import * as THREE from 'three';
import type { ArenaSessionResult } from '../../shared/mapgen/arenaSession';
import { issuesFromValidationReports } from '../../shared/mapgen/validationIssues';
import type { GameClient } from './gameClient';
import { MapLabLayerManager, registerDefaultLayers, type MapLabRenderContext } from '../map-debug';

/**
 * Game F3 mapgen overlay: a metadata panel + the shared debug layers.
 * Enabled explicitly via `?debug=1`. Rendering never mutates
 * authoritative data.
 */
export class DebugOverlay {
  private readonly panel: HTMLElement;
  private readonly markers = new THREE.Group();
  private readonly layers: MapLabLayerManager;
  private baseText = '';
  private session: ArenaSessionResult | null;
  private readonly onKey = (e: KeyboardEvent) => {
    if (e.code === 'F3') {
      e.preventDefault();
      this.toggle();
    }
  };
  private visible = true;
  private hordeLines: string[] = [];

  constructor(
    private readonly game: GameClient,
    session: ArenaSessionResult,
  ) {
    this.session = session;
    this.panel = document.createElement('div');
    this.panel.id = 'mapgen-debug';
    this.panel.style.cssText =
      'position:fixed;left:10px;top:10px;z-index:50;background:rgba(8,14,18,0.88);color:#9ff3ff;' +
      'font:12px monospace;padding:10px 12px;border:1px solid rgba(127,212,255,0.4);border-radius:6px;' +
      'white-space:pre;max-height:70vh;overflow:auto;pointer-events:none;';
    document.body.appendChild(this.panel);
    window.addEventListener('keydown', this.onKey);
    this.game.world.scene.add(this.markers);
    this.layers = new MapLabLayerManager(this.markers);
    registerDefaultLayers(this.layers);
    this.rebuild();
    this.refreshHorde();
  }

  setSession(session: ArenaSessionResult): void {
    this.session = session;
    this.rebuild();
  }

  toggle(): void {
    this.setVisible(!this.visible);
  }

  isVisible(): boolean {
    return this.visible;
  }

  /** Keep the diagnostics panel and all shared map wireframes in one state. */
  setVisible(visible: boolean): void {
    this.visible = visible;
    this.panel.style.display = visible ? 'block' : 'none';
    this.markers.visible = visible;
  }

  private rebuild(): void {
    const session = this.session;
    if (!session) return;
    const arena = session.arena;
    const ctx: MapLabRenderContext = {
      arena,
      world: session.world,
      toWorldX: (x) => x - arena.widthMeters / 2,
      toWorldZ: (z) => z - arena.depthMeters / 2,
    };
    this.layers.setContext(ctx);
    const issues = issuesFromValidationReports(arena);
    this.baseText = [
      `MAPGEN DEBUG`,
      `profile: ${session.metadata.mapProfileId}`,
      `seed: ${session.metadata.arenaBaseSeed}`,
      `candidate: ${session.metadata.arenaCandidateSeed}`,
      `attempt: ${session.metadata.arenaAttempt}`,
      `version: ${session.metadata.arenaGeneratorVersion}`,
      `checksum: ${session.metadata.arenaChecksum}`,
      `fallback: ${session.metadata.arenaFallbackUsed}`,
      `generation: ${session.generationMs.toFixed(1)}ms`,
      `height: ${arena.heightfield.minHeight().toFixed(2)}..${arena.heightfield.maxHeight().toFixed(2)}`,
      `slope: ${arena.heightfield.maxSlope().toFixed(3)}`,
      `issues: ${issues.filter((i) => i.severity === 'error').length} errors, ${issues.filter((i) => i.severity === 'warning').length} warnings`,
    ].join('\n');
    this.panel.textContent = this.baseText;
  }

  /** Core Loop 06 M11: refresh horde rows (cheap, debug-only). */
  refreshHorde(): void {
    const debug = this.game.getHordeDebug();
    if (!debug) {
      this.hordeLines = [];
      return;
    }
    this.hordeLines = [
      `HORDE`,
      `phase: ${debug.phase}`,
      `farming: ${debug.farmingTimeRemaining.toFixed(1)}s`,
      `wave: ${debug.waveId ?? '-'}`,
      `leader: ${debug.leaderHp.toFixed(0)}/${debug.leaderMaxHp.toFixed(0)}`,
      `global: ${debug.global} (45m ${debug.within45} / 70m ${debug.within70})`,
      `ordinary: ${debug.ordinaryGlobal} (45m ${debug.ordinaryWithin45} / 70m ${debug.ordinaryWithin70})`,
      `near target: ${debug.nearbyTargetMinimum}-${debug.nearbyTargetMaximum} deficit g/n: ${debug.globalDeficit.toFixed(1)}/${debug.nearbyDeficit.toFixed(1)}`,
      `ambient: ${debug.ambient} wave: ${debug.wave} boss: ${debug.boss} special: ${debug.special}`,
      `roles c/r/s: ${debug.close}/${debug.ranged}/${debug.specialist}`,
      `sectors: ${debug.sectors} moved: ${debug.sectorMovement.toFixed(1)}m recycle: ${debug.recycledPerSecond.toFixed(1)}/s (${debug.recycleReason})`,
      `angular: ${debug.angularCounts.join('/')} last: ${debug.lastDirections.join(',') || '-'}`,
      `pending: ${debug.pendingSubgroups} summons: ${debug.maintenanceSummons} recovery: ${debug.persistentRecovery}`,
      `clear: ${debug.clearRate.toFixed(1)}/s x${debug.clearRateIncomeMultiplier.toFixed(2)} suppressed kills: ${debug.rewardSuppressedKills}`,
      `target e/t: ${debug.entityTarget.toFixed(1)}/${debug.threatTarget.toFixed(1)} income: ${debug.spawnIncome.toFixed(2)}`,
      `budget: ${debug.spawnBudget.toFixed(2)} last: ${debug.lastPack ?? '-'} x${debug.lastPackSize}`,
      `anchor distance: ${debug.lastAnchorDistance.toFixed(1)}m`,
      `anchor failures: ${debug.anchorFailures}`,
      `wave live/cap: ${debug.waveActiveEntities}/${debug.waveMaximumEntities} e ${debug.waveActiveThreat.toFixed(1)}/${debug.waveMaximumThreat.toFixed(1)} t`,
      `tiers: ${debug.tierCounts.join('/')}`,
    ];
    this.panel.textContent = [this.baseText, ...this.hordeLines].join('\n');
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKey);
    this.layers.dispose();
    this.game.world.scene.remove(this.markers);
    this.panel.remove();
  }
}
