import { ATTACKS } from '../../data/attacks';
import { CHARACTERS } from '../../data/characters';
import { DUNGEON } from '../../data/dungeon';
import { ENEMIES } from '../../data/enemies';
import { LOOT_RULES } from '../../data/loot';
import { simSaveFields, type SaveField, type SaveLimits } from '../../data/saveFields';
import { WEAPONS } from '../../data/weapons';
import { Random } from '../core/Random';
import { generateDungeon } from '../dungeon/generate';
import type { SimSnapshot } from './snapshot';

/** 输入来自 JSON，按字段拒绝；不夹值、不修改输入、不重播事件。 */
export function validateSaveFields(value: unknown, field: SaveField): boolean {
  if (value === null && field.nullable) return true;
  switch (field.type) {
    case 'number':
      return (
        typeof value === 'number' &&
        Number.isFinite(value) &&
        value >= field.min &&
        value <= field.max &&
        (!field.integer || Number.isSafeInteger(value))
      );
    case 'enum':
      return field.values.includes(value as string | boolean | null);
    case 'array':
      return (
        Array.isArray(value) &&
        value.length >= field.min &&
        value.length <= field.max &&
        value.every((v) => validateSaveFields(v, field.item))
      );
    case 'object': {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
      const v = value as Record<string, unknown>;
      return (
        Object.keys(v).length === Object.keys(field.fields).length &&
        Object.entries(field.fields).every(
          ([key, child]) => Object.hasOwn(v, key) && validateSaveFields(v[key], child),
        )
      );
    }
  }
}

/** 创建一次校验器，在菜单读档时使用。字段合法后才检查地图、来源与跨记录约束。 */
export function createSimDecoder(limits: SaveLimits): (value: unknown, seed: number) => SimSnapshot | null {
  const fields = simSaveFields(limits);
  return (value, seed) => {
    if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff || !validateSaveFields(value, fields))
      return null;
    const s = value as SimSnapshot,
      w = s.world,
      r = s.run;
    const map = generateDungeon(new Random(seed).fork(`map:${r.floor}`), r.floor > DUNGEON.floors);
    if (
      r.roomId >= map.rooms.length ||
      !r.visited[r.roomId] ||
      [r.visited, r.cleared, r.claimed].some((a) => a.length !== map.rooms.length) ||
      s.director.floor !== r.floor ||
      s.loot.room !== r.roomId ||
      s.rewards.upgrades.length !== r.floor - 1
    )
      return null;
    if (r.cleared.some((v, i) => v && !r.visited[i]) || r.claimed.some((v, i) => v && !r.visited[i]))
      return null;
    const offers = s.rewards.offers;
    if (
      new Set(offers).size !== offers.length ||
      (offers.length &&
        (offers.length !== LOOT_RULES.upgradeChoices ||
          map.rooms[r.roomId]!.kind !== 'exit' ||
          r.phase !== 'exploring'))
    )
      return null;
    const ids = new Set<number>();
    let players = 0;
    for (const a of w.actors) {
      if (
        ids.has(a.id) ||
        a.id >= w.nextId ||
        a.hp > a.maxHp ||
        (a.hp === 0) !== (a.phase === 'dead') ||
        a.knock.left > a.knock.total
      )
        return null;
      ids.add(a.id);
      const definitions: Readonly<Record<string, { radius: number }>> =
        a.team === 'player' ? CHARACTERS : ENEMIES;
      if (!Object.hasOwn(definitions, a.kind)) return null;
      const def = definitions[a.kind]!;
      if (a.radius !== def.radius) return null;
      if (a.team === 'player') {
        players++;
        if (
          a.id !== w.playerId ||
          !w.player ||
          w.playerDied !== (a.phase === 'dead') ||
          a.phase === 'telegraph'
        )
          return null;
      }
    }
    // 终局尸体可已回收；上层拒绝终局继续。普通局必须有且只有一个玩家。
    if (
      players !== (w.playerDied ? (w.actors.some((a) => a.id === w.playerId) ? 1 : 0) : 1) ||
      !w.player ||
      w.playerId === null ||
      w.playerId >= w.nextId
    )
      return null;
    if (
      w.secondaryWeapon === 'pistol_basic' ||
      (w.player.weaponId !== 'pistol_basic' && w.player.weaponId !== w.secondaryWeapon)
    )
      return null;
    const resources = w.resources;
    if (resources.armor > resources.maxArmor || resources.energy > resources.maxEnergy) return null;
    for (const b of w.bullets) {
      const defs: Readonly<Record<string, { pierce: number }>> = b.team === 'player' ? WEAPONS : ATTACKS;
      if (
        ids.has(b.id) ||
        b.id >= w.nextId ||
        b.ownerId >= w.nextId ||
        b.ownerId === b.id ||
        !Object.hasOwn(defs, b.source)
      )
        return null;
      const def = defs[b.source]!;
      if (
        b.pierceLeft > def.pierce ||
        b.hitIds.length > def.pierce ||
        new Set(b.hitIds).size !== b.hitIds.length ||
        b.hitIds.some((id) => id >= w.nextId || id === b.id || id === b.ownerId)
      )
        return null;
      ids.add(b.id);
      // owner / 已命中实体允许已经回收；仍存活时不允许指向子弹或错误阵营。
      const owner = w.actors.find((a) => a.id === b.ownerId);
      if (owner && owner.team !== b.team) return null;
    }
    const bulletIds = new Set(w.bullets.map((b) => b.id));
    if (w.bullets.some((b) => bulletIds.has(b.ownerId) || b.hitIds.some((id) => bulletIds.has(id))))
      return null;
    if (
      s.loot.slots.some(
        (slot) =>
          slot.active &&
          (slot.room >= map.rooms.length ||
            !r.visited[slot.room] ||
            (slot.kind !== 'weapon' && slot.room !== r.roomId)),
      )
    )
      return null;
    return s;
  };
}
