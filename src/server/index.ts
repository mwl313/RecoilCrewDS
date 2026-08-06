import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { WebSocket, WebSocketServer } from 'ws';
import { RoomManager, type ContentMetadata, type SocketLike } from './room';
import { loadContentPackFromFilesystem } from '../shared/content/contentLoader';
import type { ContentPack } from '../shared/content/contentPack';
import { PROTOCOL_VERSION } from '../shared/net/protocol';
import { NET_TUNING } from '../shared/net/tuning';
import { FixedStepAccumulator } from './fixedStep';

const PORT = Number(process.env.PORT || 8080);
const STATIC_DIR = path.resolve(process.cwd(), process.env.STATIC_DIR || 'dist');
const TIME_SCALE = Number(process.env.RECOIL_TIME_SCALE || 1);
const CONTENT_DIR = process.env.CONTENT_DIR ? path.resolve(process.cwd(), process.env.CONTENT_DIR) : path.resolve(process.cwd(), 'content');
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '*')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
  '.wasm': 'application/wasm',
};

function serveStatic(req: http.IncomingMessage, res: http.ServerResponse) {
  const url = new URL(req.url || '/', 'http://localhost');
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === '/') pathname = '/index.html';
  const filePath = path.normalize(path.join(STATIC_DIR, pathname));
  if (!filePath.startsWith(path.resolve(STATIC_DIR))) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (!err) {
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, {
        'Content-Type': MIME[ext] || 'application/octet-stream',
        'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
      });
      res.end(data);
      return;
    }
    // SPA fallback for client routes (asset misses 404).
    if (pathname.includes('.')) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    fs.readFile(path.join(STATIC_DIR, 'index.html'), (err2, html) => {
      if (err2) {
        res.writeHead(503, { 'Content-Type': 'text/plain' });
        res.end('Client build not found. Run `npm run build` first.');
        return;
      }
      res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-cache' });
      res.end(html);
    });
  });
}

const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405);
    res.end('Method not allowed');
    return;
  }
  serveStatic(req, res);
});

const wss = new WebSocketServer({ server, path: '/ws' });

// Load the authoritative content pack once at startup. Missing content is a
// deployment fallback (server runs without metadata); invalid content fails
// loudly because it would poison every room.
let contentMeta: ContentMetadata | null = null;
let contentPack: ContentPack | null = null;
if (fs.existsSync(CONTENT_DIR)) {
  contentPack = loadContentPackFromFilesystem(CONTENT_DIR);
  contentMeta = {
    packId: contentPack.id,
    version: contentPack.version,
    hash: contentPack.hash,
    // Live multiplayer uses the production main-stage loop; the Demo mode
    // remains a content fixture for tests and previews.
    modeId: 'mode.mainStage',
  };
  console.log(`[recoil-crew] content pack ${contentPack.id}@${contentPack.version} hash=${contentPack.hash.slice(0, 12)} liveMode=${contentMeta.modeId}`);
} else {
  console.warn(`[recoil-crew] content dir not found at ${CONTENT_DIR}; running without content metadata`);
}

const manager = new RoomManager({ content: contentMeta, pack: contentPack });

function originAllowed(origin: string | undefined): boolean {
  if (!origin) return true;
  if (ALLOWED_ORIGINS.includes('*')) return true;
  return ALLOWED_ORIGINS.some((o) => origin.startsWith(o));
}

wss.on('connection', (ws: WebSocket, req: http.IncomingMessage) => {
  const origin = req.headers.origin;
  if (!originAllowed(origin)) {
    ws.close(1008, 'origin not allowed');
    return;
  }
  const socket: SocketLike = {
    send(msg) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(msg));
        outboundBuffered = ws.bufferedAmount;
      }
    },
    sendText(text) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(text);
        outboundBuffered = ws.bufferedAmount;
      }
    },
    close(code, reason) {
      ws.close(code, reason);
    },
  };
  ws.on('message', (data) => {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(String(data));
    } catch {
      socket.send({ t: 'error', code: 'bad_json', message: 'Malformed message.' });
      return;
    }
    if (!msg || typeof msg !== 'object') return;
    if (msg.protocol !== PROTOCOL_VERSION) {
      socket.send({
        t: 'error',
        code: 'protocol',
        message: `Protocol mismatch — client ${String(msg.protocol ?? '?')}, server ${PROTOCOL_VERSION}. Reload to update.`,
      });
      socket.close(1008, 'protocol mismatch');
      return;
    }
    try {
      manager.handle(socket, msg);
    } catch {
      // Room errors already produce friendly error messages.
    }
  });
  ws.on('close', () => {
    const client = manager.getClient(socket);
    if (client) manager.disconnect(client);
  });
  ws.on('error', () => {
    const client = manager.getClient(socket);
    if (client) manager.disconnect(client);
  });
});

setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!(ws as WebSocket & { isAlive?: boolean }).isAlive) {
      ws.terminate();
      return;
    }
    (ws as WebSocket & { isAlive?: boolean }).isAlive = false;
    ws.ping();
  });
}, 30000);

wss.on('connection', (ws) => {
  (ws as WebSocket & { isAlive?: boolean }).isAlive = true;
  ws.on('pong', () => {
    (ws as WebSocket & { isAlive?: boolean }).isAlive = true;
  });
});

// Bounded wall-clock fixed-step accumulator (Milestone 8): the sim always
// steps by the exact fixed dt; a blocked event loop drops time instead of
// running an unbounded catch-up burst, and drift is exposed for diagnostics.
const accumulator = new FixedStepAccumulator(NET_TUNING.simHz, 5);
let lastFrame = performance.now();
let tickDurationMs = 0;
let droppedTimeMs = 0;
let outboundBuffered = 0;

function loopFrame(): void {
  const now = performance.now();
  const elapsed = now - lastFrame;
  lastFrame = now;
  const result = accumulator.accumulate(elapsed);
  for (let i = 0; i < result.steps; i++) {
    const t0 = performance.now();
    manager.tick((accumulator.tickMs / 1000) * TIME_SCALE);
    tickDurationMs = performance.now() - t0;
  }
  droppedTimeMs = accumulator.droppedTimeMs;
  manager.setLoopMetrics({
    tickDurationMs,
    droppedTimeMs,
    driftMs: result.driftMs,
    outboundBuffered,
  });
  setTimeout(loopFrame, 1);
}

setTimeout(loopFrame, 1);

server.listen(PORT, () => {
  console.log(`[recoil-crew] server listening on http://localhost:${PORT}`);
  console.log(`[recoil-crew] static dir: ${STATIC_DIR} (${fs.existsSync(path.join(STATIC_DIR, 'index.html')) ? 'build found' : 'no build yet - use npm run dev:client or npm run build'})`);
  console.log(`[recoil-crew] time scale: ${TIME_SCALE}`);
});

function shutdown() {
  wss.clients.forEach((ws) => ws.close(1001, 'server shutdown'));
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 800).unref();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
