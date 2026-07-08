terraform {
  required_providers {
    google = { source = "hashicorp/google", version = "~> 5.0" }
  }
}

provider "google" {
  project = "reachr-demo"
  region  = "us-central1"
}

resource "google_compute_network" "prod" {
  name                    = "prod"
  auto_create_subnetworks = false
}

resource "google_compute_security_policy" "armor" {
  name = "api-armor"
  rule {
    action   = "allow"
    priority = 2147483647
    match {
      versioned_expr = "SRC_IPS_V1"
      config { src_ip_ranges = ["*"] }
    }
    description = "default"
  }
}

resource "google_cloud_run_v2_service" "api" {
  name     = "api"
  location = "us-central1"
  ingress  = "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER"
  template {
    containers { image = "us-docker.pkg.dev/cloudrun/container/hello" }
  }
}

resource "google_compute_region_network_endpoint_group" "run" {
  name                  = "run-neg"
  region                = "us-central1"
  network_endpoint_type = "SERVERLESS"
  cloud_run { service = google_cloud_run_v2_service.api.name }
}

resource "google_compute_backend_service" "api" {
  name                  = "api-backend"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  security_policy       = google_compute_security_policy.armor.id
  backend { group = google_compute_region_network_endpoint_group.run.id }
}

resource "google_compute_url_map" "default" {
  name            = "api-urlmap"
  default_service = google_compute_backend_service.api.id
}

resource "google_compute_target_http_proxy" "http" {
  name    = "api-proxy"
  url_map = google_compute_url_map.default.id
}

resource "google_compute_global_forwarding_rule" "http" {
  name                  = "api-fr"
  target                = google_compute_target_http_proxy.http.id
  port_range            = "80"
  load_balancing_scheme = "EXTERNAL_MANAGED"
}

# DRIFT #1 — opened to the world during an incident, never reverted.
resource "google_sql_database_instance" "main" {
  name             = "pii-db"
  database_version = "POSTGRES_15"
  region           = "us-central1"
  settings {
    tier = "db-custom-2-8192"
    ip_configuration {
      ipv4_enabled    = true
      private_network = google_compute_network.prod.id
      authorized_networks {
        name  = "temp-debug"
        value = "0.0.0.0/0"
      }
    }
  }
  deletion_protection = false
}

resource "google_storage_bucket" "exports" {
  name     = "acme-pii-exports"
  location = "US"
}

# DRIFT #2 — export bucket made world-readable to unblock a partner.
resource "google_storage_bucket_iam_member" "exports_public" {
  bucket = google_storage_bucket.exports.name
  role   = "roles/storage.objectViewer"
  member = "allUsers"
}

resource "google_project_iam_member" "api_sql" {
  project = "reachr-demo"
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:api@reachr-demo.iam.gserviceaccount.com"
}

# DRIFT #3 — analytics tool granted DB access out-of-band.
resource "google_project_iam_member" "analytics_sql" {
  project = "reachr-demo"
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:analytics@reachr-demo.iam.gserviceaccount.com"
}

resource "google_compute_firewall" "api_to_sql" {
  name          = "allow-api-sql"
  network       = google_compute_network.prod.id
  direction     = "INGRESS"
  source_ranges = ["10.0.0.0/8"]
  allow {
    protocol = "tcp"
    ports    = ["5432"]
  }
  target_service_accounts = ["api@reachr-demo.iam.gserviceaccount.com"]
}
