# Reachr

**Who can actually reach your crown jewels?**

Reachr maps every route — network *and* identity — that can reach a data store
(Cloud SQL, GCS, Redis, BigQuery) in a GCP project, and flags the ones that
matter: a public path with **no WAF**, a DB **open to `0.0.0.0/0`**, a bucket
readable by **`allUsers`**, a tool that **quietly gained DB access**.

The core idea is **drift**. Your Terraform is the *intended* state; after months
of operation, reality diverges — someone opens a firewall in the console, a
service account accumulates a role. Reachr compares:

- **declared** — `terraform show -json` (your code)
- **actual** — a Cloud Asset Inventory snapshot (what's really deployed)

…and fails CI when a path reaches your data **in production that isn't in your
code**.

```
  REACHR  ·  who can reach your crown jewels
  ────────────────────────────────────────────
  declared (terraform)   0 critical · 0 high · 1 medium
  actual   (deployed)    2 critical · 0 high · 2 medium
  ────────────────────────────────────────────
  DRIFT  declared → actual

  ✗ 3 attack path(s) exist in production that are NOT in your code:

  CRITICAL pii-db is directly reachable from the internet
        🌐 Internet  →  🗄️ pii-db

  CRITICAL acme-pii-exports is directly reachable from the internet
        🌐 Internet  →  🗄️ acme-pii-exports

  MEDIUM   analytics can reach pii-db via roles/cloudsql.client
        (identity edge)
  ────────────────────────────────────────────
   FAIL   3 new path(s) reach your data (2 critical)
```

## Run it

```bash
npm install
npm run scan          # diff the bundled declared vs actual fixtures (terminal)
npm run serve         # serve the map + Gemini API on :8080 → open http://localhost:8080
npm run viz           # build viz/data.js to open viz/index.html directly (map only, no API)
npm run scan:json     # write out/graph.json (machine-readable)
```

The visualizer is a layered attack-surface map with a **declared / actual**
toggle, drift paths glowing red, and the crown-jewel data stores on the right.
It inherits the Aegis Mission Control design language (dark-luxury oklch,
holographic HUD).

### Gemini (Vertex AI)

`npm run serve` runs Reachr's web surface (this is what deploys to **Cloud
Run**) and exposes a Gemini-backed API:

- **Explain & fix** — click any drift finding → Gemini explains the risk and
  generates a minimal Terraform patch that closes that exact path.
- **Ask** — natural-language queries over the graph ("can anyone reach my DB
  from the internet?") highlight the matching paths.

Set Vertex AI creds (`GOOGLE_GENAI_USE_VERTEXAI=true` + `GOOGLE_CLOUD_PROJECT`)
or a `GEMINI_API_KEY` — see `.env.example`. **Without credentials it uses a
deterministic fallback**, so the demo always works. The graph itself is never
produced by the LLM.

Point it at your own captures:

```bash
npx tsx src/cli.ts scan \
  --declared path/to/plan.json \
  --actual   path/to/asset-inventory.json
```

Exit code is **1** when new paths reach your data, so it drops straight into a
GitHub Action as a required check.

## How it works

```
plan/snapshot JSON ─▶ parse ─▶ buildGraph ─▶ reach (internet→data) ─▶ invariants ─▶ findings
                                                                                        │
                              diffFindings(declared, actual) ◀───────────────────────── ┘
                                        │
                                        ▼  introduced paths → report + non-zero exit
```

| file | role |
|------|------|
| `src/parse.ts` | JSON envelope → `TfResource[]` |
| `src/graph.ts` | resources → typed reachability graph (network + identity edges) |
| `src/reach.ts` | enumerate internet → data-store routes |
| `src/invariants.ts` | the rule set → `Finding[]` with stable signatures |
| `src/drift.ts` | declared vs actual diff |
| `src/report.ts` | terminal report + CI verdict |

Graph truth is **deterministic code** — no LLM decides what can reach what.

## Detections (v0)

- `PUBLIC_DATASTORE` — data store reachable directly from the internet
- `NO_WAF_TO_DATA` — public route reaches data without passing Cloud Armor
- `IDENTITY_REACH` — a principal (incl. `allUsers`) can reach data by IAM role

## Roadmap

- [x] Web visualizer (layered attack-surface map, declared/actual toggle, drift in red)
- [x] Gemini layer (Vertex AI): explain each path, generate the Terraform fix, NL queries
- [ ] GitHub Action wrapper (PR comment with the introduced paths)
- [ ] `demo-target/`: real deployable GCP app (Cloud Run + LB + Armor + Cloud SQL
      + GCS) + `drift.sh`, and a `collect` command that reads real
      `terraform show -json` + Cloud Asset Inventory (upgrades the parser off the
      simplified fixture refs)
- [ ] Deploy Reachr on Cloud Run (eligibility: GCP execution product + Vertex AI)
- [ ] More GCP coverage (GKE authorized networks, Memorystore, BigQuery IAM)

> Fixtures model AWS-free GCP topology. `fixtures/actual/` has no `main.tf` on
> purpose — the dangerous state lives outside the code. That's the point.
