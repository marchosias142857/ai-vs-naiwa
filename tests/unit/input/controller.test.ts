import { WEAPONS } from '../../../src/data/weapons';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Scene } from 'phaser';
import { InputController } from '../../../src/game/input/InputController';
import { createCombatWorld } from '../../../src/sim/combat/api';
import { EventBus } from '../../../src/sim/core/EventBus';
import { INPUT_UI as UI } from '../../../src/game/fx/params';

vi.mock('phaser', () => ({
  Math: {
    Vector2: class {
      x = 0;
      y = 0;
    },
  },
}));
vi.mock('../../../src/game/world/combatPause', () => ({ combatPause: () => undefined }));

function setup(native = true) {
  const win = Object.assign(new EventTarget(), native ? { ontouchstart: null } : {});
  vi.stubGlobal('window', win);
  vi.stubGlobal(
    'document',
    Object.assign(new EventTarget(), { documentElement: { style: { setProperty: vi.fn() } } }),
  );
  vi.stubGlobal('matchMedia', () => ({ matches: native }));
  const rect = { left: 17, top: 29, width: 800, height: 450 };
  const canvas = Object.assign(new EventTarget(), {
    getBoundingClientRect: () => rect,
    setPointerCapture: vi.fn(),
    style: {},
  });
  const ui = {
    game: { canvas, input: { enabled: true }, loop: { frame: 0 } },
    scale: { on: vi.fn(), off: vi.fn(), width: 480 },
    input: {},
  };
  const battle = { scene: { isPaused: () => false } };
  const controls = new InputController(ui as unknown as Scene, battle as unknown as Scene, vi.fn());
  const sample = () => {
    ui.game.loop.frame++;
    return controls.sample(0, 0);
  };
  const touch = (type: string, points: number[][]) => {
    const e = Object.assign(new Event(type, { cancelable: true }), {
      changedTouches: points.map(([identifier, x = 0, y = 0]) => ({
        identifier,
        clientX: x + rect.left,
        clientY: y + rect.top,
      })),
    });
    (type === 'touchstart' ? canvas : win).dispatchEvent(e);
    return e;
  };
  const pointer = (type: string, pointerType: string, pointerId: number, x = 712, y = 362) => {
    (type === 'pointerup' ? win : canvas).dispatchEvent(
      Object.assign(new Event(type), {
        pointerType,
        pointerId,
        clientX: x + rect.left,
        clientY: y + rect.top,
        button: 0,
      }),
    );
  };
  return { controls, sample, touch, pointer, win, canvas };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('DOM 触控到战斗开火', () => {
  it.each([-1, -42, -2147483648])('触点编号 %i：拖拽出弹、回中长按、双指所有权及释放', (id) => {
    const { controls, sample, touch, pointer } = setup();
    const clock = vi.spyOn(performance, 'now').mockReturnValue(0);
    const moveId = id + 10;
    touch('touchstart', [
      [moveId, 100, 350],
      [id, 712, 362],
    ]);
    touch('touchmove', [
      [moveId, 130, 350],
      [id, 672, 362],
    ]);
    expect(sample()).toMatchObject({ source: 'touch', fire: true, aim: { x: -1, y: 0 } });
    pointer('pointermove', 'mouse', 99);
    touch('touchstart', [[id + 1, 712, 362]]); // 第三指不能抢走已经占用的右轮盘。
    expect(controls.touch.fireId).toBe(id);
    expect(sample().move.x).toBeGreaterThan(0);
    const world = createCombatWorld({ seed: 42, bus: new EventBus() });
    world.spawnPlayer('ai_proto', 240, 135);
    expect(world.step(1 / 60, sample()).bulletSpawns.length).toBeGreaterThan(0);
    touch('touchend', [[moveId]]);
    expect(sample()).toMatchObject({ fire: true, move: { x: 0, y: 0 } });
    touch('touchcancel', [[id]]);
    expect(sample()).toMatchObject({ fire: false, aim: null });
    touch('touchstart', [[id, 712, 362]]);
    expect(sample().fire).toBe(false);
    clock.mockReturnValue(UI.aimWheel.firstShotDelayMs + 1);
    expect(sample().fire).toBe(true);
    touch('touchend', [[id]]);
    expect(sample().fire).toBe(false);
    controls.destroy();
  });

  it('原生触摸按住中心出弹，不依赖 pointerdown 或捕获；销毁移除监听', () => {
    const { controls, sample, touch, canvas } = setup();
    const clock = vi.spyOn(performance, 'now').mockReturnValue(0);
    expect(touch('touchstart', [[0, 712, 362]]).defaultPrevented).toBe(true);
    expect(sample().fire).toBe(false);
    clock.mockReturnValue(UI.aimWheel.firstShotDelayMs + 1);
    const world = createCombatWorld({ seed: 42, bus: new EventBus() });
    world.spawnPlayer('ai_proto', 240, 135);
    expect(world.step(1 / 60, sample()).bulletSpawns.length).toBeGreaterThan(0);
    expect(canvas.setPointerCapture).not.toHaveBeenCalled();
    touch('touchend', [[0]]);
    expect(sample().fire).toBe(false);
    controls.destroy();
    touch('touchstart', [[0, 712, 362]]);
    expect(controls.touch.fireId).toBeNull();
  });

  it('双指拖动即时出弹；重复指针/兼容鼠标释放不能停火；松左指保留右指', () => {
    const { controls, sample, touch, pointer } = setup();
    touch('touchstart', [
      [0, 100, 350],
      [1, 712, 362],
    ]);
    touch('touchmove', [
      [0, 130, 350],
      [1, 672, 362],
    ]);
    for (const type of ['pointercancel', 'lostpointercapture', 'pointerup']) {
      pointer(type, 'touch', 1);
      pointer(type, 'mouse', 1);
    }
    pointer('pointermove', 'mouse', 99);
    expect(sample()).toMatchObject({ source: 'touch', fire: true, aim: { x: -1, y: 0 } });
    expect(sample().move.x).toBeGreaterThan(0);
    const world = createCombatWorld({ seed: 42, bus: new EventBus() });
    world.spawnPlayer('ai_proto', 240, 135);
    expect(Math.abs(world.step(1 / 60, sample()).bulletSpawns[0]!.angle - Math.PI)).toBeLessThanOrEqual(
      (WEAPONS.pistol_basic.spread * Math.PI) / 360,
    );
    touch('touchend', [[0]]);
    expect(sample()).toMatchObject({ move: { x: 0, y: 0 }, fire: true });
    touch('touchend', [[1]]);
    expect(sample()).toMatchObject({ aim: null, fire: false });
    controls.destroy();
  });

  it('右指取消不打断左摇杆，拖出画布仍更新，切后台清空触摸', () => {
    const { controls, sample, touch, win } = setup();
    touch('touchstart', [
      [0, 100, 350],
      [1, 712, 362],
    ]);
    touch('touchmove', [
      [0, 130, 350],
      [1, 900, 362],
    ]);
    expect(sample()).toMatchObject({ fire: true, aim: { x: 1, y: 0 } });
    touch('touchcancel', [[1]]);
    expect(sample().fire).toBe(false);
    expect(sample().move.x).toBeGreaterThan(0);
    win.dispatchEvent(new Event('blur'));
    expect(sample().move).toEqual({ x: 0, y: 0 });
    touch('touchmove', [[1, 672, 362]]);
    expect(sample().fire).toBe(false);
    controls.destroy();
  });

  it('无原生 TouchEvent 的设备保留 PointerEvent 触控路径', () => {
    const { controls, sample, pointer, canvas } = setup(false);
    pointer('pointerdown', 'touch', 7);
    pointer('pointermove', 'touch', 7, 672);
    expect(sample()).toMatchObject({ source: 'touch', fire: true, aim: { x: -1, y: 0 } });
    expect(canvas.setPointerCapture).toHaveBeenCalledWith(7);
    pointer('pointerup', 'touch', 7);
    expect(sample().fire).toBe(false);
    controls.destroy();
  });
});
