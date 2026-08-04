import type { Hud } from '../hud';
import type { MatchState, Role } from '../../shared/types';

export interface HudContext {
  role: Role;
  peerConnected: boolean;
  ping: number;
  fps: number;
  pointerLocked: boolean;
  session: {
    kind: 'multiplayer' | 'singlePlayer';
    showRoleIdentity: boolean;
    showPeerStatus: boolean;
  };
  localCharge?: { unlocked: boolean; held: boolean; ratio: number; full: boolean };
  rules?: { maxIntegrity?: number; cannonCooldown?: number; chargeTapMaxSeconds?: number; chargeFullSeconds?: number };
  objective: { x: number; y: number; visible: boolean } | null;
}

/** Projection of authoritative state into the DOM HUD. */
export class HudController {
  constructor(private readonly hud: Hud) {}

  update(state: MatchState, context: HudContext): void {
    this.hud.update(state, context);
  }

  onEvent(event: never): void {
    this.hud.onEvent(event);
  }

  showResults(results: never, rematch: never): void {
    this.hud.showResults(results, rematch);
  }

  setTheme(theme: 'driver' | 'gunner' | 'singlePlayer'): void {
    this.hud.setTheme(theme);
  }

  setGameScreen(visible: boolean): void {
    this.hud.setGameScreen(visible);
  }

  /** Project the truck objective marker for the HUD. */
  projectObjective(state: MatchState, project: (x: number, y: number, z: number) => { x: number; y: number; visible: boolean }): HudContext['objective'] {
    const truck = state.truck;
    if (!truck.active) return null;
    return project(truck.x, truck.y + 2.4, truck.z);
  }
}
