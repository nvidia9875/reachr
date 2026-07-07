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
          `${sink.label} is directly reachable from the internet`,
          `${sink.label} accepts connections from 0.0.0.0/0 with no gateway in front.`),
      );
    } else if (!path.passesWaf) {
      // a real path exists but skips Cloud Armor.
      findings.push(
        networkFinding(path, 'NO_WAF_TO_DATA', 'critical',
          `Public route reaches ${sink.label} without a WAF`,
          `Traffic can travel from the internet to ${sink.label} without passing Cloud Armor.`),
      );
    }
  }

  // --- identity: principals that can reach a data store by IAM ---
  for (const e of graph.edges) {
    if (e.channel !== 'identity') continue;
    const sink = graph.nodes.get(e.to)!;
    const principal = graph.nodes.get(e.from)!;
    const severity: Severity = e.exposure === 'public' ? 'critical' : 'medium';
    findings.push({
      rule: 'IDENTITY_REACH',
      severity,
      sink: e.to,
      title:
        e.exposure === 'public'
          ? `${sink.label} grants ${e.via} to the world (${principal.label})`
          : `${principal.label} can reach ${sink.label} via ${e.via}`,
      detail: `${principal.meta.member ?? principal.label} holds ${e.via} on ${sink.label}.`,
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
