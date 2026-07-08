# reachr agent — remediation plan

## CRITICAL — pii-db is directly reachable from the internet

- decision: **remediate**
- path: `Internet → pii-db`
- risk: Your PII database is reachable from the entire internet.
- Cloud SQL has a public IP with an authorized network of 0.0.0.0/0, so anyone on the internet can attempt to connect and brute-force credentials or exfiltrate data. This was changed outside Terraform, so code review never caught it.
- fix: `remediation/01-public-datastore.tf`
- verified: ✅ path closed after fix

## CRITICAL — acme-pii-exports is directly reachable from the internet

- decision: **remediate**
- path: `Internet → acme-pii-exports`
- risk: A bucket holding data exports is readable by the whole world.
- An IAM binding grants allUsers access to the export bucket, exposing whatever it contains to anonymous download. Enforce public-access prevention so a stray grant can never make it public again.
- fix: `remediation/02-public-datastore.tf`
- verified: ✅ path closed after fix

## MEDIUM — analytics can reach pii-db via roles/cloudsql.client

- decision: **flag**
- path: `analytics → pii-db`
- risk: A tool holds standing access to your database that your code never granted.
- A service account was granted a Cloud SQL / Storage role out-of-band, so it can reach the data by identity regardless of the network. Revoke it and grant access only through Terraform with least privilege.
- fix: `remediation/03-identity-reach.tf`
- verified: ✅ path closed after fix

