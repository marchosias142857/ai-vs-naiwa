import type { Scene } from 'phaser';
import { FrameStats } from './FrameStats';

export interface StressLoad {
  ready: boolean;
  actors: number;
  bullets: number;
  effects: number;
  children: number;
  simSeconds: number;
}
/** 仅在 stress 模式挂接 renderer；退出恢复原方法，不改变普通游戏的绘制路径。 */
export class StressMeter {
  private readonly stats = new FrameStats();
  private readonly root = document.createElement('section');
  private readonly label = document.createElement('pre');
  private readonly abort = new AbortController();
  private readonly restoreDraw: () => void;
  private readonly load: StressLoad = {
    ready: false,
    actors: 0,
    bullets: 0,
    effects: 0,
    children: 0,
    simSeconds: 0,
  };
  private last = 0;
  private refreshed = 0;
  private draws = 0;
  private actorMin = Infinity;
  private bulletMin = Infinity;
  private peakBullets = 0;
  private peakFx = 0;
  private minChildren = Infinity;
  private maxChildren = 0;
  constructor(
    private readonly scene: Scene,
    private readonly profile: string,
    private readonly seed: number,
    private readonly readLoad: (out: StressLoad) => void,
  ) {
    const renderer = scene.game.renderer;
    if ('drawElements' in renderer) {
      const draw = renderer.drawElements,
        originalInstanced = renderer.drawInstancedArrays;
      const instanced = originalInstanced as (
        ...args: [...Parameters<typeof originalInstanced>, topology?: number]
      ) => void;
      const count = () => this.draws++;
      // 显式参数，避免每个 draw call 分配 rest 参数数组。
      renderer.drawElements = function (a, b, c, d, e, f, g) {
        count();
        draw.call(this, a, b, c, d, e, f, g);
      };
      renderer.drawInstancedArrays = function (a, b, c, d, e, f, g, h?: number) {
        count();
        instanced.call(this, a, b, c, d, e, f, g, h);
      };
      this.restoreDraw = () => {
        renderer.drawElements = draw;
        renderer.drawInstancedArrays = instanced;
      };
    } else this.restoreDraw = () => {};
    this.root.id = 'stress-panel';
    this.root.style.cssText =
      'position:fixed;left:6px;top:4px;z-index:10;color:white;background:#111c;font:12px monospace;padding:5px;max-width:45vw';
    this.label.style.margin = '0';
    this.root.append(this.label);
    for (const [text, action] of [
      ['重新计时', this.reset],
      ['导出 JSON', this.download],
    ] as const) {
      const button = document.createElement('button');
      button.textContent = text;
      button.addEventListener('click', action, { signal: this.abort.signal });
      this.root.append(button);
    }
    document.body.append(this.root);
    const options = { signal: this.abort.signal, capture: true };
    const resetClock = () => {
      this.last = 0;
    };
    document.addEventListener('visibilitychange', resetClock, options);
    window.addEventListener('resize', resetClock, options);
    window.addEventListener('orientationchange', resetClock, options);
    scene.game.events.on('prerender', this.beforeRender);
    scene.game.events.on('postrender', this.afterRender);
    scene.events.once('shutdown', this.destroy);
  }
  private readonly beforeRender = () => {
    this.draws = 0;
  };
  private readonly afterRender = () => {
    this.readLoad(this.load);
    const now = performance.now(),
      l = this.load;
    if (document.hidden || !this.scene.sys.isActive() || this.scene.physics.world.isPaused || !l.ready)
      this.last = 0;
    else {
      if (this.last) {
        this.stats.record(now - this.last, this.draws);
        this.actorMin = Math.min(this.actorMin, l.actors);
        this.bulletMin = Math.min(this.bulletMin, l.bullets);
        this.peakBullets = Math.max(this.peakBullets, l.bullets);
        this.peakFx = Math.max(this.peakFx, l.effects);
        this.minChildren = Math.min(this.minChildren, l.children);
        this.maxChildren = Math.max(this.maxChildren, l.children);
      }
      this.last = now;
    }
    if (now - this.refreshed < 250) return;
    this.refreshed = now;
    const s = this.stats.snapshot();
    this.root.dataset.ready = String(l.ready);
    this.root.dataset.frames = String(s.frames);
    this.root.dataset.seconds = String(s.seconds);
    this.label.textContent = `${this.profile} · ${l.ready ? '计时' : '填充中'} ${s.seconds.toFixed(0)}s\n怪 ${l.actors} 弹 ${l.bullets} FX ${l.effects}\nFPS avg ${s.averageFps.toFixed(1)} min ${s.minFrameFps.toFixed(1)}\n最低秒均 ${s.minSecondFps?.toFixed(1) ?? '—'} · p95 ${s.p95Ms}ms\ndraw avg ${s.drawAverage.toFixed(1)} max ${s.drawMax}`;
  };
  private readonly reset = () => {
    this.stats.reset();
    this.last = 0;
    this.actorMin = this.bulletMin = this.minChildren = Infinity;
    this.peakBullets = this.peakFx = this.maxChildren = 0;
  };
  private readonly download = () => {
    const renderer = this.scene.game.renderer;
    const gl = 'gl' in renderer ? renderer.gl : null,
      gpuInfo = gl?.getExtension('WEBGL_debug_renderer_info');
    const report = {
      version: 1,
      capturedAt: new Date().toISOString(),
      profile: this.profile,
      seed: this.seed,
      url: location.href,
      userAgent: navigator.userAgent,
      viewport: [innerWidth, innerHeight],
      dpr: devicePixelRatio,
      gpu: gpuInfo ? gl?.getParameter(gpuInfo.UNMASKED_RENDERER_WEBGL) : null,
      drawCallsAvailable: 'drawElements' in renderer,
      renderer:
        'gl' in renderer ? renderer.gl.getParameter(renderer.gl.RENDERER) : 'Canvas (draw calls unavailable)',
      bundle: performance
        .getEntriesByType('resource')
        .map((e) => e.name)
        .find((name) => /\/assets\/index-.*\.js/.test(name)),
      ...this.stats.snapshot(),
      actorMin: this.actorMin,
      bulletMin: this.bulletMin,
      peakBullets: this.peakBullets,
      peakFx: this.peakFx,
      minChildren: this.minChildren,
      maxChildren: this.maxChildren,
      load: this.load,
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = `ai-vs-naiwa-stress-${this.profile}-${Date.now()}.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  private readonly destroy = () => {
    this.scene.game.events.off('prerender', this.beforeRender);
    this.scene.game.events.off('postrender', this.afterRender);
    this.restoreDraw();
    this.abort.abort();
    this.root.remove();
  };
}
