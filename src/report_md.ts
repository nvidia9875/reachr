import type { Analysis } from './analyze.ts';
import type { Finding, Graph } from './types.ts';

const SEV: Record<string, string> = {
  critical: '🔴 critical',
  high: '🟠 high',
  medium: '⚪ medium',
};

const RANK: Record<string, number> = { critical: 0, high: 1, medium: 2 };

export function routeText(graph: Graph, f: Finding): string {
  if (!f.path) return '';
  return f.path.nodeIds.map((id) => graph.nodes.get(id)?.label ?? id).join(' → ');
}

/** PR-comment / job-summary Markdown for a declared-vs-actual (or base-vs-head)
 *  diff. `introduced` findings are the regressions that fail the check. */
export function markdownReport(a: Analysis): string {
  const intro = a.drift.introduced;
  const g = a.actual.graph;
  const out: string[] = ['## 🛡️ Reachr — attack-path check', ''];

  if (intro.length === 0) {
    out.push('✅ **PASS** — no change opens a new path to your data stores.');
    out.push('', '<sub>Reachr · declared-vs-actual data reachability</sub>');
    return out.join('\n');
  }

  const crit = intro.filter((f) => f.severity === 'critical').length;
  out.push(`❌ **FAIL — ${intro.length} new path(s) reach your data** (${crit} critical)`);
  out.push('');
  out.push('| severity | finding | path |');
  out.push('|---|---|---|');
  for (const f of [...intro].sort((x, y) => RANK[x.severity] - RANK[y.severity])) {
    out.push(`| ${SEV[f.severity]} | ${f.title} | \`${routeText(g, f)}\` |`);
  }
  out.push('');
  out.push('> These paths exist in the target state but not in the base — a regression. Close them or justify before merge.');
  out.push('', '<sub>Reachr · declared-vs-actual data reachability</sub>');
  return out.join('\n');
}
