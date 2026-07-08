# analytics can reach pii-db via roles/cloudsql.client
# path: analytics → pii-db
# risk: A tool holds standing access to your database that your code never granted.

# Revoke the out-of-band grant (manage all data-access IAM in Terraform):
#   gcloud projects remove-iam-policy-binding acme-prod \
#     --member="serviceAccount:analytics@acme-prod.iam.gserviceaccount.com" \
#     --role="roles/cloudsql.client"
# Do NOT re-add it unless the tool genuinely needs it.
