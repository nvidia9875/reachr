import type { ScanResult, DriftResult, Finding, Graph, Severity } from './types.ts';

// Tiny ANSI helpers — no dependency, works in any terminal / CI log.
const esc = (code: string) => (s: string) => `\x1b[${code}m${s}\x1b[0m`;
const c = {
  red: esc('31'),
  green: esc('32'),
  yellow: esc('33'),
  cyan: esc('36'),
  dim: esc('2'),
  bold: esc('1'),
  bgRed: esc('41;97;1'),
  bgGreen: esc('42;30;1'),
};

const ICON: Record<string, string> = {
  internet: '🌐',
  lb: '🔀',
  waf: '🛡️',
  compute: '⚙️',
  datastore: '🗄️',
  identity: '🔑',
};

const SEV_TAG: Record<Severity, (s: string) => string> = {
  critical: (s) => c.red(c.bold(s)),
  high: (s) => c.yellow(s),
  medium: (s) => c.dim(s),
};

function drawPath(graph: Graph, f: Finding): string {
  if (!f.path) return c.dim('(identity edge)');
  return f.path.nodeIds
    .map((id) => {
      const n = graph.nodes.get(id)!;
      return `${ICON[n.kind] ?? ''} ${n.label}`;
    })
    .join(c.dim('  →  '));
}

function line(f: Finding, graph: Graph): string {
  const tag = SEV_TAG[f.severity](f.severity.toUpperCase().padEnd(8));
  const head = `  ${tag} ${f.title}`;
  const route = `        ${drawPath(graph, f)}`;
  return `${head}\n${route}`;
}

function countSeverities(findings: Finding[]): string {
  const n = (s: Severity) => findings.filter((f) => f.severity === s).length;
  return `${c.red(String(n('critical')))} critical · ${c.yellow(String(n('high')))} high · ${c.dim(String(n('medium')) + ' medium')}`;
}

export function printReport(declared: ScanResult, actual: ScanResult, drift: DriftResult): void {
  const w = process.stdout.columns ?? 72;
  const rule = c.dim('─'.repeat(Math.min(w, 72)));

  console.log('');
  console.log(c.bold(c.cyan('  REACHR')) + c.dim('  ·  who can reach your crown jewels'));
  console.log(rule);

  // Baselines
  console.log(`  ${c.bold('declared')} ${c.dim('(terraform)')}   ${countSeverities(declared.findings)}`);
  console.log(`  ${c.bold('actual')}   ${c.dim('(deployed)')}    ${countSeverities(actual.findings)}`);
  console.log(rule);

  // The star of the show: drift.
  console.log(c.bold('  DRIFT  ') + c.dim('declared → actual'));
  console.log('');

  if (drift.introduced.length === 0) {
    console.log('  ' + c.green('✓ No new attack paths in production beyond your Terraform.'));
  } else {
    console.log(
      '  ' +
        c.red(c.bold(`✗ ${drift.introduced.length} attack path(s) exist in production that are NOT in your code:`)),
    );
    console.log('');
    for (const f of sortBySeverity(drift.introduced)) {
      console.log(line(f, actual.graph));
      console.log('');
    }
  }

  if (drift.resolved.length > 0) {
    console.log('  ' + c.green(`↩ ${drift.resolved.length} risk(s) present in code but not in production (safe).`));
    console.log('');
  }

  // Verdict — this drives the CI exit code.
  console.log(rule);
  if (drift.introduced.length === 0) {
    console.log('  ' + c.bgGreen(' PASS ') + '  no data-store drift detected');
  } else {
    const crit = drift.introduced.filter((f) => f.severity === 'critical').length;
    console.log(
      '  ' +
        c.bgRed(' FAIL ') +
        `  ${drift.introduced.length} new path(s) reach your data ` +
        c.dim(`(${crit} critical)`),
    );
  }
  console.log('');
}

function sortBySeverity(findings: Finding[]): Finding[] {
  const rank: Record<Severity, number> = { critical: 0, high: 1, medium: 2 };
  return [...findings].sort((a, b) => rank[a.severity] - rank[b.severity]);
}
