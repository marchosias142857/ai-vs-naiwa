import { CHECKPOINT_KEY, recordResult } from '../../services/profile';
import { removeValue, saveValue } from '../../services/storage';
import type { DemoSession } from './DemoSession';

/** 只在入口变化/结束时写盘；帧循环不序列化局内状态。 */
export class RunPersistence {
  private floor = 0;
  private ended = false;
  saved = true;
  constructor(private readonly session: DemoSession) {}
  update(): void {
    const s = this.session,
      d = s.dungeon;
    if (d.finished) {
      if (!this.ended) {
        this.ended = true;
        removeValue(CHECKPOINT_KEY);
        recordResult(d.phase === 'won', d.floor, d.kills);
      }
    } else if (d.floor !== this.floor) {
      this.floor = d.floor;
      this.saved = saveValue(CHECKPOINT_KEY, s.checkpoint());
    }
  }
}
