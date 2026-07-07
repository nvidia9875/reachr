#!/usr/bin/env bash
# Deploy Reachr to Cloud Run with Vertex AI (Gemini).
#
#   ./deploy.sh <PROJECT_ID>
#
# Requires: gcloud auth login  (and billing enabled on the project).
set -euo pipefail

PROJECT="${1:-$(gcloud config get-value project 2>/dev/null || true)}"
REGION="${REGION:-us-central1}"
SERVICE="${SERVICE:-reachr}"
MODEL="${GEMINI_MODEL:-gemini-2.5-flash}"

if [ -z "${PROJECT}" ]; then
  echo "usage: ./deploy.sh <PROJECT_ID>   (or: gcloud config set project <ID>)" >&2
  exit 1
fi

echo "▸ deploying '${SERVICE}' to project=${PROJECT} region=${REGION} model=${MODEL}"

gcloud services enable run.googleapis.com aiplatform.googleapis.com cloudbuild.googleapis.com \
  --project "${PROJECT}"

# Vertex AI is called via the Cloud Run runtime service account (ADC).
gcloud run deploy "${SERVICE}" \
  --source . \
  --project "${PROJECT}" \
  --region "${REGION}" \
  --allow-unauthenticated \
  --set-env-vars "GOOGLE_GENAI_USE_VERTEXAI=true,GOOGLE_CLOUD_PROJECT=${PROJECT},GOOGLE_CLOUD_LOCATION=${REGION},GEMINI_MODEL=${MODEL}"

echo
echo "▸ done — open the Service URL printed above."
echo "  If the Explain panel shows 'deterministic fallback', grant Vertex AI to the runtime SA:"
echo "    gcloud projects add-iam-policy-binding ${PROJECT} \\"
echo "      --member=\"serviceAccount:\$(gcloud run services describe ${SERVICE} --region ${REGION} --format='value(spec.template.spec.serviceAccountName)')\" \\"
echo "      --role=roles/aiplatform.user"
