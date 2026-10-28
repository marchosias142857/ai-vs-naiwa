/** ADR 0039: query masks are independent; combined masks block on any selected bit. */
export const GeometryMask = { walk: 1, land: 2, LOS: 4, projectile: 8 } as const;
/** World-unit contact tolerance shared by occupancy and directional initial sweeps. */
export const CONTACT_EPSILON = 0.02;
/** Deeper starting penetration is invalid even when moving towards free space. */
const MAX_RECOVERABLE_PENETRATION = 1;
export type GeometryKind = 'boundary' | 'wall' | 'pillar' | 'barrel' | 'rock' | 'water';
export type OccupyPurpose = 'walk' | 'land' | 'spawn' | 'surface' | 'rock';
export interface Point {
  readonly x: number;
  readonly y: number;
}
export interface GeometryObstacle {
  readonly id: string;
  readonly kind: GeometryKind;
  readonly mask: number;
  readonly shape:
    | { readonly type: 'polygon'; readonly points: readonly Point[] }
    | { readonly type: 'circle'; readonly x: number; readonly y: number; readonly radius: number };
}
/** Caller-owned output. Position is the moving centre, normal points away from the blocker.
 * Miss: t=1, distance=path length, position=to, normal=0, kind/id=null.
 * Initial contact has a separating unit normal; a zero-radius vertex uses -direction.
 * Results remain valid until caller reuses out.
 */
export interface GeometryHit {
  hit: boolean;
  t: number;
  distance: number;
  x: number;
  y: number;
  nx: number;
  ny: number;
  kind: GeometryKind | null;
  id: string | null;
}
/** Allocate outside the combat loop. */
export function createGeometryHit(): GeometryHit {
  return { hit: false, t: 1, distance: 0, x: 0, y: 0, nx: 0, ny: 0, kind: null, id: null };
}
/** Read-only sim contract; never imports game, consumes RNG, or changes world state. */
export interface GeometryQueries {
  readonly revision: number;
  /** Contact is legal: signed clearance may fall short of radius by CONTACT_EPSILON. */
  canOccupy(center: Point, radius: number, purpose: OccupyPurpose): boolean;
  /** Initial clearance <= radius + CONTACT_EPSILON blocks only inward motion. Leaving/sliding
   * ignores initial contact and exit roots, but still tests later entry into other features.
   * Room-exterior starts or penetration > 1 world unit always hit at t=0. Endpoint entry hits t=1.
   * Sliding out of initial contact ignores tangential endcap joins. Pure zero-radius LOS retains legacy
   * closed polygons / strict circle interiors, including initial overlap, without body tolerance.
   */
  sweepCircle(from: Point, to: Point, radius: number, mask: number, out: GeometryHit): void;
  traceSegment(from: Point, to: Point, mask: number, out: GeometryHit): void;
}
function distanceSq(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x,
    dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
  return (p.x - a.x - t * dx) ** 2 + (p.y - a.y - t * dy) ** 2;
}
function inside(p: Point, points: readonly Point[]): boolean {
  let yes = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[j]!,
      b = points[i]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) yes = !yes;
  }
  return yes;
}
function clearance(p: Point, points: readonly Point[], boundary: boolean): number {
  let nearest = Infinity;
  for (let i = 0; i < points.length; i++)
    nearest = Math.min(nearest, distanceSq(p, points[i]!, points[(i + 1) % points.length]!));
  return Math.sqrt(nearest) * (inside(p, points) === boundary ? 1 : -1);
}
function copyPolygon(points: readonly Point[]): readonly Point[] {
  if (points.length < 3) throw new Error('Geometry polygon needs at least three vertices');
  const copy = points.map((p) => Object.freeze({ x: p.x, y: p.y }));
  for (let i = 0; i < copy.length; i++) {
    const a = copy[i]!,
      b = copy[(i + 1) % copy.length]!;
    if (!Number.isFinite(a.x) || !Number.isFinite(a.y) || (a.x === b.x && a.y === b.y))
      throw new Error('Invalid geometry edge');
  }
  return Object.freeze(copy);
}
/** Immutable snapshot. The owner replaces it on room/door/barrel/rock changes and supplies
 * a strictly increasing revision across rooms (not a per-template counter). Snapshot creation
 * allocates; queries do not. Polygon inputs are compiled simple contours, no holes/self-crossing.
 * Room exterior always blocks all nonzero masks. Obstacles supply explicit masks; absent/broken
 * objects must be omitted. Circle LOS uses strict interior, matching legacy barrel/rock tangency.
 */
export class RoomGeometry implements GeometryQueries {
  readonly revision: number;
  private readonly boundary: readonly Point[];
  private readonly obstacles: readonly GeometryObstacle[];
  constructor(boundary: readonly Point[], obstacles: readonly GeometryObstacle[], revision: number) {
    if (!Number.isSafeInteger(revision) || revision < 0) throw new Error('Invalid geometry revision');
    this.revision = revision;
    this.boundary = copyPolygon(boundary);
    const ids = new Set<string>();
    this.obstacles = Object.freeze(
      obstacles.map((o) => {
        if (
          !o.id ||
          o.id === 'boundary' ||
          ids.has(o.id) ||
          !Number.isInteger(o.mask) ||
          o.mask < 0 ||
          o.mask > 15
        )
          throw new Error('Invalid geometry identity/mask');
        ids.add(o.id);
        const s = o.shape;
        if (
          s.type === 'circle' &&
          (!Number.isFinite(s.x) || !Number.isFinite(s.y) || !Number.isFinite(s.radius) || s.radius <= 0)
        )
          throw new Error('Invalid geometry circle');
        return Object.freeze({
          ...o,
          shape:
            s.type === 'polygon'
              ? Object.freeze({ type: 'polygon' as const, points: copyPolygon(s.points) })
              : Object.freeze({ ...s }),
        });
      }),
    );
    Object.freeze(this);
  }
  canOccupy(center: Point, radius: number, purpose: OccupyPurpose): boolean {
    this.validate(center, center, radius);
    const mask =
      purpose === 'walk' || purpose === 'surface'
        ? GeometryMask.walk
        : purpose === 'land'
          ? GeometryMask.land
          : GeometryMask.walk | GeometryMask.land;
    if (radius - clearance(center, this.boundary, true) > CONTACT_EPSILON) return false;
    for (const o of this.obstacles) {
      if (!(o.mask & mask)) continue;
      const s = o.shape;
      if (
        s.type === 'circle'
          ? radius + s.radius - Math.hypot(center.x - s.x, center.y - s.y) > CONTACT_EPSILON
          : radius - clearance(center, s.points, false) > CONTACT_EPSILON
      )
        return false;
    }
    return true;
  }
  traceSegment(from: Point, to: Point, mask: number, out: GeometryHit): void {
    this.sweepCircle(from, to, 0, mask, out);
  }
  sweepCircle(from: Point, to: Point, radius: number, mask: number, out: GeometryHit): void {
    this.validate(from, to, radius);
    if (!Number.isInteger(mask) || mask < 0 || mask > 15) throw new Error('Invalid query mask');
    out.hit = false;
    out.t = 1;
    out.distance = Math.hypot(to.x - from.x, to.y - from.y);
    out.x = to.x;
    out.y = to.y;
    out.nx = 0;
    out.ny = 0;
    out.kind = null;
    out.id = null;
    if (!mask) return;
    const los = radius === 0 && mask === GeometryMask.LOS;
    this.edges(from, to, radius, this.boundary, 'boundary', 'boundary', out, los, true);
    for (const o of this.obstacles) {
      if (!(o.mask & mask)) continue;
      const s = o.shape;
      if (s.type === 'circle')
        this.accumulateCircle(from, to, radius + s.radius, s.x, s.y, o.kind, o.id, out, los);
      else this.edges(from, to, radius, s.points, o.kind, o.id, out, los);
    }
    out.distance *= out.t;
    out.x = from.x + (to.x - from.x) * out.t;
    out.y = from.y + (to.y - from.y) * out.t;
  }
  private validate(a: Point, b: Point, r: number): void {
    if (
      !Number.isFinite(a.x) ||
      !Number.isFinite(a.y) ||
      !Number.isFinite(b.x) ||
      !Number.isFinite(b.y) ||
      !Number.isFinite(r) ||
      r < 0
    )
      throw new Error('Invalid geometry query');
  }
  private record(t: number, nx: number, ny: number, kind: GeometryKind, id: string, out: GeometryHit): void {
    if (t < 0 || t > 1 || t > out.t) return;
    if (
      out.hit &&
      t === out.t &&
      ((out.kind === 'boundary' && kind !== 'boundary') ||
        ((out.kind === 'boundary') === (kind === 'boundary') && id >= out.id!))
    )
      return;
    out.hit = true;
    out.t = t;
    out.nx = nx || 0;
    out.ny = ny || 0;
    out.kind = kind;
    out.id = id;
  }
  /** @internal Shared circle narrow phase for live slots; caller must first initialize/validate
   * out via sweepCircle, then finalize distance/position after accumulating all circles.
   */
  accumulateCircle(
    a: Point,
    b: Point,
    r: number,
    x: number,
    y: number,
    kind: GeometryKind,
    id: string,
    out: GeometryHit,
    strict = false,
    previous?: Point,
    next?: Point,
    sliding = false,
  ): void {
    const px = a.x - x,
      py = a.y - y,
      dx = b.x - a.x,
      dy = b.y - a.y;
    const c = px * px + py * py - r * r,
      v = dx * dx + dy * dy,
      dot = px * dx + py * dy,
      distance = Math.hypot(px, py),
      speed = Math.sqrt(v);
    // A centre/zero-radius vertex has no radial normal: oppose motion (fixed axis if stationary).
    const nx = distance ? px / distance : speed ? -dx / speed : 1,
      ny = distance ? py / distance : speed ? -dy / speed : 0;
    if (strict ? c < 0 : distance <= r + (previous ? 0 : CONTACT_EPSILON)) {
      if (strict || r - distance > MAX_RECOVERABLE_PENETRATION || dx * nx + dy * ny < 0)
        this.record(0, nx, ny, kind, id, out);
      return;
    }
    if (v === 0) return;
    const disc = dot * dot - v * c;
    if (disc < 0 || ((strict || (sliding && r > 0)) && disc === 0)) return;
    const t = (-dot - Math.sqrt(disc)) / v;
    if (strict && t >= 1) return;
    const hx = px + dx * t,
      hy = py + dy * t,
      length = Math.hypot(hx, hy);
    // A polygon endcap only owns the arc beyond BOTH adjacent finite edges. The hidden
    // half-circle would otherwise stop a slightly penetrating body sliding off a flat face.
    if (
      previous &&
      next &&
      (hx * (x - previous.x) + hy * (y - previous.y) < 0 || hx * (next.x - x) + hy * (next.y - y) > 0)
    )
      return;
    this.record(
      t,
      r && length ? hx / length : -dx / speed,
      r && length ? hy / length : -dy / speed,
      kind,
      id,
      out,
    );
  }
  private edges(
    a: Point,
    b: Point,
    r: number,
    points: readonly Point[],
    kind: GeometryKind,
    id: string,
    out: GeometryHit,
    los: boolean,
    boundary = false,
  ): void {
    const dx = b.x - a.x,
      dy = b.y - a.y,
      wrongSide = inside(a, points) !== boundary;
    let nearest = Infinity,
      nearX = 0,
      nearY = 0,
      edgeX = 0,
      edgeY = 0,
      area = 0;
    // Find a separating normal even for invalid starts; winding selects the legal side at d=0.
    for (let i = 0; i < points.length; i++) {
      const p = points[i]!,
        q = points[(i + 1) % points.length]!;
      const ex = q.x - p.x,
        ey = q.y - p.y;
      const u = Math.max(0, Math.min(1, ((a.x - p.x) * ex + (a.y - p.y) * ey) / (ex * ex + ey * ey)));
      const x = a.x - p.x - u * ex,
        y = a.y - p.y - u * ey,
        d = Math.hypot(x, y);
      area += p.x * q.y - q.x * p.y;
      if (d < nearest) {
        nearest = d;
        nearX = x;
        nearY = y;
        edgeX = ex;
        edgeY = ey;
      }
    }
    const side = (area > 0 ? 1 : -1) * (boundary ? 1 : -1);
    const normalX = nearest
      ? (nearX / nearest) * (wrongSide ? -1 : 1)
      : (-edgeY / Math.hypot(edgeX, edgeY)) * side;
    const normalY = nearest
      ? (nearY / nearest) * (wrongSide ? -1 : 1)
      : (edgeX / Math.hypot(edgeX, edgeY)) * side;
    const signed = wrongSide ? -nearest : nearest;
    if (
      (boundary && wrongSide && nearest > 0) ||
      r - signed > MAX_RECOVERABLE_PENETRATION ||
      (los && signed <= 0)
    ) {
      this.record(0, normalX, normalY, kind, id, out);
      return;
    }
    for (let i = 0; i < points.length; i++) {
      const p = points[i]!,
        q = points[(i + 1) % points.length]!;
      const ex = q.x - p.x,
        ey = q.y - p.y,
        len = Math.hypot(ex, ey),
        nx = (-ey / len) * side,
        ny = (ex / len) * side;
      const u = Math.max(0, Math.min(1, ((a.x - p.x) * ex + (a.y - p.y) * ey) / (len * len)));
      const cx = a.x - p.x - u * ex,
        cy = a.y - p.y - u * ey,
        distance = Math.hypot(cx, cy);
      if (distance <= r + (los ? 0 : CONTACT_EPSILON)) {
        const sx = distance ? (cx / distance) * (wrongSide ? -1 : 1) : nx;
        const sy = distance ? (cy / distance) * (wrongSide ? -1 : 1) : ny;
        if (los || dx * sx + dy * sy < 0) this.record(0, sx, sy, kind, id, out);
        continue;
      }
      // Only entry roots count: never report the far side of a capsule as an exit collision.
      this.accumulateCircle(
        a,
        b,
        r,
        p.x,
        p.y,
        kind,
        id,
        out,
        false,
        points[(i + points.length - 1) % points.length],
        q,
        !los && signed <= r + CONTACT_EPSILON,
      );
      const start = (a.x - p.x) * nx + (a.y - p.y) * ny,
        speed = dx * nx + dy * ny;
      if (speed >= 0) continue;
      const t = (r - start) / speed;
      const along = ((a.x + dx * t - p.x) * ex + (a.y + dy * t - p.y) * ey) / (len * len);
      if (along >= 0 && along <= 1) this.record(t, nx, ny, kind, id, out);
    }
  }
}
