import { DUNGEON } from '../../data/dungeon';
import { ROOM_RULES } from '../../data/rooms';
import type { EventBus } from '../core/EventBus';
import type { GameEvents } from '../core/events';
import { Random } from '../core/Random';
import { generateDungeon, type DungeonMap, type DungeonRoom } from '../dungeon/generate';

export type DungeonPhase = 'exploring' | 'fighting' | 'won' | 'lost';

/** 存档用的纯数据（ADR 0019）；地图由种子与楼层重新生成，不保存。 */
export interface DungeonRunState {
  floor: number;
  roomId: number;
  phase: DungeonPhase;
  visited: boolean[];
  cleared: boolean[];
  claimed: boolean[];
  wave: number;
  wait: number;
  alive: number;
  kills: number;
  roomsCleared: number;
  elapsed: number;
}

/** 房间规则状态。每个 WORLD_STEP 在战斗之后调用；game 负责消费 spawnCount 并实际刷怪。 */
export class DungeonRun {
  floor = 1;
  map: DungeonMap;
  roomId = 0;
  phase: DungeonPhase = 'exploring';
  readonly visited: boolean[] = [];
  readonly cleared: boolean[] = [];
  readonly claimed: boolean[] = [];
  wave = 0;
  alive = 0;
  kills = 0;
  roomsCleared = 0;
  elapsed = 0;
  /** 只在当前 step 有效，下一步清零；消费方不可跨帧保留。 */
  spawnCount = 0;
  revision = 0;
  private wait: number = ROOM_RULES.waveDelay;
  private readonly root: Random;
  private readonly roomEvent = { roomId: '' };
  private readonly endedEvent = { victory: false };

  constructor(
    readonly seed: number,
    private readonly bus: EventBus<GameEvents>,
    startFloor = 1,
    restore?: Readonly<DungeonRunState>,
  ) {
    const floor = restore?.floor ?? startFloor;
    if (!Number.isInteger(floor) || floor < 1 || floor > DUNGEON.floors + 1)
      throw new RangeError('invalid starting floor');
    this.floor = floor;
    this.root = new Random(seed);
    this.map = this.generate();
    // 读档不走入场流程，也不发 room:entered（ADR 0019：恢复不重放业务事件）。
    if (restore) this.load(restore);
    else this.enterCurrent();
    bus.on('entity:died', this.onDied);
  }
  /** 从存档重建；数据须先按 ADR 0019 第 4 节校验。 */
  static restore(seed: number, bus: EventBus<GameEvents>, state: Readonly<DungeonRunState>): DungeonRun {
    return new DungeonRun(seed, bus, state.floor, state);
  }
  save(): DungeonRunState {
    return {
      floor: this.floor,
      roomId: this.roomId,
      phase: this.phase,
      visited: Array.from(this.map.rooms, (_, i) => !!this.visited[i]),
      cleared: Array.from(this.map.rooms, (_, i) => !!this.cleared[i]),
      claimed: Array.from(this.map.rooms, (_, i) => !!this.claimed[i]),
      wave: this.wave,
      wait: this.wait,
      alive: this.alive,
      kills: this.kills,
      roomsCleared: this.roomsCleared,
      elapsed: this.elapsed,
    };
  }
  private load(s: Readonly<DungeonRunState>): void {
    this.roomId = s.roomId;
    this.phase = s.phase;
    this.visited.length = this.cleared.length = this.claimed.length = 0;
    this.visited.push(...s.visited);
    this.cleared.push(...s.cleared);
    this.claimed.push(...s.claimed);
    this.wave = s.wave;
    this.wait = s.wait;
    this.alive = s.alive;
    this.kills = s.kills;
    this.roomsCleared = s.roomsCleared;
    this.elapsed = s.elapsed;
    this.spawnCount = 0;
    this.revision++;
  }
  private readonly onDied = (e: GameEvents['entity:died']): void => {
    if (e.team === 'enemy' && !this.finished) this.kills++;
  };
  destroy(): void {
    this.bus.off('entity:died', this.onDied);
  }
  claim(): boolean {
    if (this.claimed[this.roomId]) return false;
    this.claimed[this.roomId] = true;
    return true;
  }

  get room(): DungeonRoom {
    return this.map.rooms[this.roomId]!;
  }
  get locked(): boolean {
    return this.phase === 'fighting';
  }
  get finished(): boolean {
    return this.phase === 'won' || this.phase === 'lost';
  }

  /** 仅允许通过当前房间的连接；已清空的房间再次进入不刷怪。 */
  enter(id: number): boolean {
    if (this.locked || this.finished || !this.room.links.includes(id)) return false;
    this.roomId = id;
    this.enterCurrent();
    return true;
  }

  /** 出口必须显式交互；第四层为独立 Boss 层。 */
  nextFloor(): boolean {
    if (this.finished || this.locked || this.room.kind !== 'exit') return false;
    this.floor++;
    this.map = this.generate();
    this.roomId = this.map.start;
    this.visited.length = this.cleared.length = this.claimed.length = 0;
    this.enterCurrent();
    return true;
  }

  step(dt: number, alive: number, playerDead: boolean): void {
    this.spawnCount = 0;
    if (this.finished) return;
    this.elapsed += dt;
    this.alive = alive;
    if (playerDead) {
      this.end(false);
      return;
    }
    if (!this.locked || alive > 0) return;
    const total = this.room.kind === 'boss' ? 1 : ROOM_RULES.waves.length;
    if (this.wave >= total) {
      this.cleared[this.roomId] = true;
      this.roomsCleared++;
      this.phase = 'exploring';
      this.revision++;
      this.roomEvent.roomId = `${this.floor}:${this.roomId}`;
      this.bus.emit('room:cleared', this.roomEvent);
      if (this.room.kind === 'boss') this.end(true);
      return;
    }
    this.wait -= dt;
    if (this.wait > 0) return;
    this.spawnCount =
      this.room.kind === 'boss' ? 1 : ROOM_RULES.waves[this.wave]! + (this.floor - 1) * ROOM_RULES.floorExtra;
    this.wave++;
    this.wait = ROOM_RULES.waveDelay;
  }

  private generate(): DungeonMap {
    return generateDungeon(this.root.fork(`map:${this.floor}`), this.floor > DUNGEON.floors);
  }
  private enterCurrent(): void {
    this.visited[this.roomId] = true;
    const kind = this.room.kind;
    this.phase =
      !this.cleared[this.roomId] && (kind === 'combat' || kind === 'boss') ? 'fighting' : 'exploring';
    this.wave = this.alive = this.spawnCount = 0;
    this.wait = ROOM_RULES.waveDelay;
    this.revision++;
    this.roomEvent.roomId = `${this.floor}:${this.roomId}`;
    this.bus.emit('room:entered', this.roomEvent);
  }
  private end(victory: boolean): void {
    this.phase = victory ? 'won' : 'lost';
    this.revision++;
    this.endedEvent.victory = victory;
    this.bus.emit('run:ended', this.endedEvent);
  }
}
