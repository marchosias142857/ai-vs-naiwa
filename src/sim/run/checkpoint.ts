import { DUNGEON } from '../../data/dungeon';
import { UPGRADES, type UpgradeId } from '../../data/player';
import { WEAPONS, type WeaponId } from '../../data/weapons';

/** 楼层入口存档；不保存房内敌人/弹丸，继续时从该层入口重开。 */
export interface FloorCheckpoint {
  version: 1;
  seed: number;
  floor: number;
  upgrades: UpgradeId[];
  secondary: WeaponId | null;
  equipped: WeaponId;
  hp: number;
  armor: number;
  energy: number;
  coins: number;
  kills: number;
  roomsCleared: number;
  elapsed: number;
}
/** 运行时轻量验证；与 data schema 的验收用例成对测试，不将 zod 打入战斗包。 */
export function parseCheckpoint(value: unknown): FloorCheckpoint | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (
    v.version !== 1 ||
    !Number.isInteger(v.seed) ||
    Number(v.seed) < 0 ||
    Number(v.seed) > 0xffffffff ||
    !Number.isInteger(v.floor) ||
    Number(v.floor) < 1 ||
    Number(v.floor) > DUNGEON.floors + 1
  )
    return null;
  if (
    !Array.isArray(v.upgrades) ||
    v.upgrades.length !== Number(v.floor) - 1 ||
    !v.upgrades.every((id) => typeof id === 'string' && Object.hasOwn(UPGRADES, id))
  )
    return null;
  if (
    (v.secondary !== null && (typeof v.secondary !== 'string' || !Object.hasOwn(WEAPONS, v.secondary))) ||
    typeof v.equipped !== 'string' ||
    (v.equipped !== 'pistol_basic' && v.equipped !== v.secondary)
  )
    return null;
  for (const key of ['hp', 'armor', 'energy', 'coins', 'kills', 'roomsCleared', 'elapsed'])
    if (
      typeof v[key] !== 'number' ||
      !Number.isFinite(v[key]) ||
      v[key] < 0 ||
      v[key] > Number.MAX_SAFE_INTEGER
    )
      return null;
  if (Number(v.hp) <= 0) return null;
  return {
    version: 1,
    seed: Number(v.seed),
    floor: Number(v.floor),
    upgrades: [...v.upgrades] as UpgradeId[],
    secondary: v.secondary === 'pistol_basic' ? null : (v.secondary as WeaponId | null),
    equipped: v.equipped as WeaponId,
    hp: Number(v.hp),
    armor: Number(v.armor),
    energy: Number(v.energy),
    coins: Number(v.coins),
    kills: Number(v.kills),
    roomsCleared: Number(v.roomsCleared),
    elapsed: Number(v.elapsed),
  };
}
