import type { Scene } from 'phaser';
import { TALENTS, type TalentId } from '../../data/talents';
import { availablePoints } from '../../sim/meta/profile';
import { nextCost, unlockBlock } from '../../sim/meta/talents';
import { t, type TextKey } from '../../i18n/t';
import { changeTalent, readProfile } from '../save/metaProfile';
import type { PauseState } from '../world/PauseState';
import { MenuNavigation } from './MenuNavigation';
import './talents.css';

const ids = Object.keys(TALENTS) as TalentId[];
const point = (id: TalentId) => ({ x: 50 + TALENTS[id].lane * 25, y: 114 - TALENTS[id].tier * 32 });
/** DOM 节点仅创建一次，选择/购买时刷新；没有逐帧布局或特效分配。 */
export class TalentPanel {
  readonly root = document.createElement('section');
  private readonly balance = document.createElement('strong');
  private readonly detail = document.createElement('div');
  private readonly message = document.createElement('p');
  private readonly buy = document.createElement('button');
  private readonly reset = document.createElement('button');
  private readonly cancel = document.createElement('button');
  private readonly nodes = new Map<TalentId, HTMLButtonElement>();
  private readonly navigation: MenuNavigation;
  private selected: TalentId = ids[0]!;
  private confirming = false;
  constructor(
    private readonly pause: PauseState,
    ui: Scene,
    signal: AbortSignal,
    close: () => void,
  ) {
    this.root.id = 'talent-panel';
    this.root.className = 'demo-dialog';
    this.root.hidden = true;
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');
    this.root.setAttribute('aria-labelledby', 'talent-title');
    const header = document.createElement('header'),
      title = document.createElement('h2');
    title.id = 'talent-title';
    title.textContent = t('talent.title');
    const back = document.createElement('button');
    back.id = 'talent-close';
    back.textContent = t('hub.cancel');
    back.addEventListener('click', close, { signal });
    this.reset.id = 'talent-reset';
    this.reset.addEventListener(
      'click',
      () => {
        if (!this.confirming) {
          this.confirming = true;
          this.refresh();
          return;
        }
        this.change('reset');
      },
      { signal },
    );
    this.cancel.id = 'talent-reset-cancel';
    this.cancel.textContent = t('hub.cancel');
    this.cancel.addEventListener(
      'click',
      () => {
        this.confirming = false;
        this.refresh();
      },
      { signal },
    );
    header.append(title, this.balance, this.reset, this.cancel, back);
    const tree = document.createElement('div');
    tree.className = 'talent-tree';
    for (const branch of new Set(ids.map((id) => TALENTS[id].branch))) {
      const section = document.createElement('section'),
        heading = document.createElement('h3'),
        grid = document.createElement('div');
      section.dataset.branch = branch;
      heading.textContent = t(`talent.branch.${branch}`);
      grid.className = 'talent-branch';
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 100 100');
      svg.setAttribute('preserveAspectRatio', 'none');
      svg.setAttribute('aria-hidden', 'true');
      grid.append(svg);
      for (const id of ids.filter((id) => TALENTS[id].branch === branch)) {
        const node = TALENTS[id],
          pos = point(id),
          button = document.createElement('button');
        for (const requirement of node.requires) {
          const from = point(requirement.id),
            line = document.createElementNS(svg.namespaceURI, 'line');
          for (const [attr, value] of Object.entries({ x1: from.x, y1: from.y, x2: pos.x, y2: pos.y }))
            line.setAttribute(attr, String(value));
          svg.append(line);
        }
        button.dataset.talent = id;
        button.style.left = `${pos.x}%`;
        button.style.top = `${pos.y}%`;
        button.addEventListener(
          'click',
          () => {
            this.selected = id;
            this.confirming = false;
            this.refresh();
          },
          { signal },
        );
        this.nodes.set(id, button);
        grid.append(button);
      }
      section.append(heading, grid);
      tree.append(section);
    }
    const footer = document.createElement('footer'),
      action = document.createElement('div');
    this.buy.id = 'talent-buy';
    this.buy.addEventListener('click', () => this.change(this.selected), { signal });
    this.message.id = 'talent-message';
    this.message.setAttribute('role', 'status');
    action.append(this.buy, this.message);
    footer.append(this.detail, action);
    this.root.append(header, tree, footer);
    this.navigation = new MenuNavigation(this.root, ui);
    window.addEventListener(
      'keydown',
      (e) => {
        if (this.root.hidden || this.pause.has('manual') || !ui.game.input.enabled) return;
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopImmediatePropagation();
          if (this.confirming) {
            this.confirming = false;
            this.refresh();
          } else close();
        } else if (e.key === 'Tab') {
          const buttons = [...this.root.querySelectorAll('button')].filter(
            (b) => !b.disabled && b.getClientRects().length,
          );
          const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
          e.preventDefault();
          e.stopImmediatePropagation();
          buttons[(index + (e.shiftKey ? -1 : 1) + buttons.length) % buttons.length]?.focus();
        }
      },
      { signal, capture: true },
    );
  }
  open(): void {
    this.confirming = false;
    this.root.hidden = false;
    this.refresh();
    this.nodes.get(this.selected)!.focus();
  }
  private change(id: TalentId | 'reset'): void {
    const result = changeTalent(id);
    this.confirming = false;
    this.refresh();
    this.message.textContent = t(result.error ? `talent.block.${result.error}` : 'talent.saved');
  }
  private refresh(): void {
    const { profile } = readProfile(),
      points = availablePoints(profile);
    this.balance.id = 'talent-balance';
    this.balance.textContent = t('talent.balance', { points });
    this.reset.textContent = t(this.confirming ? 'talent.confirmReset' : 'talent.reset');
    this.reset.disabled = Object.keys(profile.talents).length === 0;
    this.cancel.hidden = !this.confirming;
    this.message.textContent = this.confirming ? t('talent.resetWarning') : t('talent.nextRun');
    for (const [id, button] of this.nodes) {
      const node = TALENTS[id],
        rank = profile.talents[id] ?? 0;
      const block = unlockBlock(profile.talents, points, id);
      button.dataset.state = block ?? 'available';
      button.setAttribute('aria-pressed', String(id === this.selected));
      button.textContent = `${t(node.name)}\n${rank}/${node.costs.length} · ${block === 'maxed' ? t('talent.block.maxed') : t('talent.cost', { points: nextCost(profile.talents, id) ?? 0 })}`;
    }
    const node = TALENTS[this.selected],
      rank = profile.talents[this.selected] ?? 0;
    const amount = (r: number) =>
      String(Number((node.amount * r * (node.display === 'percent' ? 100 : 1)).toFixed(2)));
    const block = unlockBlock(profile.talents, points, this.selected);
    const name = document.createElement('strong'),
      effect = document.createElement('p'),
      requires = document.createElement('p');
    name.textContent = t(node.name);
    const total = (r: number) => `+${amount(r)}${node.display === 'percent' ? '%' : ''}`;
    effect.textContent = `${t(node.desc as TextKey, { amount: amount(1) })} · ${t('talent.effects', {
      current: total(rank),
      next: rank === node.costs.length ? t('talent.block.maxed') : total(rank + 1),
    })}`;
    requires.textContent = t('talent.requires', {
      nodes: node.requires.map((r) => `${t(TALENTS[r.id].name)} ${r.rank}`).join(' · ') || t('talent.none'),
    });
    this.detail.replaceChildren(name, effect, requires);
    this.buy.disabled = !!block || this.confirming;
    this.buy.textContent = block
      ? t(`talent.block.${block}`)
      : t('talent.unlock', { points: nextCost(profile.talents, this.selected) ?? 0 });
  }
  update(): void {
    this.root.style.visibility = this.pause.has('manual') ? 'hidden' : '';
    this.navigation.update(!this.root.hidden && !this.pause.has('manual'));
  }
}
