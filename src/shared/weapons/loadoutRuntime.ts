import type { GunnerInput } from '../types';
import type { WeaponDefinition } from '../content/schemas/weapon';
import { WeaponRuntimeState } from './weaponRuntimeState';

export interface LoadoutSlot {
  readonly id: string;
  readonly definition: WeaponDefinition;
  readonly state: WeaponRuntimeState;
}

/**
 * Resolved loadout: primary/secondary/ability weapons plus their runtime
 * states. The input adapter maps the legacy wire fields (mg/cannon/charge)
 * to generic actions; new generic fields (primary/secondary/ability) win
 * when both are present.
 */
export class LoadoutRuntime {
  readonly primary: LoadoutSlot;
  readonly secondary: LoadoutSlot;
  readonly ability: LoadoutSlot | null;

  constructor(definitions: ReadonlyMap<string, WeaponDefinition>, loadout: { primary: string; secondary: string; ability?: string | null }) {
    this.primary = this.slot('primary', loadout.primary, definitions);
    this.secondary = this.slot('secondary', loadout.secondary, definitions);
    this.ability = loadout.ability ? this.slot('ability', loadout.ability, definitions) : null;
  }

  clear(): void {
    this.primary.state.clear();
    this.secondary.state.clear();
    this.ability?.state.clear();
  }

  slots(): LoadoutSlot[] {
    return [this.primary, this.secondary, ...(this.ability ? [this.ability] : [])];
  }

  private slot(slotName: 'primary' | 'secondary' | 'ability', id: string, defs: ReadonlyMap<string, WeaponDefinition>): LoadoutSlot {
    const definition = defs.get(id);
    if (!definition) throw new Error(`loadout references unknown weapon '${id}'`);
    return { id, definition, state: new WeaponRuntimeState(slotName, id) };
  }
}
