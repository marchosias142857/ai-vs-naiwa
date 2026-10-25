"""生成房间主题与机关像素图集 public/assets/demo/rooms-v1.png 与帧数据 src/data/roomArt.ts（ADR 0032）。

用法（仓库根目录）：python3 art-src/rooms/build_rooms.py [--preview 输出目录]

三套新楼层主题（沉船货舱、珊瑚深渊、奶池神殿）的地砖、墙砖、障碍块与小摆设，以及五种机关的贴图。
第 1 层继续用原有的海底石殿图（environment.png），这里不重画。
1 个图集像素 = 0.5 个游戏像素：地砖 64 像素 = 32 游戏像素，墙砖 32 像素 = 16 游戏像素，与原房间网格一致。
地砖、墙砖、障碍块、水流和海草都是无缝贴图，可以平铺。
"""

from __future__ import annotations

import math
import os
import sys

HERE = os.path.dirname(__file__)
sys.path.insert(0, os.path.join(HERE, "..", "monsters"))

from PIL import Image  # noqa: E402

from pixelkit import OUTLINE, Canvas, mix, preview  # noqa: E402

ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
ATLAS = os.path.join(ROOT, "public", "assets", "demo", "rooms-v1.png")
DATA = os.path.join(ROOT, "src", "data", "roomArt.ts")
SCALE = 0.5
WHITE = "#f7f4ea"


def tone(base: str, light: float = 0.3, dark: float = 0.35) -> tuple[str, str, str]:
    return (base, mix(base, "#ffffff", light), mix(base, "#14102a", dark))


class Hash:
    """确定性的伪随机，保证每次生成的图一模一样。"""

    def __init__(self, seed: int):
        self.s = seed

    def next(self) -> float:
        self.s = (self.s * 1103515245 + 12345) & 0x7FFFFFFF
        return self.s / 0x7FFFFFFF

    def range(self, a: float, b: float) -> float:
        return a + (b - a) * self.next()


def seamless(size: int, base, draw) -> Image.Image:
    """先在 3 倍大的画布中间作画，再把九宫格叠回一块，越过边缘的部分从对边出来，贴图可以无缝平铺。"""
    big = Canvas(size * 3, size * 3)
    draw(big, size)
    tile = Image.new("RGBA", (size, size), base if isinstance(base, tuple) else (*bytes.fromhex(base[1:]), 255))
    src = big.image()
    for gy in range(3):
        for gx in range(3):
            tile.alpha_composite(src.crop((gx * size, gy * size, gx * size + size, gy * size + size)))
    return tile


# ---------------------------------------------------------------- 沉船货舱


def wreck_floor(alt: bool = False) -> Image.Image:
    wood = ["#7a4a2b", "#83512f", "#6f4227", "#7d4c2c"]

    def draw(c: Canvas, s: int) -> None:
        h = Hash(7 if not alt else 11)
        for row in range(4):
            y0 = s + row * 16
            # 不透明的底色只画在中间一格，否则九宫格叠回时会盖掉接缝。
            c.fill(c.rect(s, y0, 2 * s, y0 + 16), wood[row])
            c.fill(c.rect(s, y0, 2 * s, y0 + 1), mix(wood[row], "#ffffff", 0.18))
            c.fill(c.rect(s, y0 + 15, 2 * s, y0 + 16), "#3a2214")
            seam = s + (row * 23 + 9) % s
            for x in (seam, s + (seam - s + (37 if row % 2 else 29)) % s):
                c.fill(c.rect(x, y0, x + 1, y0 + 16), "#3a2214")
                c.dot(x - 2, y0 + 4, "#2a170c")
                c.dot(x + 2, y0 + 11, "#2a170c")
            # 木纹
            for _ in range(3):
                gx, gy = h.range(s, 2 * s), y0 + h.range(4, 12)
                c.fill(c.line(gx, gy, gx + h.range(6, 14), gy, 0.8), mix(wood[row], "#2a170c", 0.35))
        if alt:
            # 甲板上的金币与一圈绳子
            c.fill(c.ring(s + 32, s + 32, 9, 2.2), "#c9a46a")
            c.fill(c.ring(s + 32, s + 32, 5, 2.2), "#b08a52")
            for x, y in ((s + 14, s + 50), (s + 18, s + 52), (s + 50, s + 14)):
                c.fill(c.circle(x, y, 2), "#f4c542")
                c.dot(x - 1, y - 1, "#ffe58a")

    return seamless(64, "#3a2214", draw)


def wreck_wall() -> Image.Image:
    def draw(c: Canvas, s: int) -> None:
        for row in range(2):
            y0 = s + row * 16
            c.fill(c.rect(s, y0, 2 * s, y0 + 16), "#4a2d1c" if row else "#553422")
            c.fill(c.rect(s, y0, 2 * s, y0 + 2), "#6b4329")
            c.fill(c.rect(s, y0 + 14, 2 * s, y0 + 16), "#24140b")
        # 铁箍与铆钉
        c.fill(c.rect(s + 12, s, s + 16, s + 32), "#5b5f6e")
        c.fill(c.rect(s + 12, s, s + 13, s + 32), "#8a8fa0")
        for y in (s + 4, s + 12, s + 20, s + 28):
            c.dot(s + 14, y, "#c8ccd8")

    return seamless(32, "#24140b", draw)


def wreck_block() -> Image.Image:
    """货箱：每块平铺就是一只箱子，长条障碍会变成一排箱子。"""
    c = Canvas(48, 48)
    wood = tone("#a8713f")
    c.fill(c.rect(0, 0, 48, 48), "#3a2214")
    c.fill(c.rect(2, 2, 46, 46), wood[0])
    for y in (2, 17, 32):
        c.fill(c.rect(2, y, 46, y + 1), wood[1])
        c.fill(c.rect(2, y + 13, 46, y + 14), wood[2])
    c.fill(c.line(5, 5, 43, 43, 4), wood[2])
    c.fill(c.line(5, 5, 43, 43, 2), wood[1])
    c.fill(c.rect(2, 2, 46, 5), "#6d4527")
    c.fill(c.rect(2, 43, 46, 46), "#6d4527")
    for x, y in ((4, 4), (43, 4), (4, 43), (43, 43)):
        c.dot(x, y, "#c8ccd8")
    return c.image()


def wreck_decor():
    out = {}
    # 一卷绳子
    c = Canvas(22, 18)
    for r in (8, 5.5, 3):
        c.fill(c.ring(11, 9, r, 2), "#c9a46a")
    c.fill(c.line(17, 12, 21, 16, 2), "#c9a46a")
    c.outline()
    out["wreck_rope"] = c.image()
    # 一小堆金币
    c = Canvas(20, 14)
    for x, y in ((6, 9), (11, 10), (15, 8), (9, 6), (13, 5)):
        c.fill(c.ellipse(x, y, 3.4, 2.4), "#f4c542")
        c.fill(c.ellipse(x - 0.5, y - 0.6, 2, 1.2), "#ffe58a")
    c.outline()
    out["wreck_coins"] = c.image()
    # 破木板
    c = Canvas(26, 12)
    c.fill(c.polygon([(1, 4), (20, 2), (25, 6), (19, 9), (2, 10)]), "#8a5a34")
    c.fill(c.line(3, 6, 20, 5, 1), "#5a3820")
    c.outline()
    out["wreck_plank"] = c.image()
    return out


# ---------------------------------------------------------------- 珊瑚深渊


def abyss_floor(alt: bool = False) -> Image.Image:
    def draw(c: Canvas, s: int) -> None:
        h = Hash(21 if not alt else 29)
        stones = [(8, 8, 26, 22), (38, 6, 60, 26), (6, 34, 30, 58), (36, 32, 58, 56), (30, 22, 40, 34)]
        for x0, y0, x1, y1 in stones:
            m = c.ellipse(s + (x0 + x1) / 2, s + (y0 + y1) / 2, (x1 - x0) / 2 + 2, (y1 - y0) / 2 + 2)
            # 石块与缝隙的明暗差压低，避免地面比怪物还抢眼。
            c.shade(m, s + (x0 + x1) / 2, s + (y0 + y1) / 2, (x1 - x0) / 2, (y1 - y0) / 2, "#252950", "#2e335f", "#1d203f")
        for _ in range(9):
            x, y = s + h.range(0, 64), s + h.range(0, 64)
            c.dot(x, y, "#5ef0e0" if h.next() < 0.5 else "#9f7cff")
        if alt:
            # 发光的海葵
            for k in range(7):
                a = k * math.tau / 7
                c.fill(c.line(s + 32, s + 34, s + 32 + math.cos(a) * 9, s + 34 + math.sin(a) * 7, 2), "#ff7ac8")
                c.fill(c.circle(s + 32 + math.cos(a) * 9, s + 34 + math.sin(a) * 7, 1.6), "#ffd0f0")
            c.fill(c.circle(s + 32, s + 34, 3), "#ffb0e0")

    return seamless(64, "#191b38", draw)


def abyss_wall() -> Image.Image:
    def draw(c: Canvas, s: int) -> None:
        h = Hash(33)
        for _ in range(7):
            x, y = s + h.range(0, 32), s + h.range(0, 32)
            r = h.range(5, 9)
            m = c.circle(x, y, r)
            c.shade(m, x, y, r, r, "#252a52", "#363d72", "#151832")
        c.fill(c.circle(s + 24, s + 8, 2.4), "#ff7ac8")
        c.fill(c.circle(s + 6, s + 26, 1.8), "#5ef0e0")

    return seamless(32, "#101126", draw)


def abyss_block() -> Image.Image:
    c = Canvas(48, 48)
    rock = tone("#3b3f74")
    c.fill(c.rect(0, 0, 48, 48), "#151832")
    m = c.ellipse(24, 26, 22, 20)
    c.shade(m, 24, 26, 22, 20, *rock)
    # 长在石头上的珊瑚枝
    coral = "#ff6f9e"
    for x0, y0, x1, y1 in ((14, 22, 10, 8), (14, 22, 20, 10), (32, 24, 36, 10), (32, 24, 42, 16)):
        c.fill(c.line(x0, y0, x1, y1, 2.4), coral)
        c.fill(c.circle(x1, y1, 2), "#ffb0c8")
    c.dot(24, 36, "#5ef0e0")
    c.dot(30, 38, "#5ef0e0")
    return c.image()


def abyss_decor():
    out = {}
    c = Canvas(16, 20)
    for x, h in ((4, 14), (8, 18), (12, 12)):
        c.fill(c.line(x, 19, x + (1 if x % 8 else -1), 19 - h, 2), "#2fd1a0")
    c.outline()
    out["abyss_kelp"] = c.image()
    c = Canvas(14, 14)
    c.fill(c.ellipse(7, 9, 5, 4), "#e8e2d0")
    c.fill(c.circle(5, 8, 1.2), OUTLINE)
    c.fill(c.circle(9, 8, 1.2), OUTLINE)
    c.fill(c.rect(5, 11, 9, 12), OUTLINE)
    c.outline()
    out["abyss_skull"] = c.image()
    c = Canvas(14, 18)
    for x, y, r in ((7, 14, 3), (5, 8, 2), (9, 3, 1.5)):
        c.fill(c.ring(x, y, r, 1), "#9fdcff")
        c.dot(x - r * 0.4, y - r * 0.4, WHITE)
    out["abyss_bubbles"] = c.image()
    return out


# ---------------------------------------------------------------- 奶池神殿


def milk_floor(alt: bool = False) -> Image.Image:
    def draw(c: Canvas, s: int) -> None:
        h = Hash(41 if not alt else 47)
        for gy in range(2):
            for gx in range(2):
                x0, y0 = s + gx * 32, s + gy * 32
                cream = "#f3e6c8" if (gx + gy) % 2 == 0 else "#ead9b4"
                c.fill(c.rect(x0 + 1, y0 + 1, x0 + 31, y0 + 31), cream)
                c.fill(c.rect(x0 + 1, y0 + 1, x0 + 31, y0 + 2), "#fff8e6")
                # 大理石纹
                vx = x0 + h.range(4, 28)
                c.fill(c.line(vx, y0 + 3, vx + h.range(-8, 8), y0 + 29, 0.8), "#d8c39a")
        c.fill(c.rect(0, s, s * 3, s + 1), "#c9a046")
        c.fill(c.rect(0, s + 32, s * 3, s + 33), "#c9a046")
        c.fill(c.rect(s, 0, s + 1, s * 3), "#c9a046")
        c.fill(c.rect(s + 32, 0, s + 33, s * 3), "#c9a046")
        if alt:
            # 金色奶滴徽记
            drop = c.circle(s + 32, s + 36, 7) | c.polygon([(s + 26, s + 33), (s + 32, s + 22), (s + 38, s + 33)])
            c.fill(drop, "#e8c25a")
            c.fill(drop & c.circle(s + 30, s + 34, 3), "#fff1b0")

    return seamless(64, "#c9a046", draw)


def milk_wall() -> Image.Image:
    def draw(c: Canvas, s: int) -> None:
        for row in range(2):
            y0 = s + row * 16
            off = 0 if row == 0 else 8
            for k in range(-1, 3):
                x0 = s + off + k * 16
                c.fill(c.rect(x0 + 1, y0 + 1, x0 + 16, y0 + 16), "#e0cfa8")
                c.fill(c.rect(x0 + 1, y0 + 1, x0 + 16, y0 + 3), "#f5ead0")
                c.fill(c.rect(x0 + 1, y0 + 14, x0 + 16, y0 + 16), "#b9a47a")
        c.fill(c.rect(0, s + 15, s * 3, s + 17), "#c9a046")

    return seamless(32, "#8c7650", draw)


def milk_block() -> Image.Image:
    c = Canvas(48, 48)
    c.fill(c.rect(0, 0, 48, 48), "#8c7650")
    m = c.rect(3, 2, 45, 46)
    c.shade(m, 24, 24, 21, 22, "#efe2c0", "#fff8e6", "#cdb98e")
    for y in (8, 38):
        c.fill(c.rect(3, y, 45, y + 3), "#e8c25a")
        c.fill(c.rect(3, y, 45, y + 1), "#fff1b0")
    for x in (12, 24, 36):
        c.fill(c.rect(x, 12, x + 2, 37), "#d8c39a")
    return c.image()


def milk_decor():
    out = {}
    c = Canvas(24, 14)
    c.fill(c.ellipse(12, 8, 11, 5), "#fffbef")
    c.fill(c.ellipse(9, 7, 4, 1.6), WHITE)
    c.outline()
    out["milk_puddle"] = c.image()
    c = Canvas(14, 18)
    c.fill(c.line(7, 17, 7, 8, 1.6), "#4fae5a")
    for k in range(5):
        a = k * math.tau / 5 - math.pi / 2
        c.fill(c.circle(7 + math.cos(a) * 3.2, 6 + math.sin(a) * 3.2, 2.2), "#fff6d0")
    c.fill(c.circle(7, 6, 1.8), "#f4c542")
    c.outline()
    out["milk_flower"] = c.image()
    c = Canvas(16, 16)
    c.fill(c.circle(8, 8, 6), "#f4c542")
    c.fill(c.circle(7, 7, 3.5), "#ffe58a")
    c.fill(c.rect(7, 4, 9, 12), "#b98a22")
    c.outline()
    out["milk_coin"] = c.image()
    return out


# ---------------------------------------------------------------- 机关


def spikes(state: str) -> Image.Image:
    """海胆刺板：收起只看到孔，预警时孔发红、刺尖冒头，刺出时一排白色尖刺。"""
    c = Canvas(32, 32)
    plate = c.rect(1, 1, 31, 31)
    c.shade(plate, 16, 16, 15, 15, "#5a5e78", "#777c98", "#3c3f54")
    c.fill(c.rect(1, 1, 31, 2), "#8a8fae")
    for gy in range(2):
        for gx in range(2):
            x, y = 8 + gx * 16, 9 + gy * 15
            hole = "#ff5d73" if state == "warn" else "#1a1b28"
            c.fill(c.ellipse(x, y + 3, 4, 2), hole)
            if state == "warn":
                c.fill(c.polygon([(x - 1, y + 3), (x, y), (x + 1, y + 3)]), "#e8ecf8")
            elif state == "up":
                c.fill(c.polygon([(x - 3, y + 4), (x, y - 7), (x + 3, y + 4)]), "#e8ecf8")
                c.fill(c.polygon([(x, y - 7), (x + 3, y + 4), (x + 1, y + 4)]), "#9fa6c0")
    c.outline()
    return c.image()


def current_tile() -> Image.Image:
    """朝右流动的水：浅色水纹 + 白色箭头，横向平铺并滚动。"""

    def draw(c: Canvas, s: int) -> None:
        for y in (s + 6, s + 26):
            c.fill(c.line(s + 2, y, s + 14, y - 2, 1.2), "#bff4ff")
            c.fill(c.line(s + 18, y + 1, s + 30, y - 1, 1.2), "#bff4ff")
        c.fill(c.polygon([(s + 10, s + 11), (s + 22, s + 16), (s + 10, s + 21), (s + 14, s + 16)]), "#ffffff")

    tile = seamless(32, (79, 184, 255, 140), draw)
    return tile


def weed_tile() -> Image.Image:
    """俯视的海草丛：一簇簇深浅绿色的叶片。"""

    def draw(c: Canvas, s: int) -> None:
        h = Hash(57)
        for _ in range(14):
            x, y = s + h.range(0, 32), s + h.range(0, 32)
            a = h.range(-1.2, 1.2) - math.pi / 2
            col = "#2f9e5a" if h.next() < 0.5 else "#46c26e"
            c.fill(c.line(x, y, x + math.cos(a) * 7, y + math.sin(a) * 7, 2.2), col)
            c.dot(x + math.cos(a) * 7, y + math.sin(a) * 7, "#9cf0a8")

    return seamless(32, (31, 102, 64, 170), draw)


def mine(lit: bool) -> Image.Image:
    c = Canvas(30, 30)
    for k in range(8):
        a = k * math.tau / 8
        c.fill(c.line(15 + math.cos(a) * 8, 16 + math.sin(a) * 8, 15 + math.cos(a) * 13, 16 + math.sin(a) * 13, 2), "#5b5f6e")
        c.fill(c.circle(15 + math.cos(a) * 13, 16 + math.sin(a) * 13, 1.5), "#ffd34d" if lit else "#8a8fa0")
    body = c.circle(15, 16, 9)
    c.fill(body, "#bfeaff" if not lit else "#ffb0b8")
    c.fill(c.ring(15, 16, 9, 1.4), "#7fd0ff" if not lit else "#ff5d73")
    c.fill(c.circle(12, 13, 2.6), WHITE)
    c.fill(c.circle(15, 17, 3.4), "#ff5d73" if lit else "#e8414f")
    c.outline()
    return c.image()


def barrel(state: str) -> Image.Image:
    c = Canvas(30, 34)
    if state == "broken":
        for x, y, a in ((7, 26, 0.4), (20, 28, -0.3), (14, 22, 1.2), (24, 20, 0.9)):
            c.fill(c.line(x - math.cos(a) * 5, y - math.sin(a) * 5, x + math.cos(a) * 5, y + math.sin(a) * 5, 3), "#8a2f2f")
        c.fill(c.ellipse(15, 28, 9, 3), "#2a2430")
        c.outline()
        return c.image()
    red = tone("#d0453c")
    body = c.ellipse(15, 18, 12, 14)
    c.shade(body, 15, 18, 12, 14, *red)
    for y in (9, 27):
        c.fill(body & c.rect(0, y, 30, y + 2), "#5b5f6e")
        c.fill(body & c.rect(0, y, 30, y + 1), "#9aa0b4")
    c.fill(c.ellipse(15, 5, 10, 3), "#8a2f2f")
    c.fill(c.ellipse(15, 5, 7, 2), "#3a1618")
    # 鱼骨标志：一看就知道会炸
    c.fill(c.circle(15, 18, 4.4), "#fff1d0")
    c.fill(c.line(11, 18, 19, 18, 1), "#3a1618")
    for x in (13, 15, 17):
        c.fill(c.line(x, 16, x, 20, 1), "#3a1618")
    if state == "hit":
        c.fill(c.line(6, 12, 11, 17, 1.2), "#3a1618")
        c.fill(c.line(11, 17, 9, 23, 1.2), "#3a1618")
        c.fill(c.line(22, 22, 25, 26, 1.2), "#3a1618")
    c.outline()
    return c.image()


# ---------------------------------------------------------------- 打包


def pack(images: dict[str, Image.Image], width: int = 512) -> tuple[Image.Image, dict[str, tuple[int, int, int, int]]]:
    order = sorted(images, key=lambda k: (-images[k].height, k))
    rects: dict[str, tuple[int, int, int, int]] = {}
    x = y = row = 0
    for name in order:
        im = images[name]
        if x + im.width + 2 > width:
            x, y, row = 0, y + row + 2, 0
        rects[name] = (x + 1, y + 1, im.width, im.height)
        x += im.width + 2
        row = max(row, im.height)
    atlas = Image.new("RGBA", (width, y + row + 2), (0, 0, 0, 0))
    for name, (rx, ry, _, _) in rects.items():
        atlas.alpha_composite(images[name], (rx, ry))
    return atlas, rects


def build(preview_dir: str | None = None) -> None:
    images: dict[str, Image.Image] = {
        "wreck_floor": wreck_floor(),
        "wreck_floor_alt": wreck_floor(True),
        "wreck_wall": wreck_wall(),
        "wreck_block": wreck_block(),
        "abyss_floor": abyss_floor(),
        "abyss_floor_alt": abyss_floor(True),
        "abyss_wall": abyss_wall(),
        "abyss_block": abyss_block(),
        "milk_floor": milk_floor(),
        "milk_floor_alt": milk_floor(True),
        "milk_wall": milk_wall(),
        "milk_block": milk_block(),
        "spikes_idle": spikes("idle"),
        "spikes_warn": spikes("warn"),
        "spikes_on": spikes("up"),
        "current": current_tile(),
        "weed": weed_tile(),
        "mine": mine(False),
        "mine_lit": mine(True),
        "barrel": barrel("ok"),
        "barrel_hit": barrel("hit"),
        "barrel_broken": barrel("broken"),
        **wreck_decor(),
        **abyss_decor(),
        **milk_decor(),
    }
    atlas, rects = pack(images)
    atlas.save(ATLAS, optimize=True)
    write_data(rects)
    if preview_dir:
        os.makedirs(preview_dir, exist_ok=True)
        preview(list(images.values()), 5, 6).save(os.path.join(preview_dir, "rooms.png"))
        # 平铺预览：每种地砖铺 3×2，检查接缝
        tiles = ["wreck_floor", "abyss_floor", "milk_floor", "current", "weed"]
        sheet = Image.new("RGBA", (64 * 3 * len(tiles) + 8 * len(tiles), 64 * 2), (20, 18, 32, 255))
        for i, name in enumerate(tiles):
            im = images[name]
            for gy in range(128 // im.height):
                for gx in range(192 // im.width):
                    sheet.alpha_composite(im, (i * (192 + 8) + gx * im.width, gy * im.height))
        sheet.resize((sheet.width * 2, sheet.height * 2), Image.NEAREST).save(os.path.join(preview_dir, "tiles.png"))
    print(f"rooms {atlas.width}x{atlas.height} -> {ATLAS}")


def write_data(rects) -> None:
    lines = [
        "// 由 art-src/rooms/build_rooms.py 生成，不要手改；改画法后重新运行脚本。",
        "",
        "/** 房间主题与机关图集 `demo_rooms` 的帧（ADR 0032）：[x, y, 宽, 高]，图集像素。 */",
        "export const ROOM_ART = {",
    ]
    for name in sorted(rects):
        x, y, w, h = rects[name]
        lines.append(f"  {name}: [{x}, {y}, {w}, {h}],")
    lines += [
        "} as const satisfies Record<string, readonly [number, number, number, number]>;",
        "",
        "/** 1 个图集像素对应的游戏像素。 */",
        f"export const ROOM_ART_SCALE = {SCALE:g};",
        "",
    ]
    with open(DATA, "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines))


if __name__ == "__main__":
    out = sys.argv[sys.argv.index("--preview") + 1] if "--preview" in sys.argv else None
    build(out)
