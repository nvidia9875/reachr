import type { Finding, DriftResult } from './types.ts';

/** Diff findings between the declared (Terraform) and actual (deployed) worlds.
 *
 *  `introduced` is the headline: attack paths that exist in production but are
 *  absent from your code — the holes that crept in outside Terraform. */
export function diffFindings(declared: Finding[], actual: Finding[]): DriftResult {
  const declaredSig = new Set(declared.map((f) => f.signature));
  const actualSig = new Set(actual.map((f) => f.signature));

  return {
    introduced: actual.filter((f) => !declaredSig.has(f.signature)),
    resolved: declared.filter((f) => !actualSig.has(f.signature)),
    persistent: actual.filter((f) => declaredSig.has(f.signature)),
  };
}
