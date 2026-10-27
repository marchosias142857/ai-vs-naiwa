import { AUTO, Game, Scene, GameObjects, Scale } from 'phaser';
import { DEPTH, GAME_WIDTH, GAME_HEIGHT, RENDER_SCALE } from '../../src/config';
import { ART, installDemoArt, preloadDemoArt } from '../../src/game/assets/demoArt';
import { createPlaceholderTextures } from '../../src/game/assets/placeholders';
import { EnemyArt } from '../../src/game/entities/EnemyArt';
import { CombatBridge } from '../../src/game/world/CombatBridge';
import { HazardLayer } from '../../src/game/fx/HazardLayer';
import { CombatFeedback } from '../../src/game/fx/CombatFeedback';
import { drawSkillTell } from '../../src/game/fx/skillTells';
import { fxBudget } from '../../src/game/fx/FxBudget';
import { createCombatWorld, type CombatWorldState } from '../../src/sim/combat/api';
import { EventBus } from '../../src/sim/core/EventBus';
import type { GameEvents } from '../../src/sim/core/events';
import { createInputFrame } from '../../src/sim/core/types';
import { skillStates, landingStates, type SkillSample } from './skillStates';

class SkillScene extends Scene {
  preload(): void {
    preloadDemoArt(this);
  }
  create(): void {
    createPlaceholderTextures(this);
    installDemoArt(this);
    this.physics.disableUpdate();
    // Same floor atlas as the game; the fixed camera keeps the full 220px bump tell visible.
    const floorFrame = this.textures
      .get(ART.rooms)
      .getFrameNames()
      .find((name) => name.includes('floor'))!;
    this.add.tileSprite(240, 135, 480, 270, ART.rooms, floorFrame).setTileScale(0.5).setDepth(DEPTH.floor);
    const bus = new EventBus<GameEvents>();
    let sim = createCombatWorld({ seed: 8, bus, godMode: true });
    let bridge = new CombatBridge(this, sim);
    bridge.actors.enableArt(this);
    let hazards = new HazardLayer(this, sim, bridge, bus);
    let feedback = new CombatFeedback(this, sim, bridge, bus);
    const budget = fxBudget(this);
    const admit = budget.admit.bind(budget);
    const cases = skillStates();
    const landingCases = landingStates(cases);
    const probe = this.add.image(0, 0, 'ph_enemy').setVisible(false);
    const tells = this.add.graphics().setVisible(false);
    const pose = () => [
      probe.frame.name,
      probe.x,
      probe.y,
      probe.scaleX,
      probe.scaleY,
      probe.flipX,
      probe.tintTopLeft,
    ];
    const render = () => {
      feedback.update();
      hazards.update();
      this.events.emit('postupdate');
    };
    const load = (sample: SkillSample, mode = 'load') => {
      const state: CombatWorldState = structuredClone(sample.state);
      if (mode === 'frozen') state.actors.find((a) => a.id === sample.id)!.status.freeze = 10;
      // Rebuild ephemeral effects like a real scene reload; keep all persistent resources preloaded.
      hazards.destroy();
      feedback.destroy();
      bridge.destroy();
      sim = createCombatWorld({ seed: 8, bus, godMode: true });
      sim.load(state);
      bridge = new CombatBridge(this, sim);
      bridge.actors.enableArt(this);
      for (const bullet of sample.bullets ?? []) bridge.bullets.spawn(bullet);
      hazards = new HazardLayer(this, sim, bridge, bus);
      feedback = new CombatFeedback(this, sim, bridge, bus);
      budget.admit = mode === 'zero' ? () => false : admit;
      feedback.loadDeaths([]);
      if (mode === 'live') {
        for (const e of sample.events) bus.emit('enemy:acted', e);
        for (const e of sample.explosions) bus.emit('combat:exploded', e);
      }
      render();
    };
    window.skillList = () =>
      cases.map((c) => ({ name: c.name, frames: c.frames.map((f) => f?.label ?? null) }));
    window.skillShow = (row, column, mode) => {
      const sample = cases[row]?.frames[column];
      if (!sample) return null;
      load(sample, mode);
      const a = sim.getActor(sample.id)!;
      const wide = a.move === 'bump' || cases[row]!.name === 'falling_rocks';
      this.cameras.main.setZoom((wide ? 1.35 : 2.3) * RENDER_SCALE).centerOn(a.x + (wide ? 70 : 20), a.y - 6);
      return {
        kind: a.kind,
        move: a.move,
        stage: a.phase === 'dead' ? 'dead' : a.stage,
        stageTime: a.stageTime,
        stageSpan: a.stageSpan,
        aimLocked: a.aimLocked,
        label: sample.label,
        rocks: sim.rocks.filter((r) => r.active).length,
      };
    };
    window.skillDense = (mode) => {
      const state = createCombatWorld({ seed: 8, bus: new EventBus<GameEvents>() }).save();
      let id = 1;
      for (let i = 0; i < 30; i++) {
        const row = cases[i % cases.length]!;
        const sample = row.frames[row.move === 'hop' ? 1 : 2] ?? row.frames[3]!;
        const actor = structuredClone(sample.state.actors.find((a) => a.id === sample.id)!);
        actor.id = id++;
        actor.x = 45 + (i % 6) * 72;
        actor.y = 48 + Math.floor(i / 6) * 45;
        actor.baseX = actor.x;
        actor.baseY = actor.y;
        if (mode === 'frozen' && actor.kind !== 'naiwa_boss') actor.status.freeze = 10;
        state.actors.push(actor);
      }
      state.nextId = id;
      const rain = cases.find((c) => c.name === 'falling_rocks')!.frames[0]!;
      state.rocks = structuredClone(rain.state.rocks);
      load(
        { state, id: 1, label: '30 enemies', events: [], explosions: [] },
        mode === 'frozen' ? 'load' : mode,
      );
      this.cameras.main.setZoom(RENDER_SCALE).centerOn(GAME_WIDTH / 2, GAME_HEIGHT / 2);
      return { actors: sim.actors.length, rocks: sim.rocks.filter((r) => r.active).length, budget: mode };
    };
    window.landingShow = (index, zoom, mode = 'load') => {
      const sample = landingCases[index]!;
      load(sample, mode);
      const a = sim.getActor(sample.id)!;
      const rock = sample.label.startsWith('rock') ? sim.rocks.find((r) => r.active)! : null;
      this.cameras.main.setZoom(zoom).centerOn(rock?.x ?? a.landX, rock?.y ?? a.landY);
      return { label: sample.label, zoom, time: rock?.time ?? a.stageTime, span: rock?.fall ?? a.stageSpan };
    };
    window.formalTell = (kind, last, zoom) => {
      if (kind === 'rock') return window.landingShow(last ? 3 : 0, zoom);
      if (kind === 'hopper') return window.landingShow(last ? 5 : 4, zoom);
      if (kind === 'boss-hop') return window.landingShow(last ? 7 : 6, zoom);
      const row = cases.findIndex((c) => c.move === (kind === 'fuse' ? 'fuse' : 'bump'));
      const column = last ? 2 : 0;
      window.skillShow(row, column, 'load');
      const a = sim.getActor(cases[row]!.frames[column]!.id)!;
      this.cameras.main.setZoom(zoom).centerOn(a.x + (kind === 'bump' ? 105 : 0), a.y);
      return { label: `${kind}-${last ? 'last' : 'first'}`, zoom, time: a.stageTime, span: a.stageSpan };
    };
    window.landingAudit = () => {
      const errors: string[] = [];
      const records: object[] = [];
      const check = (ok: boolean, label: string) => {
        if (!ok) errors.push(label);
      };
      type Segment = number[];
      let segments: Segment[] = [];
      const styles = new WeakMap<GameObjects.Graphics, number[]>();
      const originalStyle = GameObjects.Graphics.prototype.lineStyle;
      const originalLine = GameObjects.Graphics.prototype.lineBetween;
      GameObjects.Graphics.prototype.lineStyle = function (width = 1, color = 0xffffff, alpha = 1) {
        styles.set(this, [width, color, alpha]);
        return originalStyle.call(this, width, color, alpha);
      };
      GameObjects.Graphics.prototype.lineBetween = function (x1, y1, x2, y2) {
        const style = styles.get(this);
        if (style?.[0] === 0.7 && (style[1] === 0xfff1c2 || style[1] === 0xf05a4f))
          segments.push([x1, y1, x2, y2, style[2]!, style[1]!]);
        return originalLine.call(this, x1, y1, x2, y2);
      };
      const capture = () => {
        segments = [];
        render();
        return JSON.stringify(segments);
      };
      try {
        for (const sample of landingCases) {
          load(sample, 'normal');
          const fallingArt = this.children.list.filter(
            (o): o is GameObjects.Image =>
              o instanceof GameObjects.Image &&
              o.texture.key === 'hz_rock' &&
              o.visible &&
              o.depth > DEPTH.actors + 10,
          );
          check(
            fallingArt.every((o) => o.depth < DEPTH.fx),
            `${sample.label}: falling sprite covers boundary`,
          );
          if (sample.label.startsWith('rock')) {
            const r = sim.rocks.find((r) => r.active)!;
            const progress = 1 - r.time / r.fall;
            if (sample.label === 'rock-0') check(progress === 0, 'rock spawn is not exact t=0');
            if (sample.label === 'rock-0.3')
              check(progress >= 0.3 && progress < 0.35, 'missing early-rock sample');
            if (sample.label === 'rock-0.9') check(r.time > 0 && r.time < 0.15, 'missing dust-window sample');
            if (sample.label === 'rock-1') check(r.time > 0 && r.time <= 1 / 60, 'missing final-rock sample');
          }
          const expected: number[][] = [];
          // Independent contract: box sides reach the true radius; player radius is not added to the art.
          for (const r of sim.rocks)
            if (r.active && !r.landed) {
              const p = Math.max(0, Math.min(1, 1 - r.time / r.fall));
              expected.push([r.x, r.y, r.radius, r.radius, p, 0xf05a4f]);
            }
          for (const a of sim.actors)
            if (a.phase === 'active' && a.move === 'hop' && a.stage === 'air') {
              if (a.kind === 'naiwa_hopper') {
                tells.clear();
                const empty = JSON.stringify(tells.commandBuffer);
                drawSkillTell(tells, a);
                check(JSON.stringify(tells.commandBuffer) === empty, 'hopper retained landing hint');
              } else if (a.kind === 'naiwa_boss') {
                const half = Math.max(a.radius, 6) * 1.5;
                expected.push([a.landX, a.landY, half, half, a.stageTime / a.stageSpan, 0xfff1c2]);
              }
            }
          const normal = capture();
          const geometry: object[] = [];
          check(segments.length === expected.length * 12, `${sample.label}: missing corner segments`);
          for (let i = 0; i < expected.length; i++) {
            const [x, y, rx, ry, p, color] = expected[i]!;
            const group = segments.slice(i * 12, i * 12 + 12);
            const xs = group.flatMap((s) => [s[0]!, s[2]!]);
            const ys = group.flatMap((s) => [s[1]!, s[3]!]);
            const scale = 1.3 - 0.3 * p!;
            check(
              group.every((s) => s[4]! >= 0.75 && s[5] === color),
              `${sample.label}: wrong color or low opacity`,
            );
            check(
              Math.abs(Math.min(...xs) - (x! - rx! * scale)) < 1e-6 &&
                Math.abs(Math.max(...xs) - (x! + rx! * scale)) < 1e-6 &&
                Math.abs(Math.min(...ys) - (y! - ry! * scale)) < 1e-6 &&
                Math.abs(Math.max(...ys) - (y! + ry! * scale)) < 1e-6,
              `${sample.label}: wrong landing bounds`,
            );
            const halfWidth = (Math.max(...xs) - Math.min(...xs)) / (2 * scale);
            const halfHeight = (Math.max(...ys) - Math.min(...ys)) / (2 * scale);
            const radiusContract = Math.abs(halfWidth - rx!) < 1e-6 && Math.abs(halfHeight - ry!) < 1e-6;
            check(radiusContract, `${sample.label}: unscaled radius contract`);
            geometry.push({
              kind: color === 0xf05a4f ? 'rock' : 'boss-hop',
              center: [x, y],
              progress: p,
              scale,
              expectedHalfSize: [rx, ry],
              actualUnscaledHalfSize: [halfWidth, halfHeight],
              radiusContract,
            });
          }
          for (const mode of ['zero', 'frozen', 'load']) {
            load(sample, mode);
            check(capture() === normal, `${sample.label}/${mode}: boundary differs`);
            // Pause freezes the entire world, including rocks/Boss; repeat render with no sim step.
            for (let i = 0; i < 10; i++) render();
            check(capture() === normal, `${sample.label}/${mode}: render clock changed boundary`);
          }
          records.push({
            label: sample.label,
            markers: expected.length,
            segments: expected.length * 12,
            geometry,
            modesIdentical: ['normal', 'zero', 'frozen', 'load'],
            hopperHintRemoved: sample.label.startsWith('naiwa_hopper'),
          });
        }
        window.skillDense('zero');
        const children = this.children.length,
          textures = this.textures.getTextureKeys().length;
        check(
          sim.actors.length === 30 && sim.rocks.filter((r) => r.active).length === 7,
          'dense load differs',
        );
        for (let i = 0; i < 120; i++) render();
        for (const mode of ['load', 'frozen', 'zero', 'load']) window.skillDense(mode);
        check(
          this.children.length === children && this.textures.getTextureKeys().length === textures,
          'dense resources grew',
        );
        return {
          errors,
          records,
          children,
          textures,
          denseActors: sim.actors.length,
          denseRocks: sim.rocks.filter((r) => r.active).length,
        };
      } finally {
        GameObjects.Graphics.prototype.lineStyle = originalStyle;
        GameObjects.Graphics.prototype.lineBetween = originalLine;
      }
    };
    window.skillAudit = () => {
      const errors: string[] = [];
      let samples = 0,
        frozen = 0,
        cues = 0;
      const check = (ok: boolean, label: string) => {
        if (!ok) errors.push(label);
      };
      const graphics = () =>
        this.children.list
          .filter((g): g is GameObjects.Graphics => g instanceof GameObjects.Graphics && g.visible)
          .map((g) => JSON.stringify(g.commandBuffer))
          .sort();
      const emptyWorld = createCombatWorld({ seed: 9, bus: new EventBus<GameEvents>() }).save();
      load({ state: emptyWorld, id: 0, label: 'empty', events: [], explosions: [] });
      const emptyBuffers = JSON.stringify(graphics());
      const initialChildren = this.children.length;
      const initialTextures = this.textures.getTextureKeys().length;
      for (const row of cases) {
        check(!!row.frames[3], `${row.name}: no activation captured`);
        for (const sample of row.frames) {
          if (!sample) continue;
          samples++;
          if (sample.label.startsWith('前摇'))
            check(
              sample.state.actors.find((a) => a.id === sample.id)!.phase === 'active',
              `${row.name}: dead frame classified as windup`,
            );
          load(sample, 'zero');
          const a = sim.getActor(sample.id)!;
          const before = JSON.stringify(bridge.actors.save());
          if (a.stage !== 'ready' && a.phase === 'active') {
            const fresh = new EnemyArt(1);
            fresh.draw(0, probe, a, 0, 0, 0, 1);
            const first = JSON.stringify(pose());
            fresh.draw(0, probe, a, 99999, 0, 0, 1);
            check(first === JSON.stringify(pose()), `${row.name}/${sample.label}: local clock affects skill`);
            const cold = new EnemyArt(1);
            cold.draw(0, probe, a, 456, 0, 0, 1);
            check(first === JSON.stringify(pose()), `${row.name}/${sample.label}: cold-load frame mismatch`);
            tells.clear();
            drawSkillTell(tells, a);
            const commands = JSON.stringify(tells.commandBuffer);
            if (tells.commandBuffer.length > 5) cues++;
            if (a.kind !== 'naiwa_boss') {
              const state = sim.save();
              state.actors.find((e) => e.id === a.id)!.status.freeze = 10;
              const frozenWorld = createCombatWorld({
                seed: 8,
                bus: new EventBus<GameEvents>(),
                godMode: true,
              });
              frozenWorld.load(state);
              const f = frozenWorld.getActor(a.id)!;
              fresh.draw(0, probe, f, 0, 0, 0, 1);
              const frozenPose = JSON.stringify(pose());
              for (let i = 0; i < 10; i++) frozenWorld.step(1 / 60, createInputFrame());
              fresh.draw(0, probe, f, sim.time, 0, 0.1, 1);
              tells.clear();
              drawSkillTell(tells, f);
              check(JSON.stringify(pose()) === frozenPose, `${row.name}: freeze/flash changed pose`);
              check(
                JSON.stringify(tells.commandBuffer) === commands,
                `${row.name}: frozen cue changed/vanished`,
              );
              frozen++;
            }
          }
          check(JSON.stringify(bridge.actors.save()) === before, `${row.name}: art mutated physics`);
        }
      }
      check(this.children.length === initialChildren, 'scene children grew across reloads');
      check(this.textures.getTextureKeys().length === initialTextures, 'textures grew across reloads');
      // Clearing a room must clear skill marks as well as falling-rock images.
      const empty = createCombatWorld({ seed: 9, bus: new EventBus<GameEvents>() }).save();
      load({ state: empty, id: 0, label: 'empty', events: [], explosions: [] });
      const marks = graphics();
      check(JSON.stringify(marks) === emptyBuffers, 'room clear retained skill geometry');
      return {
        errors,
        samples,
        frozen,
        cues,
        children: initialChildren,
        textures: initialTextures,
        emptyGraphics: marks.length,
      };
    };
  }
}
declare global {
  interface Window {
    skillList: () => { name: string; frames: (string | null)[] }[];
    skillShow: (row: number, column: number, mode?: string) => object | null;
    skillDense: (mode: string) => object;
    landingShow: (index: number, zoom: number, mode?: string) => object;
    formalTell: (kind: string, last: boolean, zoom: number) => object;
    landingAudit: () => {
      errors: string[];
      records: object[];
      children: number;
      textures: number;
      denseActors: number;
      denseRocks: number;
    };
    skillAudit: () => {
      errors: string[];
      samples: number;
      frozen: number;
      cues: number;
      children: number;
      textures: number;
      emptyGraphics: number;
    };
  }
}
new Game({
  type: AUTO,
  // Match the production framebuffer, not a 270p intermediate enlarged by CSS.
  width: GAME_WIDTH * RENDER_SCALE,
  height: GAME_HEIGHT * RENDER_SCALE,
  antialias: true,
  roundPixels: false,
  scale: { mode: Scale.FIT, autoCenter: Scale.CENTER_BOTH },
  parent: 'game',
  physics: { default: 'arcade', arcade: { fixedStep: true } },
  scene: [SkillScene],
});
