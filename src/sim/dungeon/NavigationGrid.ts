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
/** 固定数组 BFS 流场；缓存目标格/半径，所有查询原地写 out。 */
export class NavigationGrid {
  private readonly width: number;
  private readonly height: number;
  private readonly distances: Int16Array;
  private readonly queue: Int16Array;
  private readonly blocked: Uint8Array;
  private radius = -1;
  private target = -1;
  constructor(
    private readonly bounds: Bounds,
    private readonly free: Free,
    private readonly clear: Clear,
  ) {
    this.width = Math.ceil(bounds.width / NAVIGATION.cellSize);
    this.height = Math.ceil(bounds.height / NAVIGATION.cellSize);
    this.distances = new Int16Array(this.width * this.height);
    this.queue = new Int16Array(this.distances.length);
    this.blocked = new Uint8Array(this.distances.length);
  }
  invalidate(): void {
    this.radius = -1;
    this.target = -1;
  }
  private x(id: number): number {
    return this.bounds.x + ((id % this.width) + 0.5) * NAVIGATION.cellSize;
  }
  private y(id: number): number {
    return this.bounds.y + (Math.floor(id / this.width) + 0.5) * NAVIGATION.cellSize;
  }
  steer(x: number, y: number, tx: number, ty: number, radius: number, out: Vec2): boolean {
    radius += NAVIGATION.clearance;
    if (radius !== this.radius) {
      this.radius = radius;
      this.target = -1;
      for (let i = 0; i < this.blocked.length; i++)
        this.blocked[i] = this.free(this.x(i), this.y(i), radius) ? 0 : 1;
    }
    let goal = -1,
      nearest = Infinity;
    for (let i = 0; i < this.blocked.length; i++)
      if (!this.blocked[i]) {
        const d = Math.hypot(this.x(i) - tx, this.y(i) - ty);
        if (d < nearest) {
          goal = i;
          nearest = d;
        }
      }
    if (goal < 0) return false;
    if (goal !== this.target) this.build(goal);
    let best = -1,
      cost = Infinity;
    for (let i = 0; i < this.distances.length; i++) {
      if (this.distances[i]! < 0) continue;
      const cx = this.x(i),
        cy = this.y(i),
        distance = Math.hypot(cx - x, cy - y);
      if (distance > NAVIGATION.cellSize * NAVIGATION.lookahead || !this.clear(x, y, cx, cy, radius))
        continue;
      const score = this.distances[i]! * NAVIGATION.cellSize + distance;
      if (
        score < cost - Number.EPSILON ||
        (Math.abs(score - cost) < NAVIGATION.tieEpsilon &&
          (best < 0 || this.distances[i]! < this.distances[best]!))
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
  private build(goal: number): void {
    this.target = goal;
    this.distances.fill(-1);
    let read = 0,
      write = 1;
    this.queue[0] = goal;
    this.distances[goal] = 0;
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
          next >= this.distances.length ||
          this.blocked[next] ||
          this.distances[next]! >= 0 ||
          !this.clear(this.x(id), this.y(id), this.x(next), this.y(next), this.radius)
        )
          continue;
        this.distances[next] = this.distances[id]! + 1;
        this.queue[write++] = next;
      }
    }
  }
}
