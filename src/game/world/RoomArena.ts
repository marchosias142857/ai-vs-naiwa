import { LEGACY_V1 } from '../../data/roomTemplates/legacyV1';
import { compileRoom, type CompiledRoom } from '../../sim/dungeon/compileRoom';
import { MODULAR_V2 } from '../../data/roomTemplates/modularV2';
import { resolveRoomTemplate } from '../../sim/dungeon/roomCatalog';
import { ROOM_BLOCKS, createRoomArt, type RoomArt } from './RoomArt';
import { TRAP_RULES } from '../../data/traps';
import { DUNGEON } from '../../data/dungeon';
import type { TrapPlacement } from '../../data/schema/traps';
import type { TrapLayoutInput } from '../../sim/combat/api';
import { LiveRoomGeometry } from '../../sim/geometry/LiveRoomGeometry';
import { createGeometryHit, GeometryMask, type GeometryQueries } from '../../sim/geometry/RoomGeometry';
import { ART } from '../assets/demoArt';
import { MAP_ART } from '../../data/mapArt';
import type { RoomTheme } from '../../data/schema/traps';
import { NavigationGrid } from '../../sim/dungeon/NavigationGrid';
import type { Vec2 } from '../../sim/core/types';
import type { GameObjects, Physics, Scene } from 'phaser';
import { COLORS, DEPTH, TILE_SIZE } from '../../config';
import { ROOM_LAYOUTS } from '../../data/layouts';
import { ROOM_RULES } from '../../data/rooms';
import type { DungeonRun } from '../../sim/run/DungeonRun';
import { TEX } from '../assets/keys';
import type { CombatBridge } from './CombatBridge';
import { GRAYBOX_BOUNDS as B } from './graybox';

interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}
const ROOM_BOUNDARY = [
  { x: B.x, y: B.y },
  { x: B.x + B.width, y: B.y },
  { x: B.x + B.width, y: B.y + B.height },
  { x: B.x, y: B.y + B.height },
];

/** 房间切换复用固定的内墙池。门口跨越判定由 DungeonRun 校验连接与锁门状态。 */
export class RoomArena {
  private readonly art: RoomArt | null;
  private readonly modularArt: boolean;
  private theme: RoomTheme['art'] = 'temple';
  private room: CompiledRoom | null = null;
  private readonly boundarySlots: Physics.Arcade.Image[] = [];
  private readonly navigation: NavigationGrid;
  private readonly graphics: GameObjects.Graphics;
  private readonly walls: Physics.Arcade.StaticGroup;
  private readonly slots: Physics.Arcade.Image[] = [];
  private readonly doors: GameObjects.Image[] = [];
  private readonly colliders: Physics.Arcade.Collider[];
  private readonly geometry: LiveRoomGeometry;
  private geometryRevision = -1;
  private readonly from = { x: 0, y: 0 };
  private readonly to = { x: 0, y: 0 };
  private readonly hit = createGeometryHit();
  constructor(
    scene: Scene,
    private readonly bridge: CombatBridge,
    reflectBullets = false,
    graybox = false,
  ) {
    this.art = graybox ? null : createRoomArt(scene, true);
    this.modularArt = !!this.art && scene.textures.exists(MAP_ART.textures.doors);
    this.graphics = scene.add.graphics().setDepth(DEPTH.floor + 1);
    if (this.art && (this.modularArt || scene.textures.exists(ART.doors)))
      for (let i = 0; i < 4; i++)
        this.doors.push(
          scene.add
            .image(
              0,
              0,
              this.modularArt ? MAP_ART.textures.doors : ART.doors,
              this.modularArt ? 'temple_north_open' : 'open',
            )
            .setDisplaySize(64, 40)
            .setDepth(DEPTH.floor + 2)
            .setVisible(false),
        );
    this.walls = scene.physics.add.staticGroup();
    for (let i = 0; i < ROOM_BLOCKS; i++) {
      const image = this.walls.create(0, 0, TEX.wall) as Physics.Arcade.Image;
      if (this.art) image.setTexture(ART.environment, 'pillar');
      image.disableBody(true, true);
      this.slots.push(image);
    }
    for (let i = 0; i < MODULAR_V2.maxBoundaryBodies; i++) {
      const image = this.walls.create(0, 0, TEX.wall) as Physics.Arcade.Image;
      image.disableBody(true, true);
      this.boundarySlots.push(image);
    }
    this.geometry = new LiveRoomGeometry(ROOM_BOUNDARY, [], bridge.sim);
    this.navigation = new NavigationGrid(MODULAR_V2.bounds, this.canWalk, this.pathClear);
    this.colliders = [
      scene.physics.add.collider(bridge.actors.group, this.walls),
      reflectBullets
        ? scene.physics.add.collider(bridge.bullets.group, this.walls)
        : scene.physics.add.overlap(bridge.bullets.group, this.walls, this.hitWall),
    ];
  }
  private readonly hitWall = (object: unknown): void => {
    const slot = this.bridge.bullets.byImage.get(object as Physics.Arcade.Image);
    if (!slot?.id) return;
    const body = slot.image.body!;
    this.bridge.sim.hitWall(slot.id, body.center.x, body.center.y);
    this.bridge.bullets.recycle(slot);
  };
  /** Resolve the selected stable ID before placing art, Arcade bodies or sim obstacles. */
  show(run: DungeonRun, templateId: string): void {
    const template = resolveRoomTemplate(templateId, run.floor, run.room.kind);
    if (!template) throw new RangeError('room template does not match the generated room');
    const room = compileRoom(template);
    if (template.boxes.length > this.slots.length) throw new RangeError('obstacle pool exhausted');
    for (const id of run.room.links) {
      const to = run.map.rooms[id]!;
      if (!room.ports.some((p) => p.direction.x === to.x - run.room.x && p.direction.y === to.y - run.room.y))
        throw new RangeError('missing linked port');
    }
    this.room = room;
    this.theme = template.theme;
    this.bridge.setRoomBounds(room.bounds);
    for (let i = 0; i < this.boundarySlots.length; i++) {
      const image = this.boundarySlots[i]!,
        box = room.cuts[i];
      if (!box) {
        image.disableBody(true, true);
        continue;
      }
      image
        .enableBody(true, box.x, box.y, true, true)
        .setDisplaySize(box.width, box.height)
        .refreshBody()
        .setAlpha(0);
    }
    this.art?.show(
      template.theme,
      template.boxes,
      room,
      template.traps,
      room.ports.filter((p) =>
        run.room.links.some((id) => {
          const to = run.map.rooms[id]!;
          return p.direction.x === to.x - run.room.x && p.direction.y === to.y - run.room.y;
        }),
      ),
    );
    this.setBoxes(template.boxes, template.obstacle, template.mask);
    // 每层每个房间的编号唯一；同一房间重建（存档恢复）时 sim 保留机关进行中的状态。
    this.placeTraps(run.floor * DUNGEON.gridSize ** 2 + run.roomId, template.traps);
    this.prepareGeometry();
    this.draw(run);
  }
  /** 机关换算成世界坐标交给 sim；与当前摆放相同时 sim 保留进行中的状态（存档恢复）。 */
  private placeTraps(room: number, traps: readonly TrapPlacement[]): void {
    const cx = B.x + B.width / 2,
      cy = B.y + B.height / 2;
    const layouts: TrapLayoutInput[] = traps.map((t) => ({
      kind: t.kind,
      x: cx + t.x,
      y: cy + t.y,
      width: t.width ?? 0,
      height: t.height ?? 0,
      radius: t.kind === 'mine' ? TRAP_RULES.mine.radius : t.kind === 'barrel' ? TRAP_RULES.barrel.radius : 0,
      angle: ((t.angle ?? 0) * Math.PI) / 180,
      delay: t.delay ?? 0,
    }));
    this.bridge.sim.setTraps(room, layouts);
    this.navigation.invalidate();
  }
  /** 鱼雷桶被打爆后，导航网格重新把那里当成空地。 */
  invalidateNavigation(): void {
    this.navigation.invalidate();
  }
  /** 压测也复用正式房间的墙体、视线与导航缓存。 */
  setLayout(layout: number): void {
    const boxes = ROOM_LAYOUTS[layout % ROOM_LAYOUTS.length]!;
    this.art?.show('temple', boxes);
    this.setBoxes(boxes);
  }
  private setBoxes(boxes: readonly Box[], kind: 'wall' | 'pillar' = 'wall', mask = 15): void {
    // 新主题的内墙由 RoomArt 平铺障碍块画出来，这里的墙体只保留碰撞。
    const hidden = this.art?.drawsBlocks ?? false;
    for (let i = 0; i < this.slots.length; i++) {
      const image = this.slots[i]!,
        box = boxes[i];
      if (!box) {
        image.disableBody(true, true);
        continue;
      }
      image.enableBody(true, B.x + B.width / 2 + box.x, B.y + B.height / 2 + box.y, true, true);
      image
        .setDisplaySize(box.width, box.height)
        .refreshBody()
        .setDepth(DEPTH.wallTops)
        .setAlpha(hidden ? 0 : 1);
    }
    this.geometry.setRoom(
      this.room?.boundary ?? ROOM_BOUNDARY,
      boxes.slice(0, this.slots.length).map((box, i) => {
        const x = B.x + B.width / 2 + box.x,
          y = B.y + B.height / 2 + box.y;
        const l = x - box.width / 2,
          r = x + box.width / 2;
        const t = y - box.height / 2,
          b = y + box.height / 2;
        return {
          id: `${kind}:${i}`,
          kind,
          mask,
          shape: {
            type: 'polygon',
            points: [
              { x: l, y: t },
              { x: r, y: t },
              { x: r, y: b },
              { x: l, y: b },
            ],
          },
        };
      }),
    );
    this.navigation.invalidate();
  }
  draw(run: DungeonRun): void {
    const g = this.graphics;
    g.clear();
    if (!this.art) {
      const points = this.room?.boundary ?? ROOM_BOUNDARY;
      g.beginPath();
      g.moveTo(points[0]!.x, points[0]!.y);
      for (let i = 1; i < points.length; i++) g.lineTo(points[i]!.x, points[i]!.y);
      g.closePath();
      g.fillStyle(COLORS.floor).fillPath();
      g.lineStyle(2, COLORS.wall).strokePath();
    } else if (!this.modularArt)
      g.lineStyle(1, 0x647d80).strokeRect(B.x - 1, B.y - 1, B.width + 2, B.height + 2);
    const room = run.room,
      h = ROOM_RULES.doorHalfWidth;
    for (const door of this.doors) door.setVisible(false);
    let doorIndex = 0;
    for (const id of room.links) {
      const to = run.map.rooms[id]!,
        dx = to.x - room.x,
        dy = to.y - room.y;
      const port = this.port(dx, dy);
      const x = port.center.x,
        y = port.center.y;
      const door = this.doors[doorIndex++];
      if (door) {
        if (this.modularArt) {
          door
            .setTexture(MAP_ART.textures.doors, `${this.theme}_${port.id}_${run.locked ? 'locked' : 'open'}`)
            .setDisplaySize(dx ? 24 : 40, dx ? 38 : 30)
            .setAngle(0)
            .setOrigin(0.5, dy < 0 ? 0.8 : dy > 0 ? 0.2 : 0.5)
            .setPosition(x, y)
            .setVisible(true);
          continue;
        }
        door
          .setTexture(ART.doors, run.locked ? 'locked' : 'open')
          .setDisplaySize(64, 40)
          .setPosition(x, y)
          .setAngle(dx ? dx * 90 : dy > 0 ? 180 : 0)
          .setVisible(true);
        continue;
      }
      g.fillStyle(run.locked ? 0x6c384b : 0x397b83);
      g.fillRect(
        x - (dx ? TILE_SIZE : h),
        y - (dy ? TILE_SIZE : h),
        dx ? TILE_SIZE * 2 : h * 2,
        dy ? TILE_SIZE * 2 : h * 2,
      );
    }
  }
  /** 身体中心靠近门且仍向外移动才换房；站在门边不会来回跳。 */
  exit(run: DungeonRun, x: number, y: number, vx: number, vy: number): number | null {
    if (run.locked || run.finished) return null;
    for (const id of run.room.links) {
      const to = run.map.rooms[id]!,
        dx = to.x - run.room.x,
        dy = to.y - run.room.y;
      const port = this.port(dx, dy);
      const aligned = Math.abs(dx ? y - port.center.y : x - port.center.x) <= ROOM_RULES.doorHalfWidth;
      const atEdge = Math.abs(dx ? x - port.center.x : y - port.center.y) < ROOM_RULES.exitReach;
      if (aligned && atEdge && dx * vx + dy * vy > 0) return id;
    }
    return null;
  }
  teleport(dx = 0, dy = 0): void {
    this.bridge.sim.clearHazards();
    for (const b of this.bridge.bullets.slots)
      if (b.id) {
        this.bridge.sim.releaseBullet(b.id);
        this.bridge.bullets.recycle(b);
      }
    for (const s of this.bridge.actors.slots) {
      const a = this.bridge.sim.getActor(s.id);
      if (!a) continue;
      if (a.team === 'enemy') {
        this.bridge.actors.finishDeath(a.id);
        continue;
      }
      const point = dx || dy ? this.port(-dx, -dy).entrance : this.anchor('player');
      const safe = this.safePoint(point, a.radius);
      if (!safe) throw new RangeError('no safe player entrance');
      const { x, y } = safe;
      const body = s.image.body as Physics.Arcade.Body;
      body.reset(x, y);
      // reset 从贴图左上角定位；身体圆形碰撞体必须重新应用 offset。
      body.updateFromGameObject();
      body.prev.copy(body.position);
      body.prevFrame.copy(body.position);
      s.image.setVelocity(0, 0);
      this.bridge.sim.syncPosition(a.id, x, y);
    }
  }
  /** Refresh before a decision, then expose only read-only queries. This also covers same-step
   * barrel/rock changes and restored pools without altering WORLD_STEP listener order.
   * AI integration supplies this as a provider; EnemyAi must never import the game layer.
   */
  prepareGeometry(): GeometryQueries {
    this.geometry.sync();
    if (this.geometryRevision !== this.geometry.revision) {
      this.navigation.invalidate();
      this.geometryRevision = this.geometry.revision;
    }
    return this.geometry;
  }
  port(dx: number, dy: number) {
    const ports = this.room?.ports ?? LEGACY_V1.ports;
    const port = ports.find((p) => p.direction.x === dx && p.direction.y === dy);
    if (!port) throw new RangeError('missing room port');
    return port;
  }
  anchor(kind: keyof CompiledRoom['anchors']): Readonly<Vec2> {
    return this.room?.anchors[kind] ?? LEGACY_V1.anchors[kind];
  }
  readonly spawnAnchors = () => this.room?.spawns ?? [];
  /** Dynamic blockers can invalidate a static anchor. Never return an unchecked position. */
  safePoint(point: Readonly<Vec2>, radius: number): Readonly<Vec2> | null {
    if (this.isFree(point.x, point.y, radius)) return point;
    return this.spawnAnchors().find((p) => this.isFree(p.x, p.y, radius)) ?? null;
  }
  readonly isFree = (x: number, y: number, r: number): boolean => {
    this.prepareGeometry();
    this.from.x = x;
    this.from.y = y;
    return this.geometry.canOccupy(this.from, r, 'spawn');
  };
  private readonly canWalk = (x: number, y: number, r: number): boolean => {
    this.from.x = x;
    this.from.y = y;
    return this.geometry.canOccupy(this.from, r, 'walk');
  };
  readonly steer = (x: number, y: number, tx: number, ty: number, radius: number, out: Vec2): boolean => {
    this.prepareGeometry();
    if (this.pathClear(x, y, tx, ty, radius)) return false;
    return this.navigation.steer(x, y, tx, ty, radius, out);
  };
  private readonly pathClear = (x1: number, y1: number, x2: number, y2: number, radius: number): boolean => {
    this.from.x = x1;
    this.from.y = y1;
    this.to.x = x2;
    this.to.y = y2;
    this.geometry.sweepCircle(this.from, this.to, radius, GeometryMask.walk, this.hit);
    // A legal endpoint may exactly touch; only an earlier collision prevents reaching it.
    return (!this.hit.hit || this.hit.t === 1) && this.geometry.canOccupy(this.to, radius, 'walk');
  };
  readonly lineOfSight = (x1: number, y1: number, x2: number, y2: number): boolean => {
    this.prepareGeometry();
    this.from.x = x1;
    this.from.y = y1;
    this.to.x = x2;
    this.to.y = y2;
    this.geometry.traceStaticSegment(this.from, this.to, GeometryMask.LOS, this.hit);
    return !this.hit.hit;
  };

  destroy(): void {
    for (const c of this.colliders) if (c.world) c.destroy();
    this.walls.destroy(true, true);
    for (const door of this.doors) door.destroy();
  }
}
