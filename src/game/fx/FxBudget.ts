import type { Scene } from 'phaser';
import { FX_CULL_MARGIN, FX_LIMITS } from './params';

type Kind = keyof typeof FX_LIMITS;
interface View {
  scrollX: number;
  scrollY: number;
  originX: number;
  originY: number;
  zoomX: number;
  zoomY: number;
  matrix?: { b: number; c: number };
  width: number;
  height: number;
}

/** 预热固定计数器，事件风暴中不排队、不分配对象；不同类别互不挤占。 */
export class FxBudget {
  private readonly used = { spark: 0, burst: 0, chain: 0 };
  accepted = 0;
  dropped = 0;
  culled = 0;
  readonly beginFrame = (): void => {
    this.used.spark = this.used.burst = this.used.chain = 0;
  };
  /** 只判定装饰范围；留量覆盖普通跟随延迟，换房瞬移的边界见 ADR 0033。 */
  visible(view: View, x: number, y: number, radius: number): boolean {
    // Phaser 4.1 的 worldView 按中心原点计算；项目相机原点为 (0,0)，不能直接复用它。
    // 旋转相机不做装饰剔除，避免错误的轴对齐范围隐藏可见反馈。
    if (!view.width || !view.height || view.matrix?.b || view.matrix?.c) return true;
    const width = view.width / view.zoomX,
      height = view.height / view.zoomY;
    const left = view.scrollX + (view.width - width) * view.originX;
    const top = view.scrollY + (view.height - height) * view.originY;
    const r = radius + FX_CULL_MARGIN;
    return x + r >= left && x - r <= left + width && y + r >= top && y - r <= top + height;
  }

  /** 超限直接省略本次装饰，不延后播放，也不消费玩法随机数。 */
  admit(kind: Kind, view: View, x: number, y: number, radius: number): boolean {
    if (!this.visible(view, x, y, radius)) {
      this.culled++;
      return false;
    }
    if (this.used[kind] >= FX_LIMITS[kind]) {
      this.dropped++;
      return false;
    }
    this.used[kind]++;
    this.accepted++;
    return true;
  }
}

const budgets = new WeakMap<Scene, FxBudget>();
/** 同一场景共享预算；多次 WORLD_STEP 追帧仍共用同一渲染帧额度。 */
export function fxBudget(scene: Scene): FxBudget {
  let budget = budgets.get(scene);
  if (!budget) {
    budget = new FxBudget();
    budgets.set(scene, budget);
    const current = budget;
    scene.events.on('preupdate', current.beginFrame);
    scene.events.once('shutdown', () => {
      scene.events.off('preupdate', current.beginFrame);
      budgets.delete(scene);
    });
  }
  return budget;
}
