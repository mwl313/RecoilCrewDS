import demoPresentation from '../../../content/presentation/demoScoreAttack.json';
import type { PresentationDefinition } from '../../shared/content/schemas/presentation';
import { isValidAssetId } from '../../shared/assetRegistry';

export interface VfxPresentation {
  id: string;
  color: number;
  size: number;
  life: number;
  count: number;
  speed: number;
  gravity: number;
}

export interface UiPresentation {
  id: string;
  name: string;
  primary: string;
  accent: string;
  secondary: string;
  panel: string;
  highlight: string;
}

export interface AudioPresentation {
  id: string;
  kind: string;
  desc: string;
}

export interface IconPresentation {
  id: string;
  color: string;
  label: string;
}

export interface CameraImpulsePresentation {
  id: string;
  shake: number;
}

/**
 * Semantic presentation catalog built from the validated Demo presentation
 * definition (bundled into the client at build time). Models, VFX, audio,
 * themes, icons, and camera impulses resolve by semantic id; unknown ids
 * throw instead of silently falling back to arbitrary values.
 */
export class PresentationCatalog {
  readonly models: readonly string[];
  readonly vfx: readonly VfxPresentation[];
  readonly ui: readonly UiPresentation[];
  readonly audio: readonly AudioPresentation[];
  readonly icons: readonly IconPresentation[];
  readonly cameraImpulses: readonly CameraImpulsePresentation[];

  constructor(definition: PresentationDefinition = demoPresentation as unknown as PresentationDefinition) {
    for (const id of definition.assets.models) {
      if (!isValidAssetId(id)) throw new Error(`presentation catalog: unknown model asset id '${id}'`);
    }
    this.models = Object.freeze([...definition.assets.models]);
    this.vfx = Object.freeze(definition.assets.vfx.map((v) => ({ ...v })));
    this.ui = Object.freeze(definition.assets.ui.map((u) => ({ ...u })));
    this.audio = Object.freeze(definition.assets.audio.map((a) => ({ ...a })));
    this.icons = Object.freeze((definition.assets.icons ?? []).map((i) => ({ ...i })));
    this.cameraImpulses = Object.freeze((definition.assets.cameraImpulses ?? []).map((c) => ({ ...c })));
  }

  vfxFor(id: string): VfxPresentation {
    const entry = this.vfx.find((v) => v.id === id);
    if (!entry) throw new Error(`presentation catalog: unknown vfx id '${id}'`);
    return entry;
  }

  uiFor(id: string): UiPresentation {
    const entry = this.ui.find((u) => u.id === id);
    if (!entry) throw new Error(`presentation catalog: unknown ui id '${id}'`);
    return entry;
  }

  audioFor(id: string): AudioPresentation {
    const entry = this.audio.find((a) => a.id === id);
    if (!entry) throw new Error(`presentation catalog: unknown audio id '${id}'`);
    return entry;
  }

  iconFor(id: string): IconPresentation {
    const entry = this.icons.find((i) => i.id === id);
    if (!entry) throw new Error(`presentation catalog: unknown icon id '${id}'`);
    return entry;
  }

  cameraImpulseFor(id: string): CameraImpulsePresentation {
    const entry = this.cameraImpulses.find((c) => c.id === id);
    if (!entry) throw new Error(`presentation catalog: unknown camera impulse id '${id}'`);
    return entry;
  }

  hasModel(id: string): boolean {
    return this.models.includes(id);
  }
}
