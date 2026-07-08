import { appendFileSync, writeFileSync } from 'node:fs';
import { analyze } from './analyze.ts';
import { markdownReport, routeText } from './report_md.ts';

export interface CiArgs {
  declared: string; // base state (e.g. terraform show -json of the base ref)
  actual: string; // head state (PR plan, or a Cloud Asset Inventory snapshot)
  out?: string; // where to write the Markdown report
}

/** `reachr ci` — the GitHub Action entrypoint. Diffs base vs head, writes a
 *  Markdown report + job summary + workflow annotations, and exits non-zero
 *  when a change introduces a new path to a data store. */
export function runCi(args: CiArgs): never {
  let analysis;
  try {
    analysis = analyze(args.declared, args.actual);
  } catch (err) {
    console.error(`\n  reachr ci: ${(err as Error).message}\n`);
    process.exit(2);
  }

  const introduced = analysis.drift.introduced;
  const md = markdownReport(analysis);

  // report file — the workflow reads this to upsert a PR comment.
  const out = args.out ?? 'reachr-report.md';
  writeFileSync(out, md + '\n');

  // GitHub job summary.
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + '\n');
  }

  // inline workflow annotations (one per new path).
  for (const f of introduced) {
    const route = routeText(analysis.actual.graph, f).replace(/\n/g, ' ');
    console.log(`::error title=Reachr — ${f.title}::New path to your data: ${route}`);
  }

  console.log(
    introduced.length === 0
      ? '\n  reachr ci: PASS — no new path reaches your data\n'
      : `\n  reachr ci: FAIL — ${introduced.length} new path(s) reach your data\n`,
  );
  console.log(`  report → ${out}`);

  process.exit(introduced.length > 0 ? 1 : 0);
}
