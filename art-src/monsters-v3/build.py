"""Import new frog keyframes into native-resolution, hard-alpha atlases.

Source layout: four columns, six rows. ImageGen supplies drawn poses; this importer
only slices, aligns, reduces resolution/palette, and packs them. No static-image
translation is used to synthesize animation. Requires the existing Pillow/numpy.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
OUT = ROOT / "public/assets/demo"
# Keep the established world footprint while recovering source detail.
PIXEL_DENSITY = 1.5
WORLD_SCALE = 0.5 / PIXEL_DENSITY
MANIFEST = json.loads((HERE / "manifest.json").read_text())
ROWS = {"idle": [0, 1, 2, 3], "move": [4, 5, 6, 7], "windup": [8, 9],
        "attack": [10, 11], "recover": [12, 13], "hurt": [14, 15],
        "special": [16, 17, 18, 19], "death": [20, 21, 22, 23]}
# Match the existing visible state spans; this does not change any sim timing.
TIMES = {
    "naiwa_chaser": (0.45, 0.18, 0.6), "naiwa_charger": (0.65, 0.35, 1.1),
    "naiwa_hopper": (0.45, 0.2, 0.55), "naiwa_tongue": (0.55, 0.16, 0.6),
    "naiwa_bomber": (0.9, 0.25, 0.5), "naiwa_brood": (0.7, 0.3, 0.5),
    "naiwa_burrower": (0.5, 0.3, 0.5), "naiwa_boss": (0.8, 1.3, 0.6),
}


def cuts(mask: np.ndarray, count: int, axis: int) -> list[int]:
    """Find transparent gutters near the prescribed regular grid boundaries."""
    profile = mask.sum(axis=axis)
    # Cut through the middle of a gutter, retaining a transparent pixel on
    # both sides rather than choosing the first zero after an opaque edge.
    profile = np.convolve(profile, np.ones(3, dtype=int), mode="same")
    length = len(profile)
    result = [0]
    for i in range(1, count):
        center = length * i / count
        span = length / count * 0.16
        lo, hi = max(result[-1] + 1, round(center - span)), min(length, round(center + span))
        segment = profile[lo:hi]
        candidates = np.where(segment == segment.min())[0] + lo
        result.append(int(min(candidates, key=lambda x: abs(x - center))))
    return [*result, length]


def components(mask: np.ndarray) -> list[list[tuple[int, int, int]]]:
    """Connected alpha components via scanline runs, without extra dependencies."""
    runs, parent, previous = [], [], []
    def root(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i
    for y, row in enumerate(mask):
        edges = np.diff(np.pad(row.astype(np.int8), (1, 1)))
        spans = list(zip(np.where(edges == 1)[0], np.where(edges == -1)[0]))
        current = []
        for left, right in spans:
            n = len(runs)
            runs.append((y, int(left), int(right)))
            parent.append(n)
            current.append(n)
            for before in previous:
                _, l0, r0 = runs[before]
                if left <= r0 and right >= l0:
                    parent[root(n)] = root(before)
        previous = current
    grouped = {}
    for i, run in enumerate(runs):
        grouped.setdefault(root(i), []).append(run)
    return list(grouped.values())


def split(path: Path, rows: int = 6) -> list[Image.Image]:
    source = np.array(Image.open(path).convert("RGBA"))
    source[:, :, 3] = np.where(source[:, :, 3] >= 128, 255, 0)
    source[source[:, :, 3] == 0] = 0
    ycuts = cuts(source[:, :, 3] > 0, rows, 1)
    images = []
    for y0, y1 in zip(ycuts, ycuts[1:]):
        band = source[y0:y1]
        masks = [np.zeros(band.shape[:2], dtype=bool) for _ in range(4)]
        cell = band.shape[1] / 4
        # Long arms/tails can overlap a neighboring column's x-range without
        # touching that sprite. Keep each whole alpha component, not a rigid
        # rectangular crop that would sever those limbs.
        for runs in components(band[:, :, 3] > 0):
            area = sum(r - l for _, l, r in runs)
            cx = sum((l + r - 1) * (r - l) / 2 for _, l, r in runs) / area
            col = min(3, max(0, int(cx / cell)))
            for y, left, right in runs:
                masks[col][y, left:right] = True
        if sum(int(m.sum()) for m in masks) != int((band[:, :, 3] > 0).sum()):
            raise ValueError(f"Alpha lost while extracting {path.name}")
        for col, mask in enumerate(masks):
            rgba = band.copy()
            rgba[~mask] = 0
            cx = cell * (col + 0.5)
            frame = Image.fromarray(rgba).crop((round(cx - cell), 0, round(cx + cell), len(band)))
            if not frame.getbbox():
                raise ValueError(f"Empty source cell {path.name}:{len(images)}")
            box = frame.getbbox()
            if box[0] == 0 or box[1] == 0 or box[2] == frame.width or box[3] == frame.height:
                raise ValueError(f"Source crosses a cell gutter {path.name}:{len(images)}")
            images.append(frame)
    return images


def import_kind(spec: dict) -> dict:
    raw = split(HERE / spec["source"])
    boxes = [im.getbbox() for im in raw]
    base_w = float(np.median([b[2] - b[0] for b in boxes[:8]]))
    base_h = float(np.median([b[3] - b[1] for b in boxes[:8]]))
    if spec.get("extraSource"):
        extra = split(HERE / spec["extraSource"], 2)
        extra_boxes = [im.getbbox() for im in extra[4:]]
        normalizer = base_h / float(np.median([b[3] - b[1] for b in extra_boxes]))
        raw += [im.resize((round(im.width * normalizer), round(im.height * normalizer)),
                          Image.Resampling.NEAREST) for im in extra]
        boxes = [im.getbbox() for im in raw]
    factor = min(spec["fit"][0] / base_w, spec["fit"][1] / base_h) * PIXEL_DENSITY
    ax, ay = spec["anchor"]
    # One anatomical anchor bias per species. Within a row, the source poses
    # retain their hand-drawn limb/body motion; the physics pivot never changes.
    bias_x = float(np.median([b[0] + (b[2] - b[0]) * ax - raw[i].width / 2
                              for i, b in enumerate(boxes[:4])]))
    ground = round(base_h * (1 - ay) * factor)
    placed = []
    center = 128
    for i, im in enumerate(raw):
        row = i // 4
        ground_cells = boxes[row * 4:row * 4 + (2 if row == 5 else 4)]
        floor = float(np.median([b[3] for b in ground_cells]))
        anchor_x = im.width / 2 + bias_x
        anchor_y = floor - base_h * (1 - ay)
        # Resample the original drawings at the requested intermediate density,
        # without magnifying the previously reduced runtime pixels.
        small = im.resize((max(1, round(im.width * factor)), max(1, round(im.height * factor))),
                          Image.Resampling.NEAREST)
        arr = np.array(small)
        arr[:, :, 3] = np.where(arr[:, :, 3] >= 128, 255, 0)
        arr[arr[:, :, 3] == 0] = 0
        if not arr[:, :, 3].any():
            raise ValueError(f"Empty reduced frame {spec['id']}:{i}")
        canvas = Image.new("RGBA", (256, 256))
        canvas.alpha_composite(Image.fromarray(arr),
                               (center - round(anchor_x * factor), center - round(anchor_y * factor)))
        placed.append(canvas)
    # Crop once for the entire animation set, never once per displayed frame.
    union = [im.getbbox() for im in placed]
    padding = math.ceil(3 * PIXEL_DENSITY)
    bounds = (min(b[0] for b in union) - padding, min(b[1] for b in union) - padding,
              max(b[2] for b in union) + padding, max(b[3] for b in union) + padding)
    images = [im.crop(bounds) for im in placed]
    # Shared per-species palette prevents different frames choosing different
    # skin shades. Alpha remains a separate hard 0/255 mask.
    sw, sh = images[0].size
    strip = Image.new("RGB", (sw * 4, sh * math.ceil(len(images) / 4)))
    for i, im in enumerate(images):
        strip.paste(im.convert("RGB"), ((i % 4) * sw, (i // 4) * sh))
    if "palette" in spec:
        from PIL import ImageColor
        colors = [ImageColor.getrgb(c) for c in spec["palette"]]
        palette = Image.new("P", (1, 1))
        palette.putpalette([v for c in colors for v in c] + list(colors[0]) * (256 - len(colors)))
    else:
        palette = strip.quantize(colors=spec["colors"], method=Image.Quantize.MEDIANCUT,
                                 dither=Image.Dither.NONE)
    frames = []
    for im in images:
        mapped = im.convert("RGB").quantize(palette=palette, dither=Image.Dither.NONE).convert("RGBA")
        mapped.putalpha(im.getchannel("A"))
        arr = np.array(mapped)
        arr[arr[:, :, 3] == 0] = 0
        frames.append(Image.fromarray(arr))
    pivot = [center - bounds[0], center - bounds[1]]
    shadow = pivot[1] + ground
    if not 0 < pivot[0] < sw or not 0 < pivot[1] < shadow < sh:
        raise ValueError(f"Bad anchor {spec['id']}: {pivot}, shadow {shadow}, {sw}x{sh}")
    for i, im in enumerate(frames):
        b = im.getbbox()
        if not b or b[0] <= 0 or b[1] <= 0 or b[2] >= sw or b[3] >= sh:
            raise ValueError(f"Clipped {spec['id']}:{i}")
    actions = {spec["special"] if k == "special" else k: [frames[i] for i in indices]
               for k, indices in ROWS.items()}
    if spec.get("extraSource"):
        actions["spin"] = frames[24:28]
        actions["laugh"] = frames[28:32]
    windup, attack, recover = TIMES.get(spec["id"], (0.35, 0.25, 0.5))
    seconds = {"idle": 0.24, "move": 0.09, "windup": windup / 2,
               "attack": attack / 2, "recover": recover / 2, "hurt": 0.08,
               "death": 0.1125, spec["special"]: 0.12}
    if spec.get("extraSource"):
        seconds.update(spin=0.12, laugh=0.2)
    if spec["special"] == "air":
        seconds["air"] = (0.8 if spec["id"] == "naiwa_boss" else 0.55) / 4
    return {"id": spec["id"], "size": [sw, sh], "pivot": pivot, "shadowY": shadow,
            "actions": actions, "seconds": seconds, "source": spec["source"]}


def pack(kinds: list[dict], name: str, width: int) -> tuple[dict, dict]:
    unique, coords = {}, {}
    x = y = row_h = 0
    for kind in kinds:
        w, h = kind["size"]
        coords[kind["id"]] = {}
        for action, frames in kind["actions"].items():
            row = []
            for frame in frames:
                key = (w, h, frame.tobytes())
                if key not in unique:
                    if x + w > width:
                        x, y, row_h = 0, y + row_h + 2, 0
                    unique[key] = (x, y, frame)
                    x += w + 2
                    row_h = max(row_h, h)
                row.append(list(unique[key][:2]))
            coords[kind["id"]][action] = row
    atlas = Image.new("RGBA", (width, y + row_h))
    for px, py, im in unique.values():
        atlas.alpha_composite(im, (px, py))
    path = OUT / name
    pixels = np.array(atlas)
    colors, inverse = np.unique(pixels.reshape(-1, 4), axis=0, return_inverse=True)
    if len(colors) <= 256:
        # Exact indexing, not another color reduction: decoded RGBA is identical.
        indexed = Image.fromarray(inverse.reshape(atlas.height, atlas.width).astype(np.uint8), "P")
        indexed.putpalette(colors[:, :3].flatten().tolist() + [0] * (768 - len(colors) * 3))
        indexed.info["transparency"] = bytes(colors[:, 3])
        if not np.array_equal(np.array(indexed.convert("RGBA")), pixels):
            raise ValueError("Indexed PNG changed pixels")
        indexed.save(path, optimize=True)
    else:
        atlas.save(path, optimize=True)
    return coords, {"file": name, "bytes": path.stat().st_size, "size": list(atlas.size),
                    "rgbaBytes": atlas.width * atlas.height * 4, "uniqueTiles": len(unique),
                    "sha256": hashlib.sha256(path.read_bytes()).hexdigest()}


def ts_entry(kind: dict, coords: dict) -> str:
    record = {"size": kind["size"], "pivot": dict(zip(("x", "y"), kind["pivot"])),
              "shadowY": kind["shadowY"], "scale": WORLD_SCALE, "facing": "right",
              "frames": coords, "seconds": kind["seconds"]}
    return json.dumps(record, indent=2, ensure_ascii=False)


def preview(kinds: list[dict], directory: Path) -> None:
    directory.mkdir(parents=True, exist_ok=True)
    for kind in kinds:
        w, h = kind["size"]
        sheet = Image.new("RGBA", ((w + 4) * 4, (h + 4) * len(kind["actions"])), "#1d2336")
        for row, frames in enumerate(kind["actions"].values()):
            for col, im in enumerate(frames):
                sheet.alpha_composite(im, (col * (w + 4) + 2, row * (h + 4) + 2))
        sheet.resize((sheet.width * 5, sheet.height * 5), Image.Resampling.NEAREST).save(
            directory / f"{kind['id']}-actions.png")
    # One contact sheet per animation phase, shown at integer enlargement.
    for action in ("idle", "move"):
        sequence = []
        for frame in range(4):
            sheet = Image.new("RGB", (768, 720), "#1d2336")
            draw = ImageDraw.Draw(sheet)
            for i, kind in enumerate(kinds):
                image = kind["actions"][action][frame]
                scale = (2 if kind["id"] == "naiwa_boss" else 3) / PIXEL_DENSITY
                image = image.resize((round(image.width * scale), round(image.height * scale)),
                                     Image.Resampling.NEAREST)
                x, y = (i % 4) * 192 + 96, (i // 4) * 180 + 80
                sheet.paste(image, (x - image.width // 2, y - image.height // 2), image)
                draw.text((i % 4 * 192 + 8, i // 4 * 180 + 164), kind["id"].replace("naiwa_", ""), fill="#e1e7ef")
            sequence.append(sheet)
        sequence[0].save(directory / f"{action}.gif", save_all=True, append_images=sequence[1:],
                         duration=240 if action == "idle" else 90, loop=0, disposal=2)
        sequence[0].save(directory / f"{action}.png")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--partial", action="store_true", help="Only preview sources present; never update runtime data")
    parser.add_argument("--preview", type=Path)
    args = parser.parse_args()
    available = [s for s in MANIFEST if (HERE / s["source"]).exists()]
    if not args.partial and len(available) != len(MANIFEST):
        raise ValueError("All sixteen source sheets are required before publishing atlases")
    kinds = [import_kind(spec) for spec in available]
    if args.preview:
        preview(kinds, args.preview)
    if args.partial:
        print(json.dumps([{k: v for k, v in d.items() if k not in ("actions",)} for d in kinds]))
        return
    regular = [k for k in kinds if k["id"] != "naiwa_boss"]
    bosses = [k for k in kinds if k["id"] == "naiwa_boss"]
    mc, mr = pack(regular, "monsters-v4.png", 1536)
    bc, br = pack(bosses, "naiguai-v4.png", 768)
    header = "// Generated by art-src/monsters-v3/build.py from the new frog keyframes.\n"
    header += "import type { MonsterArt } from './schema/art';\n"
    text = header + "export const MONSTER_ART = {\n"
    text += ",\n".join(f"  {k['id']}: {ts_entry(k, mc[k['id']])}" for k in regular)
    text += "\n} as const satisfies Record<string, MonsterArt>;\n"
    (ROOT / "src/data/monsterArt.ts").write_text(text)
    text = header + "export const NAIGUAI_ART = " + ts_entry(bosses[0], bc["naiwa_boss"])
    (ROOT / "src/data/naiguaiArt.ts").write_text(text + " as const satisfies MonsterArt;\n")
    report = {"pixelDensity": PIXEL_DENSITY, "worldScale": WORLD_SCALE, "assets": [mr, br], "monsters": [{"id": k["id"], "size": k["size"],
              "pivot": k["pivot"], "shadowY": k["shadowY"],
              "frames": {a: len(f) for a, f in k["actions"].items()}} for k in kinds]}
    (HERE / "build-report-v4.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report["assets"]))


if __name__ == "__main__":
    main()
