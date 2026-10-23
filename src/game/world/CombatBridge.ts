import type { GameObjects, Physics, Scene, Tilemaps } from 'phaser';
import { createInputFrame } from '../../sim/core/types';
import { GRAYBOX_BOUNDS } from './graybox';
import type { CombatWorld } from '../../sim/combat/api';
import type { InputFrame } from '../../sim/core/types';
import { CombatActors } from '../entities/CombatActors';
import { BulletPool } from '../pools/BulletPool';

type ColliderObject =
  GameObjects.GameObject | Physics.Arcade.Body | Physics.Arcade.StaticBody | Tilemaps.Tile;

/** Arcade 与 CombatWorld 的唯一适配点；不计算伤害或移动决策。 */
export class CombatBridge {
  readonly actors: CombatActors;
  readonly bullets: BulletPool;
  private destroyed = false;
  private readonly input = createInputFrame();
  private readonly aim = { x: 0, y: 0 };
  playerDead = false;
  private readonly colliders: Physics.Arcade.Collider[];
  constructor(
    private readonly scene: Scene,
    readonly sim: CombatWorld,
  ) {
    const b = GRAYBOX_BOUNDS;
    scene.physics.world.setBounds(b.x, b.y, b.width, b.height);
    this.actors = new CombatActors(scene, sim);
    this.bullets = new BulletPool(scene, sim);
    this.colliders = [
      scene.physics.add.overlap(this.bullets.group, this.actors.group, this.hitActor),
      scene.physics.add.overlap(this.actors.group, this.actors.group, this.contact),
    ];
    scene.physics.world.on('worldbounds', this.hitWall);
    scene.physics.world.on('worldstep', this.tick);
    this.actors.apply();
    scene.events.once('shutdown', this.destroy);
  }
  /** PRE_UPDATE 每渲染帧调用一次；复制快照，边沿留到第一个物理步。 */
  setInput(frame: Readonly<InputFrame>): void {
    const input = this.input;
    input.move.x = frame.move.x;
    input.move.y = frame.move.y;
    if (frame.aim) {
      this.aim.x = frame.aim.x;
      this.aim.y = frame.aim.y;
      input.aim = this.aim;
    } else input.aim = null;
    input.fire = frame.fire;
    input.source = frame.source;
    input.skillPressed ||= frame.skillPressed;
    input.swapPressed ||= frame.swapPressed;
    input.interactPressed ||= frame.interactPressed;
    input.pausePressed ||= frame.pausePressed;
  }
  private readonly hitActor = (a: ColliderObject, b: ColliderObject): void => {
    const bullet = this.bullets.byImage.get(a as Physics.Arcade.Image);
    const actor = this.actors.byImage.get(b as Physics.Arcade.Image);
    if (!bullet?.id || !actor?.id || this.sim.getActor(actor.id)?.phase !== 'active') return;
    const body = bullet.image.body as Physics.Arcade.Body;
    if (this.sim.hitActor(bullet.id, actor.id, body.center.x, body.center.y)) this.bullets.recycle(bullet);
    // 同一次物理步可能还有其他碰撞；立即关掉死者，不能等到 scene.update。
    if (this.sim.getActor(actor.id)?.phase === 'dead') this.stopActor(actor.image);
  };
  private readonly contact = (a: ColliderObject, b: ColliderObject): void => {
    const first = this.actors.byImage.get(a as Physics.Arcade.Image),
      second = this.actors.byImage.get(b as Physics.Arcade.Image);
    if (!first?.id || !second?.id) return;
    const av = this.sim.getActor(first.id),
      bv = this.sim.getActor(second.id);
    if (av?.phase !== 'active' || bv?.phase !== 'active' || av.team === bv.team) return;
    this.sim.contact(av.team === 'enemy' ? av.id : bv.id, av.team === 'player' ? av.id : bv.id);
    if (this.sim.getActor(first.id)?.phase === 'dead') this.stopActor(first.image);
    if (this.sim.getActor(second.id)?.phase === 'dead') this.stopActor(second.image);
  };
  private stopActor(image: Physics.Arcade.Image): void {
    const body = image.body as Physics.Arcade.Body;
    image.setPosition(body.center.x, body.center.y).setVelocity(0, 0).disableBody(false, false);
  }
  private readonly hitWall = (body: Physics.Arcade.Body): void => {
    const slot = this.bullets.byImage.get(body.gameObject as Physics.Arcade.Image);
    if (!slot?.id) return;
    this.sim.hitWall(slot.id, body.center.x, body.center.y);
    this.bullets.recycle(slot);
  };
  /** WORLD_STEP 在移动及重叠检测后触发，dt 为秒。 */
  private readonly tick = (dt: number): void => {
    this.bullets.tick(dt);
    this.actors.syncPositions();
    const result = this.sim.step(dt, this.input);
    this.input.skillPressed =
      this.input.swapPressed =
      this.input.interactPressed =
      this.input.pausePressed =
        false;
    this.actors.apply();
    for (const bullet of result.bulletSpawns) this.bullets.spawn(bullet);
    this.playerDead = result.playerDead;
  };
  /** 按需生成测试快照；不要在帧循环中调用。 */
  inspect() {
    return {
      bulletCapacity: this.bullets.slots.length,
      bullets: this.bullets.activeCount,
      actors: this.actors.slots.reduce((n, s) => n + Number(s.id !== 0), 0),
    };
  }
  readonly destroy = (): void => {
    if (this.destroyed) return;
    this.destroyed = true;
    this.scene.events.off('shutdown', this.destroy);
    // Arcade 的 shutdown 监听先执行，此时 plugin.world 可能已清空。
    const world = this.scene.physics.world;
    if (world) {
      world.off('worldbounds', this.hitWall);
      world.off('worldstep', this.tick);
      for (const collider of this.colliders) if (collider.world) collider.destroy();
    }
    this.bullets.destroy();
    this.actors.destroy();
  };
}
