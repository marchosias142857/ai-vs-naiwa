import { ActorArt } from './ActorArt';
import { ART } from '../assets/demoArt';
import type { Physics, Scene } from 'phaser';
import { DEPTH, DEPTH_Y_SORT, POOL_SIZES } from '../../config';
import { CHARACTERS } from '../../data/characters';
import { ENEMIES } from '../../data/enemies';
import type { ActorView, CombatWorld } from '../../sim/combat/api';
import { TEX } from '../assets/keys';
import { loadBody, saveBody, type ActorSlotSnapshot } from '../world/bodySnapshot';

interface ActorSlot {
  image: Physics.Arcade.Image;
  id: number;
}

/** 角色位置统一为身体圆心；动画贴图独立于物理代理，换帧不修改物理体。 */
export class CombatActors {
  readonly art?: ActorArt;
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
    if (scene.textures.exists(ART.hero)) this.art = new ActorArt(scene, sim, this);
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
  private acquire(actor: ActorView, restored?: ActorSlot): ActorSlot {
    let slot = restored;
    if (!slot)
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
    image.setOrigin(0.5, 0.5).setScale(1).setAngle(0).setAlpha(1).clearTint();
    image.enableBody(true, actor.x, actor.y, true, true);
    image.setCircle(actor.radius, image.width / 2 - actor.radius, image.height / 2 - actor.radius);
    const body = image.body as Physics.Arcade.Body;
    body.updateFromGameObject();
    // 预警体不跑 preUpdate；激活当步却会跑 postUpdate，不能补出旧矩形到圆心的偏移。
    body.prev.copy(body.position);
    body.prevFrame.copy(body.position);
    image.setCollideWorldBounds(true);
    return slot;
  }
  /** 槽位顺序决定 Arcade 重叠回调顺序，不能按 actors 数组重新分配。 */
  save(): (ActorSlotSnapshot | null)[] {
    return this.slots.map((s) => (s.id ? { id: s.id, ...saveBody(s.image) } : null));
  }
  /** 调用方先恢复 sim 并校验槽位与实体一一对应；不发业务事件。 */
  load(states: readonly (ActorSlotSnapshot | null)[]): void {
    if (states.length !== this.slots.length) throw new RangeError('角色槽位容量不一致');
    this.byId.clear();
    for (const s of this.slots) {
      s.image.disableBody(true, true);
      s.id = 0;
    }
    for (let i = 0; i < states.length; i++) {
      const s = states[i];
      if (!s) continue;
      const actor = this.sim.getActor(s.id);
      if (!actor) throw new Error('角色槽位缺少 sim 实体');
      this.acquire(actor, this.slots[i]!);
    }
    this.apply();
    for (let i = 0; i < states.length; i++) {
      const s = states[i];
      if (s) loadBody(this.slots[i]!.image, s);
    }
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
    this.art?.destroy();
    this.group.destroy(true, true);
    this.byImage.clear();
    this.byId.clear();
    this.slots.length = 0;
  }
}
