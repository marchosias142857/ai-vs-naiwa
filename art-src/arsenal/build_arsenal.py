"""生成新武器像素图集 public/assets/demo/arsenal-v1.png 与帧数据 src/data/arsenalArt.ts（ADR 0031）。

用法（仓库根目录）：python3 art-src/arsenal/build_arsenal.py [--preview 输出目录]

13 把海洋生物主题的原创武器和它们的弹体。画法向原武器图看齐：
深色粗描边（2 像素）、左上受光的四档明暗、金色描边与高光、会发光的部件（宝珠、灯笼、炮口）。
武器默认枪口朝右，握把处画大肥鱼的拳头（深蓝袖口 + 肤色拳头），与原武器图一致；
握把放在武器后段，后面只留短短一截，拿在手上不会挡住角色。
1 个图集像素 = 1/6 游戏像素：相机默认放大 6 倍时正好 1 像素对 1 像素，细节与角色、原武器图同一密度。
武器长 12～20 游戏像素，与原武器图相当；弹体同一比例。
"""

from __future__ import annotations

import math
import os
import sys

HERE = os.path.dirname(__file__)
sys.path.insert(0, os.path.join(HERE, "..", "monsters"))

import numpy as np  # noqa: E402
from PIL import Image  # noqa: E402

from pixelkit import Canvas, mix, preview  # noqa: E402

ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
ATLAS = os.path.join(ROOT, "public", "assets", "demo", "arsenal-v1.png")
DATA = os.path.join(ROOT, "src", "data", "arsenalArt.ts")
# 写进 TS 的精确写法；弹体与武器同一像素密度。
SCALE_TS = "1 / 6"
INK = "#0e0b1c"
WHITE = "#fbf8ee"

# 四档材质：高光、亮面、底色、暗面。
GOLD = ("#fff5bf", "#f8d35c", "#d99a2b", "#8e5715")
STEEL = ("#f5f8ff", "#c7d1e3", "#8a97b2", "#4c5672")
NAVY = ("#6a86d6", "#3a54a3", "#25397a", "#15204a")
WOOD = ("#e7ab6c", "#b8783f", "#87522b", "#512d17")
SKIN = ("#fff2e2", "#fed3ae", "#f0b08a", "#c7866a")
SLEEVE = ("#5f86e0", "#2f4a9c", "#1f3270", "#121b44")


def tone4(base: str) -> tuple[str, str, str, str]:
    """由底色推出四档：高光偏白，暗面偏深紫，元气骑士式的冷暗面。"""
    return (mix(base, "#ffffff", 0.55), mix(base, "#ffffff", 0.22), base, mix(base, "#1a1236", 0.45))


def shade4(c: Canvas, mask, cx, cy, rx, ry, pal, hi=0.62, lit=0.18, dark=-0.38) -> None:
    """椭圆体四档明暗，左上受光。"""
    u = (c.x - cx) / max(rx, 1e-6)
    v = (c.y - cy) / max(ry, 1e-6)
    d = u * -0.55 + v * -0.8
    c.fill(mask, pal[2])
    c.fill(mask & (d > lit), pal[1])
    c.fill(mask & (d > hi), pal[0])
    c.fill(mask & (d < dark), pal[3])


def band(c: Canvas, mask, y0: float, y1: float, pal) -> None:
    """横放的圆柱（枪管、杖身）：自上而下 高光 → 亮面 → 底色 → 暗面。"""
    t = (c.y - y0) / max(y1 - y0, 1e-6)
    c.fill(mask, pal[2])
    c.fill(mask & (t < 0.42), pal[1])
    c.fill(mask & (t < 0.2), pal[0])
    c.fill(mask & (t > 0.74), pal[3])


def tube(c: Canvas, x0, y0, x1, y1, pal) -> np.ndarray:
    m = c.rect(x0, y0, x1, y1)
    band(c, m, y0, y1, pal)
    return m


def ring(c: Canvas, x, y0, y1, w, pal=GOLD) -> None:
    """套在管子上的金箍：比管子略粗，中间一条亮线。"""
    m = c.rect(x, y0 - 1, x + w, y1 + 1)
    band(c, m, y0 - 1, y1 + 1, pal)
    c.fill(c.rect(x, y0 - 1, x + 1, y1 + 1), pal[0])
    c.fill(c.rect(x + w - 1, y0 - 1, x + w, y1 + 1), pal[3])


def ball(c: Canvas, cx, cy, r, pal, spec=True) -> np.ndarray:
    m = c.circle(cx, cy, r)
    shade4(c, m, cx, cy, r, r, pal)
    if spec:
        c.fill(c.circle(cx - r * 0.38, cy - r * 0.42, max(1.0, r * 0.2)), WHITE)
    return m


def glow_orb(c: Canvas, cx, cy, r, core, mid, rim) -> None:
    """发光宝珠：外圈深、中圈亮、内核接近白，左上一点高光。"""
    c.fill(c.circle(cx, cy, r), rim)
    c.fill(c.circle(cx - r * 0.1, cy - r * 0.1, r * 0.78), mid)
    c.fill(c.circle(cx - r * 0.18, cy - r * 0.18, r * 0.45), core)
    c.fill(c.circle(cx - r * 0.42, cy - r * 0.45, max(1.0, r * 0.16)), WHITE)


def eye(c: Canvas, x, y, r=2.6, look=0.5) -> None:
    c.fill(c.circle(x, y, r + 1), INK)
    c.fill(c.circle(x, y, r), WHITE)
    pr = max(1.2, r * 0.58)
    c.fill(c.circle(x + look * (r - pr), y + 0.3, pr), INK)
    c.dot(x + look * (r - pr) - pr * 0.4, y - pr * 0.3, WHITE)


def sparkle(c: Canvas, x, y, color="#fff6a8") -> None:
    for dx, dy in ((0, 0), (1, 0), (-1, 0), (0, 1), (0, -1)):
        c.dot(x + dx, y + dy, color)


def glow_disc(c: Canvas, cx, cy, rx, ry, pal=("#fffbe0", "#ffe14d", "#ff9a2e", "#c8401c")) -> None:
    """发光的炮口：外圈暗红、向内橙黄、中心接近白，原武器图的炮口画法。"""
    for k, col in enumerate(reversed(pal)):
        f = 1 - k * 0.24
        c.fill(c.ellipse(cx, cy, rx * f, ry * f), col)


def fist(c: Canvas, gx: float, gy: float) -> None:
    """握把处的拳头（中心即 grip）：左边深蓝袖口，右边肤色拳头，指节两道细线。"""
    cuff = c.rect(gx - 11, gy - 5, gx - 4, gy + 6)
    band(c, cuff, gy - 5, gy + 6, SLEEVE)
    c.fill(c.rect(gx - 5, gy - 5, gx - 4, gy + 6), SLEEVE[3])
    hand = c.rect(gx - 4, gy - 6, gx + 6, gy + 6)
    band(c, hand, gy - 6, gy + 6, SKIN)
    c.fill(c.rect(gx + 5, gy - 6, gx + 6, gy + 6), SKIN[3])
    for y in (gy - 2, gy + 2):
        c.fill(c.rect(gx + 1, y, gx + 6, y + 1), SKIN[3])


def finish(c: Canvas, crop: bool = True) -> tuple[Image.Image, tuple[int, int]]:
    """四周先留 2 像素再描两圈深色边（边不会被画布裁掉）；武器再裁到不透明范围，返回原点偏移。
    弹体不裁：贴图以帧中心对齐弹体位置，四周对称留边才不偏。"""
    pad = 2
    big = Canvas(c.w + pad * 2, c.h + pad * 2)
    big.px[pad : pad + c.h, pad : pad + c.w] = c.px
    big.outline(INK)
    big.outline(INK)
    im = big.image()
    if not crop:
        return im, (pad, pad)
    x0, y0, x1, y1 = im.getbbox()
    return im.crop((x0, y0, x1, y1)), (pad - x0, pad - y0)


# ---------------------------------------------------------------- 武器


def octo_bazooka():
    """章鱼火箭筒：深蓝炮管配金箍，前端金色喇叭口里火光通亮；章鱼趴在炮管上，触手缠着炮身。"""
    c = Canvas(108, 50)
    tube(c, 18, 22, 92, 38, NAVY)
    c.fill(c.rect(18, 25, 92, 26), NAVY[0])
    for x in (28, 56, 82):
        ring(c, x, 22, 38, 4)
    # 后端排气口
    tube(c, 10, 24, 18, 36, STEEL)
    c.fill(c.rect(10, 27, 12, 33), "#ff9a3c")
    # 炮口：金色喇叭 + 里面火光
    bell = c.polygon([(92, 20), (104, 13), (104, 47), (92, 40)])
    shade4(c, bell, 96, 22, 10, 16, GOLD)
    c.fill(c.rect(92, 20, 94, 40) & bell, GOLD[3])
    glow_disc(c, 103, 30, 3.4, 13)
    # 章鱼：脑袋在炮管上方偏前，触手绕下来
    purple = tone4("#c04fa8")
    for x0, x1 in ((42, 38), (50, 48), (60, 62), (68, 72)):
        t = c.line(x0, 24, x1, 40, 4.2)
        shade4(c, t, x0, 30, 6, 10, purple)
        for y in (29, 34):
            c.dot(x0 + (x1 - x0) * (y - 24) / 16 + 1, y, "#ffd0ec")
    head = c.ellipse(57, 15, 14, 11)
    shade4(c, head, 55, 13, 14, 11, purple)
    c.fill(c.circle(51, 9, 2), purple[0])
    for x, y in ((63, 8), (67, 13), (49, 18)):
        c.fill(c.circle(x, y, 1.6) & head, purple[3])
    eye(c, 59, 17, 3)
    eye(c, 68, 17, 2.6)
    c.fill(c.ellipse(64, 23, 2, 1.2), "#5a1324")
    # 握把 + 扳机护圈
    grip = c.polygon([(30, 38), (40, 38), (38, 48), (28, 48)])
    band(c, grip, 38, 48, WOOD)
    c.fill(c.ring(45, 41, 4, 1.6) & c.rect(0, 38, 200, 50), GOLD[2])
    g = (33, 43)
    fist(c, *g)
    return c, g, (105, 30)


def eel_staff():
    """电鳗法杖：深色木杖缠金线，杖头金爪托着雷电宝珠，电鳗绕在杖头下方。"""
    c = Canvas(104, 44)
    shaft = c.rect(4, 20, 74, 26)
    band(c, shaft, 20, 26, WOOD)
    for x in range(12, 72, 9):
        c.fill(c.line(x, 26, x + 4, 20, 1.4), GOLD[1])
    # 杖头：金色月牙爪
    claw = c.ring(86, 21, 13, 4) & c.rect(70, 0, 104, 44) & ~c.rect(96, 13, 104, 30)
    shade4(c, claw, 84, 16, 14, 14, GOLD)
    for x, y in ((97, 10), (97, 32)):
        c.fill(c.polygon([(x - 3, y - 2), (x + 4, y), (x - 3, y + 2)]), GOLD[1])
    glow_orb(c, 86, 21, 9, "#eafcff", "#6fe0ff", "#1f7fd1")
    # 宝珠里的闪电
    zig = [(81, 14), (87, 19), (83, 22), (90, 28)]
    for (x1, y1), (x2, y2) in zip(zig, zig[1:]):
        c.fill(c.line(x1, y1, x2, y2, 1.4), "#fff7a8")
    # 电鳗：从杖身绕上来，头在宝珠下方朝前
    eel = tone4("#bcd83c")
    pts = [(48, 30), (54, 34), (62, 32), (66, 26), (64, 20), (70, 16), (76, 20), (76, 30), (82, 36)]
    for (x1, y1), (x2, y2) in zip(pts, pts[1:]):
        seg = c.line(x1, y1, x2, y2, 4.6)
        shade4(c, seg, (x1 + x2) / 2, (y1 + y2) / 2, 6, 6, eel)
    for x, y in ((55, 33), (65, 23), (75, 24)):
        c.dot(x, y, "#3f6d18")
    head = c.ellipse(84, 37, 5, 3.6)
    shade4(c, head, 83, 36, 5, 3.6, eel)
    eye(c, 85, 36, 1.6, 0.6)
    c.fill(c.line(87, 39, 90, 39, 1), "#3f1226")
    for x, y in ((99, 4), (101, 39), (72, 8)):
        sparkle(c, x, y)
    g = (24, 23)
    fist(c, *g)
    return c, g, (96, 21)


def bezier(p0, p1, p2, n: int = 14):
    return [
        ((1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0],
         (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1])
        for t in (k / n for k in range(n + 1))
    ]


def fin_shape(c: Canvas, dx: float = 0, dy: float = 0, s: float = 1.0):
    """弯月形的鲨鳍回旋镖轮廓：外缘是背鳍的长弧，内缘凹进去。武器图与弹体共用。"""
    def p(x, y):
        return (dx + x * s, dy + y * s)
    out = bezier(p(6, 44), p(14, 2), p(54, 16))
    inner = bezier(p(52, 22), p(26, 18), p(20, 44))
    return c.polygon(out + inner)


def fin_paint(c: Canvas, shape, dx: float = 0, dy: float = 0, s: float = 1.0) -> None:
    """鲨鳍上色：亮蓝鳍面、外弧一道金边、内弧白色腹边，三道深蓝斑纹，根部金铆钉。"""
    fin = ("#d9ecff", "#8fc3f7", "#4a8ad8", "#28509c")
    shade4(c, shape, dx + 22 * s, dy + 14 * s, 26 * s, 20 * s, fin)
    out = bezier((dx + 6 * s, dy + 44 * s), (dx + 14 * s, dy + 2 * s), (dx + 54 * s, dy + 16 * s))
    inner = bezier((dx + 52 * s, dy + 22 * s), (dx + 26 * s, dy + 18 * s), (dx + 20 * s, dy + 44 * s))
    for i in (5, 8, 11):
        (x1, y1), (x2, y2) = out[i], inner[len(inner) - 1 - i]
        c.fill(shape & c.line(x1, y1, x2, y2, 2.2 * s), "#1f3a7a")
    c.fill(shape & ~fin_shape(c, dx + 2.4 * s, dy - 2.6 * s, s), WHITE)
    c.fill(shape & ~fin_shape(c, dx - 1.6 * s, dy + 1.8 * s, s), GOLD[1])
    c.fill(c.circle(dx + 14 * s, dy + 34 * s, 2.4 * s), GOLD[1])
    c.dot(dx + 13.5 * s, dy + 33.5 * s, GOLD[0])


def fin_boomerang():
    c = Canvas(60, 52)
    shape = fin_shape(c, 2, 4)
    fin_paint(c, shape, 2, 4)
    # 咬痕缺口
    c.clear(c.circle(42, 13, 2.4))
    g = (12, 42)
    fist(c, *g)
    return c, g, (54, 20)


def puffer_wand():
    """河豚魔杖：青绿杖身金箍，杖头金色月牙托着一只鼓成球的河豚，刺尖发亮，气鼓鼓地瞪着前方。"""
    c = Canvas(88, 50)
    teal = tone4("#2fb3a3")
    shaft = c.rect(4, 23, 50, 28)
    band(c, shaft, 23, 28, teal)
    ring(c, 18, 23, 28, 3)
    ring(c, 44, 23, 28, 4)
    cx, cy = 66, 25
    # 刺：避开脸前方，尖端亮黄
    for k in range(16):
        a = k * math.tau / 16
        if abs(math.atan2(math.sin(a), math.cos(a))) < 0.5:
            continue
        x1, y1 = cx + math.cos(a) * 9, cy + math.sin(a) * 9
        x2, y2 = cx + math.cos(a) * 16, cy + math.sin(a) * 16
        c.fill(c.line(x1, y1, x2, y2, 2.4), "#e2901e")
        c.fill(c.circle(x2, y2, 1.1), "#fff2a0")
    # 金色月牙托
    cradle = c.ring(cx, cy, 15, 3.4) & (c.x < cx - 5)
    shade4(c, cradle, cx - 8, cy - 8, 15, 15, GOLD)
    body = ball(c, cx, cy, 12, tone4("#ffcf3f"), spec=False)
    c.fill(body & c.ellipse(cx + 2, cy + 7, 10, 5), "#fff3c6")
    for x, y in ((cx - 5, cy - 3), (cx - 1, cy - 7), (cx - 6, cy + 3)):
        c.fill(c.circle(x, y, 1.2), "#d98a14")
    c.fill(c.circle(cx - 5, cy - 7, 2.2), WHITE)
    # 胸鳍
    c.fill(c.polygon([(cx - 1, cy + 3), (cx - 7, cy + 7), (cx - 2, cy + 8)]), "#ffae2e")
    eye(c, cx + 5, cy - 3, 3.4, 0.6)
    c.fill(c.line(cx + 1, cy - 9, cx + 8, cy - 7, 1.6), INK)
    c.fill(c.circle(cx + 3, cy + 3, 2), "#ff8fb0")
    c.fill(c.ellipse(cx + 12, cy + 2, 2.4, 2), "#5a1324")
    c.fill(c.ellipse(cx + 12.4, cy + 2, 1.2, 1), "#ff8fb0")
    g = (14, 25)
    fist(c, *g)
    return c, g, (84, 25)


def coral_bow():
    """珊瑚长弓：两段弯弯的粉珊瑚弓臂各分出一个小枝杈，弓梢镶金，金色握把，弦上搭着一支珊瑚箭。"""
    c = Canvas(38, 78)
    coral = tone4("#ff6f86")
    cy = 39
    for sign in (-1, 1):
        pts = bezier((16, cy), (34, cy + sign * 20), (17, cy + sign * 36), 14)
        for k, ((x1, y1), (x2, y2)) in enumerate(zip(pts, pts[1:])):
            seg = c.line(x1, y1, x2, y2, 5.2 - k * 0.16)
            shade4(c, seg, (x1 + x2) / 2 - 1, (y1 + y2) / 2, 4, 5, coral)
        bx, by = pts[6]
        c.fill(c.line(bx, by, bx + 6, by + sign * 5, 2.6), coral[1])
        c.fill(c.circle(bx + 6, by + sign * 5, 2), coral[0])
        c.fill(c.circle(bx + 1, by - sign * 2, 1), "#ffe1e8")
        tx, ty = pts[-1]
        c.fill(c.circle(tx, ty, 2.6), GOLD[1])
        c.dot(tx - 1, ty - 1, GOLD[0])
    # 弦：从两端弓梢拉到箭尾
    c.fill(c.line(17, cy - 36, 9, cy, 1), "#eef4ff")
    c.fill(c.line(9, cy, 17, cy + 36, 1), "#eef4ff")
    # 箭
    c.fill(c.line(9, cy, 33, cy, 1.6), WOOD[1])
    head = c.polygon([(31, cy - 4), (37, cy), (31, cy + 4)])
    shade4(c, head, 33, cy - 2, 4, 4, coral)
    c.fill(c.polygon([(6, cy - 3), (11, cy), (6, cy + 3)]), "#ffe1e8")
    grip = c.rect(13, cy - 6, 22, cy + 6)
    band(c, grip, cy - 6, cy + 6, GOLD)
    g = (17, cy)
    fist(c, *g)
    return c, g, (37, cy)


def lantern_beam():
    """灯笼鱼光枪：深蓝鱼身是枪身，大嘴是发光的枪口，头顶的灯笼弯到前面。"""
    c = Canvas(112, 58)
    body = c.ellipse(56, 34, 40, 16)
    shade4(c, body, 50, 28, 40, 16, NAVY)
    c.fill(body & c.ellipse(56, 44, 34, 6), "#6f83c4")
    for x in (40, 48, 56):
        c.fill(body & c.line(x, 30, x + 3, 38, 1.4), NAVY[3])
    # 金色鳍纹
    c.fill(c.polygon([(40, 20), (50, 11), (57, 20)]), GOLD[2])
    c.fill(c.polygon([(42, 20), (50, 13), (54, 20)]), GOLD[1])
    c.fill(c.polygon([(60, 46), (68, 54), (71, 46)]), GOLD[2])
    # 短尾
    tail = c.polygon([(18, 34), (7, 23), (12, 34), (7, 45)])
    shade4(c, tail, 12, 30, 8, 10, NAVY)
    c.fill(c.line(9, 26, 15, 33, 1), GOLD[1])
    c.fill(c.line(9, 42, 15, 35, 1), GOLD[1])
    # 大嘴：张开，里面黄光，上下几颗尖牙
    mouth = c.polygon([(80, 28), (104, 21), (106, 47), (80, 40)])
    c.fill(mouth, "#2a1036")
    glow_disc(c, 98, 34, 7, 9, ("#fffbe0", "#fff07a", "#ffc93c", "#b8641c"))
    for x, y in ((84, 26.6), (91, 24.8), (98, 23)):
        c.fill(c.polygon([(x, y), (x + 4, y - 1), (x + 2, y + 5)]), WHITE)
    for x, y in ((86, 40.5), (94, 41.5)):
        c.fill(c.polygon([(x, y), (x + 4, y + 0.5), (x + 2, y - 4)]), WHITE)
    eye(c, 74, 26, 3.4, 0.7)
    # 灯笼：从头顶弯到嘴前
    stalk = bezier((66, 20), (80, 0), (98, 8), 12)
    for (x1, y1), (x2, y2) in zip(stalk, stalk[1:]):
        c.fill(c.line(x1, y1, x2, y2, 1.8), "#1c2a5c")
    glow_orb(c, 100, 10, 5.6, "#fffbe0", "#ffe14d", "#e29b1c")
    sparkle(c, 108, 4)
    # 握把
    grip = c.polygon([(30, 44), (40, 44), (38, 56), (28, 56)])
    band(c, grip, 44, 56, WOOD)
    g = (33, 48)
    fist(c, *g)
    return c, g, (106, 34)


def slush_blaster():
    """冰沙喷枪：青绿枪身，顶上透明杯里装着粉蓝冰沙和奶油，铬色喷嘴挂着冰碴。"""
    c = Canvas(104, 54)
    teal = tone4("#2fc0c0")
    body = c.polygon([(14, 30), (70, 30), (78, 34), (78, 44), (14, 44)])
    band(c, body, 30, 44, teal)
    c.fill(c.rect(14, 40, 78, 41), teal[3])
    # 喷嘴
    tube(c, 78, 33, 96, 41, STEEL)
    ring(c, 86, 33, 41, 3, STEEL)
    c.fill(c.rect(96, 32, 100, 42), STEEL[3])
    for x, y in ((99, 30), (101, 35), (99, 44)):
        c.fill(c.polygon([(x, y), (x + 3, y + 1), (x, y + 3)]), "#dff7ff")
    # 冰沙杯
    cup = c.polygon([(30, 6), (56, 6), (52, 30), (34, 30)])
    c.fill(cup, "#d9f5ff")
    c.fill(cup & c.rect(0, 12, 200, 30), "#7fd6ff")
    c.fill(cup & c.rect(0, 20, 200, 30), "#ff9ec4")
    c.fill(cup & c.rect(0, 26, 200, 30), "#f26f9e")
    c.fill(cup & c.rect(30, 6, 34, 30), "#ffffff")
    for x, y in ((40, 16), (47, 23), (38, 25)):
        c.fill(c.circle(x, y, 1.4), WHITE)
    cream = c.ellipse(43, 7, 14, 4) | c.circle(38, 4, 4) | c.circle(46, 3, 4.4)
    shade4(c, cream, 42, 4, 14, 6, ("#ffffff", "#fff7f2", "#f3e2e8", "#d4bccb"))
    c.fill(c.circle(50, 1.6, 2), "#ff4d6a")
    c.fill(c.line(52, 6, 58, 0, 2), "#5ad1ff")
    # 握把与扳机
    grip = c.polygon([(22, 44), (32, 44), (30, 54), (20, 54)])
    band(c, grip, 44, 54, teal)
    g = (25, 47)
    fist(c, *g)
    return c, g, (101, 37)


def jelly_guard():
    """水母护卫：紫金权杖，顶上透明粉水母，伞盖里一颗发光核，触手飘着电光。"""
    c = Canvas(100, 52)
    shaft = c.rect(4, 26, 62, 31)
    band(c, shaft, 26, 31, tone4("#8a62d8"))
    for x in (16, 40):
        ring(c, x, 26, 31, 3)
    # 金色托座
    cradle = c.polygon([(60, 22), (70, 26), (70, 31), (60, 35)])
    shade4(c, cradle, 64, 26, 6, 8, GOLD)
    pink = ("#ffe1f3", "#ffb1df", "#ff7cc6", "#c8478f")
    bell = c.ellipse(84, 20, 14, 13) & c.rect(60, 0, 100, 25)
    shade4(c, bell, 80, 14, 14, 12, pink)
    c.fill(c.rect(70, 23, 99, 26), pink[3])
    glow_orb(c, 84, 16, 4.4, "#ffffff", "#fff3a0", "#ffb3e6")
    for k, x in enumerate((72, 77, 82, 87, 92, 96)):
        w = 1.4 if k % 2 else -1.4
        c.fill(c.line(x, 26, x + w, 36, 1.6), pink[2])
        c.fill(c.line(x + w, 36, x, 46, 1.6), pink[3])
    for x, y in ((98, 6), (68, 10), (90, 48)):
        sparkle(c, x, y)
    eye(c, 79, 19, 1.8, 0.2)
    eye(c, 89, 19, 1.8, 0.2)
    g = (20, 28)
    fist(c, *g)
    return c, g, (98, 20)


def swordfish_spear():
    """剑鱼长枪：金箍长杆、红缨，枪头是一条剑鱼，长长的银吻就是枪尖。"""
    c = Canvas(122, 34)
    shaft = c.rect(10, 13, 74, 18)
    band(c, shaft, 13, 18, WOOD)
    c.fill(c.rect(8, 12, 12, 19), GOLD[2])
    for x in (46, 68):
        ring(c, x, 13, 18, 3)
    # 红缨：金结下垂一把
    for k in range(7):
        col = ("#ff6b74", "#e8414f", "#b82638")[k % 3]
        c.fill(c.line(72, 18, 63 + k * 1.4, 27 + (k % 3) * 1.6, 2.2), col)
    c.fill(c.circle(72, 18, 2.4), GOLD[1])
    # 剑鱼身体
    blue = tone4("#2f86e0")
    body = c.ellipse(86, 15, 14, 7)
    shade4(c, body, 84, 12, 14, 7, blue)
    c.fill(body & c.ellipse(86, 20, 12, 3.4), "#dceaf8")
    c.fill(c.polygon([(78, 9), (86, 0), (92, 9)]), blue[3])
    c.fill(c.polygon([(80, 9), (86, 2), (89, 9)]), blue[1])
    c.fill(c.polygon([(74, 15), (68, 7), (71, 15), (68, 23)]), blue[1])
    for x in (82, 86):
        c.fill(body & c.line(x, 11, x - 1, 17, 1), blue[3])
    # 银吻
    bill = c.polygon([(98, 12), (121, 15), (98, 17)])
    shade4(c, bill, 106, 13, 16, 3, STEEL)
    c.fill(c.line(99, 14, 118, 15, 1), WHITE)
    eye(c, 92, 13, 2, 0.6)
    g = (28, 15)
    fist(c, *g)
    return c, g, (120, 15)


def shark_katana():
    """鲨齿太刀：刀身就是一条鲨鱼，深蓝鲨背、银白刀刃，刃纹像浪；刀根张开一排鲨齿，金色圆刀镡，深蓝缠柄。"""
    c = Canvas(126, 30)
    hilt = c.rect(6, 11, 32, 19)
    band(c, hilt, 11, 19, NAVY)
    for x in range(8, 30, 5):
        c.fill(c.polygon([(x, 15), (x + 2.5, 12.5), (x + 5, 15), (x + 2.5, 17.5)]), GOLD[1])
    pommel = c.rect(2, 10, 7, 20)
    band(c, pommel, 10, 20, GOLD)
    # 刀身：逐列算出背线与刃线，刀尖上挑收窄。
    x0, x1 = 40.0, 124.0
    t = (c.x - x0) / (x1 - x0)
    spine = 10 - 6 * t**2
    edge = spine + 10.5 * np.clip(1 - t**5, 0, 1) ** 0.7
    blade = (t >= 0) & (t <= 1) & (c.y >= spine) & (c.y < edge)
    rel = (c.y - spine) / np.maximum(edge - spine, 1e-6)
    wave = 0.46 + 0.09 * np.sin(c.x * 0.55)
    c.fill(blade, "#c9d8ec")
    c.fill(blade & (rel > wave + 0.12), "#eef5ff")
    c.fill(blade & (rel < wave), "#3d62b0")
    c.fill(blade & (rel < wave * 0.45), "#6f93dc")
    c.fill(blade & (rel < 0.14), "#a9c4f2")
    c.fill(blade & (rel >= wave) & (rel < wave + 0.1), "#8fb2e6")
    c.fill(blade & (rel > 0.86), WHITE)
    # 刀根的鲨鱼脸：眼睛、腮裂、一排牙
    eye(c, 47, 12.6, 1.6, 0.6)
    for x in (52, 55, 58):
        c.fill(blade & c.line(x, 11, x - 1, 15, 1), "#203b78")
    for x in range(42, 66, 4):
        c.fill(c.polygon([(x, 20.3), (x + 3, 20.3), (x + 1.5, 23.6)]), WHITE)
    # 金色圆刀镡 + 刀根金箍
    guard = c.ellipse(35, 15, 3.6, 9)
    shade4(c, guard, 34, 11, 3.6, 9, GOLD)
    c.fill(c.ellipse(35, 15, 1.2, 4), GOLD[3])
    collar = c.rect(38, 10, 42, 21)
    band(c, collar, 10, 21, GOLD)
    g = (20, 15)
    fist(c, *g)
    return c, g, (123, 5)


def bubble_gatling():
    """泡泡加特林：玫红机身金边，四根玻璃枪管里冒着泡，顶上背一瓶泡泡水。"""
    c = Canvas(112, 56)
    body = c.polygon([(12, 22), (50, 22), (54, 26), (54, 44), (12, 44)])
    shade4(c, body, 30, 28, 24, 14, tone4("#e0548e"))
    c.fill(c.rect(12, 22, 54, 24), GOLD[1])
    c.fill(c.rect(12, 42, 54, 44), GOLD[3])
    c.fill(c.circle(24, 33, 3.4), GOLD[2])
    c.fill(c.circle(23, 32, 1.6), GOLD[0])
    # 枪管
    for y in (24, 30, 36, 42):
        m = c.rect(54, y - 2, 98, y + 2)
        band(c, m, y - 2, y + 2, ("#ffffff", "#d8f4ff", "#9fd8f2", "#5c9cc4"))
    for x, y in ((62, 30), (75, 36), (86, 24), (70, 42), (92, 36)):
        c.fill(c.ring(x, y, 1.6, 0.8), WHITE)
    for x in (60, 80):
        ring(c, x, 21, 45, 4)
    tube(c, 98, 20, 104, 46, STEEL)
    # 泡泡水瓶
    bottle = c.polygon([(22, 8), (40, 8), (42, 22), (20, 22)])
    c.fill(bottle, "#a9e8ff")
    c.fill(bottle & c.rect(0, 14, 200, 22), "#5cc6ff")
    c.fill(bottle & c.rect(22, 8, 25, 22), WHITE)
    tube(c, 27, 3, 35, 8, tone4("#e0548e"))
    for x, y, r in ((46, 8, 3.4), (52, 2.6, 2.2), (12, 12, 2.4)):
        c.fill(c.ring(x, y, r, 1), "#9fdcff")
        c.dot(x - r * 0.4, y - r * 0.4, WHITE)
    grip = c.polygon([(22, 44), (32, 44), (30, 55), (20, 55)])
    band(c, grip, 44, 55, NAVY)
    g = (25, 48)
    fist(c, *g)
    return c, g, (104, 33)


def urchin_mortar():
    """海胆榴弹：墨绿铆钉炮身、宽口炮嘴，一只紫海胆从炮口探出头。"""
    c = Canvas(100, 54)
    green = tone4("#2f9a78")
    drum = c.rect(12, 18, 66, 40)
    band(c, drum, 18, 40, green)
    for x in (22, 44):
        ring(c, x, 18, 40, 4)
    for x in range(16, 64, 8):
        c.dot(x, 37, green[0])
    # 弹鼓
    mag = c.circle(36, 44, 8)
    shade4(c, mag, 34, 42, 8, 8, STEEL)
    c.fill(c.ring(36, 44, 4, 1.4), STEEL[3])
    # 炮口
    bell = c.polygon([(66, 16), (80, 10), (80, 48), (66, 42)])
    shade4(c, bell, 70, 18, 10, 18, green)
    c.fill(c.polygon([(66, 16), (80, 10), (80, 13), (66, 19)]), GOLD[1])
    # 海胆
    for k in range(13):
        a = -math.pi * 0.62 + k * math.pi * 1.24 / 12
        c.fill(c.line(82, 29, 82 + math.cos(a) * 15, 29 + math.sin(a) * 15, 2), "#4a1f78")
        c.dot(82 + math.cos(a) * 15, 29 + math.sin(a) * 15, "#c7a2f0")
    ball(c, 82, 29, 8, tone4("#8c4fd0"))
    eye(c, 85, 27, 2.2, 0.6)
    grip = c.polygon([(16, 40), (26, 40), (24, 52), (14, 52)])
    band(c, grip, 40, 52, WOOD)
    g = (19, 44)
    fist(c, *g)
    return c, g, (92, 29)


def bubble_bouncer():
    """弹弹水枪：橙色玩具水枪，透明水箱里有气泡，蓝色枪口，黄扳机。"""
    c = Canvas(86, 48)
    orange = tone4("#ff8a2a")
    body = c.polygon([(12, 18), (58, 18), (62, 22), (62, 32), (12, 32)])
    band(c, body, 18, 32, orange)
    c.fill(c.rect(12, 26, 62, 27), orange[3])
    # 枪口
    tube(c, 62, 20, 78, 30, tone4("#2a9fd6"))
    ring(c, 72, 20, 30, 3, tone4("#2a9fd6"))
    c.fill(c.rect(78, 19, 82, 31), tone4("#2a9fd6")[3])
    # 水箱
    tank = c.ellipse(34, 11, 14, 8)
    c.fill(tank, "#b8eeff")
    c.fill(tank & c.rect(0, 11, 200, 20), "#4ab4ff")
    c.fill(tank & c.ellipse(30, 7, 6, 2.4), WHITE)
    for x, y, r in ((38, 14, 1.8), (30, 15, 1.2), (43, 10, 1.2)):
        c.fill(c.ring(x, y, r, 0.8), WHITE)
    # 扳机护圈与扳机
    c.fill(c.ring(36, 36, 5, 1.8) & c.rect(0, 32, 200, 48), orange[3])
    c.fill(c.rect(35, 32, 38, 37), "#ffd84a")
    grip = c.polygon([(14, 32), (26, 32), (24, 46), (12, 46)])
    band(c, grip, 32, 46, orange)
    g = (18, 37)
    fist(c, *g)
    return c, g, (82, 25)


WEAPONS = {
    "octo_bazooka": octo_bazooka,
    "eel_staff": eel_staff,
    "fin_boomerang": fin_boomerang,
    "puffer_wand": puffer_wand,
    "coral_bow": coral_bow,
    "lantern_beam": lantern_beam,
    "slush_blaster": slush_blaster,
    "jelly_guard": jelly_guard,
    "swordfish_spear": swordfish_spear,
    "shark_katana": shark_katana,
    "bubble_gatling": bubble_gatling,
    "urchin_mortar": urchin_mortar,
    "bubble_bouncer": bubble_bouncer,
}

# ---------------------------------------------------------------- 弹体（朝右）


class Big(Canvas):
    """按设计坐标作画、按 k 倍像素出图的画布：弹体沿用同一套坐标，放大到与命中半径相称，仍是 1/6 的像素密度。"""

    def __init__(self, width: float, height: float, k: float):
        super().__init__(round(width * k), round(height * k))
        self.k = k
        self.x = self.x / k
        self.y = self.y / k

    def dot(self, x: float, y: float, color) -> None:
        fx, fy = math.floor(x), math.floor(y)
        m = self.rect(fx, fy, fx + 1, fy + 1)
        if m.any():
            self.fill(m, color)
        else:
            super().dot(x * self.k, y * self.k, color)


def shot_rocket():
    c = Big(50, 26, 1.35)
    purple = tone4("#c04fa8")
    body = c.ellipse(26, 13, 15, 8)
    shade4(c, body, 24, 10, 15, 8, purple)
    nose = c.polygon([(38, 6), (48, 13), (38, 20)])
    shade4(c, nose, 40, 10, 6, 6, GOLD)
    eye(c, 31, 11, 2.4)
    # 尾焰触手
    for y in (7, 13, 19):
        c.fill(c.line(11, y, 2, y + (y - 13) * 0.4, 3), "#ffb347")
        c.fill(c.line(10, y, 5, y + (y - 13) * 0.3, 1.4), "#fff1a8")
    return c


def shot_eel():
    c = Big(32, 32, 2)
    glow_orb(c, 16, 16, 11, "#f2feff", "#78e4ff", "#1f7fd1")
    zig = [(6, 16), (12, 11), (16, 20), (21, 11), (26, 16)]
    for (x1, y1), (x2, y2) in zip(zig, zig[1:]):
        c.fill(c.line(x1, y1, x2, y2, 2), "#fff7a8")
    return c


def shot_fin():
    c = Big(60, 52, 1.25)
    shape = fin_shape(c, 2, 4)
    fin_paint(c, shape, 2, 4)
    return c


def shot_puffer():
    c = Big(34, 30, 1.8)
    for k in range(12):
        a = k * math.tau / 12
        c.fill(c.line(17 + math.cos(a) * 7, 15 + math.sin(a) * 7, 17 + math.cos(a) * 12, 15 + math.sin(a) * 12, 1.8), "#e2901e")
    body = ball(c, 17, 15, 8.5, tone4("#ffcf3f"), spec=False)
    c.fill(body & c.ellipse(18, 20, 7, 3.6), "#fff3c6")
    eye(c, 20, 12, 2.4, 0.6)
    c.fill(c.circle(14, 18, 1.6), "#ff8fb0")
    c.fill(c.ellipse(25, 16, 1.6, 1.2), "#5a1324")
    return c


def shot_arrow():
    c = Big(54, 14, 1.2)
    c.fill(c.line(6, 7, 44, 7, 2), WOOD[1])
    c.fill(c.line(6, 6, 44, 6, 1), WOOD[0])
    head = c.polygon([(42, 2), (53, 7), (42, 12)])
    shade4(c, head, 45, 5, 6, 5, tone4("#ff6f86"))
    for dx in (0, 5):
        c.fill(c.polygon([(1 + dx, 2), (8 + dx, 7), (1 + dx, 12), (4 + dx, 7)]), "#ffe1e8")
    return c


def shot_slush():
    c = Big(24, 24, 1.8)
    ice = c.polygon([(12, 1), (22, 8), (20, 19), (9, 23), (2, 14), (5, 4)])
    shade4(c, ice, 10, 8, 10, 10, ("#ffffff", "#dff7ff", "#a7e2ff", "#5aa8d8"))
    c.fill(c.circle(15, 17, 3), "#ff9ec4")
    c.dot(8, 6, WHITE)
    return c


def shot_jelly():
    c = Big(38, 42, 1.35)
    pink = ("#ffe1f3", "#ffb1df", "#ff7cc6", "#c8478f")
    bell = c.ellipse(19, 16, 15, 13) & c.rect(0, 0, 38, 20)
    shade4(c, bell, 15, 10, 15, 12, pink)
    c.fill(c.rect(5, 18, 34, 21), pink[3])
    glow_orb(c, 19, 12, 4, "#ffffff", "#fff3a0", "#ffb3e6")
    for k, x in enumerate((8, 14, 20, 26, 31)):
        w = 1.6 if k % 2 else -1.6
        c.fill(c.line(x, 21, x + w, 30, 1.8), pink[2])
        c.fill(c.line(x + w, 30, x, 39, 1.8), pink[3])
    eye(c, 14, 15, 1.8, 0)
    eye(c, 24, 15, 1.8, 0)
    sparkle(c, 3, 6)
    sparkle(c, 35, 4)
    return c


def shot_bubble():
    c = Big(24, 24, 1.6)
    c.fill(c.circle(12, 12, 10), "#cdf2ff")
    c.fill(c.ring(12, 12, 10, 2), "#6cc6ff")
    c.fill(c.circle(8, 8, 3), WHITE)
    c.dot(15, 16, WHITE)
    return c


def shot_urchin():
    c = Big(36, 36, 1.5)
    for k in range(14):
        a = k * math.tau / 14
        c.fill(c.line(18, 18, 18 + math.cos(a) * 16, 18 + math.sin(a) * 16, 2), "#4a1f78")
        c.dot(18 + math.cos(a) * 16, 18 + math.sin(a) * 16, "#c7a2f0")
    ball(c, 18, 18, 8, tone4("#8c4fd0"))
    eye(c, 20, 16, 2, 0.6)
    return c


def shot_spine():
    c = Big(28, 10, 1.3)
    spine = c.polygon([(1, 2), (27, 5), (1, 8)])
    band(c, spine, 2, 8, tone4("#8c4fd0"))
    return c


def shot_water():
    c = Big(28, 20, 1.6)
    drop = c.ellipse(17, 10, 9, 7) | c.polygon([(9, 5), (1, 10), (9, 15)])
    shade4(c, drop, 15, 8, 10, 7, ("#ffffff", "#a8e8ff", "#4fb8ff", "#2a7ed0"))
    c.fill(c.circle(19, 7, 2), WHITE)
    return c


SHOTS = {
    "shot_rocket": shot_rocket,
    "shot_eel": shot_eel,
    "shot_fin": shot_fin,
    "shot_puffer": shot_puffer,
    "shot_arrow": shot_arrow,
    "shot_slush": shot_slush,
    "shot_jelly": shot_jelly,
    "shot_bubble": shot_bubble,
    "shot_urchin": shot_urchin,
    "shot_spine": shot_spine,
    "shot_water": shot_water,
}


# ---------------------------------------------------------------- 打包


def pack(images: dict[str, Image.Image], width: int = 512) -> tuple[Image.Image, dict[str, tuple[int, int, int, int]]]:
    """按高度排序的行打包，帧之间留 2 像素，防止相邻帧采样串色。"""
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


def fmt(v: float) -> str:
    return str(int(v)) if float(v).is_integer() else f"{v:.6g}"


def build(preview_dir: str | None = None) -> None:
    images: dict[str, Image.Image] = {}
    meta: dict[str, tuple[tuple[float, float], tuple[float, float]]] = {}
    for name, draw in WEAPONS.items():
        c, (gx, gy), (mx, my) = draw()
        images[name], (ox, oy) = finish(c)
        # 拳头画在像素格里，中心在格子中间。
        meta[name] = ((gx + ox + 0.5, gy + oy + 0.5), (mx + ox, my + oy))
    for name, draw in SHOTS.items():
        images[name] = finish(draw(), crop=False)[0]
    atlas, rects = pack(images)
    atlas.save(ATLAS, optimize=True)
    write_data(rects, meta)
    if preview_dir:
        os.makedirs(preview_dir, exist_ok=True)
        frames = [images[n] for n in WEAPONS] + [images[n] for n in SHOTS]
        preview(frames, 3, 4).save(os.path.join(preview_dir, "arsenal.png"))
    print(f"arsenal {atlas.width}x{atlas.height} -> {ATLAS}")


def write_data(rects, meta) -> None:
    lines = [
        "// 由 art-src/arsenal/build_arsenal.py 生成，不要手改；改画法后重新运行脚本。",
        "import type { WeaponArt } from './schema/art';",
        "",
        "/** 新武器（ADR 0031）在 `demo_arsenal` 图集里的帧；握把、枪口与缩放的含义同 `WEAPON_ART`。 */",
        "export const ARSENAL_WEAPON_ART = {",
    ]
    for name in WEAPONS:
        x, y, w, h = rects[name]
        (gx, gy), (mx, my) = meta[name]
        lines += [
            f"  {name}: {{",
            "    texture: 'demo_arsenal',",
            f"    rect: [{x}, {y}, {w}, {h}],",
            f"    grip: {{ x: {fmt(gx)}, y: {fmt(gy)} }},",
            f"    muzzle: {{ x: {fmt(mx + 0.5 - gx)}, y: {fmt(my + 0.5 - gy)} }},",
            f"    scale: {SCALE_TS},",
            "  },",
        ]
    lines += [
        "} as const satisfies Record<string, WeaponArt>;",
        "",
        "/** 弹体帧（朝右）：`rect` 为图集坐标，贴图以帧中心对齐弹体位置。 */",
        "export const ARSENAL_SHOT_ART = {",
    ]
    for name in SHOTS:
        x, y, w, h = rects[name]
        lines.append(f"  {name}: [{x}, {y}, {w}, {h}],")
    lines += [
        "} as const satisfies Record<string, readonly [number, number, number, number]>;",
        "",
        "/** 弹体贴图 1 个图集像素对应的游戏像素。 */",
        f"export const ARSENAL_SHOT_SCALE = {SCALE_TS};",
        "",
    ]
    with open(DATA, "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines))


if __name__ == "__main__":
    out = sys.argv[sys.argv.index("--preview") + 1] if "--preview" in sys.argv else None
    build(out)
