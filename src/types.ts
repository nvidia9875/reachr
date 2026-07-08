// Core domain types for Reachr.
//
// The pipeline is: plan/snapshot JSON -> TfResource[] -> Graph -> Finding[]
// then diff(declared, actual) -> DriftResult. Everything downstream (report,
// future web viz, Gemini explanations) consumes these shapes.

/** A single resource, normalized out of `terraform show -json` (declared) or a
 *  Cloud Asset Inventory export (actual). Both are normalized to this shape. */
export interface TfResource {
  address: string; // e.g. "google_sql_database_instance.main"
  type: string; // e.g. "google_sql_database_instance"
  name: string; // e.g. "main"
  values: Record<string, any>; // resolved attributes
}

export type NodeKind =
  | 'internet'
  | 'lb'
  | 'waf'
  | 'compute'
  | 'datastore'
  | 'identity';

export interface GraphNode {
  id: string;
  kind: NodeKind;
  label: string;
  /** true for data stores — these are the "crown jewels" we protect. */
  sensitive: boolean;
  meta: Record<string, any>;
}

export type Channel = 'network' | 'identity';

export interface GraphEdge {
  from: string;
  to: string;
  channel: Channel;
  /** what permits this hop: "Cloud Armor", "authorized_networks 0.0.0.0/0",
   *  "firewall allow-api-sql", "roles/cloudsql.client", ... */
  via: string;
  exposure: 'public' | 'internal';
  ports?: string[];
}

export interface Graph {
  nodes: Map<string, GraphNode>;
  edges: GraphEdge[];
}

export type Severity = 'critical' | 'high' | 'medium';

/** A concrete route from the internet (network) or a principal (identity) to a
 *  data store. */
export interface AttackPath {
  nodeIds: string[];
  edges: GraphEdge[];
  sink: string; // datastore id
  passesWaf: boolean;
  channel: Channel;
}

export interface Finding {
  rule: string; // PUBLIC_DATASTORE | NO_WAF_TO_DATA | IDENTITY_REACH
  severity: Severity;
  sink: string;
  title: string;
  detail: string;
  path?: AttackPath;
  /** stable key used to diff declared vs actual. */
  signature: string;
}

export interface ScanResult {
  graph: Graph;
  findings: Finding[];
}

export interface DriftResult {
  /** in actual but NOT in declared — holes that exist in prod outside your code. */
  introduced: Finding[];
  /** in declared but NOT in actual — code says risky, reality is safer. */
  resolved: Finding[];
  /** in both. */
  persistent: Finding[];
}
