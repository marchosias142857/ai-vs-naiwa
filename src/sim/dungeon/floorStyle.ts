import { FLOOR_STYLE_POLICY, ROOM_STYLES, type RoomStyleId } from '../../data/roomStyles';
import { Random } from '../core/Random';

/** Choose once from an explicit policy; no gameplay stream is consumed. */
export function floorStyle(seed: number, floor: number, policy = FLOOR_STYLE_POLICY): RoomStyleId {
  if (
    !Number.isInteger(floor) ||
    floor < 1 ||
    !policy.styles.length ||
    policy.styles.some((s) => !ROOM_STYLES[s])
  )
    throw new RangeError('invalid floor style policy');
  return policy.mode === 'random'
    ? new Random(seed).fork(`floor-style:${floor}`).pick(policy.styles)
    : policy.styles[(floor - 1) % policy.styles.length]!;
}
