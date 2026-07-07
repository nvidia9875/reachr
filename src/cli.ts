#!/usr/bin/env -S npx tsx
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { parsePlan } from './parse.ts';
import { buildGraph } from './graph.ts';
import { scan } from './invariants.ts';
import { diffFindings } from './drift.ts';
import { printReport } from './report.ts';
import type { Graph, ScanResult } from './types.ts';

interface Args {
  declared: string;
  actual: string;
  json?: string;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    declared: 'fixtures/declared/plan.json',
    actual: 'fixtures/actual/snapshot.json',
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--declared') args.declared = argv[++i];
    else if (a === '--actual') args.actual = argv[++i];
    else if (a === '--json') args.json = argv[++i];
  }
  return args;
}

function scanFile(path: string): ScanResult {
  return scan(buildGraph(parsePlan(path)));
}

/** Graphs use Map<> internally; flatten for JSON so the future web viz can read it. */
function serialize(graph: Graph) {
  return { nodes: [...graph.nodes.values()], edges: graph.edges };
}

function main(): void {
  const argv = process.argv.slice(2);
  const cmd = argv[0] === 'scan' ? argv.slice(1) : argv;
  const args = parseArgs(cmd);

  let declared: ScanResult;
  let actual: ScanResult;
  try {
    declared = scanFile(args.declared);
    actual = scanFile(args.actual);
  } catch (err) {
    console.error(`\n  reachr: ${(err as Error).message}\n`);
    process.exit(2);
  }

  const drift = diffFindings(declared.findings, actual.findings);
  printReport(declared, actual, drift);

  if (args.json) {
    mkdirSync(dirname(args.json), { recursive: true });
    writeFileSync(
      args.json,
      JSON.stringify(
        {
          declared: { graph: serialize(declared.graph), findings: declared.findings },
          actual: { graph: serialize(actual.graph), findings: actual.findings },
          drift,
        },
        null,
        2,
      ),
    );
    console.log(`  ${args.json} written\n`);
  }

  // CI contract: non-zero when new attack paths reached production.
  process.exit(drift.introduced.length > 0 ? 1 : 0);
}

main();
