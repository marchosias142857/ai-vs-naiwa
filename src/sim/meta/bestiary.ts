import { BESTIARY } from '../../data/bestiary';
import { DUNGEON } from '../../data/dungeon';
import { ENEMIES, type EnemyId } from '../../data/enemies';
import { enemyAnimation, MONSTER_TEXTURES } from '../../data/enemyArt';
import { ENCOUNTERS } from '../../data/loot';
import type { EnemyDef } from '../../data/schema';
import type { BestiaryEntry, BestiaryRole } from '../../data/schema/bestiary';

/** 静态展示帧在图集里的位置（图集像素）。界面显示前再裁掉帧内透明边距。 */
export interface BestiaryFrame {
  /** Phaser 纹理 key 与 `public/assets/demo/` 下的文件名，二者指向同一张已预缓存的图集。 */
  readonly texture: string;
  readonly source: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** 帧内角色朝向；界面统一朝右显示时，朝左的帧需要水平翻转。 */
  readonly facing: 'left' | 'right';
}
/** 图鉴卡片：编号、文案 key 与可从 data 复核的事实，全部由数据推导，不另存一份数值。 */
export interface BestiaryCard {
  readonly id: EnemyId;
  readonly no: number;
  /** 三位编号，如 `007`；超过 999 时自然变长。 */
  readonly label: string;
  readonly role: BestiaryRole;
  /** i18n key：名称、攻击方式、简介。 */
  readonly name: string;
  readonly attack: string;
  readonly desc: string;
  readonly hp: number;
  /** 平时的移动速度，世界像素/秒；原地不动或只会冲锋/跳跃的怪为 0。 */
  readonly speed: number;
  readonly contact: number;
  readonly freezeImmune: boolean;
  /** 出没楼层（1 起，Boss 层为层数 + 1）；小怪取产生它的怪物所在楼层。 */
  readonly floors: readonly number[];
  /** 分裂或召唤出这种怪的怪物，按图鉴编号排序。 */
  readonly spawnedBy: readonly EnemyId[];
  readonly frame: Readonly<BestiaryFrame>;
}

const DEFS: Readonly<Record<EnemyId, EnemyDef>> = ENEMIES;
const ENTRIES: Readonly<Record<EnemyId, BestiaryEntry>> = BESTIARY;
const IDS = (Object.keys(ENTRIES) as EnemyId[]).sort((a, b) => ENTRIES[a].no - ENTRIES[b].no);

export function bestiaryLabel(no: number): string {
  return String(no).padStart(3, '0');
}
/** 分裂（`split`）或召唤（`summon`）出 `id` 的怪物。 */
export function spawnersOf(id: EnemyId): EnemyId[] {
  return IDS.filter((k) => DEFS[k].split?.kind === id || DEFS[k].summon?.kind === id);
}
/** 遭遇表里出现的楼层；首领在 Boss 层；小怪跟随产生它的怪物。 */
export function floorsOf(id: EnemyId, seen: ReadonlySet<EnemyId> = new Set()): number[] {
  if (ENTRIES[id].role === 'boss') return [DUNGEON.floors + 1];
  const out = new Set<number>();
  ENCOUNTERS.floors.forEach((list, i) => {
    if ((list as readonly string[]).includes(id)) out.add(i + 1);
  });
  if (ENTRIES[id].role === 'minion')
    for (const parent of spawnersOf(id))
      if (!seen.has(parent)) for (const f of floorsOf(parent, new Set([...seen, id]))) out.add(f);
  return [...out].sort((a, b) => a - b);
}

/** 平时的移动速度：没有触发距离的冲锋怪只会原地蓄力后冲出，从不走动（`moveEnemy`），记为 0。 */
function walkSpeed(def: Readonly<EnemyDef>): number {
  return def.behavior === 'charge_dash' && def.dash?.trigger === undefined ? 0 : def.moveSpeed;
}

function frameOf(id: EnemyId): BestiaryFrame {
  const anim = enemyAnimation(id),
    { action, index } = ENTRIES[id].frame;
  const at = anim?.art.frames[action]?.[index];
  if (!anim || !at) throw new Error(`图鉴缺少静态帧：${id} ${action}:${index}`);
  const texture = MONSTER_TEXTURES[anim.texture];
  return {
    texture: texture.key,
    source: texture.source,
    x: at[0],
    y: at[1],
    width: anim.art.size[0],
    height: anim.art.size[1],
    facing: anim.art.facing,
  };
}

let cards: readonly BestiaryCard[] | undefined;
/** 全部怪物，按编号升序；首次调用时推导一次并缓存，界面可反复调用。卡片及其数组、静态帧都已冻结，调用方无法改写缓存。 */
export function bestiaryCards(): readonly BestiaryCard[] {
  cards ??= Object.freeze(
    IDS.map((id): BestiaryCard => {
      const def = DEFS[id],
        entry = ENTRIES[id];
      return Object.freeze({
        id,
        no: entry.no,
        label: bestiaryLabel(entry.no),
        role: entry.role,
        name: def.name,
        attack: entry.attack,
        desc: entry.desc,
        hp: def.hp,
        speed: walkSpeed(def),
        contact: def.contactDamage,
        freezeImmune: def.freezeImmune === true,
        floors: Object.freeze(floorsOf(id)),
        spawnedBy: Object.freeze(spawnersOf(id)),
        frame: Object.freeze(frameOf(id)),
      });
    }),
  );
  return cards;
}
