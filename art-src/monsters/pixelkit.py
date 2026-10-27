"""小型像素画工具：在低分辨率画布上用椭圆、多边形和线条拼形状，最后统一描黑边。

坐标单位是像素，像素中心在 (i + 0.5)。形状函数只返回布尔遮罩，绘制顺序由调用方决定。
只依赖 numpy 与 Pillow，供 build_monsters.py 生成怪物图集。
"""

from __future__ import annotations

import math

import numpy as np
from PIL import Image

OUTLINE = (12, 10, 18, 255)


def rgba(value) -> tuple[int, int, int, int]:
    if isinstance(value, tuple):
        return value if len(value) == 4 else (*value, 255)
    value = value.lstrip("#")
    return (int(value[0:2], 16), int(value[2:4], 16), int(value[4:6], 16), 255)


def mix(a: str, b: str, t: float) -> str:
    ca, cb = rgba(a), rgba(b)
    return "#" + "".join(f"{round(ca[i] + (cb[i] - ca[i]) * t):02x}" for i in range(3))


class Canvas:
    def __init__(self, width: int, height: int, offset=(0, 0)):
        self.w = width
        self.h = height
        self.px = np.zeros((height, width, 4), np.uint8)
        ys, xs = np.mgrid[0:height, 0:width]
        self.offset = offset
        self.x = xs + 0.5 - offset[0]
        self.y = ys + 0.5 - offset[1]

    # ---- 遮罩 ----
    def ellipse(self, cx: float, cy: float, rx: float, ry: float, angle: float = 0.0) -> np.ndarray:
        if rx <= 0 or ry <= 0:
            return np.zeros((self.h, self.w), bool)
        dx = self.x - cx
        dy = self.y - cy
        if angle:
            c, s = math.cos(angle), math.sin(angle)
            dx, dy = dx * c + dy * s, -dx * s + dy * c
        return (dx / rx) ** 2 + (dy / ry) ** 2 <= 1.0

    def circle(self, cx: float, cy: float, r: float) -> np.ndarray:
        return self.ellipse(cx, cy, r, r)

    def rect(self, x0: float, y0: float, x1: float, y1: float) -> np.ndarray:
        return (self.x >= x0) & (self.x < x1) & (self.y >= y0) & (self.y < y1)

    def polygon(self, points) -> np.ndarray:
        inside = np.zeros((self.h, self.w), bool)
        n = len(points)
        for i in range(n):
            x1, y1 = points[i]
            x2, y2 = points[(i + 1) % n]
            if y1 == y2:
                continue
            cond = (self.y >= min(y1, y2)) & (self.y < max(y1, y2))
            xi = x1 + (self.y - y1) * (x2 - x1) / (y2 - y1)
            inside ^= cond & (self.x < xi)
        return inside

    def line(self, x1: float, y1: float, x2: float, y2: float, width: float = 1.0) -> np.ndarray:
        dx, dy = x2 - x1, y2 - y1
        length2 = dx * dx + dy * dy
        if length2 == 0:
            return self.circle(x1, y1, width / 2)
        t = np.clip(((self.x - x1) * dx + (self.y - y1) * dy) / length2, 0, 1)
        return (self.x - (x1 + t * dx)) ** 2 + (self.y - (y1 + t * dy)) ** 2 <= (width / 2) ** 2

    def ring(self, cx: float, cy: float, r: float, width: float = 1.0) -> np.ndarray:
        d = np.hypot(self.x - cx, self.y - cy)
        return (d <= r) & (d > r - width)

    # ---- 绘制 ----
    def fill(self, mask: np.ndarray, color) -> None:
        self.px[mask] = rgba(color)

    def dot(self, x: float, y: float, color) -> None:
        ix, iy = int(math.floor(x + self.offset[0])), int(math.floor(y + self.offset[1]))
        if 0 <= ix < self.w and 0 <= iy < self.h:
            self.px[iy, ix] = rgba(color)

    def shade(self, mask, cx, cy, rx, ry, base, light=None, dark=None, light_at=0.42, dark_at=-0.3):
        """椭圆体三档平涂：左上受光、右下背光（元气骑士式的硬边明暗）。"""
        u = (self.x - cx) / max(rx, 1e-6)
        v = (self.y - cy) / max(ry, 1e-6)
        dot = u * -0.55 + v * -0.8
        self.fill(mask, base)
        if light:
            self.fill(mask & (dot > light_at), light)
        if dark:
            self.fill(mask & (dot < dark_at), dark)

    def blob(self, cx, cy, rx, ry, pal, angle=0.0, light_at=0.42, dark_at=-0.3) -> np.ndarray:
        """常用组合：椭圆 + 三档明暗，返回遮罩。pal = (底, 亮, 暗)。"""
        m = self.ellipse(cx, cy, rx, ry, angle)
        self.shade(m, cx, cy, rx, ry, pal[0], pal[1], pal[2], light_at, dark_at)
        return m

    def clear(self, mask: np.ndarray) -> None:
        self.px[mask] = (0, 0, 0, 0)

    def alpha(self) -> np.ndarray:
        return self.px[:, :, 3] > 0

    def outline(self, color=OUTLINE) -> None:
        """在不透明区域外侧描一圈 1 像素黑边（只看上下左右，边角更圆）。"""
        m = self.alpha()
        grown = m.copy()
        grown[1:, :] |= m[:-1, :]
        grown[:-1, :] |= m[1:, :]
        grown[:, 1:] |= m[:, :-1]
        grown[:, :-1] |= m[:, 1:]
        self.fill(grown & ~m, color)

    def edge(self, mask: np.ndarray, color) -> None:
        """遮罩自身最外一圈改色：在两块颜色之间画内部分隔线。"""
        inner = mask.copy()
        inner[1:, :] &= mask[:-1, :]
        inner[:-1, :] &= mask[1:, :]
        inner[:, 1:] &= mask[:, :-1]
        inner[:, :-1] &= mask[:, 1:]
        self.fill(mask & ~inner, color)

    def image(self) -> Image.Image:
        return Image.fromarray(self.px, "RGBA")


def preview(frames, scale: int = 6, columns: int = 8, bg=(38, 34, 56, 255)) -> Image.Image:
    """多帧排成网格放大预览；深紫底接近元气骑士地牢的地面。"""
    w = max(f.width for f in frames)
    h = max(f.height for f in frames)
    rows = math.ceil(len(frames) / columns)
    sheet = Image.new("RGBA", (columns * (w + 2) * scale, rows * (h + 2) * scale), bg)
    for i, f in enumerate(frames):
        big = f.resize((f.width * scale, f.height * scale), Image.NEAREST)
        sheet.alpha_composite(big, ((i % columns) * (w + 2) * scale + scale, (i // columns) * (h + 2) * scale + scale))
    return sheet
