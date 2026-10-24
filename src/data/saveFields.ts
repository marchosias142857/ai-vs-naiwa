import { ATTACKS } from './attacks';
import { CHARACTERS } from './characters';
import { DUNGEON } from './dungeon';
import { ENEMIES } from './enemies';
import { LOOT_RULES } from './loot';
import { PLAYER_RULES, UPGRADES } from './player';
import { ROOM_RULES } from './rooms';
import { WEAPONS } from './weapons';

/** ADR 0019：同一份字段约束供 zod 与不含 zod 的运行时校验器使用。 */
export type SaveField = (
  | { type: 'number'; min: number; max: number; integer?: boolean }
  | { type: 'enum'; values: readonly (string | boolean | null)[] }
  | { type: 'array'; item: SaveField; min: number; max: number }
  | { type: 'object'; fields: Readonly<Record<string, SaveField>> }
) & { nullable?: boolean };
const number = (
  min = -Number.MAX_SAFE_INTEGER,
  max = Number.MAX_SAFE_INTEGER,
  integer = false,
): SaveField => ({ type: 'number', min, max, integer });
const oneOf = (...values: (string | boolean | null)[]): SaveField => ({ type: 'enum', values });
const object = (fields: Record<string, SaveField>): SaveField => ({ type: 'object', fields });
const array = (item: SaveField, max: number, min = 0): SaveField => ({ type: 'array', item, min, max });
const signed = number(),
  nonnegative = number(0),
  positive = number(Number.MIN_VALUE),
  count = number(0, Number.MAX_SAFE_INTEGER, true),
  id = number(1, Number.MAX_SAFE_INTEGER, true),
  rng = number(0, 0xffffffff, true),
  bool = oneOf(true, false);
const weapon = oneOf(...Object.keys(WEAPONS)),
  upgrade = oneOf(...Object.keys(UPGRADES));
const floor = number(1, DUNGEON.floors + 1, true),
  room = number(0, DUNGEON.gridSize ** 2 - 1, true);
const vec = object({ x: signed, y: signed });
const maxScale = 1 + DUNGEON.floors * Math.max(...Object.values(UPGRADES).map((u) => u.amount));
const scale = number(1, maxScale);

export interface SaveLimits {
  actors: number;
  bullets: number;
}
/** 池容量由调用方传入，sim 不读取引擎配置。 */
export function simSaveFields(limits: SaveLimits): SaveField {
  return object({
    world: object({
      time: nonnegative,
      nextId: id,
      playerId: { ...id, nullable: true },
      playerDied: bool,
      secondaryWeapon: { ...weapon, nullable: true },
      player: {
        ...object({
          weaponId: weapon,
          cooldown: nonnegative,
          burstLeft: number(0, Math.max(...Object.values(WEAPONS).map((w) => w.pellets)), true),
          burstWait: nonnegative,
          maxSpeed: positive,
          accelTime: positive,
          decelTime: positive,
        }),
        nullable: true,
      },
      lastMoveDir: vec,
      dashDirection: vec,
      resources: object({
        armor: nonnegative,
        maxArmor: nonnegative,
        energy: nonnegative,
        maxEnergy: nonnegative,
        coins: count,
        skillRemaining: nonnegative,
        dashRemaining: nonnegative,
        damageScale: scale,
        fireRateScale: scale,
        regenScale: scale,
        skillScale: scale,
        safeTime: nonnegative,
        regenTime: number(0, PLAYER_RULES.armorInterval),
      }),
      rng: object({ spread: rng, crit: rng }),
      actors: array(
        object({
          id,
          team: oneOf('player', 'enemy'),
          kind: oneOf(...Object.keys(CHARACTERS), ...Object.keys(ENEMIES)),
          phase: oneOf('telegraph', 'active', 'dead'),
          x: signed,
          y: signed,
          vx: signed,
          vy: signed,
          radius: positive,
          hp: nonnegative,
          maxHp: positive,
          invulnerable: bool,
          facing: signed,
          activateAt: nonnegative,
          invulnUntil: nonnegative,
          invulnTime: nonnegative,
          baseX: signed,
          baseY: signed,
          moveSpeed: nonnegative,
          contactDamage: nonnegative,
          knock: object({
            dirX: signed,
            dirY: signed,
            total: nonnegative,
            left: nonnegative,
            timeLeft: signed,
            speed: nonnegative,
            fresh: bool,
          }),
          brain: object({
            cooldown: signed,
            stage: oneOf('ready', 'windup', 'dash', 'recover'),
            time: signed,
            dirX: signed,
            dirY: signed,
          }),
          warning: bool,
        }),
        limits.actors,
      ),
      bullets: array(
        object({
          id,
          team: oneOf('player', 'enemy'),
          ownerId: id,
          source: oneOf(...Object.keys(WEAPONS), ...Object.keys(ATTACKS)),
          angle: signed,
          damage: positive,
          critChance: number(0, 1),
          knockback: nonnegative,
          pierceLeft: count,
          hitIds: array(
            id,
            Math.max(...[...Object.values(WEAPONS), ...Object.values(ATTACKS)].map((w) => w.pierce)) + 1,
          ),
        }),
        limits.bullets,
      ),
    }),
    run: object({
      floor,
      roomId: room,
      phase: oneOf('exploring', 'fighting', 'won', 'lost'),
      visited: array(bool, DUNGEON.gridSize ** 2),
      cleared: array(bool, DUNGEON.gridSize ** 2),
      claimed: array(bool, DUNGEON.gridSize ** 2),
      wave: number(0, ROOM_RULES.waves.length, true),
      wait: signed,
      alive: count,
      kills: count,
      roomsCleared: count,
      elapsed: nonnegative,
    }),
    director: object({
      floor,
      pending: number(0, Math.max(...ROOM_RULES.waves) + DUNGEON.floors * ROOM_RULES.floorExtra, true),
      kinds: rng,
      positions: rng,
    }),
    loot: object({
      room,
      rng,
      slots: array(
        object({
          active: bool,
          room,
          kind: oneOf('coin', 'health', 'energy', 'weapon'),
          x: signed,
          y: signed,
          amount: nonnegative,
          weapon,
        }),
        LOOT_RULES.capacity,
        LOOT_RULES.capacity,
      ),
    }),
    rewards: object({
      rng,
      upgrades: array(upgrade, DUNGEON.floors),
      offers: array(upgrade, LOOT_RULES.upgradeChoices),
    }),
  });
}
