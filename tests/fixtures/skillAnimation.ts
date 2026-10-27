import { AUTO, Game, Scene, GameObjects } from 'phaser';
import { DEPTH } from '../../src/config';
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
import { skillStates, type SkillSample } from './skillStates';

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
      this.cameras.main.setZoom(wide ? 1.35 : 2.3).centerOn(a.x + (wide ? 70 : 20), a.y - 6);
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
      this.cameras.main.setZoom(1).centerOn(240, 135);
      return { actors: sim.actors.length, rocks: sim.rocks.filter((r) => r.active).length, budget: mode };
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
  width: 480,
  height: 270,
  pixelArt: true,
  parent: 'game',
  physics: { default: 'arcade', arcade: { fixedStep: true } },
  scene: [SkillScene],
});
