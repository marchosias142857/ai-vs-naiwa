import { settings } from '../../services/settings';
import { Physics, type GameObjects, type Scene } from 'phaser';
import { DEPTH, POOL_SIZES } from '../../config';
import type { CombatWorld } from '../../sim/combat/api';
import type { EventBus } from '../../sim/core/EventBus';
import type { GameEvents } from '../../sim/core/events';
import type { CombatBridge } from '../world/CombatBridge';
import { COMBAT_FX as FX } from './params';

interface EffectSlot {
  image: GameObjects.Arc;
  remaining: number;
  duration: number;
}
/** 保存原始累计值，避免 elapsed → remaining → elapsed 的浮点损失改变回收步。 */
export interface DeathSnapshot {
  id: number;
  elapsed: number;
}

/** 灰盒反馈：预警/生命条用固定 Graphics，瞬时反馈与死亡计时均复用槽位。 */
export class CombatFeedback {
  private readonly effects: EffectSlot[] = [];
  /** 预热后只移动栈顶，不改变数组长度；满池丢弃次要反馈。 */
  private readonly free: EffectSlot[] = [];
  private freeCount = 0;
  private readonly states: { id: number; flash: number; death: number }[] = [];
  private readonly overlay: GameObjects.Graphics;
  private readonly marks: GameObjects.Graphics;
  private hurt = 0;
  private death = 0;
  activeCount = 0;
  constructor(
    private readonly scene: Scene,
    private readonly sim: CombatWorld,
    private readonly bridge: CombatBridge,
    private readonly bus: EventBus<GameEvents>,
  ) {
    this.marks = scene.add.graphics().setDepth(DEPTH.fx);
    this.overlay = scene.add.graphics().setDepth(DEPTH.screenFx);
    for (let i = 0; i < POOL_SIZES.fx; i++)
      this.effects.push({
        image: scene.add.circle(0, 0, FX.impactRadius, FX.hitColor).setDepth(DEPTH.fx).setVisible(false),
        remaining: 0,
        duration: 0,
      });
    for (let i = this.effects.length - 1; i >= 0; i--) this.free.push(this.effects[i]!);
    this.freeCount = this.free.length;
    for (let i = 0; i < bridge.actors.slots.length; i++) this.states.push({ id: 0, flash: 0, death: 0 });
    bus.on('bullet:hit', this.onHit);
    bus.on('weapon:fired', this.onFire);
    bus.on('entity:damaged', this.onDamage);
    scene.physics.world.on(Physics.Arcade.Events.WORLD_STEP, this.tick);
    scene.events.once('shutdown', this.destroy);
  }
  private emit(x: number, y: number, color: number, duration: number): void {
    if (!this.freeCount) return;
    const slot = this.free[--this.freeCount]!;
    slot.remaining = slot.duration = duration;
    slot.image.setPosition(x, y).setFillStyle(color).setScale(1).setAlpha(1).setVisible(true);
    this.activeCount++;
  }
  saveDeaths(): DeathSnapshot[] {
    const result: DeathSnapshot[] = [];
    for (let i = 0; i < this.states.length; i++) {
      const id = this.bridge.actors.slots[i]!.id,
        state = this.states[i]!;
      if (id && this.sim.getActor(id)?.phase === 'dead')
        result.push({ id, elapsed: state.id === id ? state.death : 0 });
    }
    return result;
  }
  loadDeaths(saved: readonly DeathSnapshot[]): void {
    for (let i = 0; i < this.states.length; i++) {
      const state = this.states[i]!,
        id = this.bridge.actors.slots[i]!.id;
      state.id = id;
      state.flash = 0;
      state.death = saved.find((s) => s.id === id)?.elapsed ?? 0;
    }
    this.update();
  }
  private readonly onHit = (e: GameEvents['bullet:hit']): void =>
    this.emit(e.x, e.y, e.critical ? FX.criticalColor : FX.hitColor, FX.impactSeconds);
  private readonly onFire = (e: GameEvents['weapon:fired']): void =>
    this.emit(e.x, e.y, FX.muzzleColor, FX.muzzleSeconds);
  private readonly onDamage = (e: GameEvents['entity:damaged']): void => {
    for (let i = 0; i < this.states.length; i++)
      if (this.bridge.actors.slots[i]!.id === e.id) {
        const state = this.states[i]!;
        if (state.id !== e.id) state.death = 0;
        state.id = e.id;
        state.flash = FX.flashSeconds;
        break;
      }
    if (e.team === 'player') this.hurt = FX.hurtSeconds;
  };
  private readonly tick = (dt: number): void => {
    this.hurt = Math.max(0, this.hurt - dt);
    if (this.bridge.playerDead) this.death += dt;
    for (const slot of this.effects)
      if (slot.remaining) {
        slot.remaining = Math.max(0, slot.remaining - dt);
        slot.image.setAlpha(slot.remaining / slot.duration).setScale(2 - slot.remaining / slot.duration);
        if (!slot.remaining) {
          slot.image.setVisible(false);
          this.activeCount--;
          this.free[this.freeCount++] = slot;
        }
      }
    for (let i = 0; i < this.states.length; i++) {
      const slot = this.bridge.actors.slots[i]!,
        state = this.states[i]!;
      if (!slot.id) {
        state.id = 0;
        continue;
      }
      if (state.id !== slot.id) {
        state.id = slot.id;
        state.death = state.flash = 0;
      }
      state.flash = Math.max(0, state.flash - dt);
      const actor = this.sim.getActor(slot.id);
      if (actor?.phase === 'dead') {
        state.death += dt;
        if (actor.team === 'enemy' && state.death >= FX.deathSeconds) this.bridge.actors.finishDeath(slot.id);
      }
    }
  };
  update(): void {
    const g = this.marks;
    g.clear();
    for (let i = 0; i < this.states.length; i++) {
      const slot = this.bridge.actors.slots[i]!,
        state = this.states[i]!,
        a = this.sim.getActor(slot.id);
      if (!a) continue;
      const x = a.x,
        y = a.y;
      if (a.phase === 'telegraph') {
        g.lineStyle(FX.lineWidth, FX.warningColor).strokeCircle(x, y, a.radius + FX.warningPadding);
        continue;
      }
      const color = FX.kinds[a.kind as keyof typeof FX.kinds] ?? FX.playerColor;
      slot.image.setTint(state.flash && settings.flashes ? FX.hitColor : color);
      slot.image.setAlpha(a.invulnerable ? FX.invulnerableAlpha : 1);
      if (a.phase === 'dead') {
        slot.image.setAngle(Math.min(1, state.death / FX.deathSeconds) * FX.deathAngle);
        if (a.team === 'enemy') slot.image.setAlpha(Math.max(0, 1 - state.death / FX.deathSeconds));
        continue;
      }
      if (a.warning)
        g.lineStyle(FX.lineWidth, FX.warningColor).strokeCircle(x, y, a.radius + FX.warningPadding);
      if (a.team === 'enemy') {
        const width = a.radius * 2,
          top = y - slot.image.height - FX.healthOffset;
        g.fillStyle(FX.healthBack).fillRect(x - a.radius, top, width, FX.healthHeight);
        g.fillStyle(color).fillRect(x - a.radius, top, (width * a.hp) / a.maxHp, FX.healthHeight);
      }
    }
    const overlay = this.overlay;
    overlay.clear();
    if (this.hurt && settings.flashes)
      overlay
        .lineStyle(FX.hurtWidth, FX.warningColor, this.hurt / FX.hurtSeconds)
        .strokeRect(0, 0, this.scene.scale.width, this.scene.scale.height);
    if (this.death)
      overlay
        .fillStyle(FX.dimColor, Math.min(FX.dimAlpha, (this.death / FX.dimSeconds) * FX.dimAlpha))
        .fillRect(0, 0, this.scene.scale.width, this.scene.scale.height);
  }
  private readonly destroy = (): void => {
    this.bus.off('bullet:hit', this.onHit);
    this.bus.off('weapon:fired', this.onFire);
    this.bus.off('entity:damaged', this.onDamage);
    this.scene.physics.world?.off(Physics.Arcade.Events.WORLD_STEP, this.tick);
  };
}
