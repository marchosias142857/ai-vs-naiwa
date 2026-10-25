import { UI_LAYOUT_CHANGED } from '../../services/uiLayout';
import { Vitals } from './Vitals';
import { guardGameUi } from './guardGameUi';
import { LOOT_RULES } from '../../data/loot';
import { WEAPONS } from '../../data/weapons';
import { t, type TextKey } from '../../i18n/t';
import { MenuNavigation } from './MenuNavigation';
import type { Scene } from 'phaser';
import { DUNGEON } from '../../data/dungeon';
import { UPGRADES } from '../../data/player';
import type { DemoSession } from '../systems/DemoSession';
import { weaponLabel } from './labels';
import './demo.css';
import './layout.css';

/** 战斗 HUD：固定 DOM 对象；只有计数文字按 4 Hz 刷新，小地图只在房间状态变化时画。 */
export class DemoHud {
  saveAvailable = true;
  private readonly root = document.createElement('div');
  private readonly vitals = new Vitals();
  private readonly statusText = document.createElement('div');
  private readonly status = document.createElement('div');
  private readonly hint = document.createElement('div');
  private readonly map = document.createElement('canvas');
  private readonly mapToggle = document.createElement('button');
  private readonly modal = document.createElement('section');
  private readonly title = document.createElement('h2');
  private readonly detail = document.createElement('p');
  private readonly choices: HTMLButtonElement[] = [];
  private readonly restart = document.createElement('button');
  private readonly menu = document.createElement('button');
  private readonly shop = document.createElement('button');
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
    this.status.append(this.statusText);
    this.hint.className = 'demo-hint';
    this.map.className = 'demo-map';
    this.map.id = 'room-map';
    this.map.width = this.map.height = 80;
    this.map.hidden = true;
    this.mapToggle.className = 'demo-map-toggle';
    this.mapToggle.type = 'button';
    this.mapToggle.textContent = t('hud.map');
    this.mapToggle.setAttribute('aria-controls', this.map.id);
    this.mapToggle.setAttribute('aria-expanded', 'false');
    this.mapToggle.addEventListener(
      'click',
      () => {
        this.map.hidden = !this.map.hidden;
        this.mapToggle.setAttribute('aria-expanded', String(!this.map.hidden));
        this.mapToggle.blur();
      },
      { signal: this.abort.signal },
    );
    this.modal.className = 'demo-dialog';
    this.modal.setAttribute('aria-label', t('hud.dialog'));
    this.modal.append(this.title, this.detail);
    for (let i = 0; i < LOOT_RULES.upgradeChoices; i++) {
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
    this.shop.id = 'buy-supplies';
    this.shop.type = 'button';
    this.shop.addEventListener(
      'click',
      () => {
        this.session.buySupplies();
        this.refresh = Infinity;
      },
      { signal: this.abort.signal },
    );
    this.modal.append(this.shop, this.restart, this.menu);
    this.root.append(this.vitals.root, this.status, this.mapToggle, this.map, this.hint, this.modal);
    guardGameUi(this.root, scene, this.abort.signal);
    document.body.append(this.root);
    this.layout();
    scene.scale.on('resize', this.layout);
    window.addEventListener('resize', this.layout, { signal: this.abort.signal });
    window.addEventListener(UI_LAYOUT_CHANGED, this.layout, { signal: this.abort.signal });
    window.addEventListener(
      'keydown',
      (e) => {
        if (!scene.game.input.enabled || this.mode === 'none' || e.repeat || session.pause.has('manual'))
          return;
        if (e.key === 'Escape') {
          if (this.mode === 'offer') return;
          e.preventDefault();
          e.stopImmediatePropagation();
          return;
        }
        if (this.mode === 'offer' && /^[1-8]$/.test(e.key)) this.choose(Number(e.key) - 1);
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
    this.vitals.layout(r.width, r.height);
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
    this.root.classList.toggle('touch-layout', s.inputScene.controls.touchVisible);
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
        if (id) {
          const upgrade = UPGRADES[id],
            percent = upgrade.display === 'percent';
          button.textContent = `${i + 1}. ${t(upgrade.name as TextKey)} +${percent ? Math.round(upgrade.amount * 100) : upgrade.amount}${percent ? '%' : ''}`;
        }
      }
      this.restart.hidden = this.menu.hidden = mode !== 'result';
      this.shop.hidden = mode !== 'offer';
    }
    this.modal.hidden = mode === 'none' || s.pause.has('manual');
    this.navigation.update(mode !== 'none' && !s.pause.has('manual'));
    this.refresh += deltaMs;
    if (this.refresh < 250) return;
    this.refresh = 0;
    this.shop.textContent = t('shop.supplies', {
      price: LOOT_RULES.shopPrice,
      health: LOOT_RULES.shopHealth,
      energy: LOOT_RULES.shopEnergy,
    });
    this.shop.disabled =
      r.coins < LOOT_RULES.shopPrice || ((p?.hp ?? 0) >= (p?.maxHp ?? 0) && r.energy >= r.maxEnergy);
    this.vitals.update(p?.hp ?? 0, p?.maxHp ?? 0, r.armor, r.maxArmor, r.energy, r.maxEnergy);
    this.statusText.textContent =
      t('hud.coins', { coins: r.coins }) +
      ' · ' +
      t('hud.compactProgress', {
        floor: d.floor,
        floors: DUNGEON.floors + 1,
        state: d.locked ? t('hud.fighting', { wave: d.wave, alive: d.alive }) : t('hud.explore'),
        skill: r.skillRemaining > 0 ? `${Math.ceil(r.skillRemaining)}s` : t('hud.ready'),
      });
    this.statusText.textContent += '\n' + weaponLabel(s.sim.weaponId);
    this.statusText.title = t('hud.slots', {
      primary: weaponLabel('pistol_basic'),
      secondary: s.sim.secondaryWeapon ? weaponLabel(s.sim.secondaryWeapon) : t('hud.empty'),
    });
    const controls = s.inputScene.controls;
    const device =
      controls?.frame.source === 'gamepad' ? 'gamepad' : controls?.touchVisible ? 'touch' : 'keyboard';
    this.hint.textContent = d.finished
      ? ''
      : t(
          d.room.kind === 'start'
            ? `hint.start.${device}`
            : d.room.kind === 'exit'
              ? `hint.exit.${device}`
              : d.room.kind === 'chest'
                ? `hint.chest.${device}`
                : d.locked
                  ? `hint.fight.${device}`
                  : 'hint.clear',
        );
    for (const slot of s.loot.slots)
      if (
        slot.active &&
        slot.room === s.loot.room &&
        slot.kind === 'weapon' &&
        p &&
        Math.hypot(slot.x - p.x, slot.y - p.y) <= LOOT_RULES.weaponRadius
      ) {
        const w = WEAPONS[slot.weapon];
        this.hint.textContent = t(`hint.weapon.${device}`, {
          weapon: weaponLabel(slot.weapon),
          damage: w.damage,
          pellets: w.pellets,
          cost: w.energyCost,
        });
        break;
      }
    for (const actor of s.sim.actors)
      if (actor.kind === 'naiwa_boss' && actor.phase !== 'dead') {
        this.statusText.textContent += '\n' + t('hud.boss', { hp: Math.ceil(actor.hp), maxHp: actor.maxHp });
        break;
      }
    if (!d.finished && r.energy < WEAPONS[s.sim.weaponId].energyCost)
      this.hint.textContent = t('hint.noEnergy');
    if (!this.saveAvailable) this.hint.textContent = t('save.unavailable');
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
