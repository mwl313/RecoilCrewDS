import type { ShellState } from '../../shared/types';

export interface ProjectileVisualColors {
  glow: string | number;
  core: string | number;
}

/** Resolve shell colors without coupling the renderer to monster content. */
export function projectileVisualColors(shell: Pick<ShellState, 'kind' | 'chargeRatio' | 'visualColor'>): ProjectileVisualColors {
  if ((shell.chargeRatio ?? 0) > 0) return { glow: 0xfff2b0, core: 0xfff7d0 };
  if (shell.kind === 'tower') return { glow: 0xff6a58, core: 0xff3b30 };
  if (shell.kind === 'enemy') {
    const color = shell.visualColor ?? '#ff5a4a';
    return { glow: color, core: color };
  }
  return { glow: 0xffb45e, core: 0xffcf8a };
}
