import { ATTACKS } from '../../data/attacks';
import { BALANCE } from '../../data/balance';
import { CHARACTERS } from '../../data/characters';
import { DUNGEON } from '../../data/dungeon';
import { ENEMIES } from '../../data/enemies';
import { ROOM_LAYOUTS } from '../../data/layouts';
import { ENCOUNTERS, LOOT_RULES } from '../../data/loot';
import { NAVIGATION } from '../../data/navigation';
import { PLAYER_RULES, UPGRADES } from '../../data/player';
import { RESUME_RULES } from '../../data/resume';
import { ROOM_RULES } from '../../data/rooms';
import { WEAPONS } from '../../data/weapons';
import { hashString } from '../../sim/core/Random';

/** 生产构建的模块 URL 含 Vite 内容哈希，代码变化也会触发入口兜底；只在模块初始化计算。 */
export const SAVE_VERSION = {
  build: new URL(import.meta.url).pathname,
  dataHash: hashString(
    JSON.stringify({
      ATTACKS,
      BALANCE,
      CHARACTERS,
      DUNGEON,
      ENEMIES,
      ROOM_LAYOUTS,
      ENCOUNTERS,
      LOOT_RULES,
      NAVIGATION,
      PLAYER_RULES,
      UPGRADES,
      RESUME_RULES,
      ROOM_RULES,
      WEAPONS,
    }),
  ).toString(16),
};
