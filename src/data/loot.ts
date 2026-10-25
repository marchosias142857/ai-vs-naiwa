import type { LootRules, EncounterRules } from './schema/loot';

export const LOOT_RULES = {
  capacity: 64,
  weaponReserve: 1,
  noDropChance: 0.4,
  upgradeChoices: 3,
  pickupRadius: 14,
  weaponRadius: 24,
  rewardSpacing: 20,
  drops: [
    { kind: 'coin', weight: 65, amount: 2 },
    { kind: 'energy', weight: 25, amount: 15 },
    { kind: 'health', weight: 10, amount: 1 },
  ],
  roomCoins: 5,
  roomEnergy: 30,
  roomHealth: 1,
  shopPrice: 8,
  shopHealth: 2,
  shopEnergy: 50,
} as const satisfies LootRules;
export const ENCOUNTERS = {
  attempts: 24,
  floors: [
    ['naiwa_chaser', 'naiwa_scout', 'naiwa_spitter', 'naiwa_hopper', 'naiwa_gasser'],
    [
      'naiwa_chaser',
      'naiwa_tank',
      'naiwa_turret',
      'naiwa_charger',
      'naiwa_splitter',
      'naiwa_tongue',
      'naiwa_bomber',
      'naiwa_hopper',
    ],
    [
      'naiwa_scout',
      'naiwa_tank',
      'naiwa_spitter',
      'naiwa_turret',
      'naiwa_charger',
      'naiwa_brood',
      'naiwa_burrower',
      'naiwa_dancer',
      'naiwa_bomber',
      'naiwa_tongue',
      'naiwa_gasser',
    ],
  ],
} as const satisfies EncounterRules;
