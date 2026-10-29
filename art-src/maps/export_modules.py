"""Lossless WebP encoding + measured, aspect-preserving source rectangles.

Never repaints/resizes originals or changes alpha. Padding is a source rectangle,
not a stretched silhouette. Wall/door fitting is uniform in the renderer.
"""
from pathlib import Path
from tempfile import TemporaryDirectory
from math import ceil
import hashlib
import json
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SOURCE = Path(__file__).resolve().parent / 'sources'
THEMES = ['temple', 'wreck', 'abyss', 'milk']
ASSETS = {**{f'{theme}Ground': f'ground-{theme}-v7' for theme in THEMES},
          'blocks': 'blocks-v4', 'doors': 'north-gates-v4b', 'southDoors': 'south-gates-v4b',
          'sideDoors': 'side-gates-v4d-approved', 'objects': 'mechanisms-v4', 'rims': 'rims-v4',
          'hub': 'hub-v4', 'effects': 'effects-v4c', 'walls': 'wall-variants-v19-approved',
          'spikes': 'spikes-themes-v4', 'crystals': 'crystals-themes-v4'}
frames, reports, measurements = {}, [], {}

def frame(im, name, region, ratio=None, fixed=None, bottom=None):
    x, y, right, end = region
    box = im.crop(region).getchannel('A').point(lambda a: 255 if a > 200 else 0).getbbox()
    assert box, name
    l, t, r, b = box
    x, y, w, h = x+l, y+t, r-l, b-t
    measurements[name] = [x, y, w, h]
    if ratio:
        k = ceil(max(w/ratio[0], h/ratio[1]))
        width, height = fixed or (ratio[0]*k, ratio[1]*k)
        assert width >= w and height >= h, (name, box, fixed)
        x, y = x-(width-w)//2, bottom-height if bottom is not None else y-(height-h)//2
        w, h = width, height
    assert x >= 0 and y >= 0 and x+w <= im.width and y+h <= im.height, name
    frames[name] = [x, y, w, h]

for name, asset in ASSETS.items():
    source = SOURCE / f'{asset}.png'
    output = ROOT / 'public/assets/demo' / f'map-{asset}.webp'
    im = Image.open(source).convert('RGBA')
    with TemporaryDirectory(prefix='naiwa-map-export-') as directory:
        temporary = Path(directory) / output.name
        im.save(temporary, lossless=True, exact=True, method=6)
        assert Image.open(temporary).convert('RGBA').tobytes() == im.tobytes()
        assert temporary.stat().st_size < 2 * 1024 * 1024, 'PWA single-file budget'
        temporary.replace(output)
    reports.append({'name': name, 'sourceFile': source.name, 'size': im.size,
                    'sourceBytes': source.stat().st_size, 'runtimeBytes': output.stat().st_size,
                    'sourceSha256': hashlib.sha256(source.read_bytes()).hexdigest(),
                    'runtimeSha256': hashlib.sha256(output.read_bytes()).hexdigest(),
                    'decodedRGBAIdentical': True})
    if name.endswith('Ground'):
        for i in range(10):
            x, y = (i%5)*im.width//5, (i//5)*im.height//2
            right, bottom = (i%5+1)*im.width//5, (i//5+1)*im.height//2
            frames[f'{name.removesuffix("Ground")}_ground_{i}'] = [x,y,right-x,bottom-y]
    elif name == 'walls':
        xs, ys = [0,305,545,785,im.width], [0,510,940,im.height]
        for row in range(3):
            for col, theme in enumerate(THEMES):
                frame(im, f'{theme}_wall_{row}', (xs[col],ys[row],xs[col+1],ys[row+1]))
    elif name in ['doors', 'southDoors']:
        ys = [0,330,610,900,im.height]
        for row, theme in enumerate(THEMES):
            for col, state in enumerate(['open','locked']):
                frame(im, f'{theme}_{"north" if name == "doors" else "south"}_{state}',
                      (col*im.width//2,ys[row],(col+1)*im.width//2,ys[row+1]))
    elif name == 'sideDoors':
        for i, theme in enumerate(THEMES):
            for j in range(4):
                col, row = (i%2)*4+j, i//2
                frame(im, f'{theme}_{"east" if j<2 else "west"}_{"locked" if j%2 else "open"}',
                      (col*im.width//8,row*im.height//2,(col+1)*im.width//8,(row+1)*im.height//2))
    elif name in ['blocks','rims','crystals','effects']:
        names = ([f'{t}_{ {"blocks":"obstacle","rims":"rim","crystals":"crystal"}[name]}' for t in THEMES]
                 if name != 'effects' else ['hazard_rock','hazard_milk','hazard_poison','hazard_debris'])
        for i, n in enumerate(names):
            ratio = (14,15) if name == 'crystals' else ((1,1),(22,15),(1,1),(3,2))[i] if name == 'effects' else (1,1)
            frame(im,n,((i%2)*im.width//2,(i//2)*im.height//2,(i%2+1)*im.width//2,(i//2+1)*im.height//2),ratio,
                  (462,495) if name == 'crystals' else None)
    elif name == 'spikes':
        ys = [0,360,720,1080,im.height]
        for row, theme in enumerate(THEMES):
            for col, state in enumerate(['idle','warn','on']):
                frame(im,f'{theme}_spikes_{state}',(col*im.width//3,ys[row],(col+1)*im.width//3,ys[row+1]),(1,1),(280,280),
                      [342,685,1031,1373][row])
    elif name == 'objects':
        specs = {
          'weed': ((20,335,375,650),(1,1),None,None),
          'barrel': ((380,335,625,650),(18,23),(216,276),626),
          'barrel_hit': ((630,335,900,650),(18,23),(216,276),626),
          'barrel_broken': ((900,335,1254,650),(21,13),None,None),
          'mine': ((40,650,315,920),(1,1),(212,212),902),
          'mine_lit': ((335,650,620,920),(1,1),(212,212),902),
          'chest': ((625,650,925,920),(24,25),(264,275),915),
          'chest_open': ((925,640,1240,920),(24,25),(264,275),915),
          'lantern': ((400,925,570,1225),(10,17),None,None),
          'moss': ((600,925,925,1225),(3,2),None,None),
          'coral': ((925,925,1254,1240),(1,1),None,None)}
        for n,(region,ratio,fixed,bottom) in specs.items(): frame(im,n,region,ratio,fixed,bottom)
        # Interior of the square water tile, no transparent border in a repeated field.
        frames['current'] = [940,54,264,264]
    elif name == 'hub':
        frame(im,'altar',(50,200,920,1050),(1,1))
        for n, region in [('pickup_coin',(950,250,1240,550)),('pickup_health',(950,550,1240,900)),('pickup_energy',(950,920,1240,1225))]:
            frame(im,n,region,(1,1))

assert len(frames) == 128, len(frames)
(ROOT/'src/data/mapArtFrames.ts').write_text('// Generated by art-src/maps/export_modules.py; measured source rectangles with logical frame padding.\n'
    'export const MAP_ART_FRAMES = '+json.dumps(frames,indent=2)+' as const satisfies Record<string, readonly [number, number, number, number]>;\n')
(SOURCE.parent/'export-report.json').write_text(json.dumps(reports,indent=2)+'\n')
(SOURCE.parent/'frame-measurements-v4.json').write_text(json.dumps({'note':'Opaque content bounds before source-frame padding. Original alpha unchanged.','bounds':measurements},indent=2)+'\n')
print(json.dumps({'atlases':len(reports),'frames':len(frames),'bytes':sum(r['runtimeBytes'] for r in reports),'allLossless':True}))
