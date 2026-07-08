# DECLARED — the intended infrastructure, as written in Terraform.
# Reachr reads `terraform show -json <plan>`; plan.json in this folder is a
# trimmed capture of that output. This .tf is the human-readable source.
#
# Topology:  🌐 internet → 🔀 LB → 🛡 Cloud Armor → ⚙ Cloud Run → 🗄 (private) Cloud SQL

resource "google_compute_security_policy" "armor" {
  name = "api-armor"
  # ... WAF rules (rate limiting, OWASP CRS, geo) ...
}

resource "google_compute_backend_service" "api" {
  name            = "api-backend"
  security_policy = google_compute_security_policy.armor.id # WAF in front ✅
  # backend -> serverless NEG -> Cloud Run "api"
}

resource "google_compute_global_forwarding_rule" "https" {
  name       = "api-https"
  port_range = "443"
  # target proxy -> url map -> backend_service.api
}

resource "google_cloud_run_v2_service" "api" {
  name     = "api"
  ingress  = "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER" # only the LB can call it ✅
}

resource "google_sql_database_instance" "main" {
  name             = "pii-db"
  database_version = "POSTGRES_15"

  settings {
    tier = "db-custom-2-8192"
    ip_configuration {
      ipv4_enabled    = false # no public IP ✅
      private_network = "projects/acme-prod/global/networks/prod"
      # no authorized_networks — reachable only from inside the VPC ✅
    }
  }
}

resource "google_compute_firewall" "api_to_sql" {
  name          = "allow-api-sql"
  direction     = "INGRESS"
  source_ranges = ["10.0.0.0/8"] # internal only ✅
  allow {
    protocol = "tcp"
    ports    = ["5432"]
  }
}

resource "google_storage_bucket" "exports" {
  name     = "acme-pii-exports"
  location = "US"
  # private — no public IAM ✅
}

# Only the API service account may reach the DB.
resource "google_project_iam_member" "api_sql" {
  role   = "roles/cloudsql.client"
  member = "serviceAccount:api@acme-prod.iam.gserviceaccount.com"
}
