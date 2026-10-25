import type { Scene } from 'phaser';
import { summarizeRun } from '../../sim/meta/profile';
import { settleProfile, type Settlement } from '../save/metaProfile';
import { clearSavedRun, writeSavedRun } from '../save/runStorage';
import { SAVE_REQUEST } from '../world/combatPause';
import type { DemoSession } from './DemoSession';

/** 唯一同步保存入口；监听安装在 session 完整恢复之后，shutdown 前主动请求保存。 */
export class RunPersistence {
  private floor = 0;
  private ended = false;
  saved = true;
  settlement?: Settlement;
  constructor(
    scene: Scene,
    private readonly session: DemoSession,
  ) {
    scene.game.events.on(SAVE_REQUEST, this.save);
    scene.events.once('shutdown', () => scene.game.events.off(SAVE_REQUEST, this.save));
  }
  private finish(): void {
    if (this.ended) return;
    this.ended = true;
    const summary = summarizeRun(this.session.runId, this.session.dungeon);
    if (summary) this.settlement = settleProfile(summary);
    // 成功先落档案再删冒险；失败保留内存奖励供离开结算后重试，终局仍不可复活。
    clearSavedRun();
  }
  readonly save = (): void => {
    if (this.session.dungeon.finished || this.ended) {
      this.finish();
      return;
    }
    try {
      this.saved = writeSavedRun(this.session.save());
    } catch {
      this.saved = false;
    } // 快照/序列化失败也不能先删旧档。
  };
  update(): void {
    const d = this.session.dungeon;
    if (d.finished) {
      if (!this.ended) this.finish();
    } else if (d.floor !== this.floor) {
      this.floor = d.floor;
      this.save();
    }
  }
}
