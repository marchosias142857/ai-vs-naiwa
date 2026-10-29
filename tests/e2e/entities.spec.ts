import { compileRoom } from '../../src/sim/dungeon/compileRoom';
import { resolveRoomTemplate } from '../../src/sim/dungeon/roomCatalog';
import { DUNGEON } from '../../src/data/dungeon';
import { TALENTS } from '../../src/data/talents';
import { POOL_SIZES } from '../../src/config';
import { LOOT_RULES } from '../../src/data/loot';
import { expect, test } from '@playwright/test';
import { build } from 'vite';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type {} from '../fixtures/combat';
import type {} from '../fixtures/knockback';
import type {} from '../fixtures/room';
import type {} from '../fixtures/demo';
import type {} from '../fixtures/snapshot';
import { BALANCE } from '../../src/data/balance';
import { WEAPONS } from '../../src/data/weapons';
import { ENEMIES } from '../../src/data/enemies';

let directory: string, url: string, server: ReturnType<typeof createServer>;
test.beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'naiwa-entities-'));
  await build({
    configFile: false,
    root: resolve('tests/fixtures'),
    base: './',
    logLevel: 'silent',
    build: {
      outDir: directory,
      rollupOptions: {
        input: [
          resolve('tests/fixtures/combat.html'),
          resolve('tests/fixtures/knockback.html'),
          resolve('tests/fixtures/room.html'),
          resolve('tests/fixtures/demo.html'),
          resolve('tests/fixtures/snapshot.html'),
        ],
      },
    },
  });
  server = createServer((req, res) => {
    const path = new URL(req.url ?? '/', 'http://localhost').pathname;
    void readFile(join(directory, path === '/' ? 'combat.html' : path))
      .then((data) => {
        res.setHeader(
          'Content-Type',
          path.endsWith('.js') ? 'text/javascript' : path.endsWith('.css') ? 'text/css' : 'text/html',
        );
        res.end(data);
      })
      .catch(() => res.writeHead(404).end());
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('no address');
  url = `http://127.0.0.1:${address.port}`;
});
test.afterAll(async () => {
  if (server) await new Promise<void>((done) => server.close(() => done()));
  if (directory) await rm(directory, { recursive: true, force: true });
});
test.beforeEach(async ({ page }) => {
  await page.goto(url);
  await page.waitForFunction(() => window.combat);
});

test('预热500、超限退回sim、寿命回收且不新建贴图', async ({ page }) => {
  const initial = await page.evaluate(() => window.combat.snapshot());
  expect(initial.bulletCapacity).toBe(500);
  await page.evaluate(() => window.combat.bullet({}, 501));
  let state = await page.evaluate(() => window.combat.snapshot());
  expect(state.bullets).toBe(500);
  expect(state.logs).toHaveLength(1);
  await page.evaluate(() => window.combat.tick(61));
  state = await page.evaluate(() => window.combat.snapshot());
  expect(state.bullets).toBe(0);
  expect(state.logs).toHaveLength(501);
  await page.evaluate(() => window.combat.bullet({}, 500));
  expect((await page.evaluate(() => window.combat.snapshot())).children).toBe(initial.children);
});
test('实时物理坐标、墙边界、碰撞只报告sim、阶段与死亡回收', async ({ page }, info) => {
  await page.evaluate(() => {
    window.combat.actor(1, { vx: 90 });
    window.combat.tick(1);
  });
  expect((await page.evaluate(() => window.combat.snapshot())).positions[0]!.x).toBeCloseTo(161.5);
  await page.evaluate(() => {
    window.combat.actor(1, { vx: -100000 });
    window.combat.actor(2, { vx: 100000 });
    window.combat.tick(2);
  });
  const state = await page.evaluate(() => window.combat.snapshot());
  expect(state.positions[0]!.x).toBeGreaterThanOrEqual(110);
  expect(state.positions[1]!.x).toBeLessThanOrEqual(370);
  await page.evaluate(() => {
    window.combat.bullet({ x: 200, speed: 100000 });
    window.combat.tick(2);
  });
  expect((await page.evaluate(() => window.combat.snapshot())).logs.some((s) => s.startsWith('wall:'))).toBe(
    true,
  );
  await page.evaluate(() => {
    window.combat.actor(2, { phase: 'telegraph', vx: 0 });
    window.combat.bullet({ x: 370, y: 130 });
    window.combat.tick(1);
  });
  expect((await page.evaluate(() => window.combat.snapshot())).logs.some((s) => s.startsWith('hit:'))).toBe(
    false,
  );
  expect((await page.evaluate(() => window.combat.snapshot())).positions[1]!.visible).toBe(false);
  await page.evaluate(() => {
    window.combat.actor(2, { phase: 'active' });
    window.combat.tick(1);
  });
  expect((await page.evaluate(() => window.combat.snapshot())).logs.some((s) => s.startsWith('hit:'))).toBe(
    true,
  );
  expect((await page.evaluate(() => window.combat.snapshot())).positions[1]!.visible).toBe(true);
  await page.screenshot({ path: info.outputPath('entities-pool.png') });
  await page.evaluate(() => {
    window.combat.actor(2, { phase: 'dead' });
    window.combat.finishDeath(2);
  });
  expect((await page.evaluate(() => window.combat.snapshot())).actors).toBe(1);
});

test('场景关闭安全清理，已存活子弹退回sim', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.evaluate(() => {
    window.combat.bullet({}, 10);
    window.combat.stop();
  });
  await expect.poll(() => page.evaluate(() => window.combat.snapshot().bullets)).toBe(0);
  expect(errors).toEqual([]);
  expect(
    (await page.evaluate(() => window.combat.snapshot())).logs.filter((x) => x.startsWith('release:')),
  ).toHaveLength(10);
});

for (const steps of [0, 1, 2]) {
  test(`一帧 ${steps} 个物理步：边沿恰好消费一次，复制输入向量`, async ({ page }) => {
    await page.evaluate((n) => window.combat.frame((1000 / 60) * n, true), steps);
    let samples = (await page.evaluate(() => window.combat.snapshot())).steps;
    expect(samples).toHaveLength(steps);
    await page.evaluate(() => window.combat.frame(1000 / 60, false));
    samples = (await page.evaluate(() => window.combat.snapshot())).steps;
    expect(samples).toHaveLength(steps + 1);
    for (const edge of ['skill', 'swap', 'interact', 'pause'] as const) {
      expect(samples.filter((s) => s[edge])).toHaveLength(1);
      expect(samples[0]![edge]).toBe(true);
    }
    expect(samples.every((s) => s.moveX === 0.5 && s.aimX === 1)).toBe(true);
  });
}

for (const fps of [60, 120]) {
  test(`真实 sim + Arcade：1/${fps} 秒锁步击退距离与同时间对照组相符`, async ({ page }, info) => {
    await page.goto(`${url}/knockback.html`);
    await page.waitForFunction(() => window.knockback);
    const shot = await page.evaluate((fps) => window.knockback(fps, true), fps);
    expect(shot.fired).toBe(1);
    expect(shot.hits).toBe(1);
    expect(shot.overlaps).toBe(1);
    expect(shot.trace).toEqual(['overlap', 'hit']);
    expect(shot.hp).toBeLessThan(ENEMIES.naiwa_chaser.hp);
    expect(shot.phase).toBe('active');
    expect(shot.bullets).toBe(0);
    expect(shot.steps - shot.hitStep).toBe(Math.ceil(BALANCE.knockbackTime * fps) + 1);

    // 全新页面、相同种子与出生位置；不开火，但推进到完全相同的物理步数。
    await page.goto(`${url}/knockback.html`);
    await page.waitForFunction(() => window.knockback);
    const control = await page.evaluate(({ fps, steps }) => window.knockback(fps, false, steps), {
      fps,
      steps: shot.steps,
    });
    expect(control.steps).toBe(shot.steps);
    expect(control.time).toBe(shot.time);
    expect(control.time).toBeCloseTo(control.steps / fps, 10);
    expect(control.fired).toBe(0);
    expect(control.hits).toBe(0);
    expect(control.overlaps).toBe(0);
    expect(control.hp).toBe(ENEMIES.naiwa_chaser.hp);
    expect(control.phase).toBe('active');
    for (const result of [shot, control]) {
      expect(result.x).toBeCloseTo(result.simX, 8);
      expect(result.y).toBeCloseTo(result.simY, 8);
      // 测量时击退已结束，两个怪物都只剩正常追击速度。
      expect(Math.hypot(result.vx, result.vy)).toBeCloseTo(ENEMIES.naiwa_chaser.moveSpeed, 8);
    }
    const distance = Math.hypot(shot.x - control.x, shot.y - control.y);
    const error = Math.abs(distance - WEAPONS.pistol_basic.knockback);
    await info.attach('knockback-measurement', {
      body: JSON.stringify({ fps, shot, control, distance, error }, null, 2),
      contentType: 'application/json',
    });
    expect(error).toBeLessThan(0.5);
  });
}

test('真实 Arcade 内墙挡人挡弹、视线遮挡、切房复用与脚底中心一致', async ({ page }, info) => {
  await page.goto(`${url}/room.html`);
  await page.waitForFunction(() => window.roomTest);
  const r = await page.evaluate(() => window.roomTest());
  expect(r.hits).toBeGreaterThan(0);
  expect(r.x).toBeLessThanOrEqual(158.01);
  expect(r.blocked).toBe(true);
  expect(r.clear).toBe(true);
  expect(r.sameChildren).toBe(true);
  expect(r.bullets).toBe(0);
  expect(r.bodyX).toBeCloseTo(r.simX, 6);
  expect(r.bodyY).toBeCloseTo(r.simY, 6);
  const entrance = compileRoom(
    resolveRoomTemplate('designed_v3/temple/court_0_0', 'temple', 'combat')!,
  ).ports.find((p) => p.id === 'west')!.entrance;
  expect(r.simX).toBe(entrance.x);
  expect(r.simY).toBe(entrance.y);
  await page.locator('canvas').screenshot({ path: `test-results/room-${info.project.name}.png` });
});

test('真实 sim + Arcade 完整三层探索、升级、Boss 胜利及池复用', async ({ page }) => {
  await page.goto(`${url}/demo.html`);
  await page.waitForFunction(() => window.demoScenario);
  const result = await page.evaluate(() => window.demoScenario());
  expect(result.phase).toBe('won');
  expect(result.settled).toBe(true);
  expect(result.floor).toBe(DUNGEON.floors + 1);
  expect(result.rooms).toBe(DUNGEON.floors * (DUNGEON.mainRooms - 1) + 1);
  expect(result.kills).toBeGreaterThan(0);
  expect(result.childrenStable).toBe(true);
});

test('真实命中反馈使用预热池，预警隐藏与死亡延迟回收', async ({ page }) => {
  await page.goto(`${url}/demo.html`);
  await page.waitForFunction(() => window.feedbackScenario);
  const result = await page.evaluate(() => window.feedbackScenario());
  expect(result.hits).toBeGreaterThan(0);
  expect(result.effects).toBeGreaterThan(0);
  expect(result.effects).toBeLessThanOrEqual(100);
  expect(result.telegraphHidden).toBe(true);
  expect(result.delayedDeath).toBe(true);
  expect(result.recycled).toBe(true);
  expect(result.stable).toBe(true);
});

test('出口升级界面可买补给，再选择升级进入下一层', async ({ page }, info) => {
  await page.goto(`${url}/demo.html`);
  await page.waitForFunction(() => window.demoScenario);
  const result = await page.evaluate(() => window.demoScenario(true));
  expect(result.phase).toBe('offer');
  const before = await page.evaluate(() => window.offerState());
  await expect(page.locator('#buy-supplies')).toBeEnabled();
  await page.locator('#demo-hud').screenshot({ path: info.outputPath('demo-upgrade.png'), scale: 'css' });
  await page.locator('#buy-supplies').click();
  const after = await page.evaluate(() => window.offerState());
  expect(after.coins).toBe(before.coins - LOOT_RULES.shopPrice);
  expect(after.energy).toBeGreaterThan(before.energy);
  await page.locator('[data-choice="0"]').click();
  expect(await page.evaluate(() => window.offerState().floor)).toBe(2);
  expect(await page.evaluate(() => window.offerState().offers)).toBe(0);
});

test('真实 Arcade 中追击怪绕过内墙接近玩家', async ({ page }) => {
  await page.goto(`${url}/room.html`);
  await page.waitForFunction(() => window.navigationTest);
  const result = await page.evaluate(() => window.navigationTest());
  expect(result.detour).toBe(true);
  expect(result.insideWall).toBe(false);
  expect(result.distance).toBeLessThan(20);
});

test('100 秒锁步压力：持续 30 怪、弹丸与反馈池不增长', async ({ page }, info) => {
  test.setTimeout(60_000);
  await page.goto(`${url}/demo.html`);
  await page.waitForFunction(() => window.stressScenario);
  const result = await page.evaluate(() => window.stressScenario());
  await writeFile(info.outputPath('stress.json'), JSON.stringify(result, null, 2));
  await info.attach('stress-counters', {
    body: JSON.stringify(result, null, 2),
    contentType: 'application/json',
  });
  expect(result.simulatedSeconds).toBeCloseTo(100, 5);
  expect(result.spawned).toBeGreaterThan(30);
  expect(result.records).toBeLessThanOrEqual(31);
  expect(result.peakBullets).toBeGreaterThan(0);
  expect(result.peakBullets).toBeLessThanOrEqual(500);
  expect(result.peakFx).toBeGreaterThan(0);
  expect(result.peakFx).toBeLessThanOrEqual(100);
  expect(result.stable).toBe(true);
});

test('楼层入口继续与不中断推进得到相同升级候选', async ({ page }) => {
  await page.goto(`${url}/demo.html`);
  await page.waitForFunction(() => window.demoScenario);
  await page.evaluate(() => window.demoScenario(true));
  await page.locator('[data-choice="0"]').click();
  const saved = await page.evaluate(() => window.floorCheckpoint());
  expect(saved.floor).toBe(2);
  await page.evaluate(() => window.demoScenario(true));
  const uninterrupted = await page.evaluate(() => window.floorOffers());
  await page.evaluate((saved) => sessionStorage.setItem('fixture.checkpoint', JSON.stringify(saved)), saved);
  await page.reload();
  await page.waitForFunction(() => window.demoScenario);
  await page.evaluate(() => window.demoScenario(true));
  expect(await page.evaluate(() => window.floorOffers())).toEqual(uninterrupted);
});

test('瞬时反馈池：满池、部分到期、反复回收不重复占槽或新建对象', async ({ page }) => {
  await page.goto(`${url}/demo.html`);
  await page.waitForFunction(() => window.feedbackPoolScenario);
  const result = await page.evaluate(() => window.feedbackPoolScenario());
  const cycle = [POOL_SIZES.fx, POOL_SIZES.fx / 2, POOL_SIZES.fx, 0];
  expect(result.counts).toEqual(Array.from({ length: 4 }, () => cycle).flat());
  expect(result.visible).toEqual(result.counts);
  expect(result.capacity).toBe(POOL_SIZES.fx);
  expect(result.stable).toBe(true);
});

test('装饰事件风暴：分类预算、重复回收、纹理复用和 sim 隔离', async ({ page }) => {
  await page.goto(`${url}/demo.html`);
  await page.waitForFunction(() => window.fxBudgetScenario);
  const result = await page.evaluate(() => window.fxBudgetScenario());
  expect(result.counts).toEqual(Array(8).fill(48));
  expect(result.accepted).toBe(8 * 80);
  expect(result.dropped).toBe(8 * (6000 - 80));
  expect(result.stable).toBe(true);
  expect(result.unchanged).toBe(true);
  expect(result.active).toBe(0);
});

for (const mode of ['mixed', 'full', 'corpse', 'teleport'] as const) {
  test(`存档物理往返：${mode}，真实 Arcade 后续命中与快照一致`, async ({ page }) => {
    await page.goto(`${url}/snapshot.html`);
    await page.waitForFunction(() => window.snapshotScenario);
    const a = await page.evaluate((mode) => window.snapshotScenario(mode), mode);
    if (mode === 'mixed') {
      expect(
        new Set(a.before.physics.bullets.slots.filter((s) => s).map((s) => s!.radius)).size,
      ).toBeGreaterThan(1);
      expect(a.events.some((s) => s.startsWith('entity:damaged'))).toBe(true);
    }
    if (mode === 'full') {
      expect(a.before.physics.bullets.free).toHaveLength(0);
      expect(a.before.sim.bullets).toHaveLength(POOL_SIZES.bullets);
      expect(a.after.physics.bullets.free.length).toBeGreaterThan(0);
    }
    if (mode === 'corpse') {
      expect(a.before.deaths.length).toBeGreaterThan(0);
      expect(a.before.deaths.every((s) => s.elapsed > 0)).toBe(true);
    }
    if (mode === 'teleport') {
      expect(a.before.physics.actors[0]!.vx).toBe(0);
      expect(a.before.sim.actors[0]!.vx).toBeGreaterThan(0);
    }
    await page.goto(`${url}/snapshot.html`);
    await page.waitForFunction(() => window.snapshotScenario);
    const b = await page.evaluate(({ mode, saved }) => window.snapshotScenario(mode, saved), {
      mode,
      saved: a.before,
    });
    expect(b.before).toEqual(a.before);
    expect(b.events).toEqual(a.events);
    expect(b.after).toEqual(a.after);
    expect(a.stable && b.stable).toBe(true);
  });
}

test('恢复冻结：真实物理和子弹寿命停住；暂停中断重新计时并清掉已锁存边沿', async ({ page }, info) => {
  await page.goto(`${url}/demo.html`);
  await page.waitForFunction(() => window.resumeFreeze);
  await page.evaluate(() => window.resumeFreeze());
  const before = await page.evaluate(() => window.resumeTick());
  expect(before.physics.bullets.slots.some((s) => s)).toBe(true);
  await expect.poll(() => page.evaluate(() => window.resumeTick().remaining)).toBeLessThan(2.2);
  const frozen = await page.evaluate(() => window.resumeTick());
  expect(frozen.world).toEqual(before.world);
  expect(frozen.physics).toEqual(before.physics);
  await page
    .locator('canvas')
    .first()
    .screenshot({ path: info.outputPath('resume-countdown.png') });
  await page.evaluate(() => window.resumeManual(true));
  await page.waitForTimeout(300);
  await page.evaluate(() => window.resumeManual(false));
  expect((await page.evaluate(() => window.resumeTick())).remaining).toBeGreaterThan(2.8);
  await page.waitForTimeout(1500);
  expect((await page.evaluate(() => window.resumeTick())).physics).toEqual(before.physics);
  await expect.poll(() => page.evaluate(() => window.resumeTick().remaining)).toBe(0);
  const after = await page.evaluate(() => window.resumeTick());
  expect(after.world.time).toBeGreaterThan(before.world.time);
  expect(after.world.resources.skillRemaining).toBe(0);
  expect(after.world.player!.weaponId).toBe('shotgun_fan');
});

test('满级天赋四个出口按钮均可选；换层保留 runId 和天赋并完整通关', async ({ page }) => {
  const talents = Object.fromEntries(Object.entries(TALENTS).map(([id, n]) => [id, n.costs.length]));
  await page.evaluate(
    (talents) =>
      sessionStorage.setItem(
        'fixture.checkpoint',
        JSON.stringify({
          version: 2,
          seed: 42,
          runId: 'full-talent-test',
          talents,
          floor: 1,
          upgrades: [],
          secondary: null,
          equipped: 'pistol_basic',
          hp: 9,
          armor: 7,
          energy: 250,
          coins: 3,
          kills: 0,
          roomsCleared: 0,
          elapsed: 0,
        }),
      ),
    talents,
  );
  await page.goto(`${url}/demo.html`);
  await page.waitForFunction(() => window.demoScenario);
  await page.evaluate(() => window.demoScenario(true));
  await expect(page.locator('[data-choice]:visible')).toHaveCount(4);
  await page.locator('[data-choice="3"]').click();
  expect(await page.evaluate(() => window.floorCheckpoint())).toMatchObject({
    floor: 2,
    runId: 'full-talent-test',
    talents,
  });
  const result = await page.evaluate(() => window.demoScenario());
  expect(result.phase).toBe('won');
  expect(result.childrenStable).toBe(true);
});
