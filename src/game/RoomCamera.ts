import type { Scene, GameObjects } from 'phaser';
import { DEPTH, GAME_WIDTH, GAME_HEIGHT, RENDER_SCALE } from '../config';
import type { InputScene } from './ui/InputScene';
import { GRAYBOX_BOUNDS as B } from './world/graybox';

/** 世界视口占满画布，保留既有倍率；padding 只参与超宽屏倍率计算，不限制滚动。 */
export const ROOM_VIEW = { zoom: 1.5, padding: 24 } as const;

/** 世界尺寸与存档不变；相机、角色取样都对齐最终渲染像素。 */
export class RoomCamera {
  private width = 0;
  private height = 0;
  private readonly markers: GameObjects.Graphics;
  constructor(
    private readonly scene: Scene,
    private readonly ui: InputScene,
  ) {
    // 房间外由相机清屏色填充，不平铺墙砖，也不增加全屏背景对象。
    scene.cameras.main.setBackgroundColor('#000000');
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
  update(x: number, y: number): void {
    // launch 的 UI 场景会在本次场景队列结束后创建。
    if (!this.ui.controls) return;
    const c = this.scene.cameras.main;
    this.markers.clear();
    const r = this.ui.controls.rect;
    if (r.width <= 0 || r.height <= 0) return;
    if (r.width !== this.width || r.height !== this.height) {
      this.width = r.width;
      this.height = r.height;
      // 保持已有桌面/手机倍率，不因取消房间边界限制而改变角色大小。
      const zoom = Math.max(
        RENDER_SCALE * ROOM_VIEW.zoom,
        Math.ceil((this.scene.scale.width / (B.width + ROOM_VIEW.padding * 2)) * 2) / 2,
      );
      c.setViewport(0, 0, this.scene.scale.width, this.scene.scale.height).setZoom(zoom);
    }
    const w = c.width / c.zoom,
      h = c.height / c.zoom;
    // 直接居中，边缘、换房和尺寸变化都不保留旧镜头偏移；误差仅为半个渲染像素。
    c.setScroll(Math.round((x - w / 2) * c.zoom) / c.zoom, Math.round((y - h / 2) * c.zoom) / c.zoom);
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
