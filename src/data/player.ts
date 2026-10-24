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
  power: { name: '火力强化', stat: 'damage', amount: 0.2 },
  plating: { name: '装甲扩容', stat: 'armor', amount: 2 },
  vitality: { name: '生命强化', stat: 'health', amount: 2 },
  battery: { name: '能量扩容', stat: 'energy', amount: 50 },
  mobility: { name: '移动强化', stat: 'speed', amount: 12 },
  trigger: { name: '射速强化', stat: 'haste', amount: 0.15 },
  repair: { name: '装甲修复加速', stat: 'regen', amount: 0.2 },
  cooling: { name: '技能冷却缩短', stat: 'skill', amount: 0.2 },
} as const satisfies Record<string, UpgradeDef>;
export type UpgradeId = keyof typeof UPGRADES;
