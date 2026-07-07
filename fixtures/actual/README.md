# actual/ — what is really deployed

`snapshot.json` is a **Cloud Asset Inventory** export of the live project,
normalized into the same envelope Terraform emits. There is intentionally **no
`main.tf` here** — that is the whole point of world **B**: the dangerous state
lives *outside* your code.

Three things drifted after the infra shipped, none of them in Terraform:

| # | Drift (out-of-band change) | New path to data |
|---|----------------------------|------------------|
| 1 | Cloud SQL opened to `0.0.0.0/0` in the console during an incident | 🌐 internet → 🗄 `pii-db` (no WAF) |
| 2 | Export bucket made `allUsers`-readable to unblock a partner | 🌐 internet → 🗄 `acme-pii-exports` |
| 3 | `analytics@` service account granted `roles/cloudsql.client` | 🔑 analytics → 🗄 `pii-db` |

Reachr diffs `declared/plan.json` against this snapshot and reports exactly
these three as **introduced** paths — the failing check in CI.
