import type { Finding, Graph, AttackPath } from './types.ts';

// ── Gemini layer ────────────────────────────────────────────────────────────
// Three capabilities, all satisfying the "GCP AI" requirement via Vertex AI:
//   1. explainFinding — why a path is dangerous + a Terraform patch to close it
//   2. answerQuery    — natural-language questions over the reachability graph
// If no credentials are present, both fall back to deterministic output so the
// demo always works. Model truth (the graph) is never produced by the LLM.

const MODEL = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash';

export type Source = 'gemini' | 'fallback';

export interface Explanation {
  risk: string; // one-line business risk
  explanation: string; // 2–4 sentences, engineering audience
  terraform: string; // minimal HCL patch that closes THIS path
  source: Source;
}

export interface QueryAnswer {
  answer: string;
  matched: string[]; // finding signatures to highlight
  source: Source;
}

// ── client (lazy; Vertex AI preferred, Gemini API key also works) ────────────
let clientPromise: Promise<any | null> | null = null;

function hasCreds(): boolean {
  return Boolean(
    process.env.GEMINI_API_KEY ||
      process.env.GOOGLE_API_KEY ||
      process.env.GOOGLE_GENAI_USE_VERTEXAI === 'true' ||
      process.env.GOOGLE_CLOUD_PROJECT,
  );
}

async function getClient(): Promise<any | null> {
  if (!hasCreds()) return null;
  if (!clientPromise) {
    clientPromise = (async () => {
      try {
        const { GoogleGenAI } = await import('@google/genai');
        const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
        const useVertex = process.env.GOOGLE_GENAI_USE_VERTEXAI === 'true' || (!apiKey && !!process.env.GOOGLE_CLOUD_PROJECT);
        return useVertex
          ? new GoogleGenAI({
              vertexai: true,
              project: process.env.GOOGLE_CLOUD_PROJECT,
              location: process.env.GOOGLE_CLOUD_LOCATION ?? 'us-central1',
            })
          : new GoogleGenAI({ apiKey });
      } catch {
        return null; // package missing → fallback
      }
    })();
  }
  return clientPromise;
}

function extractText(res: any): string {
  return res?.text ?? res?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

// ── public API ───────────────────────────────────────────────────────────────
export async function explainFinding(finding: Finding, graph: Graph): Promise<Explanation> {
  const sinkType = graph.nodes.get(finding.sink)?.meta?.type ?? 'data store';
  const client = await getClient();
  if (!client) return fallbackExplain(finding, sinkType);

  try {
    const res = await client.models.generateContent({
      model: MODEL,
      contents: explainPrompt(finding, graph, sinkType),
      config: {
        systemInstruction: EXPLAIN_SYSTEM,
        responseMimeType: 'application/json',
        temperature: 0.2,
      },
    });
    const parsed = JSON.parse(extractText(res));
    if (!parsed.risk || !parsed.terraform) throw new Error('incomplete');
    return { risk: parsed.risk, explanation: parsed.explanation ?? '', terraform: parsed.terraform, source: 'gemini' };
  } catch {
    return fallbackExplain(finding, sinkType);
  }
}

export async function answerQuery(
  question: string,
  graph: Graph,
  findings: Finding[],
  introduced: Finding[],
): Promise<QueryAnswer> {
  const client = await getClient();
  if (!client) return fallbackQuery(question, findings, introduced);

  try {
    const res = await client.models.generateContent({
      model: MODEL,
      contents: queryPrompt(question, graph, findings),
      config: {
        systemInstruction: QUERY_SYSTEM,
        responseMimeType: 'application/json',
        temperature: 0.1,
      },
    });
    const parsed = JSON.parse(extractText(res));
    const valid = new Set(findings.map((f) => f.signature));
    const matched = Array.isArray(parsed.matched) ? parsed.matched.filter((s: string) => valid.has(s)) : [];
    return { answer: String(parsed.answer ?? ''), matched, source: 'gemini' };
  } catch {
    return fallbackQuery(question, findings, introduced);
  }
}

export interface Triage {
  action: 'remediate' | 'escalate';
  reason: string;
  source: Source;
}

/** The agent's DECIDE step, delegated to Gemini: auto-remediate now, or escalate
 *  to a human? Falls back to a severity rule when there are no credentials. */
export async function triageFinding(finding: Finding, graph: Graph): Promise<Triage> {
  const client = await getClient();
  if (!client) return fallbackTriage(finding);
  try {
    const res = await client.models.generateContent({
      model: MODEL,
      contents: [
        `Finding: ${finding.title}`,
        `Severity: ${finding.severity}`,
        `Path: ${pathText(finding.path, graph)}`,
        `Detail: ${finding.detail}`,
        `Decide the action. Produce the JSON now.`,
      ].join('\n'),
      config: { systemInstruction: TRIAGE_SYSTEM, responseMimeType: 'application/json', temperature: 0.1 },
    });
    const p = JSON.parse(extractText(res));
    return {
      action: p.action === 'escalate' ? 'escalate' : 'remediate',
      reason: String(p.reason ?? ''),
      source: 'gemini',
    };
  } catch {
    return fallbackTriage(finding);
  }
}

function fallbackTriage(finding: Finding): Triage {
  return finding.severity === 'medium'
    ? { action: 'escalate', reason: 'standing access — a human should confirm intent before revoking', source: 'fallback' }
    : { action: 'remediate', reason: `${finding.severity} exposure of a data store — close immediately`, source: 'fallback' };
}

const TRIAGE_SYSTEM =
  'You are the decision step of an autonomous cloud-security agent. Given one ' +
  'attack path that reaches a data store, decide whether to AUTO-REMEDIATE it ' +
  'now or ESCALATE to a human. Auto-remediate clear-cut public exposure of data; ' +
  'escalate anything that may be intentional (e.g. a specific service account\'s ' +
  'standing access). Respond ONLY with JSON {"action":"remediate"|"escalate", ' +
  '"reason": string} — reason is one short clause.';

// ── prompts ──────────────────────────────────────────────────────────────────
const EXPLAIN_SYSTEM =
  'You are a senior GCP cloud-security engineer. You are given a single attack ' +
  'path that reaches a data store, discovered as DRIFT (it exists in the deployed ' +
  'project but not in the Terraform code). Respond ONLY with JSON of shape ' +
  '{"risk": string, "explanation": string, "terraform": string}. "risk" is one ' +
  'blunt sentence a manager understands. "explanation" is 2–4 sentences for ' +
  'engineers. "terraform" is a MINIMAL, valid HCL patch that closes exactly this ' +
  'path (least privilege, no extra commentary outside the code).';

function pathText(path: AttackPath | undefined, graph: Graph): string {
  if (!path) return '(no path)';
  const nodes = path.nodeIds.map((id) => graph.nodes.get(id)?.label ?? id).join(' -> ');
  const vias = path.edges.map((e) => e.via).join(', ');
  return `${nodes}  [via: ${vias}]`;
}

function explainPrompt(finding: Finding, graph: Graph, sinkType: string): string {
  return [
    `Attack path: ${pathText(finding.path, graph)}`,
    `Rule: ${finding.rule}`,
    `Data store: ${graph.nodes.get(finding.sink)?.label} (${sinkType})`,
    `Detail: ${finding.detail}`,
    `This path is DRIFT — present in production but absent from Terraform.`,
    `Produce the JSON now.`,
  ].join('\n');
}

const QUERY_SYSTEM =
  'You answer questions about a GCP reachability graph. You are given the nodes, ' +
  'edges, and the list of findings (each with a "signature"). Respond ONLY with ' +
  'JSON {"answer": string, "matched": string[]} where "matched" is the list of ' +
  'finding signatures relevant to the question. Be concise and factual; never ' +
  'invent nodes or paths not present in the graph.';

function queryPrompt(question: string, graph: Graph, findings: Finding[]): string {
  const nodes = [...graph.nodes.values()].map((n) => `${n.id}(${n.kind})`).join(', ');
  const edges = graph.edges.map((e) => `${e.from}->${e.to}[${e.channel}:${e.via}]`).join(', ');
  const finds = findings.map((f) => `${f.signature} :: ${f.title}`).join('\n');
  return [
    `Question: ${question}`,
    `Nodes: ${nodes}`,
    `Edges: ${edges}`,
    `Findings:\n${finds}`,
    `Produce the JSON now.`,
  ].join('\n');
}

// ── deterministic fallback (no credentials / offline demo) ───────────────────
function isSql(t: string): boolean { return t.includes('sql'); }
function isBucket(t: string): boolean { return t.includes('storage_bucket'); }

function fallbackExplain(finding: Finding, sinkType: string): Explanation {
  if (finding.rule === 'PUBLIC_DATASTORE' && isSql(sinkType)) {
    return {
      risk: 'Your PII database is reachable from the entire internet.',
      explanation:
        'Cloud SQL has a public IP with an authorized network of 0.0.0.0/0, so anyone on the internet can attempt to connect and brute-force credentials or exfiltrate data. This was changed outside Terraform, so code review never caught it.',
      terraform: [
        'resource "google_sql_database_instance" "main" {',
        '  settings {',
        '    ip_configuration {',
        '      ipv4_enabled    = false                       # remove the public IP',
        '      private_network = google_compute_network.prod.id',
        '      # delete every authorized_networks = "0.0.0.0/0" entry',
        '    }',
        '  }',
        '}',
      ].join('\n'),
      source: 'fallback',
    };
  }
  if (finding.rule === 'PUBLIC_DATASTORE' && isBucket(sinkType)) {
    return {
      risk: 'A bucket holding data exports is readable by the whole world.',
      explanation:
        'An IAM binding grants allUsers access to the export bucket, exposing whatever it contains to anonymous download. Enforce public-access prevention so a stray grant can never make it public again.',
      terraform: [
        'resource "google_storage_bucket" "exports" {',
        '  name                        = "acme-pii-exports"',
        '  public_access_prevention    = "enforced"        # blocks allUsers / allAuthenticatedUsers',
        '  uniform_bucket_level_access = true',
        '}',
        '# and remove the google_storage_bucket_iam_member granting "allUsers"',
      ].join('\n'),
      source: 'fallback',
    };
  }
  if (finding.rule === 'NO_WAF_TO_DATA') {
    return {
      risk: 'Public traffic reaches your data without passing the WAF.',
      explanation:
        'The load-balanced path to the data store has no Cloud Armor policy attached, so requests hit the backend uninspected — no rate limiting, no OWASP rules. Attach the existing security policy to the backend service.',
      terraform: [
        'resource "google_compute_backend_service" "api" {',
        '  security_policy = google_compute_security_policy.armor.id  # attach Cloud Armor',
        '}',
      ].join('\n'),
      source: 'fallback',
    };
  }
  // IDENTITY_REACH
  return {
    risk: 'A tool holds standing access to your database that your code never granted.',
    explanation:
      'A service account was granted a Cloud SQL / Storage role out-of-band, so it can reach the data by identity regardless of the network. Revoke it and grant access only through Terraform with least privilege.',
    terraform: [
      '# Revoke the out-of-band grant (manage all data-access IAM in Terraform):',
      '#   gcloud projects remove-iam-policy-binding acme-prod \\',
      '#     --member="serviceAccount:analytics@acme-prod.iam.gserviceaccount.com" \\',
      '#     --role="roles/cloudsql.client"',
      '# Do NOT re-add it unless the tool genuinely needs it.',
    ].join('\n'),
    source: 'fallback',
  };
}

function fallbackQuery(question: string, findings: Finding[], introduced: Finding[]): QueryAnswer {
  const q = question.toLowerCase();
  const wantsInternet = /internet|public|外部|世界|world|expos/.test(q);
  const wantsIdentity = /who|identity|tool|account|誰|iam|権限/.test(q);

  let matched: Finding[];
  if (wantsIdentity) matched = findings.filter((f) => f.rule === 'IDENTITY_REACH');
  else if (wantsInternet) matched = findings.filter((f) => f.rule === 'PUBLIC_DATASTORE' || f.rule === 'NO_WAF_TO_DATA');
  else matched = introduced;

  const answer =
    matched.length === 0
      ? 'Nothing in the graph matches that.'
      : `${matched.length} path(s) match: ` + matched.map((f) => f.title).join('; ') + '.';
  return { answer, matched: matched.map((f) => f.signature), source: 'fallback' };
}
