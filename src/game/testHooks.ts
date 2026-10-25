import type { InputFrame } from '../sim/core/types';
/**
 * 给 Playwright 冒烟测试和手动调试用的只读状态：window.__AVN__。
 * 只写入简单可序列化的数据，不暴露游戏对象。
 */
export interface TestHooks {
  ready: boolean;
  scene: string;
  seed: number;
  phaserVersion: string;
  readonly lifecycle?: LifecycleProbe;
  readonly input?: InputFrame & {
    manualPaused: boolean;
    touch: {
      moveX: number;
      moveY: number;
      moveRadius: number;
      fireX: number;
      fireY: number;
      fireRadius: number;
    };
  };
  readonly combat?: CombatProbe;
  /** 调试工具（#17）的状态；只在 `?debug=1` 时存在。 */
  readonly debug?: DebugProbe;
  readonly demo?: DemoProbe;
}

export interface DemoProbe {
  camera: {
    x: number;
    y: number;
    width: number;
    height: number;
    zoom: number;
    scrollX: number;
    scrollY: number;
  };
  meleeActive: boolean;
  visual: {
    frame: string | number;
    texture: string;
    source: string;
    sourceWidth: number;
    sourceHeight: number;
    x: number;
    y: number;
    flipX: boolean;
    depth: number;
    face: { visible: boolean; x: number; y: number; width: number; height: number };
    weapon: { x: number; y: number; flipY: boolean; angle: number; depth: number; visible: boolean };
  } | null;
  floor: number;
  room: number;
  kind: string;
  phase: string;
  settled: boolean;
  locked: boolean;
  wave: number;
  alive: number;
  kills: number;
  x: number;
  y: number;
  hp: number;
  armor: number;
  energy: number;
  weapon: string;
  skill: number;
  offers: string[];
  links: { id: number; dx: number; dy: number }[];
  bullets: number;
  children: number;
  time: number;
  resumeRemaining: number;
  physicsPaused: boolean;
  /** 活动阶段敌人的脚底位置；只给测试瞄准用（玩家没有自动瞄准，ADR 0020）。 */
  enemies: { x: number; y: number }[];
}
let readDemo: (() => DemoProbe) | undefined;
export function setDemoProbe(read: typeof readDemo): void {
  readDemo = read;
  setTestHooks({});
}

interface DebugProbe {
  hitboxes: boolean;
  godMode: boolean;
}

/** 战斗流程（#15）的只读快照。 */
export interface CombatProbe {
  /** 本页面开过的局数；重来后加 1。 */
  runs: number;
  phase: 'playing' | 'dead' | 'restartable';
  playerHp: number;
  playerMaxHp: number;
  /** 已开始的波数。 */
  wave: number;
  /** 存活（含预警中）的怪物数。 */
  alive: number;
  kills: number;
  /** sim 时间，秒。 */
  time: number;
  playerX: number;
  playerY: number;
  /** 最近一次交给 sim 的瞄准方向与当时的身体中心；没有手动瞄准时 aim 为 null。 */
  aim: { x: number; y: number } | null;
  aimOriginX: number;
  aimOriginY: number;
}

interface LifecycleProbe {
  paused: boolean;
  loopRunning: boolean;
  frame: number;
  sceneTime: number;
}
let readInput: (() => NonNullable<TestHooks['input']>) | undefined;
export function setInputProbe(read: typeof readInput): void {
  readInput = read;
  setTestHooks({});
}

let readCombat: (() => CombatProbe) | undefined;
export function setCombatProbe(read: typeof readCombat): void {
  readCombat = read;
  setTestHooks({});
}

let readDebug: (() => DebugProbe) | undefined;
export function setDebugProbe(read: typeof readDebug): void {
  readDebug = read;
  setTestHooks({});
}

let readLifecycle: (() => LifecycleProbe) | undefined;

/** 按需读取简单状态，不暴露游戏对象，也不在帧循环中分配调试对象。 */
export function setLifecycleProbe(read: () => LifecycleProbe): void {
  readLifecycle = read;
  setTestHooks({});
}

declare global {
  interface Window {
    __AVN__?: TestHooks;
  }
}

export function setTestHooks(patch: Partial<TestHooks>): void {
  if (typeof window === 'undefined') return;
  window.__AVN__ = {
    ready: false,
    scene: '',
    seed: 0,
    phaserVersion: '',
    ...window.__AVN__,
    ...patch,
    get input() {
      return readInput?.();
    },
    get demo() {
      return readDemo?.();
    },
    get debug() {
      return readDebug?.();
    },
    get combat() {
      return readCombat?.();
    },
    get lifecycle() {
      return readLifecycle?.();
    },
  };
}
