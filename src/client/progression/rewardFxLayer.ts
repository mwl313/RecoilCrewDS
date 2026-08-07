export type RewardImpactEmphasis = 'card' | 'final-card' | 'relic';

export class RewardFxLayer {
  readonly element: HTMLElement;
  private readonly shardPool: HTMLElement[] = [];

  constructor(reducedFlash = false) {
    this.element = document.createElement('div');
    this.element.className = 'reward-fx-layer';
    this.element.dataset['reducedFlash'] = String(reducedFlash);
    const burst = element('div', 'reward-burst');
    const core = element('div', 'reward-impact-core');
    const shockA = element('div', 'reward-shockwave reward-shockwave--a');
    const shockB = element('div', 'reward-shockwave reward-shockwave--b');
    const speedlines = element('div', 'reward-speedlines');
    const ring = element('div', 'reward-ring');
    const shards = element('div', 'reward-shard-layer');
    for (let index = 0; index < 48; index++) {
      const shard = document.createElement('i');
      shard.className = 'reward-shard';
      shard.hidden = true;
      shards.appendChild(shard);
      this.shardPool.push(shard);
    }
    this.element.append(burst, ring, core, shockA, shockB, speedlines, shards);
  }

  enter(identity: string): void {
    this.element.dataset['identity'] = identity;
    restartClass(this.element, 'reward-fx-layer--entrance');
  }

  burst(
    rarity: string,
    count: number,
    identity = rarity,
    origin?: HTMLElement,
    emphasis: RewardImpactEmphasis = 'card',
  ): void {
    this.element.dataset['rarity'] = rarity;
    this.element.dataset['emphasis'] = emphasis;
    const box = origin?.getBoundingClientRect();
    const originX = box ? box.left + box.width / 2 : globalThis.innerWidth / 2;
    const originY = box ? box.top + box.height / 2 : globalThis.innerHeight / 2;
    const random = mulberry32(hash(`${identity}:${rarity}:${emphasis}`));
    const capped = Math.min(this.shardPool.length, Math.max(0, count));
    for (let index = 0; index < this.shardPool.length; index++) {
      const shard = this.shardPool[index];
      shard.hidden = index >= capped;
      if (index >= capped) continue;
      const angle = Math.PI * 2 * (index / Math.max(1, capped)) + (random() - 0.5) * 0.45;
      const distance = 92 + random() * (emphasis === 'relic' ? 280 : 210);
      shard.dataset['tone'] = index % 3 === 0 ? 'paper' : index % 3 === 1 ? 'rarity' : 'amber';
      shard.style.left = `${originX}px`;
      shard.style.top = `${originY}px`;
      shard.style.setProperty('--shard-x', `${Math.cos(angle) * distance}px`);
      shard.style.setProperty('--shard-y', `${Math.sin(angle) * distance}px`);
      shard.style.setProperty('--shard-r', `${Math.round(random() * 620 - 310)}deg`);
      shard.style.setProperty('--shard-w', `${Math.round(4 + random() * 3)}px`);
      shard.style.setProperty('--shard-h', `${Math.round(11 + random() * 8)}px`);
      shard.style.setProperty('--shard-delay', `${Math.round(random() * 54)}ms`);
      restartClass(shard, 'reward-shard--active');
    }
    restartClass(this.element, 'reward-fx-layer--impact');
  }

  clear(): void {
    this.element.classList.remove('reward-fx-layer--entrance', 'reward-fx-layer--impact');
    for (const shard of this.shardPool) {
      shard.hidden = true;
      shard.classList.remove('reward-shard--active');
    }
  }
}

function element(tag: 'div', className: string): HTMLDivElement {
  const node = document.createElement(tag);
  node.className = className;
  return node;
}

function restartClass(node: HTMLElement, className: string): void {
  node.classList.remove(className);
  void node.offsetWidth;
  node.classList.add(className);
}

function hash(value: string): number {
  let result = 2_166_136_261;
  for (let index = 0; index < value.length; index++) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16_777_619);
  }
  return result >>> 0;
}

function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = seed + 0x6d2b79f5 | 0;
    let value = Math.imul(seed ^ seed >>> 15, 1 | seed);
    value = value + Math.imul(value ^ value >>> 7, 61 | value) ^ value;
    return ((value ^ value >>> 14) >>> 0) / 4_294_967_296;
  };
}
