// Blocks `vite` from starting until the API's port is accepting connections.
//
// Without this, `pnpm dev` starts the NestJS API (many modules, ~15-70s to fully boot
// under ts-node-dev) and Vite (ready in ~2s) in parallel — Vite starts proxying /api/*
// immediately and every request during that window logs a scary "ECONNREFUSED" proxy
// error to the console, even though nothing is actually broken. Matches the proxy
// target hardcoded in vite.config.ts.
import { connect } from 'node:net';

const HOST = '127.0.0.1';
const PORT = 4000;
const TIMEOUT_MS = 120_000;
const POLL_MS = 500;

function canConnect() {
  return new Promise((resolve) => {
    const socket = connect({ host: HOST, port: PORT }, () => {
      socket.end();
      resolve(true);
    });
    socket.on('error', () => resolve(false));
  });
}

const start = Date.now();
process.stdout.write(`[wait-for-api] waiting for API on ${HOST}:${PORT}`);
while (!(await canConnect())) {
  if (Date.now() - start > TIMEOUT_MS) {
    console.warn(
      `\n[wait-for-api] API didn't come up within ${TIMEOUT_MS / 1000}s — starting Vite anyway (is the API running?).`,
    );
    process.exit(0);
  }
  process.stdout.write('.');
  await new Promise((r) => setTimeout(r, POLL_MS));
}
console.log(' ready.');
