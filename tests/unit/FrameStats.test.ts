import { expect, it } from 'vitest';
import { FrameStats } from '../../src/debug/FrameStats';
it('帧率按真实间隔计算，保留慢帧、最低秒均、draw call 和有界 p95', () => {
  const stats = new FrameStats();
  for (let i = 0; i < 50; i++) stats.record(20, 4);
  stats.record(100, 10);
  const s = stats.snapshot();
  expect(s.frames).toBe(51);
  expect(s.averageFps).toBeCloseTo(51 / 1.1);
  expect(s.minFrameFps).toBe(10);
  expect(s.minSecondFps).toBeCloseTo(50);
  expect(s.p95Ms).toBe(20);
  expect(s.drawMax).toBe(10);
  expect(s.drawAverage).toBeCloseTo(210 / 51);
  stats.record(NaN, 1);
  expect(stats.frames).toBe(51);
  stats.reset();
  expect(stats.snapshot()).toMatchObject({ frames: 0, averageFps: 0, p95Ms: 0, drawMax: 0 });
});
