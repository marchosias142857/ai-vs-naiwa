"""生成新武器像素图集 public/assets/demo/arsenal-v1.png 与帧数据 src/data/arsenalArt.ts（ADR 0031）。

用法（仓库根目录）：python3 art-src/arsenal/build_arsenal.py [--preview 输出目录]

13 把海洋生物主题的原创武器和它们的弹体，整体参考元气骑士：1 像素黑描边、三档硬边明暗、高饱和。
武器默认枪口朝右，握把处画大肥鱼的拳头（与原武器图一致：深蓝袖口 + 肤色拳头）。
武器图 1 个图集像素 = 0.25 个游戏像素，长 12～20 游戏像素，与原武器图相当；弹体按 0.4 显示。
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
ATLAS = os.path.join(ROOT, "public", "assets", "demo", "arsenal-v1.png")
DATA = os.path.join(ROOT, "src", "data", "arsenalArt.ts")
SCALE = 0.25
# 弹体按更大的颗粒显示，和原来 6 像素的子弹差不多大，飞行中看得清。
SHOT_SCALE = 0.4
WHITE = "#f7f4ea"
SKIN = ("#fdcda6", "#fff0dc", "#e3a47f")
SLEEVE = ("#1f3270", "#476dc8", "#121b44")
GOLD = ("#f4c542", "#ffe58a", "#b98a22")
WOOD = ("#9a5b32", "#c98a52", "#5f3418")


def tone(base: str, light: float = 0.35, dark: float = 0.35) -> tuple[str, str, str]:
    return (base, mix(base, "#ffffff", light), mix(base, "#14102a", dark))


def bar(c: Canvas, x0, y0, x1, y1, pal, light_rows: int = 1, dark_rows: int = 1) -> None:
    """横向的管子、枪身：上沿亮一行、下沿暗一行。"""
    c.fill(c.rect(x0, y0, x1, y1), pal[0])
    c.fill(c.rect(x0, y0, x1, y0 + light_rows), pal[1])
    c.fill(c.rect(x0, y1 - dark_rows, x1, y1), pal[2])


def fist(c: Canvas, gx: float, gy: float) -> None:
    """握把处的拳头：左边深蓝袖口，右边肤色拳头，中心就是 grip。"""
    bar(c, gx - 6, gy - 3, gx - 2, gy + 3, SLEEVE)
    c.fill(c.rect(gx - 2, gy - 3, gx - 1, gy + 3), OUTLINE)
    c.fill(c.rect(gx - 1, gy - 3, gx + 4, gy + 4), SKIN[0])
    c.fill(c.rect(gx - 1, gy - 3, gx + 4, gy - 2), SKIN[1])
    c.fill(c.rect(gx - 1, gy + 3, gx + 4, gy + 4), SKIN[2])
    # 指缝
    for k in (0, 2):
        c.dot(gx + 3, gy - 1 + k, SKIN[2])


def glint(c: Canvas, x: float, y: float) -> None:
    c.dot(x, y, WHITE)
    c.dot(x + 1, y, WHITE)
    c.dot(x, y + 1, WHITE)


def eye(c: Canvas, x: float, y: float, r: float = 1.6, look: float = 0.6) -> None:
    c.fill(c.circle(x, y, r + 0.8), OUTLINE)
    c.fill(c.circle(x, y, r), WHITE)
    c.fill(c.circle(x + look * r * 0.4, y + 0.2, max(0.9, r * 0.55)), OUTLINE)
    c.dot(x + look * r * 0.4 - 0.4, y - 0.6, WHITE)


# ---------------------------------------------------------------- 武器
# 每个函数返回 (画布, 握把, 枪口)，坐标为画布像素，枪口在握把右边。


def octo_bazooka():
    c = Canvas(66, 30)
    purple = tone("#b0479c")
    tube = tone("#6c7fa8")
    # 发射管：钢管 + 金色箍
    bar(c, 22, 9, 62, 19, tube, 2, 2)
    for x in (30, 44):
        bar(c, x, 8, x + 2, 20, GOLD)
    # 炮口：章鱼的漏斗，粉色喇叭口
    c.blob(61, 14, 4, 7, tone("#ff8fb0"))
    c.fill(c.ellipse(62, 14, 1.8, 4.2), "#4a1027")
    # 尾部：章鱼脑袋
    head = c.blob(16, 12, 11, 10, purple)
    c.fill(head & c.circle(12, 8, 2.2), purple[1])
    for sx, sy in ((10, 16), (19, 18), (22, 8)):
        c.fill(c.circle(sx, sy, 1.2) & head, purple[2])
    eye(c, 12, 11, 2.2)
    eye(c, 19, 11, 2.2)
    # 触手卷成握把与支架
    for k, (x, y) in enumerate(((8, 21), (14, 23), (20, 22))):
        c.fill(c.line(x, y - 2, x - 2 + k, y + 4, 3), purple[0])
        c.fill(c.circle(x - 3 + k, y + 4, 1.6), purple[2])
    grip = (31, 22)
    c.fill(c.rect(28, 19, 34, 25), WOOD[0])
    fist(c, *grip)
    return c, grip, (64, 14)


def eel_staff():
    c = Canvas(64, 26)
    # 木杖
    bar(c, 4, 12, 50, 16, WOOD)
    for x in (16, 34):
        bar(c, x, 11, x + 2, 17, GOLD)
    # 杖头电球
    orb = c.circle(55, 13, 6)
    c.fill(orb, "#5ad1ff")
    c.fill(orb & c.circle(53, 11, 3), "#c8f4ff")
    c.fill(orb & ~c.circle(55, 13, 4.6), "#1f86c7")
    # 电鳗从杖身绕过电球下方，脑袋从右上探出来
    eel = tone("#b8d43a")
    pts = [(42, 14), (46, 19), (53, 21), (60, 18), (62, 11), (59, 5), (53, 3)]
    for (x1, y1), (x2, y2) in zip(pts, pts[1:]):
        c.fill(c.line(x1, y1, x2, y2, 3.4), eel[0])
    for (x1, y1), (x2, y2) in zip(pts, pts[1:]):
        c.fill(c.line(x1, y1 + 1, x2, y2 + 1, 1), eel[2])
    for x, y in ((47, 19), (56, 20), (61, 14), (60, 7)):
        c.dot(x, y - 1, "#3a6b1e")
    head = c.blob(50, 3.5, 3.6, 2.6, eel)
    c.fill(c.polygon([(46, 3), (47.5, 4.5), (46, 5.5)]), "#4a1027")
    eye(c, 51, 2.6, 1.1, -0.8)
    # 闪电火花
    for x, y in ((60, 3), (62, 21), (50, 2)):
        c.dot(x, y, "#fff36b")
        c.dot(x + 1, y + 1, "#fff36b")
    grip = (20, 14)
    fist(c, *grip)
    return c, grip, (61, 13)


def fin_boomerang():
    c = Canvas(35, 30)
    fin = tone("#6f8fb3")
    # 弯月形的鲨鳍回旋镖：外缘是背鳍的长弧，内缘凹进去
    outer = fin_shape(c, 0, 0)
    c.fill(outer, fin[0])
    c.fill(outer & c.polygon([(3, 26), (11, 2), (14, 3), (7, 26)]), fin[1])
    c.fill(outer & c.polygon([(14, 15), (31, 13), (31, 16), (14, 18)]), fin[2])
    # 白色腹边与咬痕
    c.fill(outer & c.line(10, 25, 14, 15, 1.4), WHITE)
    c.clear(c.circle(22, 6.5, 1.5))
    grip = (8, 23)
    fist(c, *grip)
    return c, grip, (30, 12)


def bezier(p0, p1, p2, n: int = 10):
    return [
        ((1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0], (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1])
        for t in (k / n for k in range(n + 1))
    ]


def fin_shape(c: Canvas, dx: float, dy: float):
    """鲨鳍回旋镖的弯月轮廓，武器图与弹体共用。"""
    out = bezier((3 + dx, 27 + dy), (8 + dx, 1 + dy), (32 + dx, 11 + dy))
    inner = bezier((31 + dx, 14 + dy), (14 + dx, 11 + dy), (11 + dx, 27 + dy))
    return c.polygon(out + inner)


def puffer_wand():
    c = Canvas(48, 26)
    bar(c, 4, 12, 30, 15, tone("#2fb3a3"))
    bar(c, 26, 11, 29, 16, GOLD)
    yellow = tone("#ffd34d")
    # 刺
    for k in range(12):
        a = k * math.tau / 12
        c.fill(c.line(38 + math.cos(a) * 7, 13 + math.sin(a) * 7, 38 + math.cos(a) * 10.5, 13 + math.sin(a) * 10.5, 1.4), "#e8a020")
    body = c.blob(38, 13, 8, 8, yellow)
    c.fill(body & c.rect(30, 15, 47, 22), "#fff6d0")
    eye(c, 41, 10, 2)
    c.fill(c.ellipse(45, 15, 1.6, 1.2), "#4a1027")
    c.fill(c.circle(36, 15, 1.2), "#ff8fb0")
    grip = (14, 13)
    fist(c, *grip)
    return c, grip, (46, 13)


def coral_bow():
    c = Canvas(30, 58)
    coral = tone("#ff6f7d")
    # 弓身：两段珊瑚弧
    for sign in (-1, 1):
        pts = [(14, 29), (17, 29 + sign * 8), (19, 29 + sign * 16), (18, 29 + sign * 23), (14, 29 + sign * 26)]
        for (x1, y1), (x2, y2) in zip(pts, pts[1:]):
            c.fill(c.line(x1, y1, x2, y2, 3.2), coral[0])
            c.fill(c.line(x1 + 0.8, y1, x2 + 0.8, y2, 1), coral[1])
        # 珊瑚枝杈
        c.fill(c.line(18, 29 + sign * 13, 23, 29 + sign * 15, 2), coral[0])
        c.fill(c.line(19, 29 + sign * 20, 24, 29 + sign * 19, 2), coral[0])
        c.fill(c.circle(23.5, 29 + sign * 15, 1.4), coral[1])
        c.fill(c.circle(24.5, 29 + sign * 19, 1.4), coral[1])
    # 弓弦
    c.fill(c.line(13, 3, 9, 29, 1), "#e8f0ff")
    c.fill(c.line(9, 29, 13, 55, 1), "#e8f0ff")
    # 搭着的箭
    c.fill(c.line(9, 29, 27, 29, 1), WOOD[1])
    c.fill(c.polygon([(26, 27), (29, 29), (26, 31)]), "#ff8fb0")
    grip = (16, 29)
    fist(c, *grip)
    return c, grip, (28, 29)


def lantern_beam():
    c = Canvas(62, 34)
    body = tone("#2d3e72")
    # 鱼身：枪身
    shape = c.ellipse(30, 19, 24, 10)
    c.shade(shape, 30, 19, 24, 10, *body)
    c.fill(shape & c.rect(8, 22, 54, 30), "#5d6fa8")
    # 尾鳍
    c.fill(c.polygon([(8, 19), (1, 11), (3, 19), (1, 27)]), body[1])
    # 大嘴就是枪口
    c.fill(c.polygon([(45, 15), (56, 12), (57, 26), (45, 23)]), "#1a0f2a")
    for x in range(47, 56, 3):
        c.fill(c.polygon([(x, 14), (x + 2, 14), (x + 1, 17)]), WHITE)
        c.fill(c.polygon([(x, 24), (x + 2, 24), (x + 1, 21)]), WHITE)
    eye(c, 40, 14, 2)
    # 头顶的灯笼
    c.fill(c.line(36, 10, 40, 2, 1.2), body[2])
    c.fill(c.line(40, 2, 47, 3, 1.2), body[2])
    c.fill(c.circle(48, 5, 3.6), "#fff36b")
    c.fill(c.circle(47, 4, 1.6), WHITE)
    grip = (22, 26)
    fist(c, *grip)
    return c, grip, (56, 19)


def slush_blaster():
    c = Canvas(56, 32)
    teal = tone("#3bc4c4")
    bar(c, 10, 17, 46, 24, teal, 2, 2)
    # 喷嘴
    bar(c, 46, 18, 53, 23, tone("#d9e2ec"))
    c.fill(c.rect(53, 17, 55, 24), tone("#d9e2ec")[2])
    # 顶上的冰沙杯：透明杯 + 粉蓝冰沙 + 吸管
    cup = c.polygon([(18, 4), (34, 4), (32, 17), (20, 17)])
    c.fill(cup, "#d8f4ff")
    c.fill(cup & c.rect(0, 9, 60, 17), "#7fd8ff")
    c.fill(cup & c.rect(0, 12, 60, 17), "#ff9ec0")
    c.fill(c.ellipse(26, 5, 9, 2.6), "#e9fbff")
    c.fill(c.line(29, 6, 33, 0.5, 1.4), "#ff5d73")
    for x, y in ((22, 10), (28, 13), (25, 8)):
        c.dot(x, y, WHITE)
    grip = (18, 26)
    c.fill(c.rect(15, 23, 21, 29), teal[2])
    fist(c, *grip)
    return c, grip, (55, 20)


def jelly_guard():
    c = Canvas(54, 30)
    bar(c, 3, 14, 34, 17, tone("#8a6bd1"))
    bar(c, 30, 13, 33, 18, GOLD)
    pink = tone("#ff9ed6")
    # 水母伞盖
    bell = c.ellipse(43, 12, 9, 8) & c.rect(30, 0, 60, 14)
    c.fill(bell, pink[0])
    c.fill(bell & c.ellipse(41, 8, 5, 3), pink[1])
    c.fill(c.rect(34, 13, 53, 15), pink[2])
    # 飘带触手
    for k, x in enumerate((36, 40, 44, 48, 51)):
        wobble = 1 if k % 2 else -1
        c.fill(c.line(x, 15, x + wobble, 20, 1.2), pink[0])
        c.fill(c.line(x + wobble, 20, x, 26, 1.2), pink[2])
    eye(c, 41, 9, 1.4)
    eye(c, 46, 9, 1.4)
    grip = (14, 15)
    fist(c, *grip)
    return c, grip, (52, 12)


def swordfish_spear():
    c = Canvas(88, 20)
    bar(c, 2, 9, 52, 12, WOOD)
    blue = tone("#2f7fd8")
    # 剑鱼头：身体 + 长吻
    body = c.blob(60, 10, 9, 5.5, blue)
    c.fill(body & c.rect(50, 11, 70, 16), "#cfe3f7")
    c.fill(c.polygon([(66, 8), (86, 10), (66, 12)]), "#9fb6cc")
    c.fill(c.line(67, 9, 84, 10, 1), WHITE)
    # 背鳍、尾鳍
    c.fill(c.polygon([(55, 6), (60, 1), (62, 6)]), blue[2])
    c.fill(c.polygon([(52, 10), (47, 5), (49, 10), (47, 15)]), blue[1])
    eye(c, 63, 9, 1.4)
    grip = (24, 10)
    fist(c, *grip)
    return c, grip, (86, 10)


def shark_katana():
    c = Canvas(80, 18)
    # 刀柄：缠绳
    bar(c, 2, 7, 22, 11, tone("#2b2f4a"))
    for x in range(4, 22, 3):
        c.fill(c.line(x, 7, x + 2, 11, 1), tone("#e8414f")[0])
    # 刀镡：鲨鱼尾形
    c.fill(c.polygon([(22, 3), (26, 9), (22, 15), (24, 9)]), GOLD[0])
    # 刀身
    blade = c.polygon([(25, 7), (70, 7), (78, 9), (70, 11), (25, 11)])
    c.fill(blade, "#c9d6e6")
    c.fill(blade & c.rect(0, 7, 80, 8), WHITE)
    c.fill(blade & c.rect(0, 10, 80, 11), "#7f93ad")
    # 刃口一排鲨鱼牙
    for x in range(28, 68, 4):
        c.fill(c.polygon([(x, 11), (x + 3, 11), (x + 1.5, 14)]), WHITE)
    c.fill(c.line(27, 9, 66, 9, 1), "#9fb6cc")
    grip = (12, 9)
    fist(c, *grip)
    return c, grip, (78, 9)


def bubble_gatling():
    c = Canvas(66, 34)
    body = tone("#e2558f")
    bar(c, 10, 14, 34, 28, body, 2, 3)
    # 三根透明枪管
    for k, y in enumerate((15, 19, 23)):
        c.fill(c.rect(34, y, 60, y + 3), "#bfeaff")
        c.fill(c.rect(34, y, 60, y + 1), WHITE)
        c.fill(c.rect(58, y - 0.5, 62, y + 3.5), tone("#7a8aa8")[0])
    for x in (38, 50):
        bar(c, x, 13, x + 3, 28, tone("#7a8aa8"))
    # 顶上的泡泡水瓶
    bottle = c.rect(14, 4, 26, 14)
    c.fill(bottle, "#8fe0ff")
    c.fill(bottle & c.rect(0, 4, 60, 7), "#d6f6ff")
    c.fill(c.rect(17, 1, 23, 4), body[0])
    for x, y, r in ((29, 6, 2.2), (33, 2.5, 1.5), (9, 6, 1.6)):
        c.fill(c.ring(x, y, r, 1), "#9fdcff")
        c.dot(x - r * 0.4, y - r * 0.4, WHITE)
    grip = (20, 27)
    c.fill(c.rect(17, 27, 23, 32), body[2])
    fist(c, *grip)
    return c, grip, (62, 20)


def urchin_mortar():
    c = Canvas(56, 32)
    drum = tone("#5a6b8c")
    bar(c, 8, 10, 40, 24, drum, 2, 3)
    for x in (14, 24):
        bar(c, x, 9, x + 2, 25, GOLD)
    # 喇叭口
    c.fill(c.polygon([(40, 8), (48, 4), (48, 30), (40, 26)]), drum[0])
    c.fill(c.polygon([(40, 8), (48, 4), (48, 7), (40, 10)]), drum[1])
    # 探出头的海胆
    for k in range(10):
        a = -math.pi / 2 + k * math.pi / 9
        c.fill(c.line(48, 17, 48 + math.cos(a) * 9, 17 + math.sin(a) * 9, 1.4), "#5b2a86")
    urchin = c.blob(48, 17, 5, 6, tone("#8a4fc8"))
    eye(c, 49, 15, 1.3)
    grip = (18, 25)
    c.fill(c.rect(15, 23, 21, 29), drum[2])
    fist(c, *grip)
    return c, grip, (53, 17)


def bubble_bouncer():
    c = Canvas(46, 30)
    orange = tone("#ff8a2a")
    teal = tone("#29b6c6")
    bar(c, 8, 9, 34, 17, orange, 2, 2)
    bar(c, 34, 11, 42, 15, teal)
    c.fill(c.rect(42, 10, 44, 16), teal[2])
    # 透明水箱
    tank = c.ellipse(20, 6, 7, 4)
    c.fill(tank, "#a8e8ff")
    c.fill(tank & c.rect(0, 6, 40, 11), "#4fb8ff")
    c.dot(17, 4, WHITE)
    # 扳机护圈与握把
    c.fill(c.ring(24, 19, 3, 1), orange[2])
    grip = (14, 21)
    c.fill(c.rect(11, 16, 18, 26), orange[0])
    fist(c, *grip)
    return c, grip, (44, 13)


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


def shot_rocket():
    c = Canvas(28, 14)
    purple = tone("#b0479c")
    c.blob(15, 7, 9, 4, purple)
    c.fill(c.polygon([(22, 3), (27, 7), (22, 11)]), "#ff8fb0")
    eye(c, 18, 6, 1.3)
    # 尾焰触手
    for y in (4, 7, 10):
        c.fill(c.line(6, y, 2, y + (y - 7) * 0.4, 1.6), "#ffb347")
    return c


def shot_eel():
    c = Canvas(18, 18)
    c.fill(c.circle(9, 9, 6), "#5ad1ff")
    c.fill(c.circle(8, 8, 3), "#e8fbff")
    zig = [(2, 9), (6, 6), (9, 11), (12, 6), (16, 9)]
    for (x1, y1), (x2, y2) in zip(zig, zig[1:]):
        c.fill(c.line(x1, y1, x2, y2, 1.2), "#fff36b")
    return c


def shot_fin():
    c = Canvas(36, 30)
    fin = tone("#6f8fb3")
    shape = fin_shape(c, 0, 0)
    c.fill(shape, fin[0])
    c.fill(shape & c.polygon([(3, 26), (11, 2), (14, 3), (7, 26)]), fin[1])
    c.fill(shape & c.line(10, 25, 14, 15, 1.4), WHITE)
    return c


def shot_puffer():
    c = Canvas(18, 16)
    for k in range(10):
        a = k * math.tau / 10
        c.fill(c.line(9 + math.cos(a) * 4, 8 + math.sin(a) * 4, 9 + math.cos(a) * 7, 8 + math.sin(a) * 7, 1), "#e8a020")
    body = c.blob(9, 8, 5, 5, tone("#ffd34d"))
    c.fill(body & c.rect(0, 9, 18, 16), "#fff6d0")
    eye(c, 11, 6, 1.2)
    c.dot(14, 9, "#4a1027")
    return c


def shot_arrow():
    c = Canvas(30, 9)
    c.fill(c.line(4, 4, 24, 4, 1.2), WOOD[1])
    c.fill(c.polygon([(23, 1), (29, 4), (23, 7)]), "#ff6f7d")
    c.fill(c.polygon([(1, 1), (6, 4), (1, 7), (3, 4)]), "#ffd2dc")
    return c


def shot_slush():
    c = Canvas(14, 14)
    ice = c.polygon([(7, 1), (12, 5), (11, 11), (5, 13), (1, 8), (3, 3)])
    c.fill(ice, "#bfeeff")
    c.fill(ice & c.polygon([(7, 1), (12, 5), (7, 6), (3, 3)]), WHITE)
    c.fill(ice & c.circle(9, 10, 2), "#ff9ec0")
    return c


def shot_jelly():
    c = Canvas(22, 24)
    pink = tone("#ff9ed6")
    bell = c.ellipse(11, 9, 8, 7) & c.rect(0, 0, 22, 11)
    c.fill(bell, pink[0])
    c.fill(bell & c.ellipse(9, 6, 4, 2.6), pink[1])
    c.fill(c.rect(3, 10, 19, 12), pink[2])
    for k, x in enumerate((5, 9, 13, 17)):
        w = 1 if k % 2 else -1
        c.fill(c.line(x, 12, x + w, 17, 1.2), pink[0])
        c.fill(c.line(x + w, 17, x, 22, 1.2), pink[2])
    eye(c, 8, 7, 1.2, 0)
    eye(c, 14, 7, 1.2, 0)
    # 带电火花
    for x, y in ((1, 4), (20, 3)):
        c.dot(x, y, "#fff36b")
    return c


def shot_bubble():
    c = Canvas(14, 14)
    c.fill(c.circle(7, 7, 5.5), "#c9efff")
    c.fill(c.ring(7, 7, 5.5, 1.2), "#7fd0ff")
    c.fill(c.circle(5, 5, 1.6), WHITE)
    return c


def shot_urchin():
    c = Canvas(20, 20)
    for k in range(12):
        a = k * math.tau / 12
        c.fill(c.line(10, 10, 10 + math.cos(a) * 8.5, 10 + math.sin(a) * 8.5, 1.3), "#5b2a86")
    c.blob(10, 10, 4.5, 4.5, tone("#8a4fc8"))
    eye(c, 11, 9, 1.1)
    return c


def shot_spine():
    c = Canvas(16, 7)
    c.fill(c.polygon([(1, 1.5), (15, 3.5), (1, 5.5)]), "#8a4fc8")
    c.fill(c.line(2, 3, 13, 3.5, 0.9), "#c7a2f0")
    return c


def shot_water():
    c = Canvas(16, 12)
    drop = c.ellipse(9, 6, 5, 4) | c.polygon([(5, 3), (1, 6), (5, 9)])
    c.fill(drop, "#4fb8ff")
    c.fill(drop & c.ellipse(9, 5, 3, 2), "#a8e8ff")
    c.dot(10, 4, WHITE)
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


def finish(c: Canvas) -> Image.Image:
    c.outline(OUTLINE)
    return c.image()


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
    return str(int(v)) if float(v).is_integer() else f"{v:g}"


def build(preview_dir: str | None = None) -> None:
    images: dict[str, Image.Image] = {}
    meta: dict[str, tuple[tuple[float, float], tuple[float, float]]] = {}
    for name, draw in WEAPONS.items():
        c, grip, muzzle = draw()
        images[name] = finish(c)
        # 拳头画在像素格里，中心在格子中间。
        meta[name] = ((grip[0] + 0.5, grip[1] + 0.5), muzzle)
    for name, draw in SHOTS.items():
        images[name] = finish(draw())
    atlas, rects = pack(images)
    atlas.save(ATLAS, optimize=True)
    write_data(rects, meta, images)
    if preview_dir:
        os.makedirs(preview_dir, exist_ok=True)
        frames = [images[n] for n in WEAPONS] + [images[n] for n in SHOTS]
        preview(frames, 6, 5).save(os.path.join(preview_dir, "arsenal.png"))
    print(f"arsenal {atlas.width}x{atlas.height} -> {ATLAS}")


def write_data(rects, meta, images) -> None:
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
            f"    scale: {fmt(SCALE)},",
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
        "/** 弹体贴图 1 个图集像素对应的游戏像素；比武器图大一档，飞行中看得清。 */",
        f"export const ARSENAL_SHOT_SCALE = {fmt(SHOT_SCALE)};",
        "",
    ]
    with open(DATA, "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines))


if __name__ == "__main__":
    out = sys.argv[sys.argv.index("--preview") + 1] if "--preview" in sys.argv else None
    build(out)
