import { ART } from './assets/demoArt';
import { ENVIRONMENT_ART } from '../data/art';
import type { Scene, GameObjects } from 'phaser';
import { DEPTH, GAME_WIDTH, GAME_HEIGHT, RENDER_SCALE } from '../config';
import type { InputScene } from './ui/InputScene';
import { GRAYBOX_BOUNDS as B } from './world/graybox';

/** 地图占满画布，控件半透明覆盖；世界与物理尺度保持不变。 */
export const ROOM_VIEW = { zoom: 1.5, padding: 24 } as const;

const constrain = (value: number, start: number, length: number, view: number) =>
  view >= length ? start + (length - view) / 2 : Math.max(start, Math.min(start + length - view, value));

/** 世界尺寸与存档不变；相机、角色取样都对齐最终渲染像素。 */
export class RoomCamera {
  private width = 0;
  private height = 0;
  private room = -1;
  private x = 0;
  private y = 0;
  private snap = true;
  private readonly backdrop: GameObjects.TileSprite;
  private readonly markers: GameObjects.Graphics;
  constructor(
    private readonly scene: Scene,
    private readonly ui: InputScene,
  ) {
    this.backdrop = scene.add
      .tileSprite(0, 0, 1, 1, ART.environment, 'wall')
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(DEPTH.floor - 1)
      .setTileScale(16 / ENVIRONMENT_ART.wall[2], 16 / ENVIRONMENT_ART.wall[3])
      .setTint(0x607084);
    this.markers = scene.add
      .graphics()
      .setDepth(DEPTH.wallTops + 1)
      .setScrollFactor(0);
    this.expand();
    scene.scale.on('resize', this.expand);
    scene.events.once('shutdown', () => scene.scale.off('resize', this.expand));
  }
  /** 横屏利用安全区内的完整宽度；标题页仍独立保持 16:9。 */
  private readonly expand = (): void => {
    const parent = this.scene.scale.parentSize;
    const height = GAME_HEIGHT * RENDER_SCALE;
    const width = Math.max(GAME_WIDTH * RENDER_SCALE, Math.round((height * parent.width) / parent.height));
    if (Number.isFinite(width) && this.scene.scale.width !== width)
      this.scene.scale.setGameSize(width, height);
  };
  update(x: number, y: number, room: number, delta: number): void {
    // launch 的 UI 场景会在本次场景队列结束后创建。
    if (!this.ui.controls) return;
    const c = this.scene.cameras.main;
    this.markers.clear();
    const r = this.ui.controls.rect;
    if (r.width <= 0 || r.height <= 0) return;
    if (r.width !== this.width || r.height !== this.height) {
      this.width = r.width;
      this.height = r.height;
      // 超宽横屏至少让房间及门口外沿覆盖视野宽度，避免控件落在大块墙外空地上。
      const zoom = Math.max(
        RENDER_SCALE * ROOM_VIEW.zoom,
        Math.ceil((this.scene.scale.width / (B.width + ROOM_VIEW.padding * 2)) * 2) / 2,
      );
      c.setViewport(0, 0, this.scene.scale.width, this.scene.scale.height).setZoom(zoom);
      this.backdrop.setSize(c.width / c.zoom, c.height / c.zoom);
      this.snap = true;
    }
    const w = c.width / c.zoom,
      h = c.height / c.zoom;
    const tx = constrain(x - w / 2, B.x - ROOM_VIEW.padding, B.width + ROOM_VIEW.padding * 2, w);
    const ty = constrain(y - h / 2, B.y - ROOM_VIEW.padding, B.height + ROOM_VIEW.padding * 2, h);
    const blend = this.snap || room !== this.room ? 1 : 1 - Math.exp(-Math.min(delta, 50) / 70);
    this.x += (tx - this.x) * blend;
    this.y += (ty - this.y) * blend;
    c.setScroll(Math.round(this.x * c.zoom) / c.zoom, Math.round(this.y * c.zoom) / c.zoom);
    this.room = room;
    this.snap = false;
  }
  /** 屏外门口和敌人的方向提示，不替代真实弹道或改变战斗规则。 */
  hint(x: number, y: number, color: number): void {
    if (!this.width) return;
    const c = this.scene.cameras.main,
      w = c.width / c.zoom,
      h = c.height / c.zoom;
    x -= c.scrollX;
    y -= c.scrollY;
    if (x >= 0 && x <= w && y >= 0 && y <= h) return;
    const radius = (5 * this.scene.scale.width) / this.width / c.zoom;
    const dx = x - w / 2,
      dy = y - h / 2;
    const t = Math.min((w / 2 - radius * 2) / Math.abs(dx), (h / 2 - radius * 2) / Math.abs(dy));
    const px = w / 2 + dx * t,
      py = h / 2 + dy * t,
      angle = Math.atan2(dy, dx);
    const ax = Math.cos(angle) * radius,
      ay = Math.sin(angle) * radius;
    this.markers
      .fillStyle(color, 0.9)
      .fillTriangle(px + ax, py + ay, px - ax - ay, py - ay + ax, px - ax + ay, py - ay - ax);
  }
  inspect() {
    const c = this.scene.cameras.main;
    return {
      x: c.x,
      y: c.y,
      width: c.width,
      height: c.height,
      zoom: c.zoom,
      scrollX: c.scrollX,
      scrollY: c.scrollY,
    };
  }
}
