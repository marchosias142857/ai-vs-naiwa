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
}

interface LifecycleProbe {
  paused: boolean;
  loopRunning: boolean;
  frame: number;
  sceneTime: number;
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
    get lifecycle() {
      return readLifecycle?.();
    },
  };
}
