import type { InputContext, ProgressionInputFrame } from '../input';

export interface ProgressionInputSource {
  context(): InputContext;
  setContext(context: InputContext): void;
  consumeProgressionInput(): ProgressionInputFrame;
}

export interface ProgressionUiInput {
  highlightedIndex: number;
  directIndex?: number;
  confirm: boolean;
  focusChanged: boolean;
}

/** Maps raw pointer-locked deltas and reward key edges to card intent. */
export class ProgressionInputContext {
  private activeKey = '';
  private highlightedIndex = 1;
  private virtualX = 0.5;

  constructor(private readonly input: ProgressionInputSource) {}

  sync(kind: 'none' | 'upgrade' | 'relic', identity = ''): void {
    const context: InputContext = kind === 'upgrade'
      ? 'progressionUpgrade'
      : kind === 'relic'
        ? 'progressionRelic'
        : 'gameplay';
    const nextKey = `${kind}:${identity}`;
    if (nextKey !== this.activeKey) {
      this.activeKey = nextKey;
      this.highlightedIndex = 1;
      this.virtualX = 0.5;
    }
    this.input.setContext(context);
  }

  active(): boolean {
    const context = this.input.context();
    return context === 'progressionUpgrade' || context === 'progressionRelic';
  }

  consume(cardCount = 3): ProgressionUiInput {
    const frame = this.input.consumeProgressionInput();
    const previous = this.highlightedIndex;
    let directIndex: number | undefined;
    let confirm = false;
    if (this.input.context() === 'progressionUpgrade' && frame.dx !== 0 && cardCount > 0) {
      this.virtualX = clamp01(this.virtualX + frame.dx * 0.0025);
      const zone = Math.min(cardCount - 1, Math.floor(this.virtualX * cardCount));
      // A small boundary dead band prevents hand tremor from flickering.
      const boundaryDistance = Math.abs(this.virtualX * cardCount - Math.round(this.virtualX * cardCount));
      if (zone === this.highlightedIndex || boundaryDistance > 0.055) this.highlightedIndex = zone;
    }
    for (const action of frame.actions) {
      if (action.kind === 'direct' && action.index < cardCount) {
        this.highlightedIndex = action.index;
        this.virtualX = (action.index + 0.5) / cardCount;
        directIndex = action.index;
      } else if (action.kind === 'move' && cardCount > 0) {
        this.highlightedIndex = (this.highlightedIndex + action.direction + cardCount) % cardCount;
        this.virtualX = (this.highlightedIndex + 0.5) / cardCount;
      } else if (action.kind === 'confirm') {
        confirm = true;
      }
    }
    return {
      highlightedIndex: this.highlightedIndex,
      directIndex,
      confirm,
      focusChanged: previous !== this.highlightedIndex,
    };
  }
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

