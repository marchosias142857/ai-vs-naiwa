import { AUTO, Game, Scene } from 'phaser';
import type { Physics } from 'phaser';
import { ENEMIES, type EnemyId } from '../../src/data/enemies';
import { MONSTER_TEXTURES, POSE_FALLBACK, enemyAnimation, monsterFrame } from '../../src/data/enemyArt';
import { createPlaceholderTextures } from '../../src/game/assets/placeholders';
import { installDemoArt, preloadDemoArt } from '../../src/game/assets/demoArt';
import { CombatActors } from '../../src/game/entities/CombatActors';
import { EnemyArt } from '../../src/game/entities/EnemyArt';
import { createCombatWorld, type ActorPose } from '../../src/sim/combat/api';
import { EventBus } from '../../src/sim/core/EventBus';
import type { GameEvents } from '../../src/sim/core/events';
import { createInputFrame } from '../../src/sim/core/types';

const ids = Object.keys(ENEMIES) as EnemyId[];
class MonsterScene extends Scene {
  preload(): void {
    preloadDemoArt(this);
  }
  create(): void {
    createPlaceholderTextures(this);
    installDemoArt(this);
    this.physics.disableUpdate();
    this.physics.world.setBounds(32, 32, 416, 206);
    const sim = createCombatWorld({ seed: 100, bus: new EventBus<GameEvents>() });
    const actors = new CombatActors(this, sim);
    const art = new EnemyArt(1);
    const visual = this.add.image(0, 0, MONSTER_TEXTURES.monsters.key);
    const shadow = this.add.ellipse(0, 0, 1, 1);
    const probe = this.physics.add.image(0, 0, 'ph_enemy').setCircle(1, 7, 7).setVisible(false);
    const wall = this.physics.add.staticImage(248, 130, 'ph_enemy').setDisplaySize(16, 80).refreshBody();
    const barrel = this.physics.add.staticImage(300, 180, 'ph_enemy').setCircle(8, 0, 0);
    this.physics.add.collider(actors.group, [wall, barrel]);
    const input = createInputFrame();
    let tick = 0;
    const step = () => {
      this.physics.world.update(++tick * (1000 / 60), 1000 / 60);
      this.physics.world.postUpdate();
      actors.syncPositions();
    };
    window.monsterBodies = () => {
      const errors: string[] = [];
      const check = (ok: boolean, name: string) => {
        if (!ok) errors.push(name);
      };
      const children = this.children.length;
      const textures = this.textures.getTextureKeys().length;
      let frames = 0,
        now = 0;
      // 最大→最小，再遍历全部类型两遍；始终复用同一个实际 Arcade 槽位。
      const order: EnemyId[] = ['naiwa_boss', 'naiwa_tadpole', ...ids, ...[...ids].reverse()];
      for (const kind of order) {
        const id = sim.spawnEnemy(kind, 160, 130);
        actors.apply();
        const slot = actors.slots.find((s) => s.id === id)!;
        const body = slot.image.body as Physics.Arcade.Body;
        check(slot === actors.slots[0], `${kind}: slot reuse`);
        check(!body.enable, `${kind}: telegraph disabled`);
        for (let i = 0; i < 30; i++) sim.step(0.05, input);
        actors.apply();
        const actor = sim.getActor(id)!;
        const radius = ENEMIES[kind].radius;
        check(body.enable && actor.phase === 'active', `${kind}: activation`);
        check(body.radius === radius && body.isCircle, `${kind}: radius`);
        check(
          body.offset.x === slot.image.width / 2 - radius && body.offset.y === slot.image.height / 2 - radius,
          `${kind}: offset`,
        );
        check(body.center.x === actor.x && body.center.y === actor.y, `${kind}: center`);
        const before = JSON.stringify(actors.save());
        const anim = enemyAnimation(kind)!;
        for (const pose of Object.keys(POSE_FALLBACK)) {
          const action = POSE_FALLBACK[pose]!.find((key) => anim.art.frames[key]?.length)!;
          const count = anim.art.frames[action]!.length;
          const seconds = anim.art.seconds[action]!;
          for (const facing of [0, Math.PI]) {
            const view = {
              ...actor,
              pose: pose as ActorPose,
              facing,
              lift: pose === 'air' ? 12 : 0,
              phase: pose === 'death' ? ('dead' as const) : ('active' as const),
            };
            now += 10;
            art.draw(0, visual, view, now, 0, 0, 2, shadow);
            for (let i = 0; i < count; i++) {
              art.draw(0, visual, view, now + (i + 0.5) * seconds, (i + 0.5) * seconds, 0, 2, shadow);
              check(
                shadow.x === actor.x &&
                  shadow.y === actor.y + (anim.art.shadowY! - anim.art.pivot.y) * anim.art.scale,
                `${kind}:${action}: grounded shadow`,
              );
              check(
                this.textures.get(MONSTER_TEXTURES[anim.texture].key).has(monsterFrame(kind, action, i)),
                `${kind}:${action}:${i}: missing texture`,
              );
              check(Number.isFinite(visual.x) && Number.isFinite(visual.y), `${kind}:${action}: position`);
              if (pose !== 'death') {
                check(
                  Math.abs(visual.x - actor.x) <= 0.25 && Math.abs(visual.y - (actor.y - view.lift)) <= 0.25,
                  `${kind}:${action}: fixed anchor`,
                );
                const flip = (facing !== 0) !== (anim.art.facing === 'left');
                check(visual.flipX === flip, `${kind}:${action}: facing`);
              }
              frames++;
            }
          }
        }
        // Real rendered frame names: one-shot poses hold, hurt does not reset
        // the gait clock or mask the attack tell, frozen actors keep the pose.
        const idle = { ...actor, pose: 'idle' as const };
        now += 10;
        art.draw(0, visual, idle, now, 0, 0, 2, shadow);
        art.draw(0, visual, idle, now + 0.01, 0, 0.05, 2, shadow, now);
        check(visual.frame.name === monsterFrame(kind, 'hurt', 0), `${kind}: hurt frame`);
        const resume = anim.art.seconds.hurt! * anim.art.frames.hurt!.length + 0.01;
        art.draw(0, visual, idle, now + resume, 0, 0, 2, shadow, now);
        check(
          visual.frame.name ===
            monsterFrame(
              kind,
              'idle',
              Math.floor(resume / anim.art.seconds.idle!) % anim.art.frames.idle!.length,
            ),
          `${kind}: resume clock`,
        );
        const frozenFrame = visual.frame.name;
        art.draw(0, visual, { ...idle, frozen: true }, now + resume + 10, 0, 0, 2, shadow, now);
        check(visual.frame.name === frozenFrame, `${kind}: frozen pose`);
        now += 30;
        const windup = { ...actor, pose: 'windup' as const };
        art.draw(0, visual, windup, now, 0, 0, 2, shadow, now);
        check(visual.frame.name === monsterFrame(kind, 'windup', 0), `${kind}: hurt keeps tell`);
        art.draw(0, visual, windup, now + 10, 0, 0, 2, shadow);
        check(
          visual.frame.name === monsterFrame(kind, 'windup', anim.art.frames.windup!.length - 1),
          `${kind}: windup holds last frame`,
        );
        check(JSON.stringify(actors.save()) === before, `${kind}: art mutated physics`);
        // 圆周四向探针：真正的 Arcade overlap，不以包围盒代替圆形命中。
        for (const angle of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
          for (const [gap, expected] of [
            [0.5, true],
            [1.5, false],
          ] as const) {
            probe.body!.reset(
              actor.x + Math.cos(angle) * (radius + gap),
              actor.y + Math.sin(angle) * (radius + gap),
            );
            // reset 本身按贴图左上角放置；即时探针不等下一次 preUpdate，须应用圆的 offset。
            (probe.body as Physics.Arcade.Body).updateFromGameObject();
            check(
              this.physics.overlap(probe, slot.image) === expected,
              `${kind}: circle boundary ${angle}/${gap}`,
            );
          }
        }
        // 墙面、世界角落和圆形桶的阻挡都用本体半径，后续朝向与动画不能改变它。
        body.reset(220, 130);
        for (let i = 0; i < 60; i++) {
          body.setVelocity(60, 0);
          step();
        }
        check(Math.abs(body.center.x - (240 - radius)) < 0.02, `${kind}: wall`);
        body.reset(50, 50);
        for (let i = 0; i < 60; i++) {
          body.setVelocity(-60, -60);
          step();
        }
        check(
          Math.abs(body.center.x - (32 + radius)) < 0.02 && Math.abs(body.center.y - (32 + radius)) < 0.02,
          `${kind}: corner`,
        );
        body.reset(270, 180);
        for (let i = 0; i < 60; i++) {
          body.setVelocity(60, 0);
          step();
        }
        check(Math.abs(body.center.x - (292 - radius)) < 0.02, `${kind}: barrel`);
        body.setVelocity(0, 0);
        const saved = actors.save();
        slot.image.setCircle(1, 0, 0);
        body.reset(410, 200);
        actors.load(saved);
        check(JSON.stringify(actors.save()) === JSON.stringify(saved), `${kind}: restore`);
        check(body.radius === radius && body.enable, `${kind}: restored shape`);
        sim.debugKillEnemies();
        actors.apply();
        check(!body.enable, `${kind}: death disabled`);
        // 分裂怪死亡会正常生成蝌蚪，同样经过 apply/死亡/回收。
        while (sim.actors.length) {
          sim.debugKillEnemies();
          actors.apply();
          for (const a of [...sim.actors]) actors.finishDeath(a.id);
        }
        check(
          actors.slots.every((s) => !s.id && !s.image.body!.enable),
          `${kind}: recycled`,
        );
      }
      check(this.children.length === children, 'children grew');
      check(this.textures.getTextureKeys().length === textures, 'textures grew');
      return { errors, frames, acquisitions: order.length, children, textures };
    };
    window.monsterAtlas = () => {
      const errors: string[] = [];
      let frames = 0;
      for (const kind of ids) {
        const anim = enemyAnimation(kind)!;
        const source = this.textures
          .get(MONSTER_TEXTURES[anim.texture].key)
          .getSourceImage() as HTMLImageElement;
        const canvas = document.createElement('canvas');
        canvas.width = source.width;
        canvas.height = source.height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(source, 0, 0);
        const [w, h] = anim.art.size;
        for (const [action, coords] of Object.entries(anim.art.frames)) {
          const distinct = new Set<string>();
          for (const [x, y] of coords) {
            const pixels = ctx.getImageData(x, y, w, h).data;
            distinct.add(Array.from(new Uint32Array(pixels.buffer)).join(','));
            let count = 0;
            for (let i = 3; i < pixels.length; i += 4) {
              const alpha = pixels[i]!;
              if (alpha) count++;
              const px = ((i - 3) / 4) % w,
                py = Math.floor((i - 3) / 4 / w);
              if (
                (alpha !== 0 && alpha !== 255) ||
                (alpha && (px === 0 || py === 0 || px === w - 1 || py === h - 1))
              )
                errors.push(`${kind}:${action}: alpha/border ${px},${py}`);
            }
            if (!count) errors.push(`${kind}:${action}: empty`);
            frames++;
          }
          if ((action === 'idle' || action === 'move') && distinct.size < 2)
            errors.push(`${kind}:${action}: identical stills instead of animation`);
        }
      }
      return { errors, frames, monsters: ids.length };
    };
  }
}
declare global {
  interface Window {
    monsterBodies: () => {
      errors: string[];
      frames: number;
      acquisitions: number;
      children: number;
      textures: number;
    };
    monsterAtlas: () => { errors: string[]; frames: number; monsters: number };
  }
}
new Game({
  type: AUTO,
  width: 480,
  height: 270,
  pixelArt: true,
  physics: { default: 'arcade', arcade: { fixedStep: true } },
  scene: [MonsterScene],
});
