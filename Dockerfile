# Reachr on Cloud Run (GCP application-execution product).
FROM node:20-slim

WORKDIR /app

# install deps first for layer caching
COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund

COPY . .

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

# Vertex AI creds come from the Cloud Run service account (Application Default
# Credentials) — set GOOGLE_GENAI_USE_VERTEXAI=true and GOOGLE_CLOUD_PROJECT.
CMD ["npm", "run", "serve"]
