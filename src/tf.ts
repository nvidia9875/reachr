import type { TfResource } from './types.ts';

// Normalize REAL `terraform show -json` (plan or refreshed state) into the
// internal resource model buildGraph consumes. Real output expresses
// cross-resource wiring via `configuration...expressions[].references`, not as
// inline addresses — so here we resolve the LB chain, Cloud Armor, the
// backend→NEG→Cloud Run hop, the firewall, and bucket-IAM targets, and inject
// the simplified fields the graph builder expects. buildGraph stays unchanged.

/** True for genuine `terraform show -json`; false for our simplified fixtures
 *  (which have planned_values but no `configuration`). */
export function isTerraformShow(json: any): boolean {
  return Boolean(json?.configuration?.root_module);
}

function flatten(module: any, key: 'resources', acc: any[] = []): any[] {
  for (const r of module?.[key] ?? []) acc.push(r);
  for (const cm of module?.child_modules ?? []) flatten(cm, key, acc);
  return acc;
}

const DB_PORTS = new Set(['3306', '5432', '6379', '1433', '27017']);

export function normalizeTerraform(json: any): TfResource[] {
  const planned = flatten(json.planned_values?.root_module, 'resources');
  const configList = flatten(json.configuration?.root_module, 'resources');
  const config = new Map<string, Record<string, any>>(configList.map((r) => [r.address, r.expressions ?? {}]));

  const addrs = new Set<string>(planned.map((r) => r.address));
  const byType = (t: string) => planned.filter((r) => r.type === t);

  // references come as ["google_x.name.id", "google_x.name"]; keep the one that
  // is an actual resource address.
  const pickAddr = (refs?: string[]): string | undefined => (refs ?? []).find((r) => addrs.has(r));
  const ref = (address: string, field: string): string | undefined =>
    pickAddr(config.get(address)?.[field]?.references);

  // serverless NEG → Cloud Run service address
  const negToRun = new Map<string, string>();
  for (const neg of byType('google_compute_region_network_endpoint_group')) {
    const cr = config.get(neg.address)?.cloud_run;
    const svcRefs = (Array.isArray(cr) ? cr[0] : cr)?.service?.references;
    const run = pickAddr(svcRefs);
    if (run) negToRun.set(neg.address, run);
  }

  const sqlInstances = byType('google_sql_database_instance');
  const buckets = byType('google_storage_bucket');
  const computes = planned.filter(
    (r) => r.type === 'google_cloud_run_v2_service' || r.type === 'google_cloud_run_service' || r.type === 'google_compute_instance',
  );

  const out: TfResource[] = [];
  for (const r of planned) {
    const values: Record<string, any> = { ...(r.values ?? {}) };

    switch (r.type) {
      case 'google_compute_global_forwarding_rule':
      case 'google_compute_forwarding_rule': {
        const proxy = ref(r.address, 'target');
        const urlmap = proxy ? ref(proxy, 'url_map') : undefined;
        const be = urlmap ? ref(urlmap, 'default_service') : undefined;
        if (be) values.backend_service = be;
        break;
      }
      case 'google_compute_backend_service': {
        const sp = ref(r.address, 'security_policy');
        if (sp) values.security_policy = sp;
        const blocks = config.get(r.address)?.backend;
        const list = Array.isArray(blocks) ? blocks : blocks ? [blocks] : [];
        const runs = list.map((b: any) => negToRun.get(pickAddr(b?.group?.references) ?? '')).filter(Boolean);
        if (runs.length) values.backends = runs as string[];
        break;
      }
      case 'google_compute_firewall': {
        const ports = (values.allow ?? []).flatMap((a: any) => a.ports ?? []);
        const hitsDb = ports.some((p: string) => DB_PORTS.has(String(p)));
        const sink = hitsDb && sqlInstances[0] ? sqlInstances[0].address : undefined;
        if (sink) values.connects_to = sink;
        const openToWorld = (values.source_ranges ?? []).includes('0.0.0.0/0');
        if (!openToWorld && computes[0]) values.connects_from = computes[0].address;
        break;
      }
      case 'google_storage_bucket_iam_member':
      case 'google_storage_bucket_iam_binding': {
        const byRef = pickAddr(config.get(r.address)?.bucket?.references);
        const byName = buckets.find((b) => b.values?.name === values.bucket)?.address;
        const addr = byRef ?? byName;
        if (addr) values.bucket = addr;
        break;
      }
    }

    out.push({ address: r.address, type: r.type, name: r.name, values });
  }

  return out;
}
