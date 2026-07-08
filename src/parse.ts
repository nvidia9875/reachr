import { readFileSync } from 'node:fs';
import type { TfResource } from './types.ts';
import { isTerraformShow, normalizeTerraform } from './tf.ts';

// Both inputs share one envelope:
//   { planned_values: { root_module: { resources: [ { address, type, name, values } ] } } }
//
// - declared = `terraform show -json <plan>` (Terraform's own shape).
// - actual   = a Cloud Asset Inventory export, normalized by our collector into
//              the same envelope. (In this skeleton it is a hand-authored
//              fixture; the production collector is a later step.)
export function parsePlan(path: string): TfResource[] {
  const raw = readFileSync(path, 'utf8');
  let json: any;
  try {
    json = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Invalid JSON in ${path}: ${(err as Error).message}`);
  }

  // Genuine `terraform show -json` (has a `configuration` block) is normalized;
  // our simplified fixtures fall through to the direct read below.
  if (isTerraformShow(json)) return normalizeTerraform(json);

  const resources = json?.planned_values?.root_module?.resources;
  if (!Array.isArray(resources)) {
    throw new Error(
      `${path}: expected planned_values.root_module.resources[] (got ${typeof resources})`,
    );
  }

  return resources.map((r: any) => ({
    address: r.address ?? `${r.type}.${r.name}`,
    type: String(r.type ?? ''),
    name: String(r.name ?? ''),
    values: r.values ?? {},
  }));
}

/** Terraform encodes nested blocks as single-element arrays. This unwraps the
 *  first element so `block(sql.values.settings)` works whether it is `[{...}]`
 *  or already `{...}`. */
export function block(v: any): any {
  if (Array.isArray(v)) return v[0];
  return v;
}
