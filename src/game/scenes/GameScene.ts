import { configureCamera } from '../configureCamera';
import { RoomCamera } from '../RoomCamera';
import { GRAYBOX_BOUNDS as B } from '../world/graybox';
import { StressRun } from '../../debug/StressRun';
import { debugCheckpoint } from '../../debug/floorCheckpoint';
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
import type { SessionSnapshot } from '../save/RunSnapshot';

/** snapshot 来自菜单已校验的恢复结果；原始存储 JSON 不直接进入场景。 */
export interface GameStart {
  checkpoint?: FloorCheckpoint;
  snapshot?: SessionSnapshot;
}

/** 默认进入完整 demo；?room=arena 保留 M1 手感与接口回归场景。 */
export class GameScene extends M1Scene {
  private stress?: StressRun;
  private demo?: DemoSession;
  private hud?: DemoHud;
  private objects?: DemoObjects;
  private tools?: DebugTools;
  private persistence?: RunPersistence;
  private roomCamera?: RoomCamera;
  override create(data?: GameStart): void {
    configureCamera(this);
    this.demo = undefined;
    this.roomCamera = undefined;
    this.stress = undefined;
    const params = debugParams();
    if (params.stress) {
      this.stress = new StressRun(this, params.seed ?? 42, params.stress === 'capacity');
      return;
    }
    if (params.room === 'arena') {
      super.create();
      return;
    }
    const snapshot = data?.snapshot;
    const checkpoint =
      parseCheckpoint(data?.checkpoint) ??
      (snapshot ? undefined : debugCheckpoint(params.floor, params.seed ?? freshSeed()));
    const seed = snapshot?.entry.seed ?? checkpoint?.seed ?? params.seed ?? freshSeed();
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
      snapshot,
    ));
    new CombatAudio(this, this.bus);
    this.roomCamera = new RoomCamera(this, ui);
    this.persistence = new RunPersistence(this, demo);
    this.persistence.update();
    this.hud = new DemoHud(this, demo);
    this.objects = new DemoObjects(this, demo);
    this.tools = params.debug ? new DebugTools(this, demo, { seed, godMode: params.god }) : undefined;
    setDemoProbe(() => ({
      camera: this.roomCamera!.inspect(),
      meleeActive: demo.sim.melee.active,
      visual: demo.bridge.actors.art?.inspect() ?? null,
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
      resumeRemaining: demo.pause.remaining,
      physicsPaused: this.physics.world.isPaused,
      enemies: demo.sim.actors
        .filter((a) => a.team === 'enemy' && a.phase === 'active')
        .map((a) => ({ x: a.x, y: a.y })),
    }));
    this.events.once('shutdown', () => {
      this.scene.stop(InputScene.KEY);
      this.hud?.destroy();
      setDemoProbe(undefined);
      this.bus.clear();
    });
    if (!snapshot) this.bus.emit('run:started', { seed });
    setTestHooks({ ready: true, scene: 'Game', seed });
  }
  override update(time: number, delta: number): void {
    if (this.stress) {
      this.stress.update(delta);
      return;
    }
    if (!this.demo) {
      super.update(time, delta);
      return;
    }
    this.demo.update();
    const p = this.demo.player;
    if (p) this.roomCamera?.update(p.x, p.y);
    const d = this.demo.dungeon;
    for (const id of d.room.links) {
      const to = d.map.rooms[id]!;
      this.roomCamera?.hint(
        B.x + B.width / 2 + ((to.x - d.room.x) * B.width) / 2,
        B.y + B.height / 2 + ((to.y - d.room.y) * B.height) / 2,
        d.locked ? 0x8a93b8 : 0x7ee8ff,
      );
    }
    for (const a of this.demo.sim.actors)
      if (a.team === 'enemy' && a.phase !== 'dead') this.roomCamera?.hint(a.x, a.y, 0xff8d9d);
    this.persistence?.update();
    if (this.hud) this.hud.saveAvailable = this.persistence?.saved ?? true;
    this.objects?.update();
    this.hud?.update(delta);
    this.tools?.update(delta);
  }
}
