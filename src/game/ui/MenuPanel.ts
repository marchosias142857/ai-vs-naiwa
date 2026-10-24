import { MenuNavigation } from './MenuNavigation';
import type { Scene } from 'phaser';
import { CHECKPOINT_KEY, readProfile } from '../../services/profile';
import { loadValue } from '../../services/storage';
import { parseCheckpoint } from '../../sim/run/checkpoint';
import './demo.css';

/** 灰盒功能菜单；正式版式待画面方案。 */
export class MenuPanel {
  private readonly root = document.createElement('section');
  private readonly navigation: MenuNavigation;
  private readonly abort = new AbortController();
  constructor(scene: Scene) {
    const checkpoint = parseCheckpoint(loadValue(CHECKPOINT_KEY)),
      profile = readProfile();
    this.root.id = 'demo-menu-panel';
    this.root.className = 'demo-dialog';
    const title = document.createElement('h2');
    title.textContent = 'AI 大战奶蛙';
    const subtitle = document.createElement('p');
    subtitle.textContent = 'AI VS NAIWA · 地牢冒险';
    const start = document.createElement('button');
    start.id = 'start-run';
    start.textContent = '开始新一局';
    const resume = document.createElement('button');
    resume.id = 'continue-run';
    resume.textContent = checkpoint ? `继续第 ${checkpoint.floor} 层（从入口恢复）` : '暂无进行中的冒险';
    resume.disabled = !checkpoint;
    const help = document.createElement('p');
    help.textContent = '穿过房门，清理敌人，寻找武器与出口。通过三层地牢，击败终层 Boss。';
    const controls = document.createElement('p');
    controls.className = 'menu-controls';
    controls.textContent =
      '键鼠：WASD 移动 · 鼠标射击 · Space 冲刺 · Q 切枪 · E 拾取\n触屏：左摇杆移动 · 右按钮自动射击 · 下方技能/切枪/拾取\n手柄：左杆移动 · RT 射击 · B 冲刺 · Y 切枪 · A 拾取 · Start 暂停';
    const stats = document.createElement('p');
    stats.textContent = `已完成 ${profile.runs} 局 · 通关 ${profile.wins} 次 · 总击杀 ${profile.kills}`;
    const note = document.createElement('small');
    note.textContent = '灰盒试玩 · 每层入口自动保存 · 可离线游玩';
    start.addEventListener('click', () => scene.scene.start('Game', {}), { signal: this.abort.signal });
    resume.addEventListener(
      'click',
      () => {
        if (checkpoint) scene.scene.start('Game', { checkpoint });
      },
      { signal: this.abort.signal },
    );
    this.root.append(title, subtitle, start, resume, help, controls, stats, note);
    document.body.append(this.root);
    this.navigation = new MenuNavigation(this.root, scene);
    window.addEventListener(
      'keydown',
      (e) => {
        if (e.repeat || e.target instanceof HTMLButtonElement) return;
        if (e.key === 'Enter') scene.scene.start('Game', {});
      },
      { signal: this.abort.signal },
    );
    scene.events.once('shutdown', () => {
      this.abort.abort();
      this.root.remove();
    });
  }
  update(): void {
    this.navigation.update(true);
  }
}
