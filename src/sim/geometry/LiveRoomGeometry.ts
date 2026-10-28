import type { CombatWorld } from '../combat/api';
import { standingBarrel } from '../room/Traps';
import {
  CONTACT_EPSILON,
  GeometryMask,
  RoomGeometry,
  type GeometryHit,
  type GeometryObstacle,
  type GeometryQueries,
  type OccupyPurpose,
  type Point,
} from './RoomGeometry';

interface CircleSlot {
  readonly id: string;
  readonly kind: 'barrel' | 'rock';
  active: boolean;
  x: number;
  y: number;
  radius: number;
}
type Source = Pick<CombatWorld, 'traps' | 'rocks'>;

/** Static contours are copied only at room changes. Dynamic circles have fixed capacity and IDs.
 * The owner calls sync() BEFORE exposing this as GeometryQueries; queries never refresh/mutate it.
 * Keep one instance per session: revision increases across rooms and is not a save field.
 */
export class LiveRoomGeometry implements GeometryQueries {
  private room!: RoomGeometry;
  private version = 0;
  private readonly circles: CircleSlot[];
  private readonly trapCount: number;
  private readonly rockCount: number;
  constructor(
    boundary: readonly Point[],
    obstacles: readonly GeometryObstacle[],
    private readonly source: Source,
  ) {
    this.trapCount = source.traps.length;
    this.rockCount = source.rocks.length;
    this.circles = Array.from({ length: this.trapCount + this.rockCount }, (_, i) => ({
      id: i < this.trapCount ? `barrel:${i}` : `rock:${i - this.trapCount}`,
      kind: i < this.trapCount ? 'barrel' : 'rock',
      active: false,
      x: 0,
      y: 0,
      radius: 0,
    }));
    this.setRoom(boundary, obstacles);
    this.sync();
  }
  get revision(): number {
    return this.version;
  }
  /** Called at room/load boundaries only; never rebuilds static polygons for a broken barrel. */
  setRoom(boundary: readonly Point[], obstacles: readonly GeometryObstacle[]): void {
    this.checkRevision();
    for (const o of obstacles)
      if (o.id.startsWith('barrel:') || o.id.startsWith('rock:'))
        throw new Error('Static geometry uses a reserved dynamic ID');
    const room = new RoomGeometry(boundary, obstacles, this.version + 1);
    this.room = room;
    this.version++;
  }
  /** Copies only blocking state into preallocated circles, once per observation boundary.
   * Return true only when query results could change. Timers, hp, warnings and other traps do not
   * invalidate navigation. Sources are the existing fixed pools, including after load/clearHazards.
   */
  sync(): boolean {
    const { traps, rocks } = this.source;
    if (traps.length !== this.trapCount || rocks.length !== this.rockCount)
      throw new Error('Geometry source capacity changed');
    this.checkRevision();
    let changed = false;
    for (let i = 0; i < this.circles.length; i++) {
      const slot = this.circles[i]!;
      const value = i < this.trapCount ? traps[i]! : rocks[i - this.trapCount]!;
      const active =
        i < this.trapCount
          ? standingBarrel(traps[i]!)
          : rocks[i - this.trapCount]!.active && rocks[i - this.trapCount]!.landed;
      if (
        slot.active === active &&
        (!active || (slot.x === value.x && slot.y === value.y && slot.radius === value.radius))
      )
        continue;
      slot.active = active;
      slot.x = value.x;
      slot.y = value.y;
      slot.radius = value.radius;
      changed = true;
    }
    if (changed) this.version++;
    return changed;
  }
  private checkRevision(): void {
    if (this.version >= Number.MAX_SAFE_INTEGER) throw new Error('Geometry revision exhausted');
  }
  canOccupy(center: Point, radius: number, purpose: OccupyPurpose): boolean {
    if (!this.room.canOccupy(center, radius, purpose)) return false;
    for (const s of this.circles)
      if (s.active && radius + s.radius - Math.hypot(center.x - s.x, center.y - s.y) > CONTACT_EPSILON)
        return false;
    return true;
  }
  /** Legacy muzzle/melee adapter: CombatWorld owns dynamic-object hit handling separately.
   * Include the true contour without treating a landed rock around the shooter as an inner wall.
   */
  traceStaticSegment(from: Point, to: Point, mask: number, out: GeometryHit): void {
    this.room.traceSegment(from, to, mask, out);
  }
  traceSegment(from: Point, to: Point, mask: number, out: GeometryHit): void {
    this.sweepCircle(from, to, 0, mask, out);
  }
  sweepCircle(from: Point, to: Point, radius: number, mask: number, out: GeometryHit): void {
    this.room.sweepCircle(from, to, radius, mask, out);
    if (!mask) return;
    for (const s of this.circles)
      if (s.active)
        this.room.accumulateCircle(
          from,
          to,
          radius + s.radius,
          s.x,
          s.y,
          s.kind,
          s.id,
          out,
          radius === 0 && mask === GeometryMask.LOS,
        );
    out.distance = Math.hypot(to.x - from.x, to.y - from.y) * out.t;
    out.x = from.x + (to.x - from.x) * out.t;
    out.y = from.y + (to.y - from.y) * out.t;
  }
}
