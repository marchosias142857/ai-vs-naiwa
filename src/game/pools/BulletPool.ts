import type { Physics, Scene } from 'phaser';
import { DEPTH, POOL_SIZES } from '../../config';
import type { BulletSpawn, CombatWorld } from '../../sim/combat/api';
import { TEX } from '../assets/keys';

/** 预热的实体槽位；只复制 sim 的标量，不保存 BulletSpawn。 */
export interface BulletSlot {
  image: Physics.Arcade.Image;
  id: number;
  remaining: number;
}

/** 固定容量，获取失败会退回 sim 的编号，避免永久占用容量。 */
export class BulletPool {
  readonly group: Physics.Arcade.Group;
  readonly slots: BulletSlot[] = [];
  readonly byImage = new Map<Physics.Arcade.Image, BulletSlot>();
  /** 空闲槽位栈：生成时 O(1) 取用，不扫描整个池。容量固定，push/pop 不会扩容。 */
  private readonly free: BulletSlot[] = [];
  activeCount = 0;
  constructor(
    scene: Scene,
    private readonly sim: CombatWorld,
  ) {
    this.group = scene.physics.add.group();
    for (let i = 0; i < POOL_SIZES.bullets; i++) {
      const image = this.group.create(0, 0, TEX.bulletPlayer) as Physics.Arcade.Image;
      image.disableBody(true, true);
      const slot = { image, id: 0, remaining: 0 };
      this.slots.push(slot);
      this.byImage.set(image, slot);
    }
    // 倒序入栈，空池时仍从第 0 个槽开始用，与改动前的取用顺序一致。
    for (let i = this.slots.length - 1; i >= 0; i--) this.free.push(this.slots[i]!);
  }
  spawn(b: BulletSpawn): void {
    const slot = this.free.pop();
    if (!slot) {
      this.sim.releaseBullet(b.id);
      return;
    }
    slot.id = b.id;
    slot.remaining = b.lifetime;
    const image = slot.image;
    image.setTexture(b.sprite).setOrigin(0.5).setScale(1).setAlpha(1).setAngle(0).clearTint();
    image.enableBody(true, b.x, b.y, true, true);
    image.setCircle(b.radius, image.width / 2 - b.radius, image.height / 2 - b.radius);
    image.setDepth(b.team === 'player' ? DEPTH.playerBullets : DEPTH.enemyBullets);
    image
      .setCollideWorldBounds(true, 0, 0, true)
      .setVelocity(Math.cos(b.angle) * b.speed, Math.sin(b.angle) * b.speed);
    this.activeCount++;
  }
  /** 物理每个固定步进一次，和真实飞行时间保持同一时钟。 */
  tick(dt: number): void {
    for (const slot of this.slots)
      if (slot.id) {
        slot.remaining -= dt;
        if (slot.remaining <= 0) {
          this.sim.releaseBullet(slot.id);
          this.recycle(slot);
        }
      }
  }
  recycle(slot: BulletSlot): void {
    if (!slot.id) return;
    slot.image.disableBody(true, true);
    slot.image.setVelocity(0, 0);
    slot.id = 0;
    slot.remaining = 0;
    this.activeCount--;
    this.free.push(slot);
  }
  destroy(): void {
    for (const slot of this.slots) if (slot.id) this.sim.releaseBullet(slot.id);
    this.group.destroy(true, true);
    this.byImage.clear();
    this.slots.length = 0;
    this.free.length = 0;
    this.activeCount = 0;
  }
}
