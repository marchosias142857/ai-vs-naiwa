import type { Scene } from 'phaser';
import { recordResult } from '../../services/profile';
import { clearSavedRun, writeSavedRun } from '../save/runStorage';
import { SAVE_REQUEST } from '../world/combatPause';
import type { DemoSession } from './DemoSession';

/** 唯一同步保存入口；监听安装在 session 完整恢复之后，shutdown 前主动请求保存。 */
export class RunPersistence {
  private floor = 0;
  private ended = false;
  saved = true;
  constructor(
    scene: Scene,
    private readonly session: DemoSession,
  ) {
    scene.game.events.on(SAVE_REQUEST, this.save);
    scene.events.once('shutdown', () => scene.game.events.off(SAVE_REQUEST, this.save));
  }
  private finish(): void {
    clearSavedRun();
    if (this.ended) return;
    this.ended = true;
    const d = this.session.dungeon;
    recordResult(d.phase === 'won', d.floor, d.kills);
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
