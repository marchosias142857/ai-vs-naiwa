import { MenuNavigation } from './MenuNavigation';
import type { Scene } from 'phaser';
import { DUNGEON } from '../../data/dungeon';
import { UPGRADES } from '../../data/player';
import type { WeaponId } from '../../data/weapons';
import type { DemoSession } from '../systems/DemoSession';
import { WEAPON_LABELS } from './labels';
import './demo.css';

/** 灰盒 HUD：固定 DOM 对象；只有计数文字按 4 Hz 刷新，小地图只在房间状态变化时画。 */
export class DemoHud {
  private readonly root = document.createElement('div');
  private readonly status = document.createElement('div');
  private readonly hint = document.createElement('div');
  private readonly map = document.createElement('canvas');
  private readonly modal = document.createElement('section');
  private readonly title = document.createElement('h2');
  private readonly detail = document.createElement('p');
  private readonly choices: HTMLButtonElement[] = [];
  private readonly restart = document.createElement('button');
  private readonly menu = document.createElement('button');
  private readonly abort = new AbortController();
  private refresh = Infinity;
  private mapRevision = -1;
  private mode = 'none';
  private readonly navigation: MenuNavigation;
  constructor(
    private readonly scene: Scene,
    private readonly session: DemoSession,
  ) {
    this.root.id = 'demo-hud';
    this.status.className = 'demo-status';
    this.hint.className = 'demo-hint';
    this.map.className = 'demo-map';
    this.map.width = this.map.height = 80;
    this.modal.className = 'demo-dialog';
    this.modal.setAttribute('aria-label', '局内选择与结算');
    this.modal.append(this.title, this.detail);
    for (let i = 0; i < 3; i++) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.choice = String(i);
      button.addEventListener('click', () => this.choose(i), { signal: this.abort.signal });
      this.choices.push(button);
      this.modal.append(button);
    }
    this.restart.type = this.menu.type = 'button';
    this.restart.textContent = '再来一局 / Enter';
    this.menu.textContent = '返回主菜单';
    this.restart.id = 'demo-restart';
    this.menu.id = 'demo-menu';
    this.restart.addEventListener('click', () => scene.scene.restart({}), { signal: this.abort.signal });
    this.menu.addEventListener('click', () => scene.scene.start('Menu'), { signal: this.abort.signal });
    this.modal.append(this.restart, this.menu);
    this.root.append(this.status, this.map, this.hint, this.modal);
    document.body.append(this.root);
    this.layout();
    scene.scale.on('resize', this.layout);
    window.addEventListener('resize', this.layout, { signal: this.abort.signal });
    window.addEventListener(
      'keydown',
      (e) => {
        if (this.mode === 'none' || e.repeat) return;
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopImmediatePropagation();
          return;
        }
        if (this.mode === 'offer' && /^[123]$/.test(e.key)) this.choose(Number(e.key) - 1);
        else if (this.mode === 'result' && e.key === 'Enter') scene.scene.restart({});
      },
      { signal: this.abort.signal },
    );
    this.modal.hidden = true;
    this.navigation = new MenuNavigation(this.modal, session.inputScene);
  }
  private choose(index: number): void {
    const id = this.session.offers[index];
    if (id) this.session.chooseUpgrade(id);
  }
  private readonly layout = (): void => {
    const r = this.scene.game.canvas.getBoundingClientRect();
    Object.assign(this.root.style, {
      left: `${r.left}px`,
      top: `${r.top}px`,
      width: `${r.width}px`,
      height: `${r.height}px`,
    });
  };
  update(deltaMs: number): void {
    const s = this.session,
      d = s.dungeon,
      p = s.player,
      r = s.sim.resources;
    const mode = s.offers.length ? 'offer' : s.settled ? 'result' : 'none';
    if (mode !== this.mode) {
      this.navigation.update(false);
      this.mode = mode;
      this.modal.hidden = mode === 'none';
      this.title.textContent =
        mode === 'offer' ? '选择一项升级' : d.phase === 'won' ? '通关成功' : '本局结束';
      this.detail.textContent =
        mode === 'offer'
          ? '按 1 / 2 / 3 或点击选择，然后前往下一层'
          : `到达第 ${d.floor} 层 · 清理 ${d.roomsCleared} 间 · 击杀 ${d.kills} · 金币 ${r.coins} · ${Math.floor(d.elapsed)} 秒`;
      for (let i = 0; i < this.choices.length; i++) {
        const button = this.choices[i]!,
          id = s.offers[i];
        button.hidden = mode !== 'offer' || !id;
        if (id) button.textContent = `${i + 1}. ${UPGRADES[id].name}`;
      }
      this.restart.hidden = this.menu.hidden = mode !== 'result';
    }
    this.navigation.update(mode !== 'none');
    this.refresh += deltaMs;
    if (this.refresh < 250) return;
    this.refresh = 0;
    this.status.textContent = `生命 ${p?.hp ?? 0}/${p?.maxHp ?? 0}  护甲 ${r.armor}/${r.maxArmor}  能量 ${Math.floor(r.energy)}/${r.maxEnergy}  金币 ${r.coins}\n第 ${d.floor}/${DUNGEON.floors + 1} 层  ${d.locked ? `战斗 · 第 ${d.wave} 波 · 剩余 ${d.alive}` : '探索'}  ${WEAPON_LABELS[s.sim.weaponId as WeaponId]}  技能 ${r.skillRemaining > 0 ? `${Math.ceil(r.skillRemaining)}s` : '就绪'}`;
    this.hint.textContent = d.finished
      ? ''
      : d.room.kind === 'start'
        ? '沿门口探索 · WASD / 左摇杆移动，鼠标 / RT 射击'
        : d.room.kind === 'exit'
          ? '走到房间中央，按 E / A / 拾取进入下一层'
          : d.room.kind === 'chest'
            ? '靠近武器后按 E / A / 拾取；Q / Y 切枪'
            : d.locked
              ? '消灭全部敌人后开门 · Space / B 冲刺'
              : '房间已清理 · 靠近补给自动拾取';
    if (this.mapRevision !== d.revision) {
      this.drawMap();
      this.mapRevision = d.revision;
    }
  }
  private drawMap(): void {
    const ctx = this.map.getContext('2d');
    if (!ctx) return;
    const d = this.session.dungeon,
      size = this.map.width / DUNGEON.gridSize;
    ctx.clearRect(0, 0, this.map.width, this.map.height);
    ctx.strokeStyle = '#8a93b8';
    for (const r of d.map.rooms)
      if (d.visited[r.id])
        for (const id of r.links) {
          const to = d.map.rooms[id]!;
          ctx.beginPath();
          ctx.moveTo((r.x + 0.5) * size, (r.y + 0.5) * size);
          ctx.lineTo((to.x + 0.5) * size, (to.y + 0.5) * size);
          ctx.stroke();
        }
    for (const r of d.map.rooms) {
      const known = d.visited[r.id] || r.links.some((id) => d.visited[id]);
      if (!known) continue;
      ctx.fillStyle = r.id === d.roomId ? '#7ee8ff' : d.cleared[r.id] ? '#9be86a' : '#59628a';
      ctx.fillRect(r.x * size + 2, r.y * size + 2, size - 4, size - 4);
      ctx.fillStyle = '#0b0d14';
      ctx.font = '9px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(
        r.kind === 'exit' ? '↑' : r.kind === 'chest' ? '?' : r.kind === 'boss' ? 'B' : '',
        (r.x + 0.5) * size,
        (r.y + 0.7) * size,
      );
    }
  }
  destroy(): void {
    this.abort.abort();
    this.scene.scale.off('resize', this.layout);
    this.root.remove();
  }
}
