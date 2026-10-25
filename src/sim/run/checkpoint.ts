import { DUNGEON } from '../../data/dungeon';
import { UPGRADES, type UpgradeId } from '../../data/player';
import { WEAPONS, type WeaponId } from '../../data/weapons';
import { RUN_ID } from '../meta/profile';
import { normalizeRanks, type TalentRanks } from '../meta/talents';

/** 楼层入口存档；不保存房内敌人/弹丸，继续时从该层入口重开。 */
export interface FloorCheckpoint {
  version: 2;
  seed: number;
  /** 冒险 ID：结算去重用，新开冒险时生成，整局不变（ADR 0035）。 */
  runId: string;
  /** 开局时冻结的天赋等级；入口兜底按它重放，不读主城里之后的改动（ADR 0035）。 */
  talents: TalentRanks;
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
/** 一局冒险的身份与开局配置；新开冒险时确定，之后只复制不重算。 */
export type RunStart = Pick<FloorCheckpoint, 'runId' | 'talents'>;
/** v1 存档没有冒险 ID；用种子派生固定 ID，同一份旧档无论读几次都只结算一次。 */
export const legacyRunId = (seed: number): string => `legacy-${seed.toString(36)}`;

/**
 * 运行时轻量验证；与 data schema 的验收用例成对测试，不将 zod 打入战斗包。
 * 接受 v1（当时还没有天赋，按零天赋迁移）与 v2，统一返回 v2。
 */
export function parseCheckpoint(value: unknown): FloorCheckpoint | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (
    (v.version !== 1 && v.version !== 2) ||
    !Number.isInteger(v.seed) ||
    Number(v.seed) < 0 ||
    Number(v.seed) > 0xffffffff ||
    !Number.isInteger(v.floor) ||
    Number(v.floor) < 1 ||
    Number(v.floor) > DUNGEON.floors + 1
  )
    return null;
  if (
    v.version === 2 &&
    (typeof v.runId !== 'string' ||
      !RUN_ID.test(v.runId) ||
      !v.talents ||
      typeof v.talents !== 'object' ||
      Array.isArray(v.talents) ||
      !Object.values(v.talents).every((r) => Number.isInteger(r) && Number(r) >= 0))
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
    version: 2,
    seed: Number(v.seed),
    runId: v.version === 2 ? (v.runId as string) : legacyRunId(Number(v.seed)),
    talents: v.version === 2 ? normalizeRanks(v.talents) : {},
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
