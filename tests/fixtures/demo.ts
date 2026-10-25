import type { PhysicsSnapshot } from '../../src/game/world/CombatBridge';
import { parseCheckpoint, type FloorCheckpoint } from '../../src/sim/run/checkpoint';
import type { CombatWorldState, ActorView } from '../../src/sim/combat/api';
import { DemoHud } from '../../src/game/ui/DemoHud';
import { AUTO, Game, Scene, Physics } from 'phaser';
import { POOL_SIZES } from '../../src/config';
import { COMBAT_FX as FX } from '../../src/game/fx/params';
import { createPlaceholderTextures } from '../../src/game/assets/placeholders';
import { DemoSession } from '../../src/game/systems/DemoSession';
import { InputScene } from '../../src/game/ui/InputScene';
import { EventBus } from '../../src/sim/core/EventBus';
import type { GameEvents } from '../../src/sim/core/events';
import { createInputFrame } from '../../src/sim/core/types';
import { BALANCE } from '../../src/data/balance';
import { DUNGEON } from '../../src/data/dungeon';
import { doorStage, ROOM_CENTER, walkTo } from './route';
import { fxBudget } from '../../src/game/fx/FxBudget';
import { FX_LIMITS } from '../../src/game/fx/params';
import { IMPACT_TEXTURE } from '../../src/game/fx/impactTexture';

class DemoHarness extends Scene {
  private hud?: DemoHud;
  constructor() {
    super('Game');
  }
  create(): void {
    createPlaceholderTextures(this);
    this.physics.disableUpdate();
    this.scene.launch(InputScene.KEY);
    const bus = new EventBus<GameEvents>(),
      checkpoint = parseCheckpoint(JSON.parse(sessionStorage.getItem('fixture.checkpoint') ?? 'null')),
      session = new DemoSession(
        this,
        bus,
        this.scene.get(InputScene.KEY) as InputScene,
        42,
        true,
        undefined,
        checkpoint ?? undefined,
      );
    window.resumeFreeze = () => {
      session.sim.takeWeapon('shotgun_fan');
      const frame = createInputFrame();
      frame.fire = true;
      frame.aim = { x: 1, y: 0 };
      session.setInput(frame);
      this.physics.world.update(0, 1000 / 60);
      this.physics.world.postUpdate();
      frame.skillPressed = frame.swapPressed = frame.interactPressed = true;
      session.setInput(frame); // 0 步的渲染帧已锁存边沿。
      session.pause.set('restore', true);
    };
    window.resumeTick = () => {
      this.physics.world.update(0, 1000 / 60);
      this.physics.world.postUpdate();
      return {
        world: session.sim.save(),
        physics: session.bridge.save(),
        remaining: session.pause.remaining,
      };
    };
    window.resumeManual = (value) => session.pause.set('manual', value);
    window.floorCheckpoint = () => session.checkpoint();
    window.floorOffers = () => [...session.offers];
    this.hud = new DemoHud(this, session);
    window.offerState = () => ({
      floor: session.dungeon.floor,
      energy: session.sim.resources.energy,
      coins: session.sim.resources.coins,
      offers: session.offers.length,
    });
    window.stressScenario = () => {
      const input = createInputFrame(),
        records = new Set<ActorView>(),
        before = this.children.length;
      session.sim.takeWeapon('ring_staff');
      input.fire = true;
      const kinds = ['naiwa_boss', 'naiwa_turret', 'naiwa_chaser', 'naiwa_charger'] as const;
      let peakBullets = 0,
        peakFx = 0,
        spawned = 0;
      const started = performance.now();
      for (let step = 0; step < 6000; step++) {
        while (session.sim.actors.length < 31) {
          const i = spawned++;
          session.sim.spawnEnemy(
            kinds[i % kinds.length]!,
            130 + (i % 10) * 24,
            65 + Math.floor((i % 30) / 10) * 60,
          );
        }
        for (const a of session.sim.actors) records.add(a);
        session.sim.grantPickup('energy', 1);
        session.setInput(input);
        this.physics.world.update((step * 1000) / 60, 1000 / 60);
        this.physics.world.postUpdate();
        session.update();
        peakBullets = Math.max(peakBullets, session.bridge.bullets.activeCount);
        peakFx = Math.max(peakFx, session.fx.activeCount);
      }
      return {
        peakBullets,
        peakFx,
        spawned,
        records: records.size,
        stable: this.children.length === before,
        simulatedSeconds: session.sim.time,
        wallMs: performance.now() - started,
      };
    };
    window.feedbackPoolScenario = () => {
      const images = this.children.list.filter(
          (object) => 'texture' in object && (object.texture as { key: string }).key === IMPACT_TEXTURE,
        ),
        before = this.children.length,
        counts: number[] = [],
        visible: number[] = [],
        fire: GameEvents['weapon:fired'] = { ownerId: 1, weaponId: 'pistol_basic', x: 200, y: 100, angle: 0 },
        hit: GameEvents['bullet:hit'] = {
          team: 'player',
          x: 210,
          y: 100,
          angle: 0,
          targetId: null,
          critical: false,
        };
      const sample = () => {
        counts.push(session.fx.activeCount);
        visible.push(images.filter((image) => 'visible' in image && image.visible).length);
      };
      for (let cycle = 0; cycle < 4; cycle++) {
        for (let i = 0; i < POOL_SIZES.fx; i++) {
          if (i % FX_LIMITS.spark === 0) fxBudget(this).beginFrame();
          if (i % 2) bus.emit('bullet:hit', hit);
          else bus.emit('weapon:fired', fire);
        }
        bus.emit('bullet:hit', hit); // 满池丢弃，不能覆盖仍存活的效果。
        sample();
        this.physics.world.emit(Physics.Arcade.Events.WORLD_STEP, FX.muzzleSeconds);
        sample(); // 只释放寿命较短的一半，不要求槽位按编号连续。
        for (let i = 0; i < POOL_SIZES.fx; i++) {
          if (i % FX_LIMITS.spark === 0) fxBudget(this).beginFrame();
          bus.emit('bullet:hit', hit);
        }
        sample();
        this.physics.world.emit(Physics.Arcade.Events.WORLD_STEP, FX.impactSeconds);
        this.physics.world.emit(Physics.Arcade.Events.WORLD_STEP, FX.impactSeconds);
        sample(); // 连续空闲步不能重复回收。
      }
      return { counts, visible, stable: this.children.length === before, capacity: images.length };
    };
    window.fxBudgetScenario = () => {
      const budget = fxBudget(this);
      let unchanged = true;
      const children = this.children.length,
        textures = this.textures.getTextureKeys().length;
      const hit: GameEvents['bullet:hit'] = {
        team: 'player',
        x: 240,
        y: 135,
        angle: 0,
        targetId: null,
        critical: false,
      };
      const burst: GameEvents['combat:exploded'] = { team: 'player', x: 240, y: 135, radius: 12 };
      const chain: GameEvents['weapon:chained'] = { team: 'player', x1: 220, y1: 135, x2: 260, y2: 135 };
      const counts: number[] = [];
      const accepted = budget.accepted,
        dropped = budget.dropped;
      for (let cycle = 0; cycle < 8; cycle++) {
        const before = JSON.stringify(session.sim.save());
        budget.beginFrame();
        for (let i = 0; i < 2000; i++) {
          bus.emit('bullet:hit', hit);
          bus.emit('combat:exploded', burst);
          bus.emit('weapon:chained', chain);
        }
        session.update();
        counts.push(session.fx.activeCount);
        unchanged &&= before === JSON.stringify(session.sim.save());
        this.physics.world.emit(Physics.Arcade.Events.WORLD_STEP, 1);
      }
      return {
        counts,
        accepted: budget.accepted - accepted,
        dropped: budget.dropped - dropped,
        stable: children === this.children.length && textures === this.textures.getTextureKeys().length,
        unchanged,
        active: session.fx.activeCount,
      };
    };
    window.feedbackScenario = () => {
      const input = createInputFrame(),
        children = this.children.length;
      let steps = 0,
        hits = 0;
      bus.on('bullet:hit', (e) => {
        if (e.targetId !== null) hits++;
      });
      const tick = (n: number) => {
        for (let i = 0; i < n; i++) {
          fxBudget(this).beginFrame(); // fixture 每次手动推进一帧，生产环境由 PRE_UPDATE 重置。
          session.setInput(input);
          this.physics.world.update((++steps * 1000) / 60, 1000 / 60);
          this.physics.world.postUpdate();
          session.update();
        }
      };
      const id = session.sim.spawnEnemy('naiwa_tank', 330, 135);
      tick(1);
      const telegraphHidden = !session.bridge.actors.slots.find((s) => s.id === id)!.image.visible;
      tick(45);
      // 玩家没有自动瞄准（ADR 0020）：从身体中心对准敌人的碰撞圆心。
      const p = session.player!,
        enemy = session.sim.getActor(id)!,
        dx = enemy.x - p.x,
        dy = enemy.y - (p.y - p.radius),
        length = Math.hypot(dx, dy);
      input.aim = { x: dx / length, y: dy / length };
      input.fire = true;
      tick(30);
      input.fire = false;
      const effects = session.fx.activeCount;
      session.sim.debugKillEnemies();
      tick(1);
      const delayedDeath = session.sim.getActor(id)?.phase === 'dead';
      tick(30);
      return {
        hits,
        effects,
        telegraphHidden,
        delayedDeath,
        recycled: !session.sim.getActor(id),
        stable: children === this.children.length,
      };
    };
    window.demoScenario = (stopAtOffer = false) => {
      const input = createInputFrame();
      if (stopAtOffer) {
        session.sim.takeWeapon('rifle_auto');
        session.sim.grantPickup('coin', 50);
        input.fire = true;
      }
      let steps = 0,
        rooms = 0;
      const children = this.children.length;
      const tick = (count: number) => {
        for (let i = 0; i < count; i++) {
          session.setInput(input);
          this.physics.world.update((++steps * 1000) / 60, 1000 / 60);
          this.physics.world.postUpdate();
          session.update();
        }
      };
      const walk = (x: number, y: number) => {
        if (!walkTo(session, input, () => tick(1), x, y)) throw Error(`未能走到 (${x}, ${y})`);
        tick(12);
      };
      // 实际物理绕开内墙与鱼雷桶走到门内侧，再穿门；不调用 DungeonRun.enter 或篡改 sim 位置。
      const next = (id: number) => {
        const from = session.dungeon.room,
          to = session.dungeon.map.rooms[id]!,
          stage = doorStage(to.x - from.x, to.y - from.y);
        walk(stage.x, stage.y);
        input.move.x = to.x - from.x;
        input.move.y = to.y - from.y;
        for (let i = 0; i < 400 && session.dungeon.roomId === from.id; i++) tick(1);
        input.move.x = input.move.y = 0;
        tick(12);
        if (session.dungeon.roomId !== id) throw Error('未能穿过门');
        rooms++;
      };
      const clear = () => {
        for (let i = 0; i < 400 && session.dungeon.locked; i++) {
          // 使用已批准的调试清房入口；刷怪、事件、池回收和开门仍经真实接线。
          session.sim.debugKillEnemies();
          tick(1);
        }
        if (session.dungeon.locked) throw Error('清房未开门');
      };
      for (let floor = session.dungeon.floor; floor <= DUNGEON.floors; floor++) {
        for (let room = 1; room <= session.dungeon.map.exit; room++) {
          next(room);
          clear();
        }
        walk(ROOM_CENTER.x, ROOM_CENTER.y);
        input.interactPressed = true;
        tick(1);
        input.interactPressed = false;
        if (session.offers.length !== 3) throw Error('缺少升级选择');
        if (stopAtOffer) {
          this.hud!.update(300);
          return {
            phase: 'offer',
            settled: false,
            floor,
            rooms,
            kills: session.kills,
            childrenStable: children === this.children.length,
            bullets: session.bridge.bullets.activeCount,
            steps,
          };
        }
        if (!session.chooseUpgrade(session.offers[0]!)) throw Error('升级失败');
      }
      next(1);
      clear();
      // 通关结算要等 Boss 死亡演出播完（ADR 0030）。
      tick(Math.ceil(BALANCE.victoryDelay * 60) + 1);
      return {
        phase: session.dungeon.phase,
        settled: session.settled,
        floor: session.dungeon.floor,
        rooms,
        kills: session.kills,
        childrenStable: children === this.children.length,
        bullets: session.bridge.bullets.activeCount,
        steps,
      };
    };
  }
  override update(_time: number, delta: number): void {
    this.hud?.update(delta);
  }
}
declare global {
  interface Window {
    resumeFreeze: () => void;
    resumeManual: (value: boolean) => void;
    resumeTick: () => {
      world: CombatWorldState;
      physics: PhysicsSnapshot;
      remaining: number;
    };
    floorCheckpoint: () => FloorCheckpoint;
    floorOffers: () => string[];
    stressScenario: () => {
      peakBullets: number;
      peakFx: number;
      spawned: number;
      records: number;
      stable: boolean;
      simulatedSeconds: number;
      wallMs: number;
    };
    feedbackPoolScenario: () => { counts: number[]; visible: number[]; stable: boolean; capacity: number };
    fxBudgetScenario: () => {
      counts: number[];
      accepted: number;
      dropped: number;
      stable: boolean;
      unchanged: boolean;
      active: number;
    };
    feedbackScenario: () => {
      hits: number;
      effects: number;
      telegraphHidden: boolean;
      delayedDeath: boolean;
      recycled: boolean;
      stable: boolean;
    };
    offerState: () => { floor: number; energy: number; coins: number; offers: number };
    demoScenario: (stopAtOffer?: boolean) => {
      phase: string;
      settled: boolean;
      floor: number;
      rooms: number;
      kills: number;
      childrenStable: boolean;
      bullets: number;
      steps: number;
    };
  }
}
new Game({
  type: AUTO,
  width: 480,
  height: 270,
  physics: { default: 'arcade', arcade: { fixedStep: true } },
  scene: [DemoHarness, InputScene],
});
