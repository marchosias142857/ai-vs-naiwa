import { CHARACTERS } from '../data/characters';
import { DUNGEON } from '../data/dungeon';
import { PLAYER_RULES, UPGRADES, type UpgradeId } from '../data/player';
import type { FloorCheckpoint } from '../sim/run/checkpoint';

/**
 * `?floor=N`（AGENTS 第 11 节）：直接从第 N 层入口开局，N = 层数 + 1 时进入 Boss 层。
 * 之前每层按固定顺序补一个升级，资源满额；只用于调试与试玩 Boss，不写入正式存档以外的规则。
 */
export function debugCheckpoint(floor: string | null, seed: number): FloorCheckpoint | undefined {
  const n = floor === null ? NaN : Number(floor);
  if (!Number.isInteger(n) || n < 2 || n > DUNGEON.floors + 1) return undefined;
  const order = Object.keys(UPGRADES) as UpgradeId[];
  return {
    version: 1,
    seed,
    floor: n,
    upgrades: order.slice(0, n - 1),
    secondary: null,
    equipped: 'pistol_basic',
    hp: CHARACTERS.ai_proto.hp,
    armor: PLAYER_RULES.armor,
    energy: PLAYER_RULES.energy,
    coins: 0,
    kills: 0,
    roomsCleared: 0,
    elapsed: 0,
  };
}
