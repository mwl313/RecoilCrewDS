#!/usr/bin/env node
/**
 * Headless end-to-end verification of the authoritative server:
 * two WebSocket clients create a crew, ready up, play a full 90-second round
 * (Driver drives/collects, Gunner auto-aims/fires/charges), reach results,
 * then rematch into a fresh round in the same room.
 *
 * Usage: node scripts/verify-full-round.mjs [ws://host:port]
 */
import WebSocket from 'ws';

const WS_URL = process.argv[2] || 'ws://localhost:8080/ws';
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

function client() {
  const ws = new WebSocket(WS_URL);
  const messages = [];
  ws.on('message', (d) => messages.push(JSON.parse(String(d))));
  return {
    ws,
    send(obj) {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
      else setTimeout(() => this.send(obj), 30);
    },
    waitFor(pred, timeoutMs = 120000) {
      return new Promise((resolve, reject) => {
        const started = Date.now();
        const iv = setInterval(() => {
          const m = messages.find(pred);
          if (m) {
            clearInterval(iv);
            resolve(m);
          } else if (Date.now() - started > timeoutMs) {
            clearInterval(iv);
            reject(new Error('timeout waiting for message'));
          }
        }, 25);
      });
    },
    last(t) {
      return [...messages].reverse().find((m) => m.t === t);
    },
    snapshots() {
      return messages.filter((m) => m.t === 'snapshot');
    },
  };
}

function wrap(a) {
  let v = a % (Math.PI * 2);
  if (v > Math.PI) v -= Math.PI * 2;
  if (v < -Math.PI) v += Math.PI * 2;
  return v;
}

const driver = client();
const gunner = client();

driver.send({ t: 'create' });
const created = await driver.waitFor((m) => m.t === 'created');
if (!/^[A-Z2-9]{6}$/.test(created.code)) throw new Error('bad join code');
console.log(`[verify] room ${created.code} created; driver=${created.role}`);

await delay(150);
gunner.send({ t: 'join', code: created.code });
const joined = await gunner.waitFor((m) => m.t === 'joined');
if (joined.role !== 'gunner') throw new Error('joiner should be gunner');
console.log(`[verify] gunner joined`);

driver.send({ t: 'ready', ready: true });
gunner.send({ t: 'ready', ready: true });
await driver.waitFor((m) => m.t === 'start');
console.log('[verify] match started');

let driverSeq = 1;
let gunnerSeq = 1;
let lastCannon = false;
let t = 0;
const playInterval = setInterval(() => {
  t += 0.1;
  const s = driver.last('snapshot')?.state;
  if (!s) return;
  const wrapAngle = wrap;
  let target = null;
  for (const p of s.pickups) {
    if (p.collected) continue;
    const d = Math.hypot(p.x - s.tank.x, p.z - s.tank.z);
    if (!target || d < Math.hypot(target.x - s.tank.x, target.z - s.tank.z)) target = p;
  }
  // Generated arenas are 400x400 centered on (0,0): hold the center so the
  // horde converges on the tank, and only leave it to collect dropped scrap.
  const targetX = target ? target.x : 0;
  const targetZ = target ? target.z : 0;
  const yawTo = Math.atan2(targetX - s.tank.x, targetZ - s.tank.z);
  const steer = Math.max(-1, Math.min(1, wrapAngle(yawTo - s.tank.yaw) * 1.8));
  const enemyNear = s.enemies.some(
    (e) => e.alive && e.type !== 'lootTruck' && Math.hypot(e.x - s.tank.x, e.z - s.tank.z) < 45,
  );
  const throttle = enemyNear && !target ? 0.12 : 0.85;
  driver.send({
    t: 'input',
    seq: driverSeq++,
    driver: { throttle, steer, dashPressed: t % 8 < 0.1, jumpPressed: false },
  });
  let aimYaw = s.tank.yaw + Math.PI / 2;
  let enemy = null;
  for (const e of s.enemies) {
    if (!e.alive || e.type === 'lootTruck') continue;
    if (!enemy || Math.hypot(e.x - s.tank.x, e.z - s.tank.z) < Math.hypot(enemy.x - s.tank.x, enemy.z - s.tank.z)) enemy = e;
  }
  if (enemy) aimYaw = Math.atan2(enemy.x - s.tank.x, enemy.z - s.tank.z);
  const inRange = enemy && Math.hypot(enemy.x - s.tank.x, enemy.z - s.tank.z) < 80;
  const fire = inRange && s.turret.cannonCooldown <= 0;
  const cannon = fire && !lastCannon;
  lastCannon = fire;
  gunner.send({
    t: 'input',
    seq: gunnerSeq++,
    gunner: { aimYaw, aimPitch: 0.05, primary: t % 3 < 2, secondary: cannon, ability: s.turret.jackpotReady },
  });
}, 100);

const startedAt = Date.now();
const results = await driver.waitFor((m) => m.t === 'results', 150000);
clearInterval(playInterval);
const elapsed = (Date.now() - startedAt) / 1000;
console.log(`[verify] round complete in ${elapsed.toFixed(1)}s — score ${results.results.score}, grade ${results.results.grade}, "${results.results.title}", JACKPOT x${results.results.jackpotFired}, combo x${results.results.bestCombo}`);

if (results.results.score <= 0) throw new Error('score should be positive');
if (!['D', 'C', 'B', 'A', 'S'].includes(results.results.grade)) throw new Error('bad grade');
if (results.results.jackpotFired < 1) throw new Error('first-round JACKPOT should fire');

// Rematch in the same room with a modifier.
const matchBefore = driver.last('snapshot')?.state.matchId;
driver.send({ t: 'rematch', modifier: 'moonYard' });
gunner.send({ t: 'rematch', modifier: 'moonYard' });
const fresh = await driver.waitFor(
  (m) => m.t === 'snapshot' && m.state.stats.score === 0 && m.state.time < 0.5 && m.state.matchId !== matchBefore,
  20000,
);
if (fresh.matchId === matchBefore) throw new Error('rematch should create a new match');
if (fresh.state.stats.score !== 0) throw new Error('rematch should reset score');
if (fresh.state.modifier !== 'moonYard') throw new Error('rematch modifier not applied');
console.log('[verify] rematch ok (moonYard, fresh score 0, same room)');

// Latency sanity: both clients receive regular snapshots.
const snapCount = driver.snapshots().length;
console.log(`[verify] snapshots received by driver: ${snapCount}`);
if (snapCount < 100) throw new Error('snapshot stream too sparse');

driver.ws.close();
gunner.ws.close();
console.log('[verify] PASS');
