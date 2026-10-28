"""Lossless encoding and frame metadata only: no paint, resizing or alpha cleanup.
All art comes from the recorded built-in imagegen prompts; originals stay intact.
"""
from pathlib import Path
import hashlib
import json
from PIL import Image
from tempfile import TemporaryDirectory

ROOT = Path(__file__).resolve().parents[2]
SOURCE = Path(__file__).resolve().parent / 'sources'
frames = {}
reports = []
for name in ['terrain', 'doors', 'objects', 'ground', 'blocks', 'walls', 'sideDoors']:
    version = 'v2' if name in ['ground', 'blocks', 'walls', 'sideDoors'] else 'v1'
    asset = 'wall-model-v12' if name == 'walls' else 'side-doors-v2' if name == 'sideDoors' else f'{name}-{version}'
    source = SOURCE / f'{asset}.png'
    output = ROOT / 'public/assets/demo' / f'map-{asset}.webp'
    im = Image.open(source).convert('RGBA')
    # Stage outside public: incomplete files must never enter a concurrent PWA build.
    with TemporaryDirectory(prefix='naiwa-map-export-') as directory:
        temporary = Path(directory) / output.name
        im.save(temporary, lossless=True, exact=True, method=6)
        decoded = Image.open(temporary).convert('RGBA')
        assert decoded.tobytes() == im.tobytes(), 'Encoding changed pixels'
        assert temporary.stat().st_size < 2 * 1024 * 1024, 'PWA single-file budget'
        temporary.replace(output)
    reports.append({'name': name, 'sourceFile': source.name, 'size': im.size, 'sourceBytes': source.stat().st_size,
                    'runtimeBytes': output.stat().st_size,
                    'sourceSha256': hashlib.sha256(source.read_bytes()).hexdigest(),
                    'runtimeSha256': hashlib.sha256(output.read_bytes()).hexdigest(),
                    'decodedRGBAIdentical': True})
    if name == 'walls':
        # Four newly painted, connected models in a 2x2 atlas. Keep original PNG intact.
        # Measured top/body regions are normalized by the renderer to exact 80x80 + 80x96.
        for i, theme in enumerate(['temple', 'wreck', 'abyss', 'milk']):
            x = (i % 2) * im.width // 2
            row = i // 2
            top, join, bottom = (0, 248, 496) if row == 0 else (496, 727, im.height)
            for part, y, end in [('top', top, join), ('face', join, bottom)]:
                cell = im.crop((x, y, x + im.width // 2, end))
                box = cell.getchannel('A').point(lambda a: 255 if a > 16 else 0).getbbox()
                assert box
                l, t, r, b = box
                frames[f'{theme}_wall_{part}'] = [x + l, y + t, r - l, b - t]
    elif name == 'sideDoors':
        ys = [0, 310, 622, 930, im.height]
        for row, theme in enumerate(['temple', 'wreck', 'abyss', 'milk']):
            for col in range(4):
                x = col * im.width // 4
                y = ys[row]
                cell = im.crop((x, y, (col + 1) * im.width // 4, ys[row + 1]))
                box = cell.getchannel('A').point(lambda a: 255 if a > 16 else 0).getbbox()
                assert box
                l, t, r, b = box
                direction = 'east' if col < 2 else 'west'
                state = 'open' if col % 2 == 0 else 'locked'
                frames[f'{theme}_{direction}_{state}'] = [x + l, y + t, r - l, b - t]
    elif name == 'blocks':
        for i, theme in enumerate(['temple', 'wreck', 'abyss', 'milk']):
            x, y = (i % 2) * im.width // 2, (i // 2) * im.height // 2
            cell = im.crop((x, y, x + im.width // 2, y + im.height // 2))
            box = cell.getchannel('A').point(lambda a: 255 if a > 16 else 0).getbbox()
            assert box
            l, t, r, b = box
            frames[f'{theme}_obstacle'] = [x + l, y + t, r - l, b - t]
    elif name == 'ground':
        for i, theme in enumerate(['temple', 'wreck', 'abyss', 'milk']):
            frames[f'{theme}_ground'] = [(i % 2) * im.width // 2, (i // 2) * im.height // 2,
                                         im.width // 2, im.height // 2]
    elif name == 'terrain':
        xs = [0, 313, 627, 941, 1254]
        ys = [0, 315, 630, 928, 1254]
        for col, theme in enumerate(['temple', 'wreck', 'abyss', 'milk']):
            for row, part in enumerate(['floor', 'cap', 'face', 'block']):
                frames[f'{theme}_{part}'] = [xs[col]+2, ys[row]+2,
                                            xs[col+1]-xs[col]-4, ys[row+1]-ys[row]-4]
    elif name == 'doors':
        xs = [0, 212, 416, 584, 768, 956, 1154, 1330, 1536]
        ys = [0, 270, 493, 727, 1024]
        for row, theme in enumerate(['temple', 'wreck', 'abyss', 'milk']):
            for col in range(8):
                crop = im.crop((xs[col], ys[row], xs[col+1], ys[row+1]))
                box = crop.getchannel('A').point(lambda a: 255 if a > 16 else 0).getbbox()
                assert box
                l, t, r, b = box
                frames[f'{theme}_{["north", "east", "south", "west"][col//2]}_{["open", "locked"][col%2]}'] = [xs[col]+l, ys[row]+t, r-l, b-t]
    else:
        names = ['spikes_idle', 'spikes_warn', 'spikes_on', 'current', 'weed', 'barrel',
                 'barrel_hit', 'barrel_broken', 'mine', 'mine_lit', 'chest', 'chest_open',
                 'crystal', 'lantern', 'moss', 'coral']
        for i, frame in enumerate(names):
            rows = [0, 340, 640, 930, 1254]  # Water extends beyond the nominal quarter-row.
            x, y = (i % 4) * im.width // 4, rows[i // 4]
            crop = im.crop((x, y, (i % 4 + 1) * im.width // 4, rows[i // 4 + 1]))
            box = crop.getchannel('A').point(lambda a: 255 if a > 16 else 0).getbbox()
            assert box
            l, t, r, b = box
            if frame in ['current', 'weed']:
                l, t, r, b = l+5, t+5, r-5, b-5
            frames[frame] = [x+l, y+t, r-l, b-t]

destination = ROOT / 'src/data/mapArtFrames.ts'
destination.write_text('// Generated by art-src/maps/export_modules.py; measured source frames.\n'
                       'export const MAP_ART_FRAMES = ' + json.dumps(frames, indent=2) +
                       ' as const satisfies Record<string, readonly [number, number, number, number]>;\n')
(SOURCE.parent / 'export-report.json').write_text(json.dumps(reports, indent=2) + '\n')
print(json.dumps(reports, indent=2))
