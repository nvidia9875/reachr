import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePlan } from '../src/parse.ts';
import { buildGraph } from '../src/graph.ts';
import { scan } from '../src/invariants.ts';
import { diffFindings } from '../src/drift.ts';
import { analyze } from '../src/analyze.ts';

const DECLARED = 'fixtures/real/declared.json';
const ACTUAL = 'fixtures/real/actual.json';

test('real terraform show -json: declared clean, actual has 3 introduced paths', () => {
  const a = analyze(DECLARED, ACTUAL);
  assert.equal(a.drift.introduced.length, 3);
  const rules = a.drift.introduced.map((f) => f.rule).sort();
  assert.deepEqual(rules, ['IDENTITY_REACH', 'PUBLIC_DATASTORE', 'PUBLIC_DATASTORE']);
  assert.equal(a.declared.findings.filter((f) => f.severity === 'critical').length, 0);
});

test('tf normalizer resolves cross-resource references', () => {
  const rs = parsePlan(DECLARED);
  const fr = rs.find((r) => r.type === 'google_compute_global_forwarding_rule');
  assert.ok(fr?.values.backend_service?.includes('backend_service'), 'LB chain → backend_service');
  const be = rs.find((r) => r.type === 'google_compute_backend_service');
  assert.ok(be?.values.security_policy?.includes('security_policy'), 'security_policy resolved');
  assert.ok(Array.isArray(be?.values.backends) && be!.values.backends.length >= 1, 'backend → NEG → Cloud Run');
});

test('armored path is NOT flagged NO_WAF', () => {
  const g = buildGraph(parsePlan(DECLARED));
  const findings = scan(g).findings;
  assert.ok(!findings.some((f) => f.rule === 'NO_WAF_TO_DATA'));
  assert.ok([...g.nodes.values()].some((n) => n.kind === 'waf'));
});

test('public Cloud SQL is a direct internet→datastore path', () => {
  const findings = scan(buildGraph(parsePlan(ACTUAL))).findings;
  const pub = findings.find((f) => f.rule === 'PUBLIC_DATASTORE' && f.sink.includes('sql'));
  assert.ok(pub, 'pii-db must be flagged public');
  assert.equal(pub!.path!.nodeIds.length, 2, 'internet → sql, nothing between');
});

test('drift diff: identical states → nothing introduced or resolved', () => {
  const decl = scan(buildGraph(parsePlan(DECLARED))).findings;
  const drift = diffFindings(decl, decl);
  assert.equal(drift.introduced.length, 0);
  assert.equal(drift.resolved.length, 0);
  assert.equal(drift.persistent.length, decl.length);
});

test('backward compatibility: simplified fixtures still parse and detect', () => {
  const a = analyze('fixtures/declared/plan.json', 'fixtures/actual/snapshot.json');
  assert.equal(a.drift.introduced.length, 3);
});
