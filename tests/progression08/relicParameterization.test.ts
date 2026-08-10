import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ContentLoader } from '../../src/shared/content/contentLoader';
import { ContentValidationError } from '../../src/shared/content/errors';
import { MatchRuntime } from '../../src/shared/sim/matchRuntime';
import { spawnEnemy } from './helpers';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CONTENT_ROOT = path.join(ROOT, 'content');

function loadRealPackRecords(): { manifest: unknown; files: Record<string, unknown> } {
  const manifest = JSON.parse(fs.readFileSync(path.join(CONTENT_ROOT, 'manifest.json'), 'utf8'));
  const files: Record<string, unknown> = {};
  const walk = (dir: string, prefix: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(abs, rel);
      else if (entry.name.endsWith('.json')) files[rel] = JSON.parse(fs.readFileSync(abs, 'utf8'));
    }
  };
  walk(CONTENT_ROOT, '');
  return { manifest, files };
}

function clone(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value));
}

function relicFile(files: Record<string, unknown>, relicId: string): string {
  const rel = Object.keys(files).find((p) =>
    p.endsWith(`relics/${relicId.slice('relic.'.length)}.json`),
  );
  if (!rel) throw new Error(`relic file not found for ${relicId}`);
  return rel;
}

function matchWithRelic(
  relicId: string,
  mutate: (relic: { effects: Array<{ templateId: string; parameters?: Record<string, unknown> }> }) => void,
): ReturnType<typeof MatchRuntime.fromContentPack> {
  const { manifest, files } = loadRealPackRecords();
  const rel = relicFile(files, relicId);
  const relic = clone(files[rel]) as { effects: Array<{ templateId: string; parameters?: Record<string, unknown> }> };
  mutate(relic);
  files[rel] = relic;
  const pack = new ContentLoader().loadFromRecords(manifest, files);
  return MatchRuntime.fromContentPack(pack, 'param-fixture', 'none', 'mode.singlePlayerScoreAttack');
}

describe('relic handler parameterization (progression08 hardening)', () => {
  it('VAMPIRE ROUNDS heal amount comes from content', () => {
    const m = matchWithRelic('relic.vampire_rounds', (relic) => {
      relic.effects[0].parameters = { amountPerStack: 9 };
    });
    m.state.teamProgression.relicStacks['relic.vampire_rounds'] = 2;
    m.state.tank.integrity = 80;
    const e = spawnEnemy(m);
    m.systems.damage.applyEnemy(e, 9999, 'cannon');
    m.takeEvents();
    expect(m.state.tank.integrity).toBe(98);
  });

  it('SAFE HAVEN heal amount comes from content', () => {
    const m = matchWithRelic('relic.safe_haven', (relic) => {
      relic.effects[0].parameters = { amountPerStack: 25 };
    });
    m.state.teamProgression.relicStacks['relic.safe_haven'] = 1;
    m.state.tank.integrity = 70;
    m.systems.progression.notifyWaveCleared(1);
    expect(m.state.tank.integrity).toBe(95);
  });

  it('GROUND POUND damage and knockback come from content', () => {
    const m = matchWithRelic('relic.ground_pound', (relic) => {
      relic.effects[0].parameters = {
        minimumFallDistance: 1.5,
        baseDamagePerStack: 25,
        fallBonusPerMeter: 0,
        maximumFallBonus: 0,
        baseRadius: 3,
        radiusPerMeter: 0,
        maximumRadius: 3,
        baseKnockback: 6,
        knockbackPerMeter: 0,
        maximumKnockback: 6,
      };
    });
    m.state.teamProgression.relicStacks['relic.ground_pound'] = 1;
    const e = spawnEnemy(m, 'enemy.scrapBug', m.state.tank.x + 1.2, m.state.tank.z);
    m.systems.enemySpatial.rebuild(m.state.enemies);
    const hp = e.hp;
    const t = m.state.tank;
    m.systems.progression.notifyLanded({ fallDistance: 3, impactSpeed: 8, x: t.x, y: t.y, z: t.z });
    expect(hp - e.hp).toBe(25);
  });

  it('PHOENIX CORE revive integrity and shockwave damage come from content', () => {
    const m = matchWithRelic('relic.phoenix_core', (relic) => {
      relic.effects[0].parameters = { integrityPercent: 60, shockwaveRadius: 6, shockwaveDamage: 40 };
    });
    m.state.teamProgression.relicStacks['relic.phoenix_core'] = 1;
    const e = spawnEnemy(m, 'enemy.scrapBug', m.state.tank.x + 1.2, m.state.tank.z);
    m.systems.enemySpatial.rebuild(m.state.enemies);
    m.state.tank.integrity = 0;
    m.state.tank.deadT = 3;
    const hp = e.hp;
    m.systems.progression.notifyWipeout();
    expect(m.state.tank.integrity).toBe(60);
    expect(hp - e.hp).toBe(40);
  });

  it('ROADKILL coefficients come from content parameters', () => {
    const m = matchWithRelic('relic.roadkill', (relic) => {
      relic.effects[1].parameters = {
        minimumSpeedRatio: 0.9,
        baseDamageCoefficient: 1.5,
        coefficientPerAdditionalStack: 0.4,
        perTargetCooldownSeconds: 0.2,
        knockbackCoefficient: 0.7,
      };
    });
    m.state.teamProgression.relicStacks['relic.roadkill'] = 3;
    m.systems.capabilities.grant('tank.roadkillContact', 'relic:relic.roadkill');
    const params = m.systems.progression.roadkillParams()!;
    expect(params.minimumSpeedRatio).toBe(0.9);
    expect(params.baseDamageCoefficient).toBe(1.5);
    expect(params.coefficientPerAdditionalStack).toBe(0.4);
    expect(params.perTargetCooldownSeconds).toBe(0.2);
    expect(params.knockbackCoefficient).toBe(0.7);
  });

  it('TWIN SHELL cooldown multiplier comes from content', () => {
    const m = matchWithRelic('relic.twin_shell', (relic) => {
      relic.effects[0].parameters = { cooldownMultiplier: 1.8 };
    });
    m.state.teamProgression.relicStacks['relic.twin_shell'] = 1;
    expect(m.systems.progression.twinShellCooldownMultiplier()).toBe(1.8);
  });

  it('missing required effect parameters fail content validation', () => {
    const { manifest, files } = loadRealPackRecords();
    const rel = relicFile(files, 'relic.vampire_rounds');
    const relic = clone(files[rel]) as { effects: Array<{ templateId: string; parameters?: Record<string, unknown> }> };
    delete relic.effects[0].parameters;
    files[rel] = relic;
    let caught: ContentValidationError | null = null;
    try {
      new ContentLoader().loadFromRecords(manifest, files);
    } catch (err) {
      caught = err as ContentValidationError;
    }
    expect(caught).not.toBeNull();
    expect(caught!.issues.some((issue) => issue.includes('amountPerStack'))).toBe(true);
  });

  it('shipped relic numeric behavior is unchanged after parameterization', () => {
    const m = MatchRuntime.fromContentPack(
      new ContentLoader().loadFromFilesystem(CONTENT_ROOT),
      'shipped-values',
      'none',
      'mode.singlePlayerScoreAttack',
    );
    const vampire = m.rules.relicsById.get('relic.vampire_rounds')!;
    expect(vampire.effects[0].parameters?.amountPerStack).toBe(5);
    const safeHaven = m.rules.relicsById.get('relic.safe_haven')!;
    expect(safeHaven.effects[0].parameters?.amountPerStack).toBe(15);
    const phoenix = m.rules.relicsById.get('relic.phoenix_core')!;
    expect(phoenix.effects[0].parameters?.integrityPercent).toBe(50);
    expect(phoenix.effects[0].parameters?.shockwaveDamage).toBe(25);
    const roadkill = m.rules.relicsById.get('relic.roadkill')!;
    expect(roadkill.effects[1].parameters?.baseDamageCoefficient).toBe(0.8);
  });
});
