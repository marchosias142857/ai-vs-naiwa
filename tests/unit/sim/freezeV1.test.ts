import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { LEGACY_V1 } from '../../../src/data/roomTemplates/legacyV1';
import { BOSS_ROOM_LAYOUT, ROOM_LAYOUTS } from '../../../src/data/layouts';
import { ROOM_THEMES, TRAP_RULES } from '../../../src/data/traps';
import { ROOM_RULES } from '../../../src/data/rooms';
import { RoomLayoutsSchema } from '../../../src/data/schema/layouts';
import { RoomThemeSchema } from '../../../src/data/schema/traps';
import { freezeV1, legacyV1Template } from '../../../src/sim/dungeon/freezeV1';
import { DungeonRun } from '../../../src/sim/run/DungeonRun';
import { EventBus } from '../../../src/sim/core/EventBus';

it('locks ordered UTF-8 catalog bytes without snapshot auto-update', () => {
  const expected = readFileSync(new URL('../../fixtures/legacyV1/catalog.bytes.txt', import.meta.url));
  expect(Buffer.from(JSON.stringify(LEGACY_V1) + '\n', 'utf8')).toEqual(expected);
});

it('copies the current plans, geometry and door rules with no shared references', () => {
  expect(LEGACY_V1.layouts).toEqual(ROOM_LAYOUTS);
  expect(LEGACY_V1.bossLayout).toEqual(BOSS_ROOM_LAYOUT);
  expect(LEGACY_V1.trapRadii).toEqual({ mine: TRAP_RULES.mine.radius, barrel: TRAP_RULES.barrel.radius });
  expect(LEGACY_V1.doorRules).toEqual({
    doorHalfWidth: ROOM_RULES.doorHalfWidth,
    entranceInset: ROOM_RULES.entranceInset,
    exitReach: ROOM_RULES.exitReach,
  });
  expect(RoomLayoutsSchema.safeParse(LEGACY_V1.layouts).success).toBe(true);
  LEGACY_V1.themes.forEach((theme, i) => {
    const live = ROOM_THEMES[i]!;
    const plain = { art: theme.art, plans: theme.plans.map(({ layout, traps }) => ({ layout, traps })) };
    expect(plain).toEqual(live);
    expect(RoomThemeSchema.safeParse(plain).success).toBe(true);
    expect(theme.plans).not.toBe(live.plans);
    theme.plans.forEach((p, index) => expect(p.traps).not.toBe(live.plans[index]!.traps));
  });
  LEGACY_V1.layouts.forEach((boxes, i) => {
    expect(boxes).not.toBe(ROOM_LAYOUTS[i]);
    boxes.forEach((box, j) => expect(box).not.toBe(ROOM_LAYOUTS[i]![j]));
  });
});

it('is deeply frozen, with unique stable IDs and strict lookup', () => {
  const visit = (value: unknown): void => {
    if (value !== null && typeof value === 'object') {
      expect(Object.isFrozen(value)).toBe(true);
      for (const child of Object.values(value)) visit(child);
    }
  };
  visit(LEGACY_V1);
  const ids = LEGACY_V1.themes.flatMap((t) => [t.emptyId, t.bossId, ...t.plans.map((p) => p.id)]);
  expect(new Set(ids).size).toBe(22);
  for (const id of ids) expect(legacyV1Template(id)?.id).toBe(id);
  for (const id of ['', 'temple/combat_0', 'legacy_v1/temple/combat_99', '__proto__'])
    expect(legacyV1Template(id)).toBeNull();
  expect(Reflect.set(LEGACY_V1.bounds, 'x', 999)).toBe(false);
  expect(LEGACY_V1.bounds.x).toBe(104);
});

it('keeps legacy IDs and geometry when the live plans are extended or reordered', () => {
  const run = new DungeonRun(12345, new EventBus());
  const before = freezeV1(run.seed, 1, run.map.rooms);
  const geometry = before.templateIds.map(legacyV1Template);
  const plans = ROOM_THEMES[0].plans as unknown as unknown[];
  const saved = plans.slice();
  try {
    plans.reverse();
    plans.push({ layout: 8, traps: [] });
    expect(freezeV1(run.seed, 1, run.map.rooms)).toEqual(before);
    expect(before.templateIds.map(legacyV1Template)).toEqual(geometry);
  } finally {
    plans.splice(0, plans.length, ...saved);
  }
});

it('returns independent floor manifests without mutating map progress', () => {
  for (const seed of [0, 42, 12345, 0xffffffff]) {
    for (let floor = 1; floor <= 4; floor++) {
      const run = new DungeonRun(seed, new EventBus(), floor);
      const before = JSON.stringify({ map: run.map, state: run.save() });
      const first = freezeV1(seed, floor, run.map.rooms);
      const second = freezeV1(seed, floor, run.map.rooms);
      expect(first).toEqual(second);
      expect(first.templateIds).not.toBe(second.templateIds);
      expect(first.templateIds).toHaveLength(floor === 4 ? 2 : 8);
      run.map.rooms.forEach((room) => {
        const template = legacyV1Template(first.templateIds[room.id]!)!;
        expect(template.theme).toBe(LEGACY_V1.themes[floor - 1]!.art);
        if (room.kind === 'boss') expect(template.boxes).toEqual(BOSS_ROOM_LAYOUT);
        else if (room.kind !== 'combat') expect(template).toMatchObject({ boxes: [], traps: [] });
      });
      expect(JSON.stringify({ map: run.map, state: run.save() })).toBe(before);
    }
  }
});

it('rejects invalid seed, floor and room indexing instead of guessing a legacy ID', () => {
  for (const seed of [-1, 0x100000000, 1.5, NaN]) expect(() => freezeV1(seed, 1, [])).toThrow();
  for (const floor of [0, 5, 1.5, NaN]) expect(() => freezeV1(42, floor, [])).toThrow();
  expect(() => freezeV1(42, 1, [{ id: 1, kind: 'combat' }])).toThrow();
});
