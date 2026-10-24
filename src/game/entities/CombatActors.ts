import type { Physics, Scene } from 'phaser';
import { DEPTH, DEPTH_Y_SORT, POOL_SIZES } from '../../config';
import { CHARACTERS } from '../../data/characters';
import { ENEMIES } from '../../data/enemies';
import type { ActorView, CombatWorld } from '../../sim/combat/api';
import { TEX } from '../assets/keys';

interface ActorSlot {
  image: Physics.Arcade.Image;
  id: number;
}

/** 角色脚底为物理圆心；贴图底部与脚底对齐，物理体允许伸出贴图底部。 */
export class CombatActors {
  readonly group: Physics.Arcade.Group;
  readonly slots: ActorSlot[] = [];
  private readonly byId = new Map<number, ActorSlot>();
  readonly byImage = new Map<Physics.Arcade.Image, ActorSlot>();
  constructor(
    scene: Scene,
    private readonly sim: CombatWorld,
  ) {
    this.group = scene.physics.add.group();
    // M1 方案上限 30 只怪 + 1 玩家，初始化预热，生成时只复用。
    for (let i = 0; i < POOL_SIZES.actors; i++) {
      const image = scene.physics.add.image(0, 0, TEX.player);
      this.group.add(image);
      image.disableBody(true, true);
      const slot = { image, id: 0 };
      this.slots.push(slot);
      this.byImage.set(image, slot);
    }
  }
  /** 在 POST_UPDATE 之前只读 body.center，不读滞后一帧的贴图坐标。 */
  syncPositions(): void {
    for (const s of this.slots)
      if (s.id && s.image.body?.enable) {
        const body = s.image.body as Physics.Arcade.Body;
        this.sim.syncPosition(s.id, body.center.x, body.center.y);
      }
  }
  apply(): void {
    for (const actor of this.sim.actors) {
      let slot = this.byId.get(actor.id);
      if (!slot) slot = this.acquire(actor);
      const body = slot.image.body as Physics.Arcade.Body;
      slot.image.setVisible(actor.phase !== 'telegraph');
      body.enable = actor.phase === 'active';
      body.setVelocity(body.enable ? actor.vx : 0, body.enable ? actor.vy : 0);
      slot.image.setDepth(DEPTH.actors + actor.y * DEPTH_Y_SORT);
      slot.image.setFlipX(Math.cos(actor.facing) < 0);
    }
  }
  private acquire(actor: ActorView): ActorSlot {
    let slot: ActorSlot | undefined;
    for (const candidate of this.slots)
      if (!candidate.id) {
        slot = candidate;
        break;
      }
    if (!slot) throw new Error('M1 actor pool exhausted (30 enemies + player)');
    slot.id = actor.id;
    this.byId.set(actor.id, slot);
    const data =
      actor.team === 'player'
        ? CHARACTERS[actor.kind as keyof typeof CHARACTERS]
        : ENEMIES[actor.kind as keyof typeof ENEMIES];
    const image = slot.image;
    image.setTexture(data?.sprite ?? (actor.team === 'player' ? TEX.player : TEX.enemy));
    image.setOrigin(0.5, 1).setScale(1).setAngle(0).setAlpha(1).clearTint();
    image.enableBody(true, actor.x, actor.y, true, true);
    image.setCircle(actor.radius, image.width / 2 - actor.radius, image.height - actor.radius);
    (image.body as Physics.Arcade.Body).updateFromGameObject();
    image.setCollideWorldBounds(true);
    return slot;
  }
  /** 由死亡表现完成回调调用；尚未 dead 时拒绝回收。 */
  finishDeath(id: number): void {
    if (this.sim.getActor(id)?.phase !== 'dead') return;
    const slot = this.byId.get(id);
    if (slot) {
      slot.image.disableBody(true, true);
      slot.id = 0;
      this.byId.delete(id);
    }
    this.sim.removeActor(id);
  }
  destroy(): void {
    this.group.destroy(true, true);
    this.byImage.clear();
    this.byId.clear();
    this.slots.length = 0;
  }
}
