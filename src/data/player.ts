import type { PlayerRules, UpgradeDef } from './schema/player';

export const PLAYER_RULES = {
  armor: 5,
  energy: 200,
  armorDelay: 3,
  armorInterval: 1,
  skillCooldown: 8,
  dashTime: 0.2,
  dashSpeed: 240,
} as const satisfies PlayerRules;
export const UPGRADES = {
  power: { name: 'upgrade.power', stat: 'damage', amount: 0.2, display: 'percent' },
  plating: { name: 'upgrade.plating', stat: 'armor', amount: 2, display: 'number' },
  vitality: { name: 'upgrade.vitality', stat: 'health', amount: 2, display: 'number' },
  battery: { name: 'upgrade.battery', stat: 'energy', amount: 50, display: 'number' },
  mobility: { name: 'upgrade.mobility', stat: 'speed', amount: 12, display: 'number' },
  trigger: { name: 'upgrade.trigger', stat: 'haste', amount: 0.15, display: 'percent' },
  repair: { name: 'upgrade.repair', stat: 'regen', amount: 0.2, display: 'percent' },
  cooling: { name: 'upgrade.cooling', stat: 'skill', amount: 0.2, display: 'percent' },
} as const satisfies Record<string, UpgradeDef>;
export type UpgradeId = keyof typeof UPGRADES;
