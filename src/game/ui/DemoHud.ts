import { t, type TextKey } from '../../i18n/t';
import { MenuNavigation } from './MenuNavigation';
import type { Scene } from 'phaser';
import { DUNGEON } from '../../data/dungeon';
import { UPGRADES } from '../../data/player';
import type { WeaponId } from '../../data/weapons';
import type { DemoSession } from '../systems/DemoSession';
import { weaponLabel } from './labels';
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
    this.modal.setAttribute('aria-label', t('hud.dialog'));
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
    this.restart.textContent = t('hud.restart');
    this.menu.textContent = t('hud.menu');
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
        mode === 'offer' ? t('hud.upgrade') : d.phase === 'won' ? t('hud.won') : t('hud.lost');
      this.detail.textContent =
        mode === 'offer'
          ? t('hud.choose')
          : t('hud.result', {
              floor: d.floor,
              rooms: d.roomsCleared,
              kills: d.kills,
              coins: r.coins,
              seconds: Math.floor(d.elapsed),
            });
      for (let i = 0; i < this.choices.length; i++) {
        const button = this.choices[i]!,
          id = s.offers[i];
        button.hidden = mode !== 'offer' || !id;
        if (id) button.textContent = `${i + 1}. ${t(UPGRADES[id].name as TextKey)}`;
      }
      this.restart.hidden = this.menu.hidden = mode !== 'result';
    }
    this.navigation.update(mode !== 'none');
    this.refresh += deltaMs;
    if (this.refresh < 250) return;
    this.refresh = 0;
    this.status.textContent =
      t('hud.resources', {
        hp: p?.hp ?? 0,
        maxHp: p?.maxHp ?? 0,
        armor: r.armor,
        maxArmor: r.maxArmor,
        energy: Math.floor(r.energy),
        maxEnergy: r.maxEnergy,
        coins: r.coins,
      }) +
      '\n' +
      t('hud.progress', {
        floor: d.floor,
        floors: DUNGEON.floors + 1,
        state: d.locked ? t('hud.fighting', { wave: d.wave, alive: d.alive }) : t('hud.explore'),
        weapon: weaponLabel(s.sim.weaponId as WeaponId),
        skill: r.skillRemaining > 0 ? `${Math.ceil(r.skillRemaining)}s` : t('hud.ready'),
      });
    this.hint.textContent = d.finished
      ? ''
      : t(
          d.room.kind === 'start'
            ? 'hint.start'
            : d.room.kind === 'exit'
              ? 'hint.exit'
              : d.room.kind === 'chest'
                ? 'hint.chest'
                : d.locked
                  ? 'hint.fight'
                  : 'hint.clear',
        );
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
