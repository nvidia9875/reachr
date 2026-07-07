import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { analyze } from './analyze.ts';
import { explainFinding } from './gemini.ts';
import { routeText } from './report_md.ts';

export interface AgentArgs {
  declared: string;
  actual: string;
  out?: string;
}

/** `reachr agent` — the autonomous remediation loop.
 *
 *  detect drift → reason about each path with Gemini → write a Terraform patch
 *  that closes it → emit a remediation plan ready to open as a PR. This is the
 *  "AI agent" surface: it decides what is wrong and produces the fix, end to end. */
export async function runAgent(args: AgentArgs): Promise<never> {
  let analysis;
  try {
    analysis = analyze(args.declared, args.actual);
  } catch (err) {
    console.error(`\n  reachr agent: ${(err as Error).message}\n`);
    process.exit(2);
  }

  const introduced = analysis.drift.introduced;
  const dir = args.out ?? 'remediation';

  console.log(`\n  🤖 Reachr agent`);
  console.log(`  ├─ scanning declared vs actual …`);
  console.log(`  ├─ ${introduced.length} path(s) reach your data outside your code`);

  if (introduced.length === 0) {
    console.log(`  └─ nothing to remediate ✓\n`);
    process.exit(0);
  }

  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });

  const plan: string[] = ['# Reachr — autonomous remediation plan', ''];
  let live = 0;

  for (let i = 0; i < introduced.length; i++) {
    const f = introduced[i];
    const route = routeText(analysis.actual.graph, f);
    console.log(`  ├─ [${i + 1}/${introduced.length}] ${f.title}`);
    console.log(`  │     reasoning with Gemini …`);

    const fix = await explainFinding(f, analysis.actual.graph);
    if (fix.source === 'gemini') live++;

    const slug = `${String(i + 1).padStart(2, '0')}-${f.rule.toLowerCase().replace(/[^a-z]+/g, '-')}`;
    const file = `${dir}/${slug}.tf`;
    writeFileSync(file, `# ${f.title}\n# path: ${route}\n# risk: ${fix.risk}\n\n${fix.terraform}\n`);

    plan.push(`## ${f.severity.toUpperCase()} — ${f.title}`, '');
    plan.push(`- path: \`${route}\``);
    plan.push(`- risk: ${fix.risk}`);
    plan.push(`- ${fix.explanation}`);
    plan.push(`- fix: \`${file}\``, '');

    console.log(`  │     wrote ${file}`);
  }

  writeFileSync(`${dir}/PLAN.md`, plan.join('\n') + '\n');
  console.log(`  └─ ${introduced.length} patch(es) + ${dir}/PLAN.md written  ·  Gemini: ${live}/${introduced.length} live\n`);
  console.log(`  next → open a PR:  git checkout -b reachr/remediate && git add ${dir} && git commit -m "fix: close drifted paths to data" && gh pr create\n`);
  process.exit(0);
}
