import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { LEGACY_V1 } from '../../../src/data/roomTemplates/legacyV1';
import { roomTemplate } from '../../../src/sim/dungeon/roomCatalog';

it('keeps the independent pre-redraw baseline byte-for-byte while retiring its IDs', () => {
  const expected = readFileSync(new URL('../../fixtures/legacyV1/catalog.bytes.txt', import.meta.url));
  expect(Buffer.from(JSON.stringify(LEGACY_V1) + '\n', 'utf8')).toEqual(expected);
  for (const theme of LEGACY_V1.themes)
    for (const room of [theme.empty, theme.boss, ...theme.plans]) {
      expect(roomTemplate(room.id)).toBeNull();
      expect(roomTemplate(room.id.replace('legacy_v1/', 'modular_v2/'))).toBeNull();
    }
});
it('preserves the frozen baseline without letting new templates mutate it', () => {
  const visit = (value: unknown): void => {
    if (value && typeof value === 'object') {
      expect(Object.isFrozen(value)).toBe(true);
      for (const child of Object.values(value)) visit(child);
    }
  };
  visit(LEGACY_V1);
});
