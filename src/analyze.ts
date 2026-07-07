import { parsePlan } from './parse.ts';
import { buildGraph } from './graph.ts';
import { scan } from './invariants.ts';
import { diffFindings } from './drift.ts';
import type { Graph, ScanResult, DriftResult } from './types.ts';

/** Graphs use Map<> internally; flatten for JSON (viz + API responses). */
export function serialize(graph: Graph) {
  return { nodes: [...graph.nodes.values()], edges: graph.edges };
}

export interface Analysis {
  declared: ScanResult;
  actual: ScanResult;
  drift: DriftResult;
  payload: {
    declared: { graph: ReturnType<typeof serialize>; findings: ScanResult['findings'] };
    actual: { graph: ReturnType<typeof serialize>; findings: ScanResult['findings'] };
    drift: DriftResult;
  };
}

/** The whole declared-vs-actual pipeline in one call. Shared by the CLI and the
 *  HTTP server so both always agree on the graph and findings. */
export function analyze(declaredPath: string, actualPath: string): Analysis {
  const declared = scan(buildGraph(parsePlan(declaredPath)));
  const actual = scan(buildGraph(parsePlan(actualPath)));
  const drift = diffFindings(declared.findings, actual.findings);

  const payload = {
    declared: { graph: serialize(declared.graph), findings: declared.findings },
    actual: { graph: serialize(actual.graph), findings: actual.findings },
    drift,
  };

  return { declared, actual, drift, payload };
}
