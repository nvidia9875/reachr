import type { Graph, GraphEdge, AttackPath } from './types.ts';
import { INTERNET } from './graph.ts';

/** Enumerate every network route from the internet to a data store.
 *
 *  Graphs here are small (an infra snapshot), so an exhaustive DFS over simple
 *  paths is fine and gives us the full set of distinct routes — which is what
 *  drift diffing needs. */
export function networkPaths(graph: Graph): AttackPath[] {
  const adj = new Map<string, GraphEdge[]>();
  for (const e of graph.edges) {
    if (e.channel !== 'network') continue;
    if (!adj.has(e.from)) adj.set(e.from, []);
    adj.get(e.from)!.push(e);
  }

  const sinks = new Set(
    [...graph.nodes.values()].filter((n) => n.sensitive).map((n) => n.id),
  );

  const results: AttackPath[] = [];

  const walk = (
    node: string,
    visited: Set<string>,
    nodeIds: string[],
    edges: GraphEdge[],
    passesWaf: boolean,
  ): void => {
    // A data store is a terminal sink — record the route and stop.
    if (sinks.has(node) && nodeIds.length > 1) {
      results.push({ nodeIds: [...nodeIds], edges: [...edges], sink: node, passesWaf, channel: 'network' });
      return;
    }
    for (const e of adj.get(node) ?? []) {
      if (visited.has(e.to)) continue;
      visited.add(e.to);
      const nowPassesWaf = passesWaf || graph.nodes.get(e.to)?.kind === 'waf';
      walk(e.to, visited, [...nodeIds, e.to], [...edges, e], nowPassesWaf);
      visited.delete(e.to);
    }
  };

  walk(INTERNET, new Set([INTERNET]), [INTERNET], [], false);
  return results;
}
