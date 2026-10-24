import { PlayerResources } from '../../src/sim/stats/PlayerResources';
import { AUTO, Game, Scene } from 'phaser';
import type { ActorView, BulletSpawn, CombatWorld, StepResult } from '../../src/sim/combat/api';
import type { CharacterId } from '../../src/data/characters';
import type { EnemyId } from '../../src/data/enemies';
import type { InputFrame } from '../../src/sim/core/types';
import { createInputFrame } from '../../src/sim/core/types';
import { createPlaceholderTextures } from '../../src/game/assets/placeholders';
import { CombatBridge } from '../../src/game/world/CombatBridge';
import { TEX } from '../../src/game/assets/keys';

type MutableActor = { -readonly [K in keyof ActorView]: ActorView[K] };
/** 只在独立测试构建中使用，不替代 Claude 的 sim 实现。 */
class FakeWorld implements CombatWorld {
  weaponId = 'pistol_basic' as const;
  secondaryWeapon = 'rifle_auto' as const;
  resources = new PlayerResources();
  takeWeapon() {
    return true;
  }
  grantPickup() {
    return true;
  }
  buySupplies() {
    return false;
  }
  restorePlayer() {
    return true;
  }
  upgrade() {
    return true;
  }
  equipWeapon() {
    return true;
  }
  time = 0;
  playerId: number | null = null;
  actors: MutableActor[] = [];
  pending: BulletSpawn[] = [];
  logs: string[] = [];
  nextId = 1;
  steps: {
    skill: boolean;
    swap: boolean;
    interact: boolean;
    pause: boolean;
    moveX: number;
    aimX: number | null;
  }[] = [];
  getActor(id: number) {
    return this.actors.find((a) => a.id === id);
  }
  spawnPlayer(_kind: CharacterId, x: number, y: number) {
    const id = this.spawn('player', x, y);
    this.playerId = id;
    return id;
  }
  spawnEnemy(_kind: EnemyId, x: number, y: number) {
    return this.spawn('enemy', x, y);
  }
  private spawn(team: 'player' | 'enemy', x: number, y: number) {
    const id = this.nextId++;
    this.actors.push({
      id,
      team,
      kind: team === 'player' ? 'ai_proto' : 'naiwa_chaser',
      phase: 'active',
      x,
      y,
      vx: 0,
      vy: 0,
      radius: 6,
      hp: 6,
      maxHp: 6,
      invulnerable: false,
      facing: 0,
    });
    return id;
  }
  syncPosition(id: number, x: number, y: number) {
    const a = this.getActor(id);
    if (a) {
      a.x = x;
      a.y = y;
    }
  }
  step(dt: number, input: Readonly<InputFrame>): StepResult {
    this.steps.push({
      skill: input.skillPressed,
      swap: input.swapPressed,
      interact: input.interactPressed,
      pause: input.pausePressed,
      moveX: input.move.x,
      aimX: input.aim?.x ?? null,
    });
    this.time += dt;
    const bullets = this.pending;
    this.pending = [];
    return { bulletSpawns: bullets, playerDead: false };
  }
  hitActor(id: number, target: number) {
    this.logs.push(`hit:${id}:${target}`);
    return true;
  }
  hitWall(id: number) {
    this.logs.push(`wall:${id}`);
  }
  releaseBullet(id: number) {
    this.logs.push(`release:${id}`);
  }
  contact(enemy: number, player: number) {
    this.logs.push(`contact:${enemy}:${player}`);
  }
  removeActor(id: number) {
    this.logs.push(`remove:${id}`);
    this.actors = this.actors.filter((a) => a.id !== id);
  }
  debugKillEnemies() {
    this.logs.push('debug-kill');
  }
}
interface Harness {
  stop(): void;
  tick(count: number): void;
  frame(dt: number, pressed: boolean): void;
  actor(id: number, patch: Partial<MutableActor>): void;
  bullet(patch?: Partial<BulletSpawn>, count?: number): void;
  finishDeath(id: number): void;
  snapshot(): {
    bullets: number;
    bulletCapacity: number;
    actors: number;
    positions: { id: number; x: number; y: number; enabled: boolean; visible: boolean }[];
    steps: FakeWorld['steps'];
    logs: string[];
    children: number;
  };
}
declare global {
  interface Window {
    combat: Harness;
  }
}
class HarnessScene extends Scene {
  create(): void {
    createPlaceholderTextures(this);
    const sim = new FakeWorld();
    sim.spawnPlayer('ai_proto', 160, 130);
    sim.spawnEnemy('naiwa_chaser', 300, 130);
    const bridge = new CombatBridge(this, sim),
      input = createInputFrame();
    this.physics.disableUpdate();
    window.combat = {
      stop: () => this.scene.stop(),
      frame: (dt, pressed) => {
        input.skillPressed = input.swapPressed = input.interactPressed = input.pausePressed = pressed;
        input.move.x = 0.5;
        input.aim = { x: 1, y: 0 };
        bridge.setInput(input);
        // InputController 在下一帧会复用这些对象；bridge 必须自己复制。
        input.move.x = 0;
        input.aim.x = 0;
        this.physics.world.update(sim.time * 1000, dt);
        this.physics.world.postUpdate();
      },
      tick: (count) => {
        for (let i = 0; i < count; i++) {
          this.physics.world.update(sim.time * 1000, 1000 / 60);
          this.physics.world.postUpdate();
        }
      },
      actor: (id, patch) => {
        const a = sim.getActor(id);
        if (a) Object.assign(a, patch);
        bridge.actors.apply();
      },
      bullet: (patch = {}, count = 1) => {
        for (let i = 0; i < count; i++)
          sim.pending.push({
            id: sim.nextId++,
            ownerId: 1,
            team: 'player',
            x: 200,
            y: 100,
            speed: 0,
            angle: 0,
            radius: 3,
            lifetime: 1,
            sprite: TEX.bulletPlayer,
            ...patch,
          });
        this.physics.world.update(sim.time * 1000, 1000 / 60);
        this.physics.world.postUpdate();
      },
      finishDeath: (id) => bridge.actors.finishDeath(id),
      snapshot: () => ({
        ...bridge.inspect(),
        steps: [...sim.steps],
        positions: sim.actors.map((a) => ({
          id: a.id,
          x: a.x,
          y: a.y,
          visible: !!bridge.actors.slots.find((s) => s.id === a.id)?.image.visible,
          enabled: !!bridge.actors.slots.find((s) => s.id === a.id)?.image.body?.enable,
        })),
        logs: [...sim.logs],
        children: this.children.length,
      }),
    };
  }
}
new Game({ type: AUTO, width: 480, height: 270, physics: { default: 'arcade' }, scene: [HarnessScene] });
