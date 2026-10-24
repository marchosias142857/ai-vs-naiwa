import { expect, it } from 'vitest';
import { segmentHitsBox as hit } from '../../../src/sim/dungeon/geometry';
import { ROOM_LAYOUTS } from '../../../src/data/layouts';
import { RoomLayoutsSchema } from '../../../src/data/schema/layouts';
it('房间布局合法', () => expect(RoomLayoutsSchema.safeParse(ROOM_LAYOUTS).success).toBe(true));
it('视线：平行、反向、擦边、端点在墙中与零长度', () => {
  expect(hit(0, 5, 20, 5, 5, 0, 10, 10)).toBe(true);
  expect(hit(20, 5, 0, 5, 5, 0, 10, 10)).toBe(true);
  expect(hit(0, -1, 20, -1, 5, 0, 10, 10)).toBe(false);
  expect(hit(0, 0, 20, 0, 5, 0, 10, 10)).toBe(true);
  expect(hit(6, 6, 6, 6, 5, 0, 10, 10)).toBe(true);
  expect(hit(0, 5, 0, 15, 5, 0, 10, 10)).toBe(false);
});
