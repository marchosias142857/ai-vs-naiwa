import { createRoomArt } from './RoomArt';
import { ART } from '../assets/demoArt';
import { NavigationGrid } from '../../sim/dungeon/NavigationGrid';
import { NAVIGATION } from '../../data/navigation';
import type { Vec2 } from '../../sim/core/types';
import type { GameObjects, Physics, Scene } from 'phaser';
import { COLORS, DEPTH, TILE_SIZE } from '../../config';
import { BOSS_ROOM_LAYOUT, ROOM_LAYOUTS } from '../../data/layouts';
import { ROOM_RULES } from '../../data/rooms';
import { segmentHitsBox } from '../../sim/dungeon/geometry';
import type { DungeonRun } from '../../sim/run/DungeonRun';
import { TEX } from '../assets/keys';
import type { CombatBridge } from './CombatBridge';
import { GRAYBOX_BOUNDS as B } from './graybox';

/** 房间切换复用固定的内墙池。门口跨越判定由 DungeonRun 校验连接与锁门状态。 */
export class RoomArena {
  private readonly art: boolean;
  private readonly navigation: NavigationGrid;
  private readonly graphics: GameObjects.Graphics;
  private readonly walls: Physics.Arcade.StaticGroup;
  private readonly slots: Physics.Arcade.Image[] = [];
  private readonly doors: GameObjects.Image[] = [];
  private readonly colliders: Physics.Arcade.Collider[];
  constructor(
    scene: Scene,
    private readonly bridge: CombatBridge,
    reflectBullets = false,
  ) {
    this.art = createRoomArt(scene);
    this.graphics = scene.add.graphics().setDepth(DEPTH.floor + 1);
    if (this.art && scene.textures.exists(ART.doors))
      for (let i = 0; i < 4; i++)
        this.doors.push(
          scene.add
            .image(0, 0, ART.doors, 'open')
            .setDisplaySize(64, 40)
            .setDepth(DEPTH.floor + 2)
            .setVisible(false),
        );
    this.walls = scene.physics.add.staticGroup();
    for (let i = 0; i < 8; i++) {
      const image = this.walls.create(0, 0, TEX.wall) as Physics.Arcade.Image;
      if (this.art) image.setTexture(ART.environment, 'pillar');
      image.disableBody(true, true);
      this.slots.push(image);
    }
    this.navigation = new NavigationGrid(B, this.isFree, this.pathClear);
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
  show(run: DungeonRun, layout: number): void {
    // Boss 房固定放石柱，冲撞撞柱会晕（ADR 0030）。
    if (run.room.kind === 'boss') this.setBoxes(BOSS_ROOM_LAYOUT);
    else this.setLayout(run.room.kind === 'combat' ? layout : 0);
    this.draw(run);
  }
  /** 压测也复用正式房间的墙体、视线与导航缓存。 */
  setLayout(layout: number): void {
    this.setBoxes(ROOM_LAYOUTS[layout % ROOM_LAYOUTS.length]!);
  }
  private setBoxes(boxes: readonly { x: number; y: number; width: number; height: number }[]): void {
    for (let i = 0; i < this.slots.length; i++) {
      const image = this.slots[i]!,
        box = boxes[i];
      if (!box) {
        image.disableBody(true, true);
        continue;
      }
      image.enableBody(true, B.x + B.width / 2 + box.x, B.y + B.height / 2 + box.y, true, true);
      image.setDisplaySize(box.width, box.height).refreshBody().setDepth(DEPTH.wallTops);
    }
    this.navigation.invalidate();
  }
  draw(run: DungeonRun): void {
    const g = this.graphics;
    g.clear();
    if (!this.art) {
      g.fillStyle(COLORS.wall).fillRect(
        B.x - TILE_SIZE,
        B.y - TILE_SIZE,
        B.width + 2 * TILE_SIZE,
        B.height + 2 * TILE_SIZE,
      );
      g.fillStyle(COLORS.floor).fillRect(B.x, B.y, B.width, B.height);
      g.lineStyle(1, COLORS.floorAlt);
      for (let x = B.x; x < B.x + B.width; x += TILE_SIZE) g.lineBetween(x, B.y, x, B.y + B.height);
      for (let y = B.y; y < B.y + B.height; y += TILE_SIZE) g.lineBetween(B.x, y, B.x + B.width, y);
    } else g.lineStyle(1, 0x647d80).strokeRect(B.x - 1, B.y - 1, B.width + 2, B.height + 2);
    const room = run.room,
      h = ROOM_RULES.doorHalfWidth;
    for (const door of this.doors) door.setVisible(false);
    let doorIndex = 0;
    for (const id of room.links) {
      const to = run.map.rooms[id]!,
        dx = to.x - room.x,
        dy = to.y - room.y;
      const x = B.x + B.width / 2 + (dx * B.width) / 2,
        y = B.y + B.height / 2 + (dy * B.height) / 2;
      const door = this.doors[doorIndex++];
      if (door) {
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
      const cx = B.x + B.width / 2,
        cy = B.y + B.height / 2;
      const aligned = Math.abs(dx ? y - cy : x - cx) <= ROOM_RULES.doorHalfWidth;
      const atEdge = dx
        ? Math.abs(x - (cx + (dx * B.width) / 2)) < ROOM_RULES.exitReach
        : Math.abs(y - (cy + (dy * B.height) / 2)) < ROOM_RULES.exitReach;
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
      const x = B.x + B.width / 2 - dx * (B.width / 2 - ROOM_RULES.entranceInset);
      const y = B.y + B.height / 2 - dy * (B.height / 2 - ROOM_RULES.entranceInset);
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
  readonly isFree = (x: number, y: number, r: number): boolean => {
    if (x - r < B.x || x + r > B.x + B.width || y - r < B.y || y + r > B.y + B.height) return false;
    for (const s of this.slots)
      if (
        s.body?.enable &&
        Math.abs(s.x - x) < s.displayWidth / 2 + r &&
        Math.abs(s.y - y) < s.displayHeight / 2 + r
      )
        return false;
    return true;
  };
  readonly steer = (x: number, y: number, tx: number, ty: number, radius: number, out: Vec2): boolean => {
    if (this.pathClear(x, y, tx, ty, radius)) return false;
    return this.navigation.steer(x, y, tx, ty, radius, out);
  };
  private readonly pathClear = (x1: number, y1: number, x2: number, y2: number, radius: number): boolean => {
    // 接触墙面允许离开，避免闭线段的边界交点将紧贴墙面的怪物锁死。
    const r = Math.max(0, radius - NAVIGATION.tieEpsilon);
    if (!this.isFree(x1, y1, r) || !this.isFree(x2, y2, r)) return false;
    for (const s of this.slots)
      if (
        s.body?.enable &&
        segmentHitsBox(
          x1,
          y1,
          x2,
          y2,
          s.x - s.displayWidth / 2 - r,
          s.y - s.displayHeight / 2 - r,
          s.x + s.displayWidth / 2 + r,
          s.y + s.displayHeight / 2 + r,
        )
      )
        return false;
    return true;
  };
  readonly lineOfSight = (x1: number, y1: number, x2: number, y2: number): boolean => {
    for (const s of this.slots)
      if (
        s.body?.enable &&
        segmentHitsBox(
          x1,
          y1,
          x2,
          y2,
          s.x - s.displayWidth / 2,
          s.y - s.displayHeight / 2,
          s.x + s.displayWidth / 2,
          s.y + s.displayHeight / 2,
        )
      )
        return false;
    return true;
  };
  destroy(): void {
    for (const c of this.colliders) if (c.world) c.destroy();
    this.walls.destroy(true, true);
    for (const door of this.doors) door.destroy();
  }
}
