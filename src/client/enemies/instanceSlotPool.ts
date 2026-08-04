/**
 * Core Loop 06 M6: bounded, stable instance-slot pool for instanced fodder.
 * Slots are reused (free list), never leaked, and the pool never grows past
 * its maximum — overflow callers must fall back to a unique rig.
 */
export class InstanceSlotPool {
  private readonly free: number[] = [];
  private next = 0;
  private readonly capacity: number;

  constructor(capacity: number) {
    this.capacity = Math.max(1, Math.floor(capacity));
  }

  alloc(): number | null {
    if (this.free.length > 0) return this.free.pop()!;
    if (this.next < this.capacity) return this.next++;
    return null;
  }

  release(slot: number): void {
    if (slot < 0 || slot >= this.capacity || this.free.includes(slot)) return;
    this.free.push(slot);
  }

  reset(): void {
    this.free.length = 0;
    this.next = 0;
  }

  get activeCount(): number {
    return this.next - this.free.length;
  }

  get max(): number {
    return this.capacity;
  }
}
