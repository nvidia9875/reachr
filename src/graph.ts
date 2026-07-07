import type { TfResource, Graph, GraphNode, GraphEdge, NodeKind } from './types.ts';
import { block } from './parse.ts';

export const INTERNET = 'internet';

const DATASTORE_TYPES = new Set([
  'google_sql_database_instance',
  'google_storage_bucket',
  'google_redis_instance',
  'google_bigquery_dataset',
]);

// IAM roles that grant read/write reach to a data store. Anyone holding one of
// these can touch the crown jewels by identity, independent of the network.
const DATA_IAM_ROLES = new Set([
  'roles/cloudsql.client',
  'roles/cloudsql.admin',
  'roles/cloudsql.editor',
  'roles/storage.admin',
  'roles/storage.objectAdmin',
  'roles/storage.objectViewer',
]);

/** Build the reachability graph from a set of resources. Deterministic — no LLM
 *  is involved in deciding what can reach what. */
export function buildGraph(resources: TfResource[]): Graph {
  const nodes = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];
  const byAddress = new Map(resources.map((r) => [r.address, r] as const));
  const add = (e: GraphEdge) => edges.push(e);

  nodes.set(INTERNET, { id: INTERNET, kind: 'internet', label: 'Internet', sensitive: false, meta: {} });

  // 1) One node per resource we understand.
  for (const r of resources) {
    const kind = kindOf(r.type);
    if (!kind) continue;
    nodes.set(r.address, {
      id: r.address,
      kind,
      label: labelOf(r),
      sensitive: kind === 'datastore',
      meta: { type: r.type },
    });
  }

  // Pre-scan: which buckets are world-readable via an IAM member/binding.
  const publicBuckets = new Set<string>();
  for (const r of resources) {
    if (r.type === 'google_storage_bucket_iam_member' || r.type === 'google_storage_bucket_iam_binding') {
      if (memberList(r.values).some(isAllUsers)) {
        const bucket = r.values.bucket;
        if (bucket && byAddress.has(bucket)) publicBuckets.add(bucket);
      }
    }
  }

  // 2) Network edges — who can reach whom over the wire.
  for (const r of resources) {
    switch (r.type) {
      case 'google_compute_global_forwarding_rule':
      case 'google_compute_forwarding_rule':
        wireLoadBalancer(r, byAddress, nodes, add);
        break;

      case 'google_compute_backend_service': {
        for (const backend of r.values.backends ?? []) {
          if (nodes.has(backend)) {
            add({ from: r.address, to: backend, channel: 'network', via: 'backend', exposure: 'public' });
          }
        }
        break;
      }

      case 'google_compute_firewall':
        wireFirewall(r, nodes, add);
        break;

      case 'google_cloud_run_v2_service':
      case 'google_cloud_run_service':
        if (r.values.ingress === 'INGRESS_TRAFFIC_ALL') {
          add({ from: INTERNET, to: r.address, channel: 'network', via: 'ingress=ALL', exposure: 'public' });
        }
        break;

      case 'google_compute_instance': {
        const ni = block(r.values.network_interface);
        if (ni && block(ni.access_config)) {
          add({ from: INTERNET, to: r.address, channel: 'network', via: 'external IP', exposure: 'public' });
        }
        break;
      }

      case 'google_sql_database_instance':
        if (sqlIsWorldOpen(r)) {
          add({
            from: INTERNET,
            to: r.address,
            channel: 'network',
            via: 'authorized_networks 0.0.0.0/0',
            exposure: 'public',
            ports: ['5432'],
          });
        }
        break;

      case 'google_storage_bucket':
        if (publicBuckets.has(r.address)) {
          add({ from: INTERNET, to: r.address, channel: 'network', via: 'IAM allUsers', exposure: 'public' });
        }
        break;
    }
  }

  // 3) Identity edges — who can reach a data store by IAM role.
  for (const r of resources) {
    if (r.type !== 'google_project_iam_member' && r.type !== 'google_project_iam_binding') continue;
    const role: string | undefined = r.values.role;
    if (!role || !DATA_IAM_ROLES.has(role)) continue;

    const sinks = datastoresForRole(role, resources);
    for (const member of memberList(r.values)) {
      const pid = `principal:${member}`;
      if (!nodes.has(pid)) {
        nodes.set(pid, { id: pid, kind: 'identity', label: shortMember(member), sensitive: false, meta: { member } });
      }
      for (const sink of sinks) {
        add({
          from: pid,
          to: sink,
          channel: 'identity',
          via: role,
          exposure: isAllUsers(member) ? 'public' : 'internal',
        });
      }
    }
  }

  return { nodes, edges };
}

// --- resource wiring helpers ------------------------------------------------

function wireLoadBalancer(
  r: TfResource,
  byAddress: Map<string, TfResource>,
  nodes: Map<string, GraphNode>,
  add: (e: GraphEdge) => void,
): void {
  // internet -> LB entry point
  add({ from: INTERNET, to: r.address, channel: 'network', via: `public LB :${r.values.port_range ?? '443'}`, exposure: 'public' });

  const beAddr: string | undefined = r.values.backend_service; // simplified ref
  if (!beAddr || !nodes.has(beAddr)) return;
  const be = byAddress.get(beAddr)!;
  const waf: string | undefined = be.values.security_policy;

  if (waf && nodes.has(waf)) {
    // internet -> LB -> [Cloud Armor] -> backend
    add({ from: r.address, to: waf, channel: 'network', via: 'Cloud Armor', exposure: 'public' });
    add({ from: waf, to: beAddr, channel: 'network', via: 'inspected', exposure: 'public' });
  } else {
    // internet -> LB -> backend, no WAF in the path
    add({ from: r.address, to: beAddr, channel: 'network', via: 'NO WAF', exposure: 'public' });
  }
}

function wireFirewall(r: TfResource, nodes: Map<string, GraphNode>, add: (e: GraphEdge) => void): void {
  const sources: string[] = r.values.source_ranges ?? [];
  const openToWorld = sources.includes('0.0.0.0/0');
  const ports = allowedPorts(r.values);

  // Real Terraform derives who-can-reach-whom from target_tags /
  // target_service_accounts. This skeleton reads explicit connects_from /
  // connects_to refs so the fixture stays readable; the production builder
  // resolves tags + service accounts instead.
  const from = r.values.connects_from && nodes.has(r.values.connects_from)
    ? r.values.connects_from
    : openToWorld
      ? INTERNET
      : null;
  const to = r.values.connects_to && nodes.has(r.values.connects_to) ? r.values.connects_to : null;

  if (from && to) {
    add({ from, to, channel: 'network', via: `firewall ${r.name}`, exposure: openToWorld ? 'public' : 'internal', ports });
  }
}

// --- pure helpers -----------------------------------------------------------

function kindOf(type: string): NodeKind | null {
  if (DATASTORE_TYPES.has(type)) return 'datastore';
  if (type === 'google_compute_security_policy') return 'waf';
  if (
    type === 'google_compute_global_forwarding_rule' ||
    type === 'google_compute_forwarding_rule' ||
    type === 'google_compute_backend_service'
  ) {
    return 'lb';
  }
  if (
    type === 'google_cloud_run_v2_service' ||
    type === 'google_cloud_run_service' ||
    type === 'google_compute_instance' ||
    type === 'google_container_cluster'
  ) {
    return 'compute';
  }
  return null;
}

function labelOf(r: TfResource): string {
  return r.values?.name ?? r.name ?? r.address;
}

function sqlIsWorldOpen(r: TfResource): boolean {
  const settings = block(r.values.settings);
  const ipc = settings && block(settings.ip_configuration);
  if (!ipc || ipc.ipv4_enabled !== true) return false;
  const nets = ipc.authorized_networks;
  const list = Array.isArray(nets) ? nets : nets ? [nets] : [];
  return list.some((n: any) => (block(n)?.value ?? n?.value) === '0.0.0.0/0');
}

function allowedPorts(values: Record<string, any>): string[] {
  const allow = values.allow;
  const blocks = Array.isArray(allow) ? allow : allow ? [allow] : [];
  return blocks.flatMap((b: any) => b.ports ?? []);
}

function memberList(values: Record<string, any>): string[] {
  if (Array.isArray(values.members)) return values.members;
  if (values.member) return [values.member];
  return [];
}

function isAllUsers(m: string): boolean {
  return m === 'allUsers' || m === 'allAuthenticatedUsers';
}

function datastoresForRole(role: string, resources: TfResource[]): string[] {
  const wantType = role.includes('cloudsql')
    ? 'google_sql_database_instance'
    : role.includes('storage')
      ? 'google_storage_bucket'
      : null;
  if (!wantType) return [];
  return resources.filter((r) => r.type === wantType).map((r) => r.address);
}

function shortMember(member: string): string {
  const bare = member.replace(/^(serviceAccount|user|group):/, '');
  return bare.split('@')[0] || bare;
}
