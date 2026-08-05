/**
 * Curated default nickname pool (single source of truth for client, server,
 * and tests). Nicknames are presentation metadata, never identity.
 */
export const DEFAULT_NICKNAME_BASES = [
  'TurboToad',
  'ScrapFox',
  'IronMoth',
  'DustBunny',
  'RocketMole',
  'SteelOtter',
  'CannonCrow',
  'DriftBadger',
  'RumbleBee',
  'TreadGecko',
  'BoltBoar',
  'CopperCat',
  'GearGator',
  'WeldWolf',
  'RecoilRaven',
  'DashDingo',
  'JumpJackal',
  'ShellShark',
  'MagnetMouse',
  'ArmorApe',
  'HavocHare',
  'BlastBat',
  'CraterCrab',
  'RivetRat',
  'TorqueTiger',
  'SprocketSeal',
  'BunkerBear',
  'ChromeCobra',
  'DieselDuck',
  'EmberEel',
  'FlakFalcon',
  'GritGoat',
  'HammerHawk',
  'JunkJaguar',
  'KineticKoala',
  'LuckyLynx',
  'MortarMantis',
  'NitroNewt',
  'OverdriveOwl',
  'PistonPanda',
  'QuakeQuail',
  'RampRhino',
  'RicochetRook',
  'RustRabbit',
  'ShrapnelSheep',
  'SiegeSlug',
  'SparkSkunk',
  'TracerTurtle',
  'TurbineYak',
  'VectorViper',
  'VoltageVulture',
  'WardenWombat',
  'WreckWeasel',
  'ZippyZebra',
] as const;

function defaultRandomInt(exclusiveMax: number): number {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0] % exclusiveMax;
  }
  return Math.floor(Math.random() * exclusiveMax);
}

/**
 * Generate `<Base><NN>` (e.g. TurboToad07). Tests inject deterministic
 * random values; production uses crypto with a Math.random fallback.
 */
export function generateDefaultNickname(
  randomInt: (exclusiveMax: number) => number = defaultRandomInt,
): string {
  const base = DEFAULT_NICKNAME_BASES[randomInt(DEFAULT_NICKNAME_BASES.length)] ?? DEFAULT_NICKNAME_BASES[0];
  const number = randomInt(100);
  return `${base}${String(number).padStart(2, '0')}`;
}
