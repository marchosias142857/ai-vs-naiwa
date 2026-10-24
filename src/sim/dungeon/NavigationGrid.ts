import type { Vec2 } from '../core/types';
import { NAVIGATION } from '../../data/navigation';
interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}
type Free = (x: number, y: number, radius: number) => boolean;
type Clear = (x1: number, y1: number, x2: number, y2: number, radius: number) => boolean;
interface Field {
  radius: number;
  target: number;
  goal: number;
  distances: Int16Array;
  blocked: Uint8Array;
}
/** 固定容量的按半径缓存；换房失效，目标格 O(1) 定位，查询原地写 out。 */
export class NavigationGrid {
  private readonly width: number;
  private readonly height: number;
  private readonly queue: Int16Array;
  private readonly fields: Field[] = [];
  private replacement = 0;
  constructor(
    private readonly bounds: Bounds,
    private readonly free: Free,
    private readonly clear: Clear,
  ) {
    this.width = Math.ceil(bounds.width / NAVIGATION.cellSize);
    this.height = Math.ceil(bounds.height / NAVIGATION.cellSize);
    this.queue = new Int16Array(this.width * this.height);
    for (let i = 0; i < NAVIGATION.radiusCaches; i++)
      this.fields.push({
        radius: -1,
        target: -1,
        goal: -1,
        distances: new Int16Array(this.queue.length),
        blocked: new Uint8Array(this.queue.length),
      });
  }
  invalidate(): void {
    for (const field of this.fields) field.radius = -1;
  }
  private x(id: number): number {
    return this.bounds.x + ((id % this.width) + 0.5) * NAVIGATION.cellSize;
  }
  private y(id: number): number {
    return this.bounds.y + (Math.floor(id / this.width) + 0.5) * NAVIGATION.cellSize;
  }
  steer(x: number, y: number, tx: number, ty: number, radius: number, out: Vec2): boolean {
    radius += NAVIGATION.clearance;
    let field = this.fields[0]!;
    let found = false;
    for (const candidate of this.fields)
      if (candidate.radius === radius) {
        field = candidate;
        found = true;
        break;
      }
    if (!found) {
      field = this.fields[this.replacement++ % this.fields.length]!;
      field.radius = radius;
      field.target = -1;
      for (let i = 0; i < field.blocked.length; i++)
        field.blocked[i] = this.free(this.x(i), this.y(i), radius) ? 0 : 1;
    }
    const column = Math.max(
        0,
        Math.min(this.width - 1, Math.floor((tx - this.bounds.x) / NAVIGATION.cellSize)),
      ),
      row = Math.max(0, Math.min(this.height - 1, Math.floor((ty - this.bounds.y) / NAVIGATION.cellSize))),
      target = row * this.width + column;
    if (target !== field.target) {
      let goal = target;
      // 大半径目标格可能贴墙；只有目标格变化时才寻找最近的可达替代格。
      if (field.blocked[goal]) {
        goal = -1;
        let nearest = Infinity;
        for (let i = 0; i < field.blocked.length; i++)
          if (!field.blocked[i]) {
            const distance = (this.x(i) - this.x(target)) ** 2 + (this.y(i) - this.y(target)) ** 2;
            if (distance < nearest) {
              goal = i;
              nearest = distance;
            }
          }
      }
      field.target = target;
      field.goal = goal;
      if (goal >= 0) this.build(goal, field);
    }
    if (field.goal < 0) return false;
    let best = -1,
      cost = Infinity;
    const reach = NAVIGATION.cellSize * NAVIGATION.lookahead;
    const left = Math.max(0, Math.floor((x - reach - this.bounds.x) / NAVIGATION.cellSize)),
      right = Math.min(this.width - 1, Math.floor((x + reach - this.bounds.x) / NAVIGATION.cellSize)),
      top = Math.max(0, Math.floor((y - reach - this.bounds.y) / NAVIGATION.cellSize)),
      bottom = Math.min(this.height - 1, Math.floor((y + reach - this.bounds.y) / NAVIGATION.cellSize));
    for (let row = top; row <= bottom; row++)
      for (let column = left; column <= right; column++) {
        const i = row * this.width + column;
        if (field.distances[i]! < 0) continue;
        const cx = this.x(i),
          cy = this.y(i),
          distance = Math.hypot(cx - x, cy - y);
        if (distance > NAVIGATION.cellSize * NAVIGATION.lookahead || !this.clear(x, y, cx, cy, radius))
          continue;
        const score = field.distances[i]! * NAVIGATION.cellSize + distance;
        if (
          score < cost - Number.EPSILON ||
          (Math.abs(score - cost) < NAVIGATION.tieEpsilon &&
            (best < 0 || field.distances[i]! < field.distances[best]!))
        ) {
          cost = score;
          best = i;
        }
      }
    if (best < 0) return false;
    out.x = this.x(best);
    out.y = this.y(best);
    return true;
  }
  private build(goal: number, field: Field): void {
    field.distances.fill(-1);
    let read = 0,
      write = 1;
    this.queue[0] = goal;
    field.distances[goal] = 0;
    while (read < write) {
      const id = this.queue[read++]!;
      for (let direction = 0; direction < 4; direction++) {
        if (
          (direction === 0 && id % this.width === 0) ||
          (direction === 1 && id % this.width === this.width - 1)
        )
          continue;
        const next =
          id + (direction === 0 ? -1 : direction === 1 ? 1 : direction === 2 ? -this.width : this.width);
        if (
          next < 0 ||
          next >= field.distances.length ||
          field.blocked[next] ||
          field.distances[next]! >= 0 ||
          !this.clear(this.x(id), this.y(id), this.x(next), this.y(next), field.radius)
        )
          continue;
        field.distances[next] = field.distances[id]! + 1;
        this.queue[write++] = next;
      }
    }
  }
}
