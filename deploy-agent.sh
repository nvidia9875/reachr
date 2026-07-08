#!/usr/bin/env bash
# Deploy the Reachr agent as a Cloud Run Job that runs on a schedule — the
# autonomous, always-on side of the product: every hour it senses drift,
# reasons with Gemini, and opens a remediation PR.
#
#   ./deploy-agent.sh <PROJECT_ID>
#
# Requires: gcloud auth login, and a GitHub token in Secret Manager named
# `reachr-gh-token` so the job can open PRs (gh auth).
set -euo pipefail

PROJECT="${1:-$(gcloud config get-value project 2>/dev/null || true)}"
REGION="${REGION:-us-central1}"
JOB="${JOB:-reachr-agent}"
SCHEDULE="${SCHEDULE:-0 * * * *}" # hourly
MODEL="${GEMINI_MODEL:-gemini-2.5-flash}"

if [ -z "${PROJECT}" ]; then
  echo "usage: ./deploy-agent.sh <PROJECT_ID>" >&2
  exit 1
fi

echo "▸ deploying Cloud Run Job '${JOB}' (schedule: ${SCHEDULE})"

gcloud services enable run.googleapis.com aiplatform.googleapis.com \
  cloudscheduler.googleapis.com cloudbuild.googleapis.com --project "${PROJECT}"

# The job image is the same container; its command runs the agent.
gcloud run jobs deploy "${JOB}" \
  --source . \
  --project "${PROJECT}" \
  --region "${REGION}" \
  --command npm --args run,agent \
  --set-env-vars "GOOGLE_GENAI_USE_VERTEXAI=true,GOOGLE_CLOUD_PROJECT=${PROJECT},GOOGLE_CLOUD_LOCATION=${REGION},GEMINI_MODEL=${MODEL}"

# Fire it on a schedule (Cloud Scheduler → Cloud Run Jobs).
gcloud scheduler jobs create http "${JOB}-schedule" \
  --project "${PROJECT}" \
  --location "${REGION}" \
  --schedule "${SCHEDULE}" \
  --uri "https://${REGION}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${PROJECT}/jobs/${JOB}:run" \
  --http-method POST \
  --oauth-service-account-email "$(gcloud config get-value account 2>/dev/null)" \
  2>/dev/null || echo "  (scheduler job may already exist — update with 'gcloud scheduler jobs update http')"

echo
echo "▸ done. The agent now runs ${SCHEDULE} and remediates drift autonomously."
echo "  Manual run:  gcloud run jobs execute ${JOB} --region ${REGION}"
