# pii-db is directly reachable from the internet
# path: Internet → pii-db
# risk: Your PII database is reachable from the entire internet.

resource "google_sql_database_instance" "main" {
  settings {
    ip_configuration {
      ipv4_enabled    = false                       # remove the public IP
      private_network = google_compute_network.prod.id
      # delete every authorized_networks = "0.0.0.0/0" entry
    }
  }
}
