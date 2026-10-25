import { placeUi } from '../../services/uiLayout';
import { t } from '../../i18n/t';
/** 固定 DOM 状态条，4 Hz 只写文本与比例，不创建元素。 */
export class Vitals {
  readonly root = document.createElement('div');
  private readonly bars = (['health', 'armor', 'energy'] as const).map((kind) => {
    const row = document.createElement('div'),
      fill = document.createElement('i'),
      label = document.createElement('span');
    row.className = `vital vital-${kind}`;
    row.setAttribute('role', 'meter');
    row.append(fill, label);
    this.root.append(row);
    return { row, fill, label, kind };
  });
  constructor() {
    this.root.className = 'demo-vitals';
  }
  layout(width: number, height: number): void {
    for (const b of this.bars) placeUi(b.row, b.kind, width, height);
  }
  update(
    hp: number,
    maxHp: number,
    armor: number,
    maxArmor: number,
    energy: number,
    maxEnergy: number,
  ): void {
    this.set(0, t('hud.health'), hp, maxHp);
    this.set(1, t('hud.armor'), armor, maxArmor);
    this.set(2, t('hud.energy'), Math.floor(energy), maxEnergy);
  }
  private set(index: number, name: string, value: number, max: number): void {
    const b = this.bars[index]!;
    b.fill.style.width = `${max ? Math.max(0, Math.min(1, value / max)) * 100 : 0}%`;
    b.label.textContent = `${name} ${value}/${max}`;
    b.row.setAttribute('aria-label', name);
    b.row.setAttribute('aria-valuemin', '0');
    b.row.setAttribute('aria-valuemax', String(max));
    b.row.setAttribute('aria-valuenow', String(value));
  }
}
