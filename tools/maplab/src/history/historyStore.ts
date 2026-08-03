import type { MapGenerationBundle } from '@app/shared/mapgen/profiles';
import { deepCloneBundle } from '../mapLabState';

/** Undo/redo stack over working-bundle snapshots (cap 50 each). */
export class HistoryStore {
  private undoStack: MapGenerationBundle[] = [];
  private redoStack: MapGenerationBundle[] = [];

  constructor(private readonly initial: MapGenerationBundle) {
    this.undoStack = [deepCloneBundle(initial)];
  }

  push(bundle: MapGenerationBundle): void {
    this.undoStack.push(deepCloneBundle(bundle));
    if (this.undoStack.length > 50) this.undoStack.shift();
    this.redoStack.length = 0;
  }

  canUndo(): boolean {
    return this.undoStack.length > 1;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  undo(current: MapGenerationBundle): MapGenerationBundle | null {
    if (!this.canUndo()) return null;
    this.redoStack.push(deepCloneBundle(current));
    this.undoStack.pop();
    return deepCloneBundle(this.undoStack[this.undoStack.length - 1]);
  }

  redo(current: MapGenerationBundle): MapGenerationBundle | null {
    const next = this.redoStack.pop();
    if (!next) return null;
    this.undoStack.push(deepCloneBundle(current));
    return deepCloneBundle(next);
  }

  reset(bundle: MapGenerationBundle): void {
    this.undoStack = [deepCloneBundle(bundle)];
    this.redoStack.length = 0;
  }

  historyCount(): number {
    return this.undoStack.length;
  }
}
