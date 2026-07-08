# acme-pii-exports is directly reachable from the internet
# path: Internet → acme-pii-exports
# risk: A bucket holding data exports is readable by the whole world.

resource "google_storage_bucket" "exports" {
  name                        = "acme-pii-exports"
  public_access_prevention    = "enforced"        # blocks allUsers / allAuthenticatedUsers
  uniform_bucket_level_access = true
}
# and remove the google_storage_bucket_iam_member granting "allUsers"
