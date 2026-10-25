"""生成普通怪物像素图集 public/assets/demo/monsters-v1.png 与帧数据 src/data/monsterArt.ts。

用法（仓库根目录）：python3 art-src/monsters/build_monsters.py [--preview 输出目录]

全部为本项目原创的抽象搞怪蛙类怪，整体参考元气骑士：粗颗粒、1 像素黑描边、两到三档硬边明暗、亮色。
1 个图集像素 = 0.5 个游戏像素（与大肥鱼同一颗粒密度）。默认朝右，游戏里按朝向翻面。
每只怪的长相直接对应它的招式，动作名与 sim 的 pose 一一对应（ADR 0028）：
idle 待机、move 移动、windup 蓄力、attack 出招、air 腾空、recover 后摇/眩晕、buried 地下、spin 旋转、death 死亡。
"""

from __future__ import annotations

import math
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

from PIL import Image  # noqa: E402

from pixelkit import OUTLINE, Canvas, mix, preview  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
ATLAS = os.path.join(ROOT, "public", "assets", "demo", "monsters-v1.png")
DATA = os.path.join(ROOT, "src", "data", "monsterArt.ts")
ART_SCALE = 0.5
WHITE = "#f7f4ea"
PINK = "#ff8fb0"
RED = "#e8414f"
MOUTH = "#4a1027"
TONGUE = "#ff7a9a"
GOLD = ("#f4c542", "#ffe58a", "#b98a22")


# ---------------------------------------------------------------- 通用部件


def eye(c: Canvas, x: float, y: float, r: float, state: str = "open", look: float = 0.5, lid=None) -> None:
    """凸起的蛙眼：黑圈 → 眼白 → 大瞳孔 + 高光。state 决定表情。"""
    c.fill(c.circle(x, y, r + 1), OUTLINE)
    if state in ("blink", "happy", "dead", "spiral", "tired"):
        c.fill(c.circle(x, y, r), lid or WHITE)
        if state == "blink":
            c.fill(c.rect(x - r, y - 0.5, x + r, y + 0.7), OUTLINE)
        elif state == "tired":
            c.fill(c.rect(x - r, y - r, x + r, y), lid or "#9aa0b0")
            c.fill(c.circle(x + look, y + r * 0.35, r * 0.45), OUTLINE)
        elif state == "happy":
            for dx in range(-int(r), int(r) + 1):
                c.dot(x + dx, y - (r - abs(dx)) * 0.6 + 0.6, OUTLINE)
        elif state == "dead":
            for d in (-1, 0, 1):
                c.dot(x + d, y + d, OUTLINE)
                c.dot(x + d, y - d, OUTLINE)
        else:
            c.fill(c.ring(x, y, r * 0.75, 1) | c.circle(x, y, 0.8), OUTLINE)
        return
    c.fill(c.circle(x, y, r), "#ffe066" if state == "glow" else WHITE)
    pr = max(1.0, r * 0.55)
    px = x + look * (r - pr) * 0.9
    py = y + 0.3
    c.fill(c.circle(px, py, pr) & c.circle(x, y, r), RED if state in ("glow", "angry") else OUTLINE)
    c.dot(px - pr * 0.35, py - pr * 0.45, WHITE)
    if state == "angry":
        c.fill(c.line(x - r - 0.5, y - r - 0.5, x + r + 0.5, y - r * 0.2, 1.2), OUTLINE)


def mouth_line(c: Canvas, x0: float, x1: float, y: float, curve: float = 0.8) -> None:
    for x in range(int(x0), int(x1) + 1):
        t = (x - (x0 + x1) / 2) / max((x1 - x0) / 2, 1)
        c.dot(x, y + curve * (1 - t * t), OUTLINE)


def mouth_open(c: Canvas, cx: float, cy: float, rx: float, ry: float, teeth: bool = True, tongue: bool = True) -> None:
    c.fill(c.ellipse(cx, cy, rx + 1, ry + 1), OUTLINE)
    inner = c.ellipse(cx, cy, rx, ry)
    c.fill(inner, MOUTH)
    if tongue:
        c.fill(inner & c.ellipse(cx + 0.5, cy + ry * 0.55, rx * 0.65, ry * 0.5), TONGUE)
    if teeth:
        for k in range(-2, 3):
            c.fill(inner & c.rect(cx + k * rx * 0.38 - 0.6, cy - ry, cx + k * rx * 0.38 + 0.9, cy - ry + 1.6), WHITE)


def feet(c: Canvas, x: float, y: float, color, spread: float = 4.0, step: int = 0) -> None:
    for i, side in enumerate((-1, 1)):
        lift = 1 if (step == 1 and i == 0) or (step == 2 and i == 1) else 0
        c.fill(c.ellipse(x + side * spread, y - 1 - lift, 2.4, 1.4), color)


def cheeks(c: Canvas, xs, y: float, r: float = 1.4) -> None:
    for x in xs:
        c.fill(c.ellipse(x, y, r, r * 0.6), PINK)


def puff(c: Canvas, cx: float, cy: float, r: float, t: float) -> None:
    """死亡白烟：t 0→1 变大，中间逐渐镂空。"""
    for i, (dx, dy, k) in enumerate(((-0.7, 0.1, 0.7), (0.65, 0.0, 0.8), (0, -0.5, 0.9), (-0.1, 0.45, 0.75))):
        rr = r * k * (0.6 + t * 0.6)
        c.fill(c.ellipse(cx + dx * r * (0.8 + t), cy + dy * r * (0.8 + t), rr, rr * 0.85), "#d9dde8" if i % 2 else "#f2f4f8")
    if t > 0.45:
        c.clear(c.ellipse(cx, cy, r * 0.5 * t, r * 0.45 * t))


def speed_lines(c: Canvas, x: float, y: float, rows=(-4, 0, 4), length: int = 5) -> None:
    for i, dy in enumerate(rows):
        for k in range(length - i):
            c.dot(x - k, y + dy, "#f2f8ff")


def stars(c: Canvas, x: float, y: float, phase: int) -> None:
    for i in range(3):
        a = phase * 1.2 + i * 2.1
        sx, sy = x + math.cos(a) * 6, y + math.sin(a) * 1.8
        c.dot(sx, sy, "#ffe36a")
        c.dot(sx + 1, sy, "#fff6b0")


def spark(c: Canvas, x: float, y: float, phase: int, big: bool = False) -> None:
    pts = [(0, 0), (1, -1), (-1, -1), (1, 1), (-1, 1), (0, -2), (2, 0), (-2, 0), (0, 2)]
    n = (6 if big else 4) + phase % 3
    for i, (dx, dy) in enumerate(pts[:n]):
        c.dot(x + dx, y + dy, ("#ffffff", "#ffe36a", "#ff8a2a")[min(i // 3, 2)])


def dirt(c: Canvas, cx: float, fy: float, rx: float, phase: int) -> None:
    for k in range(8):
        a = math.pi * (1.08 + k * 0.12)
        d = rx * (0.9 + phase * 0.35)
        c.dot(cx + math.cos(a) * d * 1.1, fy - 3 + math.sin(a) * d * 0.7, "#b98a55" if k % 2 else "#8a6236")
        c.dot(cx - math.cos(a) * d * 1.1, fy - 3 + math.sin(a) * d * 0.7, "#8a6236" if k % 2 else "#b98a55")


# ---------------------------------------------------------------- 各怪物
# 每个函数 draw(c, f)：f 是这一帧的参数字典，至少含 action 与 i（帧序号）。
# 共同参数：sy/sx 压扁拉长、dy 整体上下、eyes 表情、shake 左右抖。


GREEN = ("#6fd04f", "#a8f06c", "#3d983a")


def chaser(c: Canvas, f: dict) -> None:
    """大头蛙：一整颗大蛙头 + 两只小脚，扑咬时整张嘴撑满脸。"""
    sx, sy, dy, shake = f.get("sx", 1), f.get("sy", 1), f.get("dy", 0), f.get("shake", 0)
    cx, fy = 16 + shake, 28
    rx, ry = 12.5 * sx, 11 * sy
    cy = fy - 1 - ry + dy
    if f["action"] != "attack":
        feet(c, cx, fy + dy * 0.3, GREEN[2], 5, f.get("step", 0))
    c.blob(cx, cy, rx, ry, GREEN)
    c.fill(c.circle(cx - rx * 0.55, cy + ry * 0.05, 1.3) & c.ellipse(cx, cy, rx, ry), "#58b244")
    c.fill(c.circle(cx + rx * 0.35, cy - ry * 0.35, 1.0), "#58b244")
    if f["action"] == "attack":
        mouth_open(c, cx + 1.5, cy + ry * 0.25, rx * 0.8, ry * 0.55)
    elif f.get("mouth") == "tight":
        mouth_line(c, cx - rx * 0.5, cx + rx * 0.75, cy + ry * 0.3, 0.2)
    else:
        mouth_line(c, cx - rx * 0.75, cx + rx * 0.85, cy + ry * 0.2, 1.4)
        cheeks(c, (cx - rx * 0.62, cx + rx * 0.72), cy + ry * 0.45)
    eyes = f.get("eyes", "open")
    eye(c, cx - rx * 0.45, cy - ry * 0.75, 3.4, eyes, 0.6)
    eye(c, cx + rx * 0.4, cy - ry * 0.82, 3.7, eyes, 0.6)


def scout(c: Canvas, f: dict) -> None:
    """腿蛙：小小的身子架在两条超长的腿上，穿着橙色运动鞋，跑得飞快。"""
    i, act = f["i"], f["action"]
    cx, fy = 12 + f.get("shake", 0), 29
    bob = f.get("dy", 0)
    swing = f.get("swing", 0)
    hip_y = 13 + bob
    for side, k in ((-1, 1), (1, -1)):
        hx = cx + side * 2.5
        footx = hx + swing * k * 4
        knee = (hx + swing * k * 2 + side * 1.5, (hip_y + fy) / 2)
        c.fill(c.line(hx, hip_y, knee[0], knee[1], 2.2) | c.line(knee[0], knee[1], footx, fy - 2, 2.2), "#38b6c4")
        c.fill(c.ellipse(footx + 1, fy - 1.5, 3, 1.6), "#ff8a3d")
        c.fill(c.rect(footx - 1, fy - 1.2, footx + 3.5, fy - 0.4), WHITE)
    c.blob(cx, 8.5 + bob, 7.5, 5.5, ("#47d3d9", "#8af0ec", "#25979f"))
    mouth_line(c, cx - 3, cx + 5, 10 + bob, 0.6)
    eyes = f.get("eyes", "open")
    eye(c, cx - 3, 4 + bob, 2.6, eyes, 0.7)
    eye(c, cx + 3.5, 3.5 + bob, 2.9, eyes, 0.7)
    _ = (i, act)


def tank(c: Canvas, f: dict) -> None:
    """铁桶蛙：整只蛙缩在铁桶里，只露出眼睛和头顶，桶下伸出两只脚。"""
    shake, step, dy = f.get("shake", 0), f.get("step", 0), f.get("dy", 0)
    cx, fy = 20 + shake, 40
    feet(c, cx, fy, "#3d983a", 8, step)
    top, bottom = 13 + dy, fy - 2
    # 头顶从桶口冒出来
    c.blob(cx, top + 1, 11, 5, GREEN)
    eyes = f.get("eyes", "open")
    eye(c, cx - 5.5, top - 2, 3.4, eyes, 0.6)
    eye(c, cx + 5, top - 2.5, 3.7, eyes, 0.6)
    bucket = c.polygon([(cx - 14, top), (cx + 14, top), (cx + 12, bottom), (cx - 12, bottom)])
    c.shade(bucket, cx, (top + bottom) / 2, 13, 14, "#8f98a8", "#c3cad6", "#5d6475", 0.5, -0.1)
    for y in (top + 4, bottom - 5):
        c.fill(bucket & c.rect(0, y, 99, y + 2), "#5d6475")
        for k in (-9, -3, 3, 9):
            c.dot(cx + k, y + 0.5, "#dfe4ec")
    c.fill(c.rect(cx - 15, top - 1, cx + 15, top + 1.5), "#c3cad6")
    c.fill(c.rect(cx - 15, top + 0.5, cx + 15, top + 1.5), "#5d6475")
    if f.get("dent"):
        c.fill(c.circle(cx + 6, top + 12, 2), "#5d6475")


def spitter(c: Canvas, f: dict) -> None:
    """喇叭蛙：嘴长成一只铜喇叭，鼓起腮帮子就会吹出泡泡弹。"""
    act, i = f["action"], f["i"]
    cx, fy = 13 + f.get("shake", 0), 28
    ry = 9 * f.get("sy", 1)
    cy = fy - 1 - ry
    feet(c, cx, fy, "#5a3a8e", 5, f.get("step", 0))
    c.blob(cx, cy, 10, ry, ("#9b6ad6", "#c9a2f4", "#69449e"))
    puffed = act == "windup"
    if puffed:
        r = 3.2 + i
        c.blob(cx + 4, cy + 2, r, r * 0.9, ("#ffb3cf", "#ffd6e5", "#e27ea5"))
    bell = 30 + (1.5 if act == "attack" and i == 0 else 0)
    horn = c.polygon([(cx + 6, cy + 0.5), (bell, cy - 5), (bell, cy + 8), (cx + 6, cy + 3.5)])
    c.shade(horn, (cx + bell) / 2, cy + 1.5, 8, 6, *GOLD)
    c.fill(c.ellipse(bell, cy + 1.5, 2, 6.5), GOLD[2])
    c.fill(c.ellipse(bell + 0.5, cy + 1.5, 1.2, 5.2), "#5a3a12")
    if act == "attack" and i == 0:
        c.fill(c.circle(bell + 3, cy, 2.2), "#bfe9ff")
        c.dot(bell + 2.5, cy - 0.8, WHITE)
    eyes = f.get("eyes", "open")
    eye(c, cx - 4, cy - ry * 0.75, 3.0, eyes, 0.7)
    eye(c, cx + 2.5, cy - ry * 0.85, 3.3, eyes, 0.7)
    for k, (u, v) in enumerate(((-6, -1), (-2, 4), (-7, 4))):
        c.dot(cx + u, cy + v, "#c9a2f4" if k % 2 else "#69449e")


def turret(c: Canvas, f: dict) -> None:
    """盆栽蛙：蛙头种在陶土花盆里，头顶两片叶子；摇叶子蓄力，然后吐出一排种子弹。"""
    act, i = f["action"], f["i"]
    cx, fy = 15 + f.get("shake", 0), 33
    sway = f.get("sway", 0)
    # 叶子
    stem_y = 6
    c.fill(c.line(cx, stem_y + 4, cx + sway * 0.5, stem_y - 1, 1.4), "#3f8f3a")
    for side in (-1, 1):
        lx = cx + side * 5 + sway
        c.blob(lx, stem_y - 1 + abs(sway) * 0.3, 4.5, 2.2, ("#58c24b", "#94ea74", "#2f7f35"), angle=side * 0.5)
    hy = 15 + f.get("dy", 0)
    c.blob(cx, hy, 10, 7.5, ("#e8604f", "#ff967c", "#a93c3f"))
    if act == "attack":
        mouth_open(c, cx + 3, hy + 2.5, 3, 2.2, teeth=False, tongue=False)
    elif act == "windup":
        mouth_open(c, cx + 2, hy + 2.5, 1.8, 1.5, teeth=False, tongue=False)
    else:
        mouth_line(c, cx - 5, cx + 6, hy + 2, 0.7)
        cheeks(c, (cx - 6, cx + 7), hy + 3.5)
    eyes = f.get("eyes", "open")
    eye(c, cx - 4.5, hy - 5, 3.0, eyes, 0.6)
    eye(c, cx + 4, hy - 5.5, 3.2, eyes, 0.6)
    pot = c.polygon([(cx - 11, 20), (cx + 11, 20), (cx + 8.5, fy - 1), (cx - 8.5, fy - 1)])
    c.shade(pot, cx, 26, 10, 7, "#d2794a", "#f0a06a", "#9a4f2c", 0.45, -0.2)
    c.fill(c.rect(cx - 12, 19, cx + 12, 22.5), "#e48a57")
    c.fill(c.rect(cx - 12, 22, cx + 12, 22.8), "#9a4f2c")
    if act == "attack" and i == 0:
        spark(c, cx + 8, hy + 2, 1)


def charger(c: Canvas, f: dict) -> None:
    """保龄球蛙：一颗长着蛙眼的保龄球。原地空转蓄力，然后滚着撞过来，撞完会晕。"""
    cx, fy = 15 + f.get("shake", 0), 28
    r = 11.5
    cy = fy - r - 0.5
    roll = f.get("roll", 0.0)
    ball = c.circle(cx, cy, r)
    c.shade(ball, cx, cy, r, r, "#5b3c9e", "#8a6ad0", "#34205f", 0.4, -0.25)
    c.fill(c.ellipse(cx - 4.5, cy - 5.5, 3, 1.6, -0.6), "#c3b3ef")
    # 指孔在球的下半圈随滚动转动；转到上半圈（眼睛的位置）就藏到背面不画。
    for k in range(3):
        a = 0.9 + roll + k * 0.6
        hx, hy = cx + math.cos(a) * 6.5, cy + math.sin(a) * 6.5
        if hy > cy - 1.5:
            c.fill(c.circle(hx, hy, 1.4), "#150d26")
    eyes = f.get("eyes", "open")
    look = 0.8 if eyes != "spiral" else 0
    eye(c, cx - 1, cy - r * 0.45, 3.2, eyes, look)
    eye(c, cx + 6, cy - r * 0.5, 3.4, eyes, look)
    if f.get("lines"):
        speed_lines(c, cx - r - 2, cy, (-5, 0, 5), 6)
    if f.get("stars") is not None:
        stars(c, cx, cy - r - 2, f["stars"])


def hopper(c: Canvas, f: dict) -> None:
    """弹簧蛙：坐在一根弹簧上。压缩弹簧蓄力，弹起来砸向玩家，落地震出一圈弹幕。"""
    act, i = f["action"], f["i"]
    cx, fy = 15, 45
    coil = f.get("coil", 1.0)
    top = fy - 3 - 15 * coil
    c.fill(c.ellipse(cx, fy - 1.5, 6, 1.8), "#5d6475")
    turns = 5
    for k in range(turns):
        y0 = fy - 3 - (fy - 3 - top) * k / turns
        y1 = fy - 3 - (fy - 3 - top) * (k + 0.5) / turns
        y2 = fy - 3 - (fy - 3 - top) * (k + 1) / turns
        c.fill(c.line(cx - 4, y0, cx + 4, y1, 1.6) | c.line(cx + 4, y1, cx - 4, y2, 1.6), "#c3cad6" if k % 2 else "#9aa3b3")
    ry = 7.5 * f.get("sy", 1)
    cy = top - ry + 1.5
    c.blob(cx, cy, 10 * f.get("sx", 1), ry, ("#ffb02e", "#ffd36b", "#d47a12"))
    if act == "air":
        mouth_open(c, cx + 1.5, cy + 2.5, 2.5, 2, teeth=False)
    else:
        mouth_line(c, cx - 5.5, cx + 6.5, cy + 2, 1.2 if act != "windup" else 0.2)
    eyes = "wide" if act == "air" else f.get("eyes", "open")
    eye(c, cx - 4.5, cy - ry * 0.85, 3.0 if eyes != "wide" else 3.5, "open" if eyes == "wide" else eyes, 0.5)
    eye(c, cx + 4, cy - ry * 0.95, 3.2 if eyes != "wide" else 3.7, "open" if eyes == "wide" else eyes, 0.5)
    _ = i


def splitter(c: Canvas, f: dict) -> None:
    """叠罗汉蛙：三只小蛙叠成一摞，走起来摇摇晃晃；被打倒就散成一地蝌蚪崽。"""
    fy = 45
    wob = f.get("wob", 0)
    layers = [
        (15 + wob * -1, 38, 10.5, 6.5, ("#ff8fb8", "#ffbdd5", "#d15f8c")),
        (15 + wob * 1, 27, 9, 6, ("#ffb77a", "#ffd9a8", "#d9864a")),
        (15 + wob * -1.5, 17, 8, 5.5, ("#7fdcb0", "#b5f5d3", "#47a87e")),
    ]
    feet(c, 15, fy, "#d15f8c", 6, f.get("step", 0))
    eyes = f.get("eyes", "open")
    for k, (x, y, rx, ry, pal) in enumerate(layers):
        c.blob(x, y, rx, ry, pal)
        if k < 2:
            # 下面两层只露出眯着的眼，像被压着
            eye(c, x - 3, y - ry * 0.6, 2.0, "tired" if eyes == "open" else eyes, 0.4, pal[2])
            eye(c, x + 3.5, y - ry * 0.65, 2.0, "tired" if eyes == "open" else eyes, 0.4, pal[2])
        else:
            mouth_line(c, x - 3.5, x + 4.5, y + 1.5, 0.8)
            eye(c, x - 3, y - ry * 0.8, 2.6, eyes, 0.6)
            eye(c, x + 3.5, y - ry * 0.9, 2.8, eyes, 0.6)


def tadpole(c: Canvas, f: dict) -> None:
    """蝌蚪崽：戴墨镜的小黑蝌蚪，尾巴甩得飞快。"""
    phase = f.get("tail", 0)
    hx, hy = 12, 7
    for k in range(8):
        t = k / 7
        x = hx - 3 - t * 8
        y = hy + math.sin(t * 3.4 + phase * 1.7) * (0.4 + t * 1.9)
        c.fill(c.circle(x, y, 1.7 - k * 0.15), "#2b2f45" if k < 5 else "#454b6b")
    c.blob(hx, hy, 4.5, 4, ("#2b2f45", "#4d5579", "#171a29"))
    c.fill(c.rect(hx - 3, hy - 2.2, hx + 5.5, hy - 0.2), OUTLINE)
    c.dot(hx - 1.5, hy - 1.8, "#9fd8ff")
    c.dot(hx + 3, hy - 1.8, "#9fd8ff")
    mouth_line(c, hx, hx + 3.5, hy + 1.5, 0.5)


def bomber(c: Canvas, f: dict) -> None:
    """炸弹蛙：一颗长着蛙眼和小脚的黑炸弹，头上的引信一直冒火花；鼓胀发红就快炸了。"""
    act, i = f["action"], f["i"]
    cx, fy = 16, 35
    swell = f.get("swell", 0.0)
    r = 11 + swell * 2.5
    cy = fy - 2 - r
    feet(c, cx, fy, "#2b2f45", 5, f.get("step", 0))
    hot = f.get("hot", 0.0)
    pal = (mix("#30364f", RED, hot), mix("#5a6386", "#ff8a8a", hot), mix("#171a29", "#7a1020", hot))
    c.blob(cx, cy, r, r, pal)
    c.fill(c.ellipse(cx - r * 0.4, cy - r * 0.45, 2.6, 1.4, -0.6), "#c7cde6")
    # 引信底座与引信
    c.fill(c.rect(cx + 2, cy - r - 1.5, cx + 7, cy - r + 1.5), "#8f98a8")
    for k in range(5):
        c.dot(cx + 5 + k * 0.7, cy - r - 2 - k, "#c8a46a")
    spark(c, cx + 8.6, cy - r - 7.5, i, big=act == "windup")
    eyes = f.get("eyes", "open")
    if act == "windup":
        eyes = "angry"
    eye(c, cx - 3, cy - 1, 3.2, eyes, 0.6)
    eye(c, cx + 4, cy - 1.5, 3.4, eyes, 0.6)
    mouth_line(c, cx - 3, cx + 5, cy + 5, 0.4 if act != "windup" else -0.4)


def tongue(c: Canvas, f: dict) -> None:
    """舌头蛙：几乎只有一张大嘴，蓄力时眼睛瞪圆、舌尖从嘴缝里探出来。"""
    act = f["action"]
    cx, fy = 15 + f.get("shake", 0), 28
    ry = 10.5 * f.get("sy", 1)
    cy = fy - 1 - ry
    feet(c, cx, fy, "#25716d", 5, f.get("step", 0))
    c.blob(cx, cy, 12.5, ry, ("#3db0a4", "#7be0cf", "#25716d"))
    lip_y = cy + 1
    if act == "attack":
        mouth_open(c, cx + 2, lip_y + 2, 10, 6, teeth=False, tongue=False)
        c.fill(c.ellipse(cx + 2, lip_y + 4, 6, 3) & c.ellipse(cx + 2, lip_y + 2, 10, 6), TONGUE)
    else:
        c.fill(c.line(cx - 10, lip_y, cx + 11.5, lip_y - 1, 2.6), "#ff8fb0")
        c.fill(c.line(cx - 10, lip_y + 0.3, cx + 11.5, lip_y - 0.7, 1.0), MOUTH)
        if act == "windup":
            c.fill(c.circle(cx + 12, lip_y, 2), TONGUE)
            c.dot(cx + 12, lip_y, "#c94a6a")
    eyes = "open" if act == "windup" else f.get("eyes", "open")
    big = 3.6 if act == "windup" else 2.8
    eye(c, cx - 3, cy - ry * 0.8, big, eyes, 1.0 if act == "windup" else 0.5)
    eye(c, cx + 4, cy - ry * 0.85, big + 0.2, eyes, 1.0 if act == "windup" else 0.5)


def brood(c: Canvas, f: dict) -> None:
    """蛙卵团：一坨半透明的蛙卵，每颗卵里都有一个黑点崽；鼓动着就会孵出蝌蚪崽。"""
    i, act = f["i"], f["action"]
    eggs = [(-9, 6, 6), (8, 7, 6.5), (0, 9, 6.5), (-5, -1, 6.5), (6, -1, 6), (0, -7, 6.5), (-11, -6, 4.5), (11, -6, 4.5)]
    cx, cy = 20, 21 + f.get("dy", 0)
    glow = f.get("glow", -1)
    for k, (dx, dy, r) in enumerate(eggs):
        if f.get("popped") == k:
            continue
        pulse = 0.6 if act == "windup" and (k + i) % 2 else 0
        x, y, rr = cx + dx, cy + dy, r + pulse
        c.fill(c.circle(x, y, rr + 1), OUTLINE)
        c.fill(c.circle(x, y, rr), "#fff1a0" if glow == k % 2 else "#b8e8b0")
        c.fill(c.circle(x - rr * 0.35, y - rr * 0.35, rr * 0.35), "#e6fbe0")
        c.fill(c.circle(x + 0.5, y + 0.5, 1.6), "#28403a")
    eyes = f.get("eyes", "open")
    eye(c, cx - 3, cy - 9, 3.0, eyes, 0.5)
    eye(c, cx + 3.5, cy - 9.5, 3.2, eyes, 0.5)
    if f.get("popped") is not None:
        spark(c, cx + eggs[f["popped"]][0], cy + eggs[f["popped"]][1], 1, True)


def burrower(c: Canvas, f: dict) -> None:
    """地洞蛙：戴着矿工安全帽的土黄蛙；钻进地下只剩帽灯在土堆上，冒头前土块乱飞。"""
    act, i = f["action"], f["i"]
    cx, fy = 16, 31
    if act == "buried":
        mound = c.ellipse(cx, fy - 3, 12, 4.5)
        c.shade(mound, cx, fy - 3, 12, 4.5, "#9b6c3d", "#c39260", "#6e4a28", 0.3, -0.2)
        hat_y = fy - 6 - (i % 2) * 0.6
        c.fill(c.ellipse(cx, hat_y, 6, 3) & c.rect(0, 0, 99, hat_y + 0.5), "#ffcf33")
        c.fill(c.rect(cx - 7, hat_y, cx + 7, hat_y + 1.2), "#e0a91a")
        c.fill(c.circle(cx + 3, hat_y - 1, 1.3), "#fffbe0")
        for k in (-8, -3, 4, 9):
            c.dot(cx + k, fy - 2 + (k % 3 == 0), "#6e4a28")
        return
    up = act in ("attack",)
    ry = 8.5 * f.get("sy", 1)
    cy = fy - 1 - ry
    if act == "windup":
        mound = c.ellipse(cx, fy - 3, 13, 5)
        c.shade(mound, cx, fy - 3, 13, 5, "#9b6c3d", "#c39260", "#6e4a28", 0.3, -0.2)
        cy = fy - 2 - ry * 0.6
        dirt(c, cx, fy, 11, i)
    else:
        feet(c, cx, fy, "#8a5a2a", 5, f.get("step", 0))
    c.blob(cx, cy, 11, ry, ("#d08a4a", "#f0b277", "#995d2c"))
    if up:
        for side in (-1, 1):
            c.fill(c.line(cx + side * 9, cy, cx + side * 13, cy - 7, 2.2), "#d08a4a")
            c.fill(c.circle(cx + side * 13, cy - 7.5, 1.6), "#f0b277")
        mouth_open(c, cx + 1, cy + 3, 4, 2.5, teeth=True, tongue=True)
    else:
        mouth_line(c, cx - 5, cx + 6, cy + 2.5, 1.0)
    eyes = f.get("eyes", "open")
    eye(c, cx - 4, cy - ry * 0.6, 2.8, eyes, 0.6)
    eye(c, cx + 4, cy - ry * 0.65, 3.0, eyes, 0.6)
    hat_y = cy - ry * 0.95
    c.fill(c.ellipse(cx, hat_y, 8, 4.2) & c.rect(0, 0, 99, hat_y + 0.5), "#ffcf33")
    c.fill(c.rect(cx - 9.5, hat_y, cx + 9.5, hat_y + 1.4), "#e0a91a")
    c.fill(c.circle(cx + 4, hat_y - 1.5, 1.5), "#fffbe0")
    if act == "windup":
        dirt(c, cx, fy, 11, i + 1)


def dancer(c: Canvas, f: dict) -> None:
    """街舞蛙：反戴棒球帽、挂金链子；绕着玩家扭着走，时不时倒立头转射出螺旋弹。"""
    act, i = f["action"], f["i"]
    cx, fy = 14, 33
    if act == "spin":
        # 倒立头转：帽子着地，身体朝上，腿随帧转动
        hy = fy - 4
        c.fill(c.ellipse(cx, hy + 1, 6.5, 2.6), "#e8414f")
        c.blob(cx, hy - 7, 7.5, 7, ("#4cc2e0", "#8fe4f6", "#2a86a8"))
        a = i * math.pi / 2
        for side in (-1, 1):
            lx = cx + math.cos(a + (0 if side > 0 else math.pi)) * 7
            ly = hy - 16 + math.sin(a + (0 if side > 0 else math.pi)) * 2
            c.fill(c.line(cx + side * 2, hy - 12, lx, ly, 2.2), "#2a86a8")
            c.fill(c.ellipse(lx, ly, 2.2, 1.4), WHITE)
        eye(c, cx - 3, hy - 4, 2.4, "happy", 0)
        eye(c, cx + 3, hy - 4, 2.4, "happy", 0)
        for k in range(3):
            c.dot(cx - 9 - k, hy - 7 + k * 3, "#f2f8ff")
        return
    lean = f.get("lean", 0)
    bob = f.get("dy", 0)
    feet(c, cx + lean * 0.5, fy, "#2a86a8", 4, f.get("step", 0))
    cy = fy - 10 + bob
    c.blob(cx + lean, cy, 8, 8.5, ("#4cc2e0", "#8fe4f6", "#2a86a8"))
    for k in range(-3, 4):
        c.fill(c.circle(cx + lean + k * 1.6, cy + 2.5 + (1 - (k / 3) ** 2) * 1.8, 0.9), GOLD[0])
    mouth_line(c, cx + lean - 3, cx + lean + 4, cy + 0.5, 0.9)
    eyes = f.get("eyes", "open")
    eye(c, cx + lean - 3, cy - 7.5, 2.7, eyes, 0.6)
    eye(c, cx + lean + 3, cy - 8, 2.9, eyes, 0.6)
    cap_y = cy - 12
    c.fill(c.ellipse(cx + lean, cap_y, 6, 3) & c.rect(0, 0, 99, cap_y + 0.8), "#e8414f")
    c.fill(c.rect(cx + lean - 9, cap_y - 0.2, cx + lean - 3, cap_y + 1.2), "#b82a3a")


def gasser(c: Canvas, f: dict) -> None:
    """放屁蛙：梨形胖蛙，鼓着腮、捏着鼻子，屁股后面不停冒出绿色毒气。"""
    i = f["i"]
    cx, fy = 19 + f.get("shake", 0), 31
    ry = 10 * f.get("sy", 1)
    cy = fy - 1 - ry
    if f.get("cloud") is not None:
        k = f["cloud"]
        for j, (dx, dy, r) in enumerate(((-13, 4, 4), (-17, 0, 3), (-15, -3, 2.5))):
            rr = r + (k % 2) * 0.7
            c.fill(c.circle(cx + dx - k * 0.6, cy + dy - k * 0.5, rr), "#a6e86a" if j % 2 else "#7cc84a")
    feet(c, cx, fy, "#6b7a2e", 5, f.get("step", 0))
    c.blob(cx, cy + 1, 11.5, ry, ("#a5ad3e", "#d3db6a", "#6b7a2e"))
    c.blob(cx + 3, cy + 3, 4, 3.5, ("#ffb3cf", "#ffd6e5", "#e27ea5"))
    c.fill(c.rect(cx + 8, cy - 2, cx + 12, cy), "#f2f2f2")
    c.fill(c.rect(cx + 8, cy - 1.5, cx + 12, cy - 0.5), "#c94a4a")
    eyes = f.get("eyes", "tired")
    eye(c, cx - 4, cy - ry * 0.7, 3.0, eyes, 0.6, "#a5ad3e")
    eye(c, cx + 3.5, cy - ry * 0.8, 3.2, eyes, 0.6, "#a5ad3e")
    _ = i


# ---------------------------------------------------------------- 动作表


def frames(kind: str, action: str, params: list[dict]) -> list[dict]:
    return [{"action": action, "i": k, **p} for k, p in enumerate(params)]


def walk(n: int = 4, **extra) -> list[dict]:
    steps = [{"step": 1, "dy": -1}, {"step": 0, "dy": 0}, {"step": 2, "dy": -1}, {"step": 0, "dy": 0}]
    return [{**steps[k % 4], **extra} for k in range(n)]


IDLE = [{}, {"sy": 0.96, "sx": 1.03}, {}, {"sy": 1.02}, {"eyes": "blink"}, {}]


def death_frames(kind: str) -> list[dict]:
    return [
        {"eyes": "dead", "squash": 0.9},
        {"eyes": "dead", "squash": 0.7, "shake": 1},
        {"eyes": "dead", "squash": 0.5, "puff": 0.2},
        {"eyes": "dead", "squash": 0.35, "puff": 0.6},
        {"only_puff": 0.95},
    ]


KINDS: dict[str, dict] = {
    "naiwa_chaser": {
        "draw": chaser,
        "size": (32, 31),
        "radius": 6,
        "actions": {
            "idle": IDLE,
            "move": walk(),
            "windup": [{"sy": 0.84, "sx": 1.1, "eyes": "angry", "mouth": "tight", "shake": -1}, {"sy": 0.82, "sx": 1.12, "eyes": "angry", "mouth": "tight", "shake": 1}],
            "attack": [{"sx": 1.12, "sy": 0.94, "eyes": "angry"}, {"sx": 1.08, "sy": 0.96, "eyes": "angry"}],
            "recover": [{"eyes": "tired"}, {"eyes": "tired", "sy": 0.97}],
        },
        "seconds": {"idle": 0.18, "move": 0.09, "windup": 0.07, "attack": 0.08, "recover": 0.2},
    },
    "naiwa_scout": {
        "draw": scout,
        "size": (24, 31),
        "radius": 4,
        "actions": {
            "idle": [{}, {"dy": 0.5}, {}, {"eyes": "blink"}],
            "move": [{"swing": 1, "dy": -1}, {"swing": 0}, {"swing": -1, "dy": -1}, {"swing": 0}],
        },
        "seconds": {"idle": 0.2, "move": 0.06},
    },
    "naiwa_tank": {
        "draw": tank,
        "size": (40, 42),
        "radius": 9,
        "actions": {
            "idle": [{}, {"dy": 0.5}, {}, {"eyes": "blink"}],
            "move": [{"step": 1, "shake": -1}, {"step": 0}, {"step": 2, "shake": 1}, {"step": 0}],
        },
        "seconds": {"idle": 0.25, "move": 0.14},
    },
    "naiwa_spitter": {
        "draw": spitter,
        "size": (36, 30),
        "radius": 6,
        "actions": {
            "idle": IDLE,
            "move": walk(),
            "windup": [{}, {"sy": 0.96}],
            "attack": [{"sy": 1.04}, {}],
        },
        "seconds": {"idle": 0.18, "move": 0.1, "windup": 0.12, "attack": 0.1},
    },
    "naiwa_turret": {
        "draw": turret,
        "size": (30, 34),
        "radius": 6,
        "actions": {
            "idle": [{"sway": 0}, {"sway": 0.5}, {"sway": 0}, {"sway": -0.5, "eyes": "blink"}],
            "windup": [{"sway": 1.5, "shake": -1}, {"sway": -1.5, "shake": 1}],
            "attack": [{"dy": -1}, {}],
        },
        "seconds": {"idle": 0.25, "windup": 0.08, "attack": 0.1},
    },
    "naiwa_charger": {
        "draw": charger,
        "size": (34, 30),
        "radius": 6,
        "actions": {
            "idle": [{"roll": 0}, {"roll": 0}, {"roll": 0, "eyes": "blink"}, {"roll": 0}],
            "move": [{"roll": k * 0.6} for k in range(4)],
            "windup": [{"roll": k * 1.4, "eyes": "angry", "shake": (-1, 1)[k % 2], "lines": k % 2} for k in range(4)],
            "attack": [{"roll": k * 1.3, "eyes": "angry", "lines": 1} for k in range(4)],
            "recover": [{"eyes": "spiral", "stars": k} for k in range(4)],
        },
        "seconds": {"idle": 0.2, "move": 0.1, "windup": 0.05, "attack": 0.05, "recover": 0.12},
    },
    "naiwa_hopper": {
        "draw": hopper,
        "size": (30, 48),
        "radius": 6,
        "actions": {
            "idle": [{"coil": 1.0}, {"coil": 0.95, "sy": 0.97}, {"coil": 1.0}, {"coil": 1.0, "eyes": "blink"}],
            "windup": [{"coil": 0.55, "sx": 1.1, "sy": 0.9, "eyes": "angry"}, {"coil": 0.45, "sx": 1.12, "sy": 0.88, "eyes": "angry"}],
            "air": [{"coil": 1.35, "sy": 1.08, "sx": 0.94}, {"coil": 1.25}],
            "attack": [{"coil": 0.4, "sx": 1.2, "sy": 0.8}, {"coil": 0.75, "sx": 1.05, "sy": 0.95}],
        },
        "seconds": {"idle": 0.2, "windup": 0.1, "air": 0.14, "attack": 0.1},
    },
    "naiwa_splitter": {
        "draw": splitter,
        "size": (30, 47),
        "radius": 8,
        "actions": {
            "idle": [{"wob": 0}, {"wob": 0.5}, {"wob": 0}, {"wob": -0.5, "eyes": "blink"}],
            "move": [{"wob": 1, "step": 1}, {"wob": 0}, {"wob": -1, "step": 2}, {"wob": 0}],
        },
        "seconds": {"idle": 0.2, "move": 0.12},
    },
    "naiwa_tadpole": {
        "draw": tadpole,
        "size": (20, 14),
        "radius": 3,
        "actions": {
            "idle": [{"tail": k} for k in range(4)],
            "move": [{"tail": k * 1.6} for k in range(4)],
        },
        "seconds": {"idle": 0.12, "move": 0.05},
    },
    "naiwa_bomber": {
        "draw": bomber,
        "size": (34, 38),
        "radius": 6,
        "actions": {
            "idle": [{}, {"sy": 0.98}, {}, {"eyes": "blink"}],
            "move": walk(),
            "windup": [{"swell": 0.2}, {"swell": 0.45, "hot": 0.5}, {"swell": 0.7}, {"swell": 1.0, "hot": 0.8}],
        },
        "seconds": {"idle": 0.15, "move": 0.08, "windup": 0.1},
    },
    "naiwa_tongue": {
        "draw": tongue,
        "size": (34, 30),
        "radius": 6,
        "actions": {
            "idle": IDLE,
            "move": walk(),
            "windup": [{"shake": -1}, {"shake": 1, "sy": 0.97}],
            "attack": [{"sy": 1.04}, {}],
        },
        "seconds": {"idle": 0.18, "move": 0.1, "windup": 0.06, "attack": 0.08},
    },
    "naiwa_brood": {
        "draw": brood,
        "size": (40, 36),
        "radius": 8,
        "actions": {
            "idle": [{}, {"dy": 0.5}, {}, {"eyes": "blink"}],
            "move": [{"dy": -1}, {}, {"dy": -1}, {}],
            "windup": [{"glow": 0}, {"glow": 1}],
            "attack": [{"popped": 2}, {"popped": 2, "dy": 0.5}],
        },
        "seconds": {"idle": 0.25, "move": 0.14, "windup": 0.1, "attack": 0.15},
    },
    "naiwa_burrower": {
        "draw": burrower,
        "size": (34, 34),
        "radius": 6,
        "actions": {
            "idle": IDLE,
            "move": walk(),
            "buried": [{}, {}],
            "windup": [{}, {"sy": 1.05}],
            "attack": [{"sy": 1.08}, {}],
        },
        "seconds": {"idle": 0.18, "move": 0.1, "buried": 0.2, "windup": 0.08, "attack": 0.12},
    },
    "naiwa_dancer": {
        "draw": dancer,
        "size": (30, 36),
        "radius": 5,
        "actions": {
            "idle": [{"lean": 0}, {"lean": 0, "dy": 0.5}, {"lean": 0}, {"lean": 0, "eyes": "blink"}],
            "move": [{"lean": -1, "step": 1}, {"lean": 0, "dy": -1}, {"lean": 1, "step": 2}, {"lean": 0, "dy": -1}],
            "spin": [{} for _ in range(4)],
        },
        "seconds": {"idle": 0.2, "move": 0.1, "spin": 0.06},
    },
    "naiwa_gasser": {
        "draw": gasser,
        "size": (36, 32),
        "radius": 6,
        "actions": {
            "idle": [{}, {"sy": 0.97}, {"cloud": 0}, {"cloud": 1}],
            "move": [{"step": 1}, {"step": 0, "cloud": 0}, {"step": 2, "cloud": 1}, {"step": 0}],
        },
        "seconds": {"idle": 0.2, "move": 0.11},
    },
}


# ---------------------------------------------------------------- 渲染与打包


def render(kind: str, spec: dict, f: dict) -> Image.Image:
    w, h = spec["size"]
    c = Canvas(w, h)
    if "only_puff" in f:
        puff(c, w / 2, h - 7, min(w, h) * 0.28, f["only_puff"])
        c.outline()
        return c.image()
    spec["draw"](c, f)
    c.outline()
    img = c.image()
    squash = f.get("squash")
    if squash:
        # 死亡压扁：贴着脚底整体压缩，再叠一层白烟
        bbox = img.getbbox() or (0, 0, w, h)
        part = img.crop(bbox)
        nh = max(1, round(part.height * squash))
        nw = round(part.width * (1 + (1 - squash) * 0.5))
        part = part.resize((nw, nh), Image.NEAREST)
        img = Image.new("RGBA", (w, h))
        img.alpha_composite(part, (max(0, (w - nw) // 2), bbox[3] - nh))
        if "puff" in f:
            pc = Canvas(w, h)
            puff(pc, w / 2, bbox[3] - 4, min(w, h) * 0.26, f["puff"])
            pc.outline()
            img.alpha_composite(pc.image())
    return img


def build(preview_dir: str | None = None) -> None:
    rendered: dict[str, dict[str, list[Image.Image]]] = {}
    for kind, spec in KINDS.items():
        acts = dict(spec["actions"])
        acts["death"] = death_frames(kind)
        rendered[kind] = {a: [render(kind, spec, f) for f in frames(kind, a, ps)] for a, ps in acts.items()}

    atlas_w, pad = 1024, 2
    x = y = row_h = 0
    placed: dict[str, dict[str, list[tuple[int, int]]]] = {}
    for kind, actions in rendered.items():
        w, h = KINDS[kind]["size"]
        placed[kind] = {}
        for action, imgs in actions.items():
            placed[kind][action] = []
            for _ in imgs:
                if x + w > atlas_w:
                    x = 0
                    y += row_h + pad
                    row_h = 0
                placed[kind][action].append((x, y))
                x += w + pad
                row_h = max(row_h, h)
    atlas = Image.new("RGBA", (atlas_w, y + row_h), (0, 0, 0, 0))
    for kind, actions in rendered.items():
        for action, imgs in actions.items():
            for img, (px, py) in zip(imgs, placed[kind][action]):
                atlas.alpha_composite(img, (px, py))
    atlas.save(ATLAS, optimize=True)
    write_data(placed)
    if preview_dir:
        os.makedirs(preview_dir, exist_ok=True)
        for kind, actions in rendered.items():
            preview([f for fs in actions.values() for f in fs], 6, 8).save(os.path.join(preview_dir, f"{kind}.png"))
        big = atlas.resize((atlas.width * 2, atlas.height * 2), Image.NEAREST)
        bg = Image.new("RGBA", big.size, (38, 34, 56, 255))
        bg.alpha_composite(big)
        bg.save(os.path.join(preview_dir, "atlas.png"))
    print(f"atlas {atlas.width}x{atlas.height} -> {ATLAS}")


def fmt(n: float) -> str:
    return str(int(n)) if float(n).is_integer() else f"{n:g}"


def write_data(placed) -> None:
    lines = [
        "// 由 art-src/monsters/build_monsters.py 生成，不要手改；改画法后重新运行脚本。",
        "import type { MonsterArt } from './schema/art';",
        "",
        "/** 普通怪物的逐帧图集（ADR 0028）：同一怪物帧尺寸相同，pivot 是身体圆心在帧内的位置。 */",
        "export const MONSTER_ART = {",
    ]
    for kind, actions in placed.items():
        spec = KINDS[kind]
        w, h = spec["size"]
        radius_px = spec["radius"] / ART_SCALE
        seconds = {**spec["seconds"], "death": 0.09}
        lines += [
            f"  {kind}: {{",
            f"    size: [{w}, {h}],",
            # 身体圆心：脚底往上一个碰撞半径
            f"    pivot: {{ x: {fmt(w / 2)}, y: {fmt(h - 2 - radius_px)} }},",
            f"    scale: {fmt(ART_SCALE)},",
            "    facing: 'right',",
            "    frames: {",
        ]
        for action, coords in actions.items():
            inner = ", ".join(f"[{cx}, {cy}]" for cx, cy in coords)
            one = f"      {action}: [{inner}],"
            if len(one) <= 110:
                lines.append(one)
            else:
                lines.append(f"      {action}: [")
                lines += [f"        [{cx}, {cy}]," for cx, cy in coords]
                lines.append("      ],")
        lines.append("    },")
        secs = ", ".join(f"{a}: {fmt(seconds[a])}" for a in actions)
        one = f"    seconds: {{ {secs} }},"
        if len(one) <= 110:
            lines.append(one)
        else:
            lines.append("    seconds: {")
            lines += [f"      {a}: {fmt(seconds[a])}," for a in actions]
            lines.append("    },")
        lines.append("  },")
    lines += ["} as const satisfies Record<string, MonsterArt>;", ""]
    with open(DATA, "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines))


if __name__ == "__main__":
    out = sys.argv[sys.argv.index("--preview") + 1] if "--preview" in sys.argv else None
    build(out)
