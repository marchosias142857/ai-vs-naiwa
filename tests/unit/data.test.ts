import { HUB } from '../../src/data/hub';
import { HubSchema } from '../../src/data/schema/hub';
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../../src/data/balance';
import { CHARACTERS } from '../../src/data/characters';
import { ENEMIES } from '../../src/data/enemies';
import {
  BalanceDefSchema,
  CharacterDefSchema,
  EnemyDefSchema,
  IdSchema,
  WeaponDefSchema,
} from '../../src/data/schema';
import { WEAPONS } from '../../src/data/weapons';
import { TEX } from '../../src/game/assets/keys';

const textureKeys = new Set<string>(Object.values(TEX));

/** 逐条校验，失败时报出是哪一条数据、哪个字段。 */
function expectAllValid(table: Record<string, unknown>, schema: { safeParse(v: unknown): unknown }) {
  for (const [id, def] of Object.entries(table)) {
    expect(IdSchema.safeParse(id).success, `ID ${id} 必须是 snake_case`).toBe(true);
    const result = schema.safeParse(def) as { success: boolean; error?: { message: string } };
    expect(result.success, `${id}: ${result.error?.message ?? ''}`).toBe(true);
  }
}

describe('数据校验', () => {
  it('角色数据符合 schema', () => expectAllValid(CHARACTERS, CharacterDefSchema));
  it('武器数据符合 schema', () => expectAllValid(WEAPONS, WeaponDefSchema));
  it('怪物数据符合 schema', () => expectAllValid(ENEMIES, EnemyDefSchema));

  it('全局参数符合 schema', () => {
    const result = BalanceDefSchema.safeParse(BALANCE);
    expect(result.success, result.error?.message).toBe(true);
  });

  it('schema 拒绝未知字段（防止拼错字段名被静默忽略）', () => {
    expect(WeaponDefSchema.safeParse({ ...WEAPONS.pistol_basic, damge: 3 }).success).toBe(false);
  });

  it('角色的开局武器存在', () => {
    for (const [id, def] of Object.entries(CHARACTERS)) {
      expect(def.startWeapon in WEAPONS, `${id}.startWeapon = ${def.startWeapon}`).toBe(true);
    }
  });

  it('引用的纹理 key 都存在于 src/game/assets/keys.ts', () => {
    const used = [
      ...Object.values(CHARACTERS).map((d) => d.sprite),
      ...Object.values(ENEMIES).map((d) => d.sprite),
      ...Object.values(WEAPONS).map((d) => d.bulletSprite),
    ];
    for (const key of used) expect(textureKeys.has(key), `未知纹理 ${key}`).toBe(true);
  });

  it('不同数据表之间没有重复 ID', () => {
    const ids = [...Object.keys(CHARACTERS), ...Object.keys(WEAPONS), ...Object.keys(ENEMIES)];
    expect(new Set(ids).size).toBe(ids.length);
  });
});

it('大厅布局与交互距离符合契约', () => {
  expect(HubSchema.safeParse(HUB).success).toBe(true);
});
