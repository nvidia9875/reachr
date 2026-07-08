#!/usr/bin/env -S npx tsx
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { analyze } from './analyze.ts';
import { printReport } from './report.ts';
import { runCi } from './ci.ts';
import { runAgent } from './agent.ts';

interface Args {
  declared: string;
  actual: string;
  json?: string;
  js?: string;
  out?: string;
  pr?: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    declared: 'fixtures/real/declared.json',
    actual: 'fixtures/real/actual.json',
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    // --base/--head are CI-facing aliases for --declared/--actual
    if (a === '--declared' || a === '--base') args.declared = argv[++i];
    else if (a === '--actual' || a === '--head') args.actual = argv[++i];
    else if (a === '--json') args.json = argv[++i];
    else if (a === '--js') args.js = argv[++i];
    else if (a === '--out') args.out = argv[++i];
    else if (a === '--pr') args.pr = true;
  }
  return args;
}

function writeFile(path: string, contents: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

function runScan(args: Args): never {
  let result;
  try {
    result = analyze(args.declared, args.actual);
  } catch (err) {
    console.error(`\n  reachr: ${(err as Error).message}\n`);
    process.exit(2);
  }

  const { declared, actual, drift, payload } = result;
  printReport(declared, actual, drift);

  if (args.json) {
    writeFile(args.json, JSON.stringify(payload, null, 2));
    console.log(`  ${args.json} written`);
  }
  if (args.js) {
    // A plain global assignment so the visualizer works over file:// with no server.
    writeFile(args.js, `window.REACHR_DATA = ${JSON.stringify(payload)};\n`);
    console.log(`  ${args.js} written`);
  }
  if (args.json || args.js) console.log('');

  // CI contract: non-zero when new attack paths reached production.
  process.exit(drift.introduced.length > 0 ? 1 : 0);
}

function main(): void {
  const argv = process.argv.slice(2);
  const cmd = argv[0];
  const known = cmd === 'scan' || cmd === 'ci' || cmd === 'agent';
  const args = parseArgs(known ? argv.slice(1) : argv);

  if (cmd === 'ci') runCi(args);
  if (cmd === 'agent') {
    void runAgent(args);
    return;
  }
  runScan(args);
}

main();
