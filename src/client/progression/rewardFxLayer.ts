export class RewardFxLayer {
  readonly element: HTMLElement;
  private readonly shardPool: HTMLElement[] = [];

  constructor() {
    this.element = document.createElement('div');
    this.element.className = 'reward-fx-layer';
    const burst = document.createElement('div');
    burst.className = 'reward-burst';
    const ring = document.createElement('div');
    ring.className = 'reward-ring';
    const shards = document.createElement('div');
    shards.className = 'reward-shard-layer';
    for (let index = 0; index < 36; index++) {
      const shard = document.createElement('i');
      shard.className = 'reward-shard';
      shard.hidden = true;
      shard.style.setProperty('--shard-i', String(index));
      shards.appendChild(shard);
      this.shardPool.push(shard);
    }
    this.element.append(burst, ring, shards);
  }

  burst(rarity: string, count: number): void {
    this.element.dataset['rarity'] = rarity;
    const capped = Math.min(this.shardPool.length, Math.max(0, count));
    for (let index = 0; index < this.shardPool.length; index++) {
      const shard = this.shardPool[index];
      shard.hidden = index >= capped;
      if (index < capped) {
        shard.classList.remove('reward-shard--active');
        void shard.offsetWidth;
        shard.classList.add('reward-shard--active');
      }
    }
  }

  clear(): void {
    for (const shard of this.shardPool) shard.hidden = true;
  }
}

