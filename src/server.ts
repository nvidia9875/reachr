import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { analyze } from './analyze.ts';
import { explainFinding, answerQuery } from './gemini.ts';

// Reachr's serving surface — this is what runs on Cloud Run (GCP execution
// product). It serves the static map and exposes the Gemini-backed API.

const PORT = Number(process.env.PORT ?? 8080);
const DECLARED = process.env.REACHR_DECLARED ?? 'fixtures/declared/plan.json';
const ACTUAL = process.env.REACHR_ACTUAL ?? 'fixtures/actual/snapshot.json';
const VIZ_DIR = 'viz';

const analysis = analyze(DECLARED, ACTUAL);
// findings are looked up by signature when the client asks to explain one.
const bySignature = new Map(
  [...analysis.actual.findings, ...analysis.declared.findings].map((f) => [f.signature, f]),
);

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function send(res: ServerResponse, code: number, body: string | Buffer, type = 'application/json'): void {
  res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(body);
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
    const path = url.pathname;

    // graph payload as a global assignment — the viz loads this via <script>.
    if (path === '/data.js') {
      return send(res, 200, `window.REACHR_DATA = ${JSON.stringify(analysis.payload)};\n`, MIME['.js']);
    }
    if (path === '/api/graph') {
      return send(res, 200, JSON.stringify(analysis.payload));
    }

    if (path === '/api/explain' && req.method === 'POST') {
      const { signature } = JSON.parse((await readBody(req)) || '{}');
      const finding = bySignature.get(signature);
      if (!finding) return send(res, 404, JSON.stringify({ error: 'unknown finding' }));
      return send(res, 200, JSON.stringify(await explainFinding(finding, analysis.actual.graph)));
    }

    if (path === '/api/query' && req.method === 'POST') {
      const { question } = JSON.parse((await readBody(req)) || '{}');
      const answer = await answerQuery(
        String(question ?? ''),
        analysis.actual.graph,
        analysis.actual.findings,
        analysis.drift.introduced,
      );
      return send(res, 200, JSON.stringify(answer));
    }

    // static files out of viz/ (path-traversal guarded)
    const rel = path === '/' ? 'index.html' : path.replace(/^\/+/, '');
    const safe = normalize(rel).replace(/^(\.\.[\\/])+/, '');
    try {
      const buf = await readFile(join(VIZ_DIR, safe));
      return send(res, 200, buf, MIME[extname(safe)] ?? 'application/octet-stream');
    } catch {
      return send(res, 404, 'not found', 'text/plain');
    }
  } catch (err) {
    send(res, 500, JSON.stringify({ error: String(err) }));
  }
});

server.listen(PORT, () => {
  const gemini = process.env.GEMINI_API_KEY || process.env.GOOGLE_CLOUD_PROJECT || process.env.GOOGLE_GENAI_USE_VERTEXAI === 'true';
  console.log(`\n  Reachr → http://localhost:${PORT}`);
  console.log(`  ${analysis.drift.introduced.length} introduced path(s) · Gemini: ${gemini ? 'live' : 'fallback'}\n`);
});
