import type { GameObjects, Physics, Scene, Tilemaps } from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, TILE_SIZE } from '../../config';
import type { CombatWorld } from '../../sim/combat/api';
import type { InputFrame } from '../../sim/core/types';
import { CombatActors } from '../entities/CombatActors';
import { BulletPool } from '../pools/BulletPool';

type ColliderObject =
  GameObjects.GameObject | Physics.Arcade.Body | Physics.Arcade.StaticBody | Tilemaps.Tile;

/** M1 无内墙房间的内边界；世界边界钳制防止大速度越过外墙。 */
export const GRAYBOX_BOUNDS = {
  x: (GAME_WIDTH - 19 * TILE_SIZE) / 2 + TILE_SIZE,
  y: (GAME_HEIGHT - 13 * TILE_SIZE) / 2 + TILE_SIZE,
  width: 17 * TILE_SIZE,
  height: 11 * TILE_SIZE,
};

/** Arcade 与 CombatWorld 的唯一适配点；不计算伤害或移动决策。 */
export class CombatBridge {
  readonly actors: CombatActors;
  readonly bullets: BulletPool;
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
  /** 场景 update 调用；sim 结果当帧消费，不保存复用数组与对象。 */
  update(dt: number, input: Readonly<InputFrame>): boolean {
    this.actors.syncPositions();
    const result = this.sim.step(dt, input);
    this.actors.apply();
    for (const bullet of result.bulletSpawns) this.bullets.spawn(bullet);
    return result.playerDead;
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
  private readonly tick = (dt: number): void => this.bullets.tick(dt);
  /** 按需生成测试快照；不要在帧循环中调用。 */
  inspect() {
    return {
      bulletCapacity: this.bullets.slots.length,
      bullets: this.bullets.activeCount,
      actors: this.actors.slots.reduce((n, s) => n + Number(s.id !== 0), 0),
    };
  }
  readonly destroy = (): void => {
    this.scene.events.off('shutdown', this.destroy);
    this.scene.physics.world.off('worldbounds', this.hitWall);
    this.scene.physics.world.off('worldstep', this.tick);
    for (const collider of this.colliders) collider.destroy();
    this.bullets.destroy();
    this.actors.destroy();
  };
}
