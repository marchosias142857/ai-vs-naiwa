"""把负责人绘制的奶怪动作表切成最终 Boss 的游戏帧，输出 public/assets/demo/naiguai-v1.png 与 src/data/naiguaiArt.ts。

用法（仓库根目录）：python3 art-src/naiguai/import_naiguai.py art-src/naiguai/source.png [--preview 目录]

只做裁切、缩放、调色板统一与描边清理，不新增或改画动作。
源图是 4 列 × 3 行：第 1–2 行为 8 帧行走，第 3 行为待机、捧腹、弯腰捧腹、待机。
"""

from __future__ import annotations

import os
import sys

import numpy as np
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
ATLAS = os.path.join(ROOT, "public", "assets", "demo", "naiguai-v1.png")
DATA = os.path.join(ROOT, "src", "data", "naiguaiArt.ts")

# 源图网格：列的横向范围与行的分隔（实测透明间隙）。
COLUMNS = [(46, 381), (410, 731), (742, 1083), (1098, 1428)]
ROWS = [(0, 371), (371, 725), (725, 1086)]
# 游戏内高度：1 个图集像素 = 0.5 世界单位（与大肥鱼同一颗粒密度）；Boss 身高约 52 游戏像素，是主角的三倍多。
TARGET_HEIGHT = 104
SOURCE_HEIGHT = 351
SCALE = TARGET_HEIGHT / SOURCE_HEIGHT
OUTLINE = (52, 26, 14, 255)
PALETTE_SIZE = 24
PAD = 2
CONTRAST = 4.0


def cells(sheet: Image.Image) -> list[Image.Image]:
    out = []
    for r0, r1 in ROWS:
        for c0, c1 in COLUMNS:
            out.append(sheet.crop((c0, r0, c1, r1)))
    return out


def shrink(cell: Image.Image, palette: np.ndarray) -> np.ndarray:
    """先按共用调色板量化原图，再按块取加权众数缩小。

    取众数而不是求平均：眼睛的黑瞳、高光和眼圈这类小面积颜色在缩小后仍保留原色，不会混成灰。
    """
    rgba = np.asarray(cell.convert("RGBA"))
    colors = palette
    flat = rgba[..., :3].reshape(-1, 1, 3).astype(np.int32)
    idx = ((flat - colors[None, :, :].astype(np.int32)) ** 2).sum(2).argmin(1).reshape(rgba.shape[:2])
    opaque = rgba[..., 3] >= 128
    w = max(1, round(cell.width * SCALE))
    h = max(1, round(cell.height * SCALE))
    out = np.zeros((h, w, 4), np.uint8)
    for oy in range(h):
        y0, y1 = int(oy / SCALE), max(int(oy / SCALE) + 1, int((oy + 1) / SCALE))
        for ox in range(w):
            x0, x1 = int(ox / SCALE), max(int(ox / SCALE) + 1, int((ox + 1) / SCALE))
            block = opaque[y0:y1, x0:x1]
            if block.mean() < 0.5:
                continue
            ids = idx[y0:y1, x0:x1][block]
            counts = np.bincount(ids, minlength=len(colors)).astype(np.float64)
            # 与块内平均色差得越远的颜色权重越高：瞳孔、高光、嘴线这类细节优先保留。
            mean = colors[ids].mean(axis=0)
            contrast = np.linalg.norm(colors.astype(np.float64) - mean, axis=1) / 255.0
            out[oy, ox, :3] = colors[(counts * (1 + CONTRAST * contrast)).argmax()]
            out[oy, ox, 3] = 255
    return out


def build_palette(pixels: np.ndarray) -> np.ndarray:
    """在去重后的颜色上做加权 k-means：权重取出现次数的平方根，让眼圈、瞳孔、高光这类少量颜色也分到色位。"""
    q = (pixels // 4).astype(np.int64)
    keys, counts = np.unique(q[:, 0] * 4096 + q[:, 1] * 64 + q[:, 2], return_counts=True)
    uniq = np.stack([keys // 4096, (keys // 64) % 64, keys % 64], axis=1).astype(np.float64) * 4 + 2
    weight = np.sqrt(counts)
    rng = np.random.default_rng(7)
    centers = uniq[rng.choice(len(uniq), PALETTE_SIZE, replace=False, p=weight / weight.sum())]
    for _ in range(40):
        d = ((uniq[:, None, :] - centers[None, :, :]) ** 2).sum(2)
        lab = d.argmin(1)
        for k in range(PALETTE_SIZE):
            sel = lab == k
            if sel.any():
                centers[k] = (uniq[sel] * weight[sel, None]).sum(0) / weight[sel].sum()
    return np.clip(centers.round(), 0, 255).astype(np.uint8)


def edge(mask: np.ndarray) -> np.ndarray:
    inner = mask.copy()
    inner[1:, :] &= mask[:-1, :]
    inner[:-1, :] &= mask[1:, :]
    inner[:, 1:] &= mask[:, :-1]
    inner[:, :-1] &= mask[:, 1:]
    return mask & ~inner


def build(source: str, preview_dir: str | None) -> None:
    sheet = Image.open(source).convert("RGBA")
    raw = cells(sheet)
    # 全部帧共用一份调色板，帧间颜色不闪。
    pixels = np.concatenate([np.asarray(c)[np.asarray(c)[..., 3] >= 128][:, :3] for c in raw])
    palette = build_palette(pixels)
    cleaned = []
    for c in raw:
        out = shrink(c, palette)
        mask = out[..., 3] > 0
        out[edge(mask)] = OUTLINE
        cleaned.append(out)

    # 每帧按脚底对齐：裁到不透明范围，记录脚底中心。
    boxes = []
    for f in cleaned:
        ys, xs = np.where(f[..., 3] > 0)
        boxes.append((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
    width = max(b[2] - b[0] for b in boxes) + 2
    height = max(b[3] - b[1] for b in boxes) + 2
    atlas = Image.new("RGBA", ((width + PAD) * 4, (height + PAD) * 3), (0, 0, 0, 0))
    coords = []
    for i, (f, b) in enumerate(zip(cleaned, boxes)):
        crop = Image.fromarray(f).crop(b)
        # 水平按帧中心、竖直按脚底放进统一大小的格子
        ox = (width - crop.width) // 2
        oy = height - 1 - crop.height
        cx = (i % 4) * (width + PAD)
        cy = (i // 4) * (height + PAD)
        atlas.alpha_composite(crop, (cx + ox, cy + oy))
        coords.append((cx, cy))
    atlas.save(ATLAS, optimize=True)
    # 身体圆心：脚底往上约 0.38 个身高（肚皮中心），与碰撞圆一致。
    pivot = (width / 2, height - 1 - round(TARGET_HEIGHT * 0.38))
    write_data(coords, (width, height), pivot)
    if preview_dir:
        os.makedirs(preview_dir, exist_ok=True)
        big = atlas.resize((atlas.width * 6, atlas.height * 6), Image.NEAREST)
        bg = Image.new("RGBA", big.size, (40, 48, 66, 255))
        bg.alpha_composite(big)
        bg.save(os.path.join(preview_dir, "naiguai.png"))
    print(f"naiguai frames {width}x{height} -> {ATLAS}")


def write_data(coords, size, pivot) -> None:
    def frames(action, ids):
        # 与 Prettier 一致：多于一个元素的二维数组逐行展开。
        ids = list(ids)
        if len(ids) == 1:
            return [f"    {action}: [[{coords[ids[0]][0]}, {coords[ids[0]][1]}]],"]
        return [f"    {action}: [", *(f"      [{coords[i][0]}, {coords[i][1]}]," for i in ids), "    ],"]

    fmt = lambda v: str(int(v)) if float(v).is_integer() else f"{v:g}"  # noqa: E731
    lines = [
        "// 由 art-src/naiguai/import_naiguai.py 生成，不要手改；源图为负责人绘制的奶怪动作表。",
        "import type { MonsterArt } from './schema/art';",
        "",
        "/**",
        " * 最终 Boss 奶怪的逐帧动画（ADR 0030）。只用负责人画的 12 帧：行走 8 帧、待机、捧腹、弯腰捧腹。",
        " * 受击闪白、眩晕星星与死亡演出由表现层的特效补足，不另画奶怪帧。",
        " */",
        "export const NAIGUAI_ART = {",
        f"  size: [{size[0]}, {size[1]}],",
        f"  pivot: {{ x: {fmt(pivot[0])}, y: {fmt(pivot[1])} }},",
        "  scale: 0.5,",
        "  facing: 'left',",
        "  frames: {",
        *frames("idle", [8, 11]),
        *frames("move", range(8)),
        *frames("windup", [10]),
        *frames("attack", [9]),
        *frames("air", [9]),
        *frames("recover", [8]),
        *frames("spin", [9, 10]),
        *frames("death", [10]),
        "  },",
        "  seconds: {",
        "    idle: 0.45,",
        "    move: 0.085,",
        "    windup: 0.2,",
        "    attack: 0.1,",
        "    air: 0.2,",
        "    recover: 0.3,",
        "    spin: 0.12,",
        "    death: 1,",
        "  },",
        "} as const satisfies MonsterArt;",
        "",
    ]
    with open(DATA, "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines))


if __name__ == "__main__":
    src = sys.argv[1]
    out = sys.argv[sys.argv.index("--preview") + 1] if "--preview" in sys.argv else None
    build(src, out)
