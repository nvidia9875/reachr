import type { Graph, ScanResult, Finding, AttackPath, Severity } from './types.ts';
import { networkPaths } from './reach.ts';

// The rule set is intentionally tiny and crisp. Each rule maps to a route that
// reaches a data store and produces a Finding with a stable signature so
// declared and actual can be diffed.

export function scan(graph: Graph): ScanResult {
  const findings: Finding[] = [];

  // --- network: routes from the internet to a data store ---
  for (const path of networkPaths(graph)) {
    const sink = graph.nodes.get(path.sink)!;

    if (path.nodeIds.length === 2) {
      // internet -> datastore, nothing in between: directly exposed.
      findings.push(
        networkFinding(path, 'PUBLIC_DATASTORE', 'critical',
          `${sink.label} がインターネットから直接アクセスできます`,
          `${sink.label} は 0.0.0.0/0（全世界）からの接続を受け付けており、手前に防御がありません。`),
      );
    } else if (!path.passesWaf) {
      // a real path exists but skips Cloud Armor.
      findings.push(
        networkFinding(path, 'NO_WAF_TO_DATA', 'critical',
          `WAF を通らずに ${sink.label} へ届く公開経路があります`,
          `インターネットから ${sink.label} まで、Cloud Armor（WAF）を通らずに到達できます。`),
      );
    }
  }

  // --- identity: principals that can reach a data store by IAM ---
  for (const e of graph.edges) {
    if (e.channel !== 'identity') continue;
    const sink = graph.nodes.get(e.to)!;
    const principal = graph.nodes.get(e.from)!;
    const severity: Severity = e.exposure === 'public' ? 'critical' : 'medium';
    const path: AttackPath = {
      nodeIds: [e.from, e.to],
      edges: [e],
      sink: e.to,
      passesWaf: false,
      channel: 'identity',
    };
    findings.push({
      rule: 'IDENTITY_REACH',
      severity,
      sink: e.to,
      title:
        e.exposure === 'public'
          ? `${sink.label} が ${e.via} を全員(allUsers)に付与しています`
          : `${principal.label} が ${e.via} で ${sink.label} にアクセスできます`,
      detail: `${principal.meta.member ?? principal.label} が ${sink.label} に対して ${e.via} を保持しています。`,
      path,
      signature: `IDENTITY_REACH|${e.via}|${principal.meta.member ?? principal.label}|${e.to}`,
    });
  }

  // Distinct routes can produce the same logical finding; keep one per signature.
  const seen = new Set<string>();
  const deduped = findings.filter((f) => {
    if (seen.has(f.signature)) return false;
    seen.add(f.signature);
    return true;
  });

  return { graph, findings: deduped };
}

function networkFinding(
  path: AttackPath,
  rule: string,
  severity: Severity,
  title: string,
  detail: string,
): Finding {
  return {
    rule,
    severity,
    sink: path.sink,
    title,
    detail,
    path,
    signature: `${rule}|${path.sink}|${path.nodeIds.join('>')}`,
  };
}
