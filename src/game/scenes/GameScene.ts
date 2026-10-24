import { CombatAudio } from '../fx/CombatAudio';
import { parseCheckpoint, type FloorCheckpoint } from '../../sim/run/checkpoint';
import { RunPersistence } from '../systems/RunPersistence';
import { debugParams } from '../../debug/params';
import { DebugTools } from '../../debug/DebugTools';
import { freshSeed } from '../../sim/core/Random';
import { DemoSession } from '../systems/DemoSession';
import { InputScene } from '../ui/InputScene';
import { DemoHud } from '../ui/DemoHud';
import { DemoObjects } from '../world/DemoObjects';
import { setDemoProbe, setTestHooks } from '../testHooks';
import { M1Scene } from './M1Scene';

/** 默认进入完整 demo；?room=arena 保留 M1 手感与接口回归场景。 */
export class GameScene extends M1Scene {
  private demo?: DemoSession;
  private hud?: DemoHud;
  private objects?: DemoObjects;
  private tools?: DebugTools;
  private persistence?: RunPersistence;
  override create(data?: { checkpoint?: FloorCheckpoint }): void {
    this.demo = undefined;
    const params = debugParams();
    if (params.room === 'arena') {
      super.create();
      return;
    }
    const checkpoint = parseCheckpoint(data?.checkpoint) ?? undefined;
    const seed = checkpoint?.seed ?? params.seed ?? freshSeed();
    this.scene.launch(InputScene.KEY, { demo: true });
    const ui = this.scene.get(InputScene.KEY) as InputScene;
    const demo = (this.demo = new DemoSession(
      this,
      this.bus,
      ui,
      seed,
      params.god,
      params.weapon,
      checkpoint,
    ));
    new CombatAudio(this, this.bus);
    this.persistence = new RunPersistence(demo);
    this.persistence.update();
    this.hud = new DemoHud(this, demo);
    this.objects = new DemoObjects(this, demo);
    this.tools = params.debug ? new DebugTools(this, demo, { seed, godMode: params.god }) : undefined;
    setDemoProbe(() => ({
      floor: demo.dungeon.floor,
      room: demo.dungeon.roomId,
      kind: demo.dungeon.room.kind,
      phase: demo.dungeon.phase,
      settled: demo.settled,
      locked: demo.dungeon.locked,
      wave: demo.dungeon.wave,
      alive: demo.dungeon.alive,
      kills: demo.kills,
      x: demo.player?.x ?? 0,
      y: demo.player?.y ?? 0,
      hp: demo.player?.hp ?? 0,
      armor: demo.sim.resources.armor,
      energy: demo.sim.resources.energy,
      weapon: demo.sim.weaponId,
      skill: demo.sim.resources.skillRemaining,
      offers: [...demo.offers],
      links: demo.dungeon.room.links.map((id) => {
        const to = demo.dungeon.map.rooms[id]!;
        return { id, dx: to.x - demo.dungeon.room.x, dy: to.y - demo.dungeon.room.y };
      }),
      bullets: demo.bridge.bullets.activeCount,
      children: this.children.length,
      time: demo.sim.time,
    }));
    this.events.once('shutdown', () => {
      this.scene.stop(InputScene.KEY);
      this.hud?.destroy();
      setDemoProbe(undefined);
      this.bus.clear();
    });
    this.bus.emit('run:started', { seed });
    setTestHooks({ ready: true, scene: 'Game', seed });
  }
  override update(time: number, delta: number): void {
    if (!this.demo) {
      super.update(time, delta);
      return;
    }
    this.demo.update();
    this.persistence?.update();
    this.objects?.update();
    this.hud?.update(delta);
    this.tools?.update(delta);
  }
}
