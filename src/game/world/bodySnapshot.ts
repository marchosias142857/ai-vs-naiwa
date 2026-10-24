import type { Physics } from 'phaser';

/** Phaser 4.1 World.js 的固定步累加器没有公开 reset API。 */
export function resetPhysicsClock(world: Physics.Arcade.World): void {
  (world as Physics.Arcade.World & { _elapsed: number })._elapsed = 0;
}

/** 原始物理位置（左上角）避免中心坐标加减半径造成浮点往返损失。 */
export interface BodySnapshot {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  /** Phaser 下一次 preUpdate 会从贴图重新计算位置；不能从 body 反推。 */
  imageX: number;
  imageY: number;
}
export interface ActorSlotSnapshot extends BodySnapshot {
  id: number;
}
export interface BulletSlotSnapshot extends ActorSlotSnapshot {
  remaining: number;
}
export interface BulletPoolSnapshot {
  slots: (BulletSlotSnapshot | null)[];
  free: number[];
}

/** 仅保存时分配；速度必须来自物理体，不能用上一步 sim 的期望速度。 */
export function saveBody(image: Physics.Arcade.Image): BodySnapshot {
  const b = image.body as Physics.Arcade.Body;
  return {
    x: b.position.x,
    y: b.position.y,
    vx: b.velocity.x,
    vy: b.velocity.y,
    radius: b.radius,
    imageX: image.x,
    imageY: image.y,
  };
}

/** 形状 / offset 先由所属池设置；同时重置前帧位置，防止首帧补出位移。 */
export function loadBody(image: Physics.Arcade.Image, s: Readonly<BodySnapshot>): void {
  const b = image.body as Physics.Arcade.Body;
  b.reset(s.imageX, s.imageY);
  b.position.set(s.x, s.y);
  b.updateCenter();
  b.prev.copy(b.position);
  b.prevFrame.copy(b.position);
  b.setVelocity(s.vx, s.vy);
}
