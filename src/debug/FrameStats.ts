/** 固定直方图，不保存无限增长的逐帧数组。所有数值为压测统计口径，非玩法参数。 */
export class FrameStats {
  private readonly histogram = new Uint32Array(1001);
  frames = 0;
  milliseconds = 0;
  worstMs = 0;
  drawTotal = 0;
  drawMax = 0;
  private secondMs = 0;
  private secondFrames = 0;
  private slowestSecond = Infinity;
  record(ms: number, draws: number): void {
    if (!(ms > 0) || !Number.isFinite(ms)) return;
    this.frames++;
    this.milliseconds += ms;
    this.worstMs = Math.max(this.worstMs, ms);
    this.drawTotal += draws;
    this.drawMax = Math.max(this.drawMax, draws);
    this.histogram[Math.min(this.histogram.length - 1, Math.ceil(ms))]!++;
    this.secondMs += ms;
    this.secondFrames++;
    if (this.secondMs >= 1000) {
      this.slowestSecond = Math.min(this.slowestSecond, (this.secondFrames * 1000) / this.secondMs);
      this.secondMs = this.secondFrames = 0;
    }
  }
  reset(): void {
    this.histogram.fill(0);
    this.frames = this.milliseconds = this.worstMs = this.drawTotal = this.drawMax = 0;
    this.secondMs = this.secondFrames = 0;
    this.slowestSecond = Infinity;
  }
  snapshot() {
    let count = 0,
      p95Ms = 0;
    for (; p95Ms < this.histogram.length - 1; p95Ms++) {
      count += this.histogram[p95Ms]!;
      if (count >= Math.ceil(this.frames * 0.95)) break;
    }
    return {
      frames: this.frames,
      seconds: this.milliseconds / 1000,
      averageFps: this.frames ? (this.frames * 1000) / this.milliseconds : 0,
      minFrameFps: this.worstMs ? 1000 / this.worstMs : 0,
      minSecondFps: Number.isFinite(this.slowestSecond) ? this.slowestSecond : null,
      p95Ms,
      worstMs: this.worstMs,
      drawAverage: this.frames ? this.drawTotal / this.frames : 0,
      drawMax: this.drawMax,
    };
  }
}
