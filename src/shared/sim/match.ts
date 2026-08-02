import { ARENA, groundHeightAt, nearestSpawn, obstacleAt, resolveCircle } from '../arena';
import { BASE_CONFIG, buildMatchConfig, GAME, type GameConfig } from '../config';
import { angleDiff, angleLerp, clamp, dist, dist2, lerp, pointInBox, wrapAngle } from '../math';
import { computeResults } from './results';
import { stepTankKinematics, type TankKinematicState } from './tankKinematics';
import type {
  BarrelState,
  DriverInput,
  EnemyState,
  EnemyType,
  GunnerInput,
  MatchConfig,
  MatchResults,
  MatchState,
  ModifierId,
  PickupState,
  Role,
  ScrapKind,
  ShellState,
  SimEvent,
  TruckState,
} from '../types';

let globalEnemyId = 1;

function nextEnemyId() {
  return globalEnemyId++;
}

export function enemyRadius(type: EnemyType, cfg: GameConfig): number {
  switch (type) {
    case 'scrapBug':
      return cfg.arena.bugRadius;
    case 'rammer':
      return cfg.arena.rammerRadius;
    case 'gunTower':
      return cfg.arena.towerRadius;
    case 'lootTruck':
      return cfg.arena.truckRadius;
  }
}

function makeBarrels(): BarrelState[] {
  return ARENA.barrels.map((b) => ({ id: b.id, x: b.x, z: b.z, exploded: false, fuseT: 0, flash: 0, hp: 0 }));
}

function initialTank(): MatchState['tank'] {
  const spawn = ARENA.spawnPoints[0];
  return {
    x: spawn.x,
    y: groundHeightAt(spawn.x, spawn.z),
    z: spawn.z,
    vx: 0,
    vy: 0,
    vz: 0,
    yaw: 0,
    yawVel: 0,
    pitch: 0,
    roll: 0,
    integrity: BASE_CONFIG.tank.maxIntegrity,
    brace: false,
    boosting: false,
    shieldedT: BASE_CONFIG.tank.shieldTime,
    deadT: 0,
    grounded: true,
    drift: false,
  };
}

function initialState(matchId: string, modifier: ModifierId): MatchState {
  return {
    matchId,
    time: 0,
    duration: GAME.roundDuration,
    phase: 'running',
    tank: initialTank(),
    turret: {
      yaw: Math.PI / 2,
      pitch: 0.05,
      chargeT: 0,
      cannonCooldown: 0,
      cannonFlash: 0,
      mgCooldown: 0,
      mgFiring: false,
      jackpotReady: false,
      jackpotCooldown: 0,
    },
    combo: { multiplier: 1, points: 0, lastDriverT: -99, lastGunnerT: -99, lastAnyT: -99, best: 1 },
    stats: {
      score: 0,
      jackpotMeter: 0,
      jackpotFired: 0,
      kills: 0,
      scrapCollected: 0,
      links: 0,
      ramKills: 0,
      dodgeCount: 0,
      wipeouts: 0,
      bestCombo: 1,
      anyContribution: false,
    },
    enemies: [],
    pickups: [],
    shells: [],
    barrels: makeBarrels(),
    truck: { active: false, x: 0, y: 0, z: 0, yaw: 0, hp: BASE_CONFIG.enemies.truckHp, waypoint: 0, escaped: false, sirenT: 0 },
    respawnT: 0,
    countdown: 0,
    modifier,
    nextEnemyId: 1,
    nextPickupId: 1,
    nextShellId: 1,
  };
}

export class Match {
  state: MatchState;
  cfg: GameConfig = BASE_CONFIG;
  mcfg: MatchConfig;
  events: SimEvent[] = [];
  results: MatchResults | null = null;

  private driverInput: DriverInput = { throttle: 0, steer: 0, boost: false, brace: false };
  private gunnerInput: GunnerInput = { aimYaw: Math.PI / 2, aimPitch: 0.05, mg: false, cannon: false, charge: false };
  private lastCannonDown = false;
  private lastChargeDown = false;
  private lastMgDown = false;
  private pendingBursts = 0;
  private pendingBurstT = 0;
  private rammerSpawns = [22, 34, 50];
  private rammerSpawnIdx = 0;
  private towerSpawns = [26, 58];
  private towerSpawnIdx = 0;
  private truckSpawned = false;
  private lastKillAt = -99;
  private lastKillKind: ScrapKind | null = null;
  private dodgeAwarded = false;

  constructor(matchId: string, modifier: ModifierId = 'none') {
    this.mcfg = buildMatchConfig(modifier);
    this.state = initialState(matchId, modifier);
    // First two Scrap Bugs are placed directly ahead so the first kill lands
    // within seconds.
    this.spawnEnemy('scrapBug', -7, 6);
    this.spawnEnemy('scrapBug', 8, -4);
  }

  takeEvents(): SimEvent[] {
    if (this.events.length === 0) return [];
    const out = this.events;
    this.events = [];
    return out;
  }

  setDriverInput(input: DriverInput) {
    this.driverInput = input;
  }

  setGunnerInput(input: GunnerInput) {
    this.gunnerInput = input;
  }

  getDriverInput(): DriverInput {
    return { ...this.driverInput };
  }

  getGunnerInput(): GunnerInput {
    return { ...this.gunnerInput };
  }

  clearInputs() {
    this.driverInput = { throttle: 0, steer: 0, boost: false, brace: false };
    this.gunnerInput = { aimYaw: this.gunnerInput.aimYaw, aimPitch: this.gunnerInput.aimPitch, mg: false, cannon: false, charge: false };
    this.lastCannonDown = false;
    this.lastChargeDown = false;
    this.lastMgDown = false;
  }

  clearDriverInput() {
    this.driverInput = { throttle: 0, steer: 0, boost: false, brace: false };
  }

  clearGunnerInput() {
    this.gunnerInput = { aimYaw: this.gunnerInput.aimYaw, aimPitch: this.gunnerInput.aimPitch, mg: false, cannon: false, charge: false };
    this.lastCannonDown = false;
    this.lastChargeDown = false;
    this.lastMgDown = false;
  }

  step(dtRaw: number) {
    if (this.state.phase !== 'running' && this.state.phase !== 'countdown') return;
    const dt = dtRaw * this.mcfg.timeScale;
    if (this.state.phase === 'countdown') {
      this.state.countdown -= dtRaw;
      if (this.state.countdown <= 0) this.state.phase = 'running';
      return;
    }
    const s = this.state;
    s.time += dt;
    this.stepTank(dt);
    this.stepWeapons(dt);
    this.stepEnemies(dt);
    this.stepShells(dt);
    this.stepPickups(dt);
    this.stepSpawns(dt);
    this.stepAssistance();
    this.stepCombo(dt);
    this.stepBarrels(dt);
    if (s.time >= s.duration) {
      s.phase = 'results';
      this.results = computeResults(s);
    }
  }

  // ---------------------------------------------------------------- tank
  private stepTank(dt: number) {
    const s = this.state;
    const t = s.tank;
    const tankCfg = this.cfg.tank;
    if (t.deadT > 0) {
      t.deadT -= dt;
      if (t.deadT <= 0) {
        this.respawn();
      }
      return;
    }
    if (t.shieldedT > 0) t.shieldedT -= dt;
    const speed = Math.hypot(t.vx, t.vz);
    const hits = stepTankKinematics(t as unknown as TankKinematicState, this.driverInput, this.cfg, this.mcfg, dt, {
      onRampLaunch: () => this.push('assist', t.x, t.y, t.z, { label: 'LAUNCHED' }),
      onHardFall: () => {
        this.damageTank(tankCfg.fallDamage, 'fall');
        this.push('crash', t.x, t.y, t.z, { value: tankCfg.fallDamage });
      },
    });
    // Hard obstacle crash damage (crusher/factory/wall) at speed.
    if (speed > 10 && hits.length > 0) {
      const hardHit = hits.some((hit) => {
        const ob = hit.obstacleId ? ARENA.obstacles.find((o) => o.id === hit.obstacleId) : undefined;
        return !!ob && (ob.type === 'crusher' || ob.type === 'factory' || ob.type === 'wall');
      });
      if (hardHit) {
        this.damageTank(4, 'crash');
        this.push('crash', t.x, t.y, t.z, { value: 4 });
      }
    }
  }

  private applyRecoil(dirX: number, dirZ: number, impulse: number, spin: number) {
    const t = this.state.tank;
    const bracing = t.brace;
    const mult = bracing ? this.cfg.tank.braceRecoilMult : 1;
    t.vx += dirX * impulse * mult;
    t.vz += dirZ * impulse * mult;
    t.yawVel += (Math.random() - 0.5) * 2 * spin * mult;
    if (!t.grounded) {
      t.vy += 1.8 * mult * clamp(impulse / 7, 0, 1.4);
    }
    t.roll = clamp(t.roll + (Math.random() - 0.5) * 0.35 * mult, -1.4, 1.4);
    this.push('recoil', t.x, t.y, t.z, { value: impulse * mult });
  }

  private respawn() {
    const t = this.state.tank;
    const spawn = nearestSpawn(t.x, t.z);
    t.x = spawn.x;
    t.y = groundHeightAt(spawn.x, spawn.z);
    t.z = spawn.z;
    t.vx = 0;
    t.vy = 0;
    t.vz = 0;
    t.yawVel = 0;
    t.roll = 0;
    t.deadT = 0;
    t.shieldedT = this.cfg.tank.shieldTime;
    t.integrity = this.cfg.tank.maxIntegrity;
    // Face nearest threat.
    let best: EnemyState | null = null;
    let bestD = Infinity;
    for (const e of this.state.enemies) {
      if (!e.alive) continue;
      const d = dist2(t.x, t.z, e.x, e.z);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    if (best) t.yaw = Math.atan2(best.x - t.x, best.z - t.z);
    this.push('respawn', t.x, t.y, t.z);
  }

  damageTank(amount: number, source: string) {
    const t = this.state.tank;
    if (t.deadT > 0 || t.shieldedT > 0) return;
    t.integrity = Math.max(0, t.integrity - amount);
    this.push('hit', t.x, t.y, t.z, { value: amount, kind: source });
    if (t.integrity <= 0) {
      t.integrity = 0;
      t.deadT = this.cfg.tank.respawnTime;
      const s = this.state.stats;
      s.wipeouts++;
      s.score = Math.floor(s.score * (1 - this.cfg.scoring.wipeoutPenalty));
      s.jackpotMeter *= 0.5;
      this.state.turret.jackpotReady = s.jackpotMeter >= 100 && this.state.turret.jackpotCooldown <= 0;
      this.state.combo.points = 0;
      this.state.combo.multiplier = 1;
      this.push('wipeout', t.x, t.y, t.z);
    }
  }

  // -------------------------------------------------------------- weapons
  private muzzleWorld(): { x: number; y: number; z: number; dx: number; dy: number; dz: number } {
    const t = this.state.tank;
    const tur = this.state.turret;
    const yaw = t.yaw + tur.yaw;
    const pitch = tur.pitch;
    const dx = Math.cos(pitch) * Math.sin(yaw);
    const dy = Math.sin(pitch);
    const dz = Math.cos(pitch) * Math.cos(yaw);
    return {
      x: t.x + dx * 2.7,
      y: t.y + 1.55 + dy * 1.4,
      z: t.z + dz * 2.7,
      dx,
      dy,
      dz,
    };
  }

  private stepWeapons(dt: number) {
    const s = this.state;
    const t = s.tank;
    const tur = s.turret;
    const inp = this.gunnerInput;
    const w = this.cfg.weapons;
    if (t.deadT > 0) {
      this.lastCannonDown = inp.cannon;
      this.lastChargeDown = inp.charge;
      this.lastMgDown = inp.mg;
      return;
    }

    // Turret movement is validated/limited by the server at all times.
    tur.yaw = tur.yaw + clamp(angleDiff(tur.yaw, inp.aimYaw), -w.turretTurnRate * dt, w.turretTurnRate * dt);
    tur.yaw = wrapAngle(tur.yaw);
    tur.pitch = clamp(
      lerp(tur.pitch, inp.aimPitch, clamp(dt * 8, 0, 1)),
      w.turretMinPitch,
      w.turretMaxPitch,
    );
    tur.cannonCooldown = Math.max(0, tur.cannonCooldown - dt);
    tur.mgCooldown = Math.max(0, tur.mgCooldown - dt);
    tur.cannonFlash = Math.max(0, tur.cannonFlash - dt);
    tur.jackpotCooldown = Math.max(0, tur.jackpotCooldown - dt);

    // Machine gun.
    if (inp.mg && !this.lastMgDown) this.push('shot', t.x, t.y + 1.5, t.z, { kind: 'mgStart' });
    if (inp.mg && tur.mgCooldown <= 0) {
      tur.mgCooldown = 1 / (w.mgRate * this.mcfg.mgRate);
      this.fireMachineGun();
      tur.mgFiring = true;
    } else if (!inp.mg) {
      tur.mgFiring = false;
    }
    this.lastMgDown = inp.mg;

    // Main cannon (edge-triggered, duplicate-proof via server validation).
    if (inp.cannon && !this.lastCannonDown && tur.cannonCooldown <= 0) {
      tur.cannonCooldown = this.mcfg.cannonCooldown;
      this.pendingBursts = this.mcfg.cannonBurst - 1;
      this.pendingBurstT = 0;
      this.fireCannon();
    }
    if (this.pendingBursts > 0) {
      this.pendingBurstT += dt;
      if (this.pendingBurstT >= 0.12) {
        this.pendingBurstT = 0;
        this.pendingBursts--;
        this.fireCannon();
      }
    }
    this.lastCannonDown = inp.cannon;

    // JACKPOT charge.
    if (inp.charge && tur.jackpotReady) {
      tur.chargeT += dt;
      if (tur.chargeT >= w.jackpotChargeTime) {
        this.fireJackpot();
        tur.chargeT = 0;
        s.stats.jackpotMeter = 0;
        tur.jackpotReady = false;
      }
    } else if (!inp.charge && tur.chargeT > 0) {
      tur.chargeT = Math.max(0, tur.chargeT - dt * 2);
    }
    this.lastChargeDown = inp.charge;
  }

  private fireMachineGun() {
    const s = this.state;
    const t = s.tank;
    const muzzle = this.muzzleWorld();
    const w = this.cfg.weapons;
    const spread = w.mgSpread;
    const dx = muzzle.dx + (Math.random() - 0.5) * spread;
    const dy = muzzle.dy + (Math.random() - 0.5) * spread;
    const dz = muzzle.dz + (Math.random() - 0.5) * spread;
    const dl = Math.hypot(dx, dy, dz);
    const nx = dx / dl;
    const ny = dy / dl;
    const nz = dz / dl;
    this.applyRecoil(-nx, -nz, this.cfg.tank.mgRecoilImpulse, 0.05);
    this.push('shot', muzzle.x, muzzle.y, muzzle.z, { kind: 'mg', tx: nx, ty: ny, tz: nz });

    // Hitscan against enemies and barrels.
    let bestT = w.mgRange;
    let bestEnemy: EnemyState | null = null;
    for (const e of s.enemies) {
      if (!e.alive || e.type === 'gunTower') continue;
      const r = enemyRadius(e.type, this.cfg) + 0.45;
      const ox = e.x - muzzle.x;
      const oy = e.y + 0.6 - muzzle.y;
      const oz = e.z - muzzle.z;
      const b = ox * nx + oy * ny + oz * nz;
      if (b < 0 || b > bestT) continue;
      const c = ox * ox + oy * oy + oz * oz - b * b;
      if (c <= r * r && b < bestT) {
        bestT = b;
        bestEnemy = e;
      }
    }
    let bestBarrel: BarrelState | null = null;
    let bestBarrelT = w.mgRange;
    for (const b of s.barrels) {
      if (b.exploded) continue;
      const ox = b.x - muzzle.x;
      const oy = 0.7 - muzzle.y;
      const oz = b.z - muzzle.z;
      const bt = ox * nx + oy * ny + oz * nz;
      if (bt < 0 || bt > bestBarrelT) continue;
      const c = ox * ox + oy * oy + oz * oz - bt * bt;
      if (c <= 1.0 * 1.0 && bt < bestBarrelT) {
        bestBarrelT = bt;
        bestBarrel = b;
      }
    }
    if (bestEnemy && (!bestBarrel || bestT <= bestBarrelT)) {
      const hitX = muzzle.x + nx * bestT;
      const hitY = muzzle.y + ny * bestT;
      const hitZ = muzzle.z + nz * bestT;
      this.push('mgHit', hitX, hitY, hitZ);
      this.damageEnemy(bestEnemy, w.mgDamage, 'mg');
      return;
    }
    if (bestBarrel) {
      const hitX = muzzle.x + nx * bestBarrelT;
      const hitY = muzzle.y + ny * bestBarrelT;
      const hitZ = muzzle.z + nz * bestBarrelT;
      this.push('mgHit', hitX, hitY, hitZ);
      this.damageBarrel(bestBarrel, w.mgDamage);
    }
  }

  private fireCannon() {
    const s = this.state;
    const t = s.tank;
    const tur = s.turret;
    const muzzle = this.muzzleWorld();
    const w = this.cfg.weapons;
    tur.cannonFlash = 0.12;
    // Recoil: opposite the barrel, strongest normal force in the game.
    this.applyRecoil(-muzzle.dx, -muzzle.dz, this.mcfg.recoilImpulse, this.cfg.tank.recoilSpin);
    this.push('shot', muzzle.x, muzzle.y, muzzle.z, { kind: 'cannon', tx: muzzle.dx, ty: muzzle.dy, tz: muzzle.dz });
    this.spawnShell(muzzle.x, muzzle.y, muzzle.z, muzzle.dx, muzzle.dy, muzzle.dz, w.cannonSpeed, 'cannon', w.cannonGravity, w.cannonLife);
    // Gunner contribution for the cannon blast.
    this.addContribution('gunner', 1, 0);
    if (t.brace) {
      this.addLink('braceShot');
    }
  }

  private fireJackpot() {
    const s = this.state;
    const t = s.tank;
    const tur = s.turret;
    const muzzle = this.muzzleWorld();
    const w = this.cfg.weapons;
    s.stats.jackpotFired++;
    tur.cannonFlash = 0.3;
    tur.jackpotCooldown = this.cfg.jackpot.jackpotCooldown;
    this.applyRecoil(-muzzle.dx, -muzzle.dz, this.cfg.tank.jackpotRecoilImpulse * (t.brace ? this.cfg.tank.jackpotBraceMult : 1), this.cfg.tank.jackpotSpin);
    this.push('jackpotFire', muzzle.x, muzzle.y, muzzle.z, { tx: muzzle.dx, ty: muzzle.dy, tz: muzzle.dz });
    this.spawnShell(muzzle.x, muzzle.y, muzzle.z, muzzle.dx, muzzle.dy, muzzle.dz, w.jackpotSpeed, 'jackpot', w.cannonGravity * 0.6, w.jackpotLife);
    if (t.brace) {
      this.addLink('braceShot');
      this.addScore(150, 'JACKPOT BRACE BONUS');
    }
    this.addContribution('gunner', 4, 0);
  }

  private spawnShell(x: number, y: number, z: number, dx: number, dy: number, dz: number, speed: number, kind: ShellState['kind'], gravity: number, life: number) {
    const s = this.state;
    s.shells.push({
      id: s.nextShellId++,
      kind,
      x,
      y,
      z,
      vx: dx * speed,
      vy: dy * speed,
      vz: dz * speed,
      life,
    });
  }

  private stepShells(dt: number) {
    const s = this.state;
    const w = this.cfg.weapons;
    const keep: ShellState[] = [];
    for (const sh of s.shells) {
      sh.life -= dt;
      sh.x += sh.vx * dt;
      sh.y += sh.vy * dt;
      sh.z += sh.vz * dt;
      if (sh.kind === 'cannon' || sh.kind === 'jackpot') {
        sh.vy -= w.cannonGravity * dt;
      }
      if (sh.kind === 'tower') {
        const td = dist(sh.x, sh.z, s.tank.x, s.tank.z);
        if (td < 1.05 && s.tank.deadT <= 0) {
          this.damageTank(this.cfg.enemies.towerShotDamage, 'tower');
          this.push('hit', s.tank.x, s.tank.y + 1.2, s.tank.z, {
            value: this.cfg.enemies.towerShotDamage,
            kind: 'tower',
          });
          continue;
        }
      }
      const h = groundHeightAt(sh.x, sh.z);
      let exploded = false;
      if (sh.y <= h + 0.05) {
        sh.y = h + 0.05;
        exploded = true;
      }
      if (!exploded) {
        const r = sh.kind === 'jackpot' ? 1.4 : 0.9;
        for (const o of ARENA.obstacles) {
          if (pointInBox(sh.x, sh.z, o.x, o.z, o.w + r * 2, o.d + r * 2)) {
            exploded = true;
            break;
          }
        }
      }
      if (!exploded) {
        for (const e of s.enemies) {
          if (!e.alive || e.type === 'gunTower') continue;
          const rr = enemyRadius(e.type, this.cfg) + 0.7;
          if (dist2(sh.x, sh.z, e.x, e.z) < rr * rr) {
            exploded = true;
            break;
          }
        }
      }
      if (exploded || sh.life <= 0) {
        this.explodeShell(sh);
        continue;
      }
      keep.push(sh);
    }
    s.shells = keep;
  }

  private explodeShell(sh: ShellState) {
    const s = this.state;
    const w = this.cfg.weapons;
    const isJackpot = sh.kind === 'jackpot';
    const radius = isJackpot ? w.jackpotRadius : w.cannonRadius;
    const dmg = isJackpot ? w.jackpotDamage : w.cannonDamage;
    if (isJackpot) {
      this.push('jackpotImpact', sh.x, sh.y, sh.z, { value: radius });
      this.addContribution('gunner', 2, 0);
    } else {
      this.push('enemyExplosion', sh.x, sh.y, sh.z, { value: radius, kind: 'cannon' });
    }
    // Damage enemies.
    for (const e of s.enemies) {
      if (!e.alive) continue;
      const d = dist(sh.x, sh.z, e.x, e.z);
      const rr = enemyRadius(e.type, this.cfg);
      if (d < radius + rr) {
        const falloff = d < radius * 0.45 ? 1 : 0.65;
        this.damageEnemy(e, dmg * falloff, isJackpot ? 'jackpot' : 'cannon');
      }
    }
    // Chain barrels.
    for (const b of s.barrels) {
      if (b.exploded) continue;
      const d = dist(sh.x, sh.z, b.x, b.z);
      if (d < (isJackpot ? w.barrelChainRadius * 2 : this.mcfg.barrelRadius) + 0.8) {
        this.damageBarrel(b, 999);
      }
    }
    // Tank splash (modest, keeps failures funny not brutal).
    const tankD = dist(sh.x, sh.z, s.tank.x, s.tank.z);
    if (tankD < radius + 1.5) {
      this.damageTank(isJackpot ? 12 : 5, 'splash');
    }
  }

  // -------------------------------------------------------------- enemies
  spawnEnemy(type: EnemyType, x?: number, z?: number): EnemyState | null {
    const s = this.state;
    const e = this.cfg.enemies;
    let sx = x;
    let sz = z;
    if (sx === undefined || sz === undefined) {
      const gates = ARENA.bugSpawns;
      for (let i = 0; i < 12; i++) {
        const g = gates[Math.floor(Math.random() * gates.length)];
        const px = g.x + (Math.random() - 0.5) * 4;
        const pz = g.z + (Math.random() - 0.5) * 4;
        if (dist2(px, pz, s.tank.x, s.tank.z) > 10 * 10) {
          sx = px;
          sz = pz;
          break;
        }
      }
      if (sx === undefined) {
        sx = -30;
        sz = -30;
      }
    }
    const hpMap: Record<EnemyType, number> = {
      scrapBug: e.bugHp,
      rammer: e.rammerHp,
      gunTower: e.towerHp,
      lootTruck: e.truckHp,
    };
    const enemy: EnemyState = {
      id: s.nextEnemyId++,
      type,
      x: sx!,
      y: groundHeightAt(sx!, sz!),
      z: sz!,
      yaw: Math.atan2(s.tank.x - sx!, s.tank.z - sz!),
      hp: hpMap[type],
      maxHp: hpMap[type],
      state: type === 'rammer' ? 'approach' : type === 'gunTower' ? 'idle' : 'hunt',
      stateT: 0,
      aimYaw: 0,
      speed: 0,
      alive: true,
      telegraph: 0,
      flash: 0,
      spawnT: s.time,
      hitCd: 0,
    };
    if (type === 'gunTower') {
      enemy.x = x ?? 0;
      enemy.z = z ?? 0;
    }
    s.enemies.push(enemy);
    return enemy;
  }

  private stepEnemies(dt: number) {
    const s = this.state;
    const t = s.tank;
    for (const e of s.enemies) {
      if (!e.alive) {
        e.stateT += dt;
        continue;
      }
      e.stateT += dt;
      e.flash = Math.max(0, e.flash - dt);
      e.telegraph = Math.max(0, e.telegraph - dt);
      e.hitCd = Math.max(0, (e.hitCd ?? 0) - dt);
      const r = enemyRadius(e.type, this.cfg);

      if (e.type === 'scrapBug') {
        this.stepBug(e, dt, r);
      } else if (e.type === 'rammer') {
        this.stepRammer(e, dt, r);
      } else if (e.type === 'gunTower') {
        this.stepTower(e, dt);
      } else if (e.type === 'lootTruck') {
        this.stepTruck(e, dt);
      }
    }
    s.enemies = s.enemies.filter((e) => e.alive || e.stateT <= 2.5);
  }

  private stepBug(e: EnemyState, dt: number, r: number) {
    const s = this.state;
    const t = s.tank;
    const speed = this.cfg.enemies.bugSpeed + Math.sin(s.time * 1.7 + e.id) * 0.6;
    const dx = t.x - e.x;
    const dz = t.z - e.z;
    const d = Math.hypot(dx, dz) || 1;
    let mx = dx / d;
    let mz = dz / d;
    if (d < 7) {
      // Circle while closing.
      const cw = e.id % 2 === 0 ? 1 : -1;
      mx = mx + (-mz * cw) * 0.85;
      mz = mz + (mx * cw) * 0.85;
      const ml = Math.hypot(mx, mz) || 1;
      mx /= ml;
      mz /= ml;
    }
    // Separation.
    for (const o of s.enemies) {
      if (o === e || !o.alive || o.type !== 'scrapBug') continue;
      const ox = e.x - o.x;
      const oz = e.z - o.z;
      const od = Math.hypot(ox, oz);
      if (od < 2.4 && od > 0.01) {
        mx += (ox / od) * 0.8;
        mz += (oz / od) * 0.8;
      }
    }
    // Obstacle avoidance.
    const aheadX = e.x + mx * 2;
    const aheadZ = e.z + mz * 2;
    if (obstacleAt(aheadX, aheadZ)) {
      const ang = Math.atan2(mx, mz);
      const side = e.id % 2 === 0 ? 1 : -1;
      const newAng = ang + side * 1.1;
      mx = Math.sin(newAng);
      mz = Math.cos(newAng);
    }
    const ml = Math.hypot(mx, mz) || 1;
    e.x += (mx / ml) * speed * dt;
    e.z += (mz / ml) * speed * dt;
    e.y = groundHeightAt(e.x, e.z);
    e.yaw = angleLerp(e.yaw, Math.atan2(mx, mz), clamp(dt * 6, 0, 1));
    const col = resolveCircle(e.x, e.z, r);
    e.x = col.x;
    e.z = col.z;
    if (d < r + this.cfg.arena.tankRadius + 0.4 && (e.hitCd ?? 0) <= 0 && t.deadT <= 0) {
      e.hitCd = 1.0;
      const tankSpeed = Math.hypot(t.vx, t.vz);
      if (tankSpeed > 5) {
        this.damageEnemy(e, 999, 'ram');
        t.vx *= 0.92;
        t.vz *= 0.92;
        this.addScore(20, 'RAM');
        this.addDriverContribution(1, this.cfg.jackpot.ramGain, 'RAM');
      } else {
        this.damageTank(this.cfg.enemies.bugDamage, 'bug');
        this.push('crash', e.x, e.y, e.z, { value: this.cfg.enemies.bugDamage });
        e.x -= mx * 0.8;
        e.z -= mz * 0.8;
      }
    }
  }

  private stepRammer(e: EnemyState, dt: number, r: number) {
    const s = this.state;
    const t = s.tank;
    const cfg = this.cfg.enemies;
    const dx = t.x - e.x;
    const dz = t.z - e.z;
    const d = Math.hypot(dx, dz) || 1;
    const toTank = Math.atan2(dx, dz);
    switch (e.state) {
      case 'approach':
        e.yaw = angleLerp(e.yaw, toTank, clamp(dt * 3, 0, 1));
        e.x += Math.sin(e.yaw) * cfg.rammerApproachSpeed * dt;
        e.z += Math.cos(e.yaw) * cfg.rammerApproachSpeed * dt;
        if (d < 16) {
          e.state = 'lock';
          e.stateT = 0;
        }
        break;
      case 'lock': {
        e.aimYaw = toTank;
        e.yaw = e.aimYaw;
        if (e.stateT >= cfg.rammerLockTime) {
          e.state = 'telegraph';
          e.stateT = 0;
          e.telegraph = cfg.rammerTelegraphTime;
          this.push('rammerTelegraph', e.x, e.y + 1, e.z, { id: e.id, tx: e.x + Math.sin(e.aimYaw) * 6, tz: e.z + Math.cos(e.aimYaw) * 6 });
        }
        break;
      }
      case 'telegraph':
        e.yaw = e.aimYaw;
        if (e.stateT >= cfg.rammerTelegraphTime) {
          e.state = 'charge';
          e.stateT = 0;
          this.dodgeAwarded = false;
        }
        break;
      case 'charge': {
        e.yaw = e.aimYaw;
        e.x += Math.sin(e.yaw) * cfg.rammerChargeSpeed * dt;
        e.z += Math.cos(e.yaw) * cfg.rammerChargeSpeed * dt;
        // Dodge credit when the Driver slips past a charging Rammer.
        if (!this.dodgeAwarded && d < 3.6) {
          this.dodgeAwarded = true;
          this.addDriverContribution(2, this.cfg.jackpot.dodgeGain, 'DODGE');
        }
        const col = resolveCircle(e.x, e.z, r);
        if (col.hit) {
          e.state = 'recovery';
          e.stateT = 0;
          e.x = col.x;
          e.z = col.z;
          break;
        }
        if (d < r + this.cfg.arena.tankRadius + 0.5 && t.deadT <= 0) {
          this.damageTank(cfg.rammerDamage, 'rammer');
          const nx = dx / d;
          const nz = dz / d;
          t.vx += nx * 7;
          t.vz += nz * 7;
          this.push('crash', e.x, e.y + 1, e.z, { value: cfg.rammerDamage });
          e.state = 'recovery';
          e.stateT = 0;
        }
        if (e.stateT >= cfg.rammerChargeTime) {
          e.state = 'recovery';
          e.stateT = 0;
        }
        break;
      }
      case 'recovery':
        e.speed = Math.max(0, e.speed - dt * 8);
        e.x += Math.sin(e.yaw) * e.speed * dt;
        e.z += Math.cos(e.yaw) * e.speed * dt;
        if (e.stateT >= cfg.rammerRecoveryTime) {
          e.state = 'approach';
          e.stateT = 0;
        }
        break;
    }
    e.y = groundHeightAt(e.x, e.z);
  }

  private stepTower(e: EnemyState, dt: number) {
    const s = this.state;
    const t = s.tank;
    const cfg = this.cfg.enemies;
    const toTank = Math.atan2(t.x - e.x, t.z - e.z);
    e.aimYaw = angleLerp(e.aimYaw, toTank, clamp(dt * cfg.towerTrackRate, 0, 1));
    if (e.state === 'idle') {
      if (e.stateT >= 1.2) {
        e.state = 'telegraph';
        e.stateT = 0;
        e.telegraph = cfg.towerTelegraphTime;
        this.push('rammerTelegraph', e.x, e.y + 2.2, e.z, { id: e.id, kind: 'tower', tx: t.x, tz: t.z });
      }
    } else if (e.state === 'telegraph') {
      if (e.stateT >= cfg.towerTelegraphTime) {
        e.state = 'fire';
        e.stateT = 0;
        e.shotsFired = 0;
      }
    } else if (e.state === 'fire') {
      if (e.stateT >= cfg.towerShotInterval) {
        const yaw = e.aimYaw + (Math.random() - 0.5) * 0.05;
        const mx = e.x + Math.sin(yaw) * 1.3;
        const mz = e.z + Math.cos(yaw) * 1.3;
        const my = e.y + 2.4;
        const d = Math.hypot(t.x - mx, t.z - mz) || 1;
        const sx = (t.x - mx) / d;
        const sz = (t.z - mz) / d;
        const sy = clamp((t.y + 1.2 - my) / d, -0.15, 0.35);
        s.shells.push({
          id: s.nextShellId++,
          kind: 'tower',
          x: mx,
          y: my,
          z: mz,
          vx: sx * cfg.towerShotSpeed,
          vy: sy * cfg.towerShotSpeed,
          vz: sz * cfg.towerShotSpeed,
          life: 6,
        });
        this.push('towerFire', mx, my, mz, { id: e.id, tx: t.x, ty: t.y + 1, tz: t.z });
        e.shotsFired = (e.shotsFired ?? 0) + 1;
        if (e.shotsFired >= cfg.towerShotCount) {
          e.state = 'pause';
          e.stateT = 0;
        } else {
          e.stateT = 0;
        }
      }
    } else if (e.state === 'pause') {
      if (e.stateT >= cfg.towerFirePause) {
        e.state = 'idle';
        e.stateT = 0;
      }
    }
  }

  private stepTruck(e: EnemyState, dt: number) {
    const s = this.state;
    const truck = s.truck;
    if (!truck.active) return;
    truck.sirenT += dt;
    const route = ARENA.truckRoute;
    const wp = route[truck.waypoint];
    const dx = wp.x - truck.x;
    const dz = wp.z - truck.z;
    const d = Math.hypot(dx, dz) || 1;
    truck.yaw = angleLerp(truck.yaw, Math.atan2(dx, dz), clamp(dt * 3, 0, 1));
    truck.x += (dx / d) * this.cfg.enemies.truckSpeed * dt;
    truck.z += (dz / d) * this.cfg.enemies.truckSpeed * dt;
    truck.y = groundHeightAt(truck.x, truck.z);
    e.x = truck.x;
    e.y = truck.y;
    e.z = truck.z;
    e.yaw = truck.yaw;
    const col = resolveCircle(truck.x, truck.z, this.cfg.arena.truckRadius);
    truck.x = col.x;
    truck.z = col.z;
    if (d < 2.5) {
      truck.waypoint++;
      if (truck.waypoint >= route.length) {
        truck.waypoint = 0;
        if (s.time > this.cfg.enemies.truckEscapeTime - 8) {
          truck.escaped = true;
          truck.active = false;
          e.alive = false;
          this.push('truckEscape', truck.x, truck.y + 1, truck.z);
          this.spawnPickup('heavy', truck.x, truck.z);
        }
      }
    }
    if (s.time > this.cfg.enemies.truckEscapeTime && truck.active) {
      truck.escaped = true;
      truck.active = false;
      e.alive = false;
      this.push('truckEscape', truck.x, truck.y + 1, truck.z);
      this.spawnPickup('heavy', truck.x, truck.z);
    }
    // Truck collision with tank: pushes both apart, no integrity loss.
    const td = dist(truck.x, truck.z, s.tank.x, s.tank.z);
    if (td < this.cfg.arena.truckRadius + this.cfg.arena.tankRadius + 0.3) {
      const nx = (s.tank.x - truck.x) / (td || 1);
      const nz = (s.tank.z - truck.z) / (td || 1);
      s.tank.vx += nx * 4;
      s.tank.vz += nz * 4;
      truck.x -= nx * 0.7;
      truck.z -= nz * 0.7;
      this.push('crash', truck.x, truck.y + 1, truck.z, { value: 0, kind: 'truck' });
    }
  }

  private stepSpawns(dt: number) {
    const s = this.state;
    const cfg = this.cfg.enemies;
    const ac = this.cfg.arena;
    // Scrap Bugs: ramp from the opening pair up to the target active count.
    const bugCount = s.enemies.filter((e) => e.alive && e.type === 'scrapBug').length;
    const target = Math.min(
      Math.round(ac.minActiveBugs * this.mcfg.maxBugs),
      ac.maxActiveBugs,
      Math.max(2, Math.floor(2 + s.time * 0.22)),
    );
    if (bugCount < target && s.enemies.length < 22) {
      this.spawnEnemy('scrapBug');
    }
    // Rammer schedule.
    while (this.rammerSpawnIdx < this.rammerSpawns.length && s.time >= this.rammerSpawns[this.rammerSpawnIdx]) {
      const rammers = s.enemies.filter((e) => e.alive && e.type === 'rammer').length;
      if (rammers < Math.round(ac.maxRammers * this.mcfg.maxRammers)) {
        this.spawnEnemy('rammer');
      }
      this.rammerSpawnIdx++;
    }
    // Gun towers.
    while (this.towerSpawnIdx < this.towerSpawns.length && s.time >= this.towerSpawns[this.towerSpawnIdx]) {
      const towers = s.enemies.filter((e) => e.alive && e.type === 'gunTower').length;
      const spot = ARENA.towerSpots[this.towerSpawnIdx % ARENA.towerSpots.length];
      if (towers < Math.round(ac.maxTowers * this.mcfg.maxTowers)) {
        this.spawnEnemy('gunTower', spot.x, spot.z);
      }
      this.towerSpawnIdx++;
    }
    // Loot truck.
    if (!this.truckSpawned && s.time >= cfg.truckSpawnTime) {
      this.truckSpawned = true;
      const start = ARENA.truckRoute[0];
      s.truck.active = true;
      s.truck.x = start.x;
      s.truck.y = groundHeightAt(start.x, start.z);
      s.truck.z = start.z;
      s.truck.hp = cfg.truckHp;
      const e = this.spawnEnemy('lootTruck', start.x, start.z);
      if (e) {
        e.state = 'route';
        this.push('truckSpawn', start.x, s.truck.y + 1, start.z);
      }
    }
    // Final chaos: replace dead Rammers during the last 20 seconds.
    if (s.time > 70) {
      const rammers = s.enemies.filter((e) => e.alive && e.type === 'rammer').length;
      if (rammers < Math.min(3, Math.round(ac.maxRammers * this.mcfg.maxRammers)) && Math.random() < dt * 0.12) {
        this.spawnEnemy('rammer');
      }
      const towers = s.enemies.filter((e) => e.alive && e.type === 'gunTower').length;
      if (towers < Math.round(ac.maxTowers * this.mcfg.maxTowers) && Math.random() < dt * 0.08) {
        this.spawnEnemy('gunTower', ARENA.towerSpots[Math.floor(Math.random() * ARENA.towerSpots.length)].x, ARENA.towerSpots[Math.floor(Math.random() * ARENA.towerSpots.length)].z);
      }
    }
  }

  private stepAssistance() {
    const s = this.state;
    const j = this.cfg.jackpot;
    if (s.stats.anyContribution && s.stats.kills + s.stats.scrapCollected >= j.assistRequireContributions) {
      if (s.time >= 55 && s.time < 66 && s.stats.jackpotMeter < j.assistFloor55) {
        s.stats.jackpotMeter = j.assistFloor55;
        this.push('assist', s.tank.x, s.tank.y, s.tank.z, { label: 'JACKPOT ASSIST' });
      }
      if (s.time >= 66 && s.stats.jackpotMeter < j.assistFloor66) {
        s.stats.jackpotMeter = j.assistFloor66;
        this.push('assist', s.tank.x, s.tank.y, s.tank.z, { label: 'JACKPOT ASSIST' });
      }
      if (s.time >= 70 && s.stats.jackpotMeter < j.assistFloor70) {
        s.stats.jackpotMeter = j.assistFloor70;
        this.push('assist', s.tank.x, s.tank.y, s.tank.z, { label: 'JACKPOT READY' });
      }
    }
    this.state.turret.jackpotReady = s.stats.jackpotMeter >= 100 && s.turret.jackpotCooldown <= 0;
  }

  // -------------------------------------------------------------- barrels
  private damageBarrel(b: BarrelState, dmg: number) {
    if (b.exploded) return;
    b.hp = (b.hp ?? 0) + dmg;
    if (b.hp >= this.cfg.weapons.barrelHp) {
      b.exploded = true;
      b.fuseT = 0.14;
    }
  }

  private stepBarrels(dt: number) {
    const s = this.state;
    const w = this.cfg.weapons;
    for (const b of s.barrels) {
      if (b.exploded && b.fuseT > 0) {
        b.fuseT -= dt;
        if (b.fuseT <= 0) {
          this.explodeBarrel(b);
        }
      }
      b.flash = Math.max(0, b.flash - dt);
    }
  }

  private explodeBarrel(b: BarrelState) {
    const s = this.state;
    const w = this.cfg.weapons;
    const radius = this.mcfg.barrelRadius;
    const dmg = 26;
    b.flash = 0.3;
    this.push('barrelExplode', b.x, 0.8, b.z, { value: radius });
    this.addContribution('gunner', 3, 0);
    for (const e of s.enemies) {
      if (!e.alive) continue;
      const d = dist(b.x, b.z, e.x, e.z);
      if (d < radius + enemyRadius(e.type, this.cfg)) {
        this.damageEnemy(e, dmg, 'barrel');
      }
    }
    const tankD = dist(b.x, b.z, s.tank.x, s.tank.z);
    if (tankD < radius + 1.6) {
      this.damageTank(10, 'barrel');
    }
    // Chain reaction.
    for (const other of s.barrels) {
      if (other.exploded || other === b) continue;
      if (dist(b.x, b.z, other.x, other.z) < w.barrelChainRadius) {
        this.damageBarrel(other, 999);
        this.push('chainExplode', other.x, 0.8, other.z, { id: other.id });
      }
    }
  }

  // --------------------------------------------------------------- damage
  damageEnemy(e: EnemyState, dmg: number, source: string) {
    if (!e.alive) return;
    if (source === 'mg') this.addContribution('gunner', 0.2, 0);
    e.hp -= dmg;
    e.flash = 0.12;
    const rearBonus = e.type === 'rammer' && e.state === 'recovery' ? 1.5 : 1;
    e.hp -= dmg * (rearBonus - 1);
    this.push('hit', e.x, e.y + 0.8, e.z, { value: dmg, id: e.id, kind: e.type });
    if (e.hp <= 0) {
      this.killEnemy(e, source);
    }
  }

  private killEnemy(e: EnemyState, source: string) {
    const s = this.state;
    e.alive = false;
    e.state = 'dead';
    e.stateT = 0;
    if (e.type === 'lootTruck') {
      s.truck.active = false;
    }
    const sc = this.cfg.scoring;
    const j = this.cfg.jackpot;
    s.stats.kills++;
    const chaosMult = s.time > j.finalChaosStart ? j.finalChaosMult : 1;
    let score = 0;
    let jackpot = 0;
    let scrap: ScrapKind | null = null;
    let contributionRole: Role = 'gunner';
    let contributionPoints = 2;
    if (e.type === 'scrapBug') {
      score = sc.bugScore;
      jackpot = j.bugGain;
      scrap = 'normal';
    } else if (e.type === 'rammer') {
      score = sc.rammerScore;
      jackpot = j.rammerGain;
      scrap = 'heavy';
      if (source === 'ram') s.stats.ramKills++;
    } else if (e.type === 'gunTower') {
      score = sc.towerScore;
      jackpot = j.towerGain;
      scrap = 'heavy';
      contributionPoints = 3;
    } else if (e.type === 'lootTruck') {
      score = sc.truckScore;
      jackpot = j.truckGain;
      contributionPoints = 4;
      this.dropJackpotScrap(e.x, e.z);
    }
    this.addScore(score, e.type.toUpperCase());
    this.addJackpot(jackpot * chaosMult);
    this.addContribution(contributionRole, contributionPoints, 0);
    if (scrap) {
      if (e.type === 'gunTower') {
        this.spawnPickup('heavy', e.x, e.z);
        this.spawnPickup('normal', e.x + 1, e.z);
        this.spawnPickup('normal', e.x - 1, e.z);
      } else if (e.type === 'rammer') {
        this.spawnPickup('heavy', e.x, e.z);
        this.spawnPickup('normal', e.x + 1.2, e.z);
      } else {
        this.spawnPickup(scrap, e.x, e.z);
      }
    }
    this.lastKillAt = s.time;
    this.lastKillKind = scrap;
    this.push('kill', e.x, e.y + 1, e.z, { id: e.id, kind: e.type, value: score, label: `+${Math.floor(score * this.state.combo.multiplier)}` });
    if (source === 'ram') {
      this.addDriverContribution(2, j.ramGain, 'RAMPAGE');
    }
  }

  private dropJackpotScrap(x: number, z: number) {
    for (let i = 0; i < 5; i++) {
      const ang = (i / 5) * Math.PI * 2 + Math.random() * 0.6;
      this.spawnPickup('jackpot', x + Math.cos(ang) * (1.4 + Math.random() * 2.2), z + Math.sin(ang) * (1.4 + Math.random() * 2.2));
    }
  }

  // -------------------------------------------------------------- pickups
  private spawnPickup(kind: ScrapKind, x: number, z: number) {
    const s = this.state;
    if (s.pickups.filter((p) => !p.collected).length >= this.cfg.arena.maxPickups) {
      const oldest = s.pickups.find((p) => !p.collected);
      if (oldest) oldest.collected = true;
    }
    s.pickups.push({
      id: s.nextPickupId++,
      kind,
      x,
      y: groundHeightAt(x, z) + 0.55,
      z,
      life: (kind === 'jackpot' ? 16 : 26) * this.mcfg.pickupLife,
      collected: false,
    });
  }

  private stepPickups(dt: number) {
    const s = this.state;
    const t = s.tank;
    if (t.deadT > 0) return;
    const magnetMult = this.mcfg.pickupMagnet;
    const baseRadius: Record<ScrapKind, number> = { normal: 5, heavy: 6.5, jackpot: 8 };
    for (const p of s.pickups) {
      if (p.collected) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.collected = true;
        continue;
      }
      const d = dist(p.x, p.z, t.x, t.z);
      const magnet = baseRadius[p.kind] * magnetMult;
      if (d < magnet) {
        const pull = 11 + (magnet - d) * 1.4;
        const nx = (t.x - p.x) / (d || 1);
        const nz = (t.z - p.z) / (d || 1);
        p.x += nx * pull * dt;
        p.z += nz * pull * dt;
        p.y += (t.y + 0.7 - p.y) * clamp(dt * 3, 0, 1);
      }
      if (d < 1.15) {
        p.collected = true;
        this.collectPickup(p);
      }
    }
  }

  private collectPickup(p: PickupState) {
    const s = this.state;
    const sc = this.cfg.scoring;
    const j = this.cfg.jackpot;
    const speed = Math.hypot(s.tank.vx, s.tank.vz);
    let score = 0;
    let jackpot = 0;
    if (p.kind === 'normal') {
      score = sc.normalScrap;
      jackpot = j.normalScrapGain;
    } else if (p.kind === 'heavy') {
      score = sc.heavyScrap;
      jackpot = j.heavyScrapGain;
    } else {
      score = sc.jackpotScrap;
      jackpot = j.jackpotScrapGain;
    }
    this.addScore(score, p.kind === 'jackpot' ? 'JACKPOT SCRAP' : 'SCRAP');
    this.addJackpot(jackpot);
    s.stats.scrapCollected++;
    let extra = '';
    if (speed > 12) {
      this.addScore(25, 'AT SPEED');
      this.addJackpot(j.speedCollectGain);
      extra = 'SPEED';
    }
    if (s.time - this.lastKillAt < 3) {
      this.addLink('scrapLoop');
      extra = extra ? 'LINK' : 'LINK';
    }
    this.addContribution('driver', p.kind === 'jackpot' ? 3 : 1, 0);
    this.push('pickup', p.x, p.y, p.z, { kind: p.kind, value: score, label: extra });
  }

  // ---------------------------------------------------------- score/combo
  private addScore(value: number, label?: string) {
    const s = this.state;
    const gained = Math.round(value * s.combo.multiplier);
    s.stats.score += gained;
    if (label) this.push('score', s.tank.x, s.tank.y + 2, s.tank.z, { value: gained, label });
  }

  addJackpot(amount: number) {
    const s = this.state;
    s.stats.jackpotMeter = clamp(s.stats.jackpotMeter + amount * this.mcfg.jackpotGainMult, 0, 100);
    const ready = s.stats.jackpotMeter >= 100 && s.turret.jackpotCooldown <= 0;
    if (ready && !s.turret.jackpotReady) {
      this.push('assist', s.tank.x, s.tank.y + 2.2, s.tank.z, { label: 'JACKPOT READY' });
    }
    s.turret.jackpotReady = ready;
  }

  addContribution(role: Role, points: number, _jackpotExtra: number) {
    this.state.stats.anyContribution = true;
    const c = this.state.combo;
    if (role === 'driver') {
      c.lastDriverT = this.state.time;
    } else {
      c.lastGunnerT = this.state.time;
    }
    c.lastAnyT = this.state.time;
    c.points += points;
    this.recalcCombo();
  }

  private addDriverContribution(points: number, jackpotGain: number, label: string) {
    this.addContribution('driver', points, 0);
    this.addJackpot(jackpotGain);
    if (label) this.push('score', this.state.tank.x, this.state.tank.y + 2, this.state.tank.z, { value: 0, label });
  }

  private stepCombo(dt: number) {
    const c = this.state.combo;
    if (this.state.time - c.lastAnyT > this.cfg.scoring.comboDecayTime && c.multiplier > 1) {
      c.points = 0;
      c.multiplier = 1;
      this.push('comboChange', 0, 0, 0, { value: 1 });
    }
  }

  private recalcCombo() {
    const c = this.state.combo;
    const sc = this.cfg.scoring;
    const bothRecent = this.state.time - c.lastDriverT < sc.comboBothWindow && this.state.time - c.lastGunnerT < sc.comboBothWindow;
    let level = 1 + Math.floor(c.points / sc.comboPointsPerLevel);
    if (level > 2 && !bothRecent) level = 2;
    level = Math.min(level, sc.comboMax);
    if (level !== c.multiplier) {
      c.multiplier = level;
      c.best = Math.max(c.best, level);
      this.push('comboChange', 0, 0, 0, { value: level });
    }
  }

  private addLink(kind: 'braceShot' | 'scrapLoop' | 'ramFinish') {
    const sc = this.cfg.scoring;
    let value = 0;
    let label = '';
    if (kind === 'braceShot') {
      value = sc.linkBraceShot;
      label = 'CREW LINK: BRACE SHOT';
    } else if (kind === 'scrapLoop') {
      value = sc.linkScrapLoop;
      label = 'CREW LINK: SCRAP LOOP';
    } else {
      value = sc.linkRamFinish;
      label = 'CREW LINK: RAM FINISH';
    }
    this.state.stats.links++;
    this.addScore(value, label);
    this.addJackpot(this.cfg.jackpot.braceShotGain);
    this.push('link', this.state.tank.x, this.state.tank.y + 2, this.state.tank.z, { label });
  }

  // ---------------------------------------------------------------- misc
  private push(type: SimEvent['type'], x?: number, y?: number, z?: number, extra?: Partial<SimEvent>) {
    this.events.push({ type, t: this.state.time, x, y, z, ...extra });
  }
}
