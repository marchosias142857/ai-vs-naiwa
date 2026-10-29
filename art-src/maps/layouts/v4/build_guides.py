"""Draw geometric layout guides only. Never draw or modify finished game art."""
import json
from pathlib import Path
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parent
specs = json.loads((root / 'manifest.json').read_text())['specs']
for spec in specs:
    image = Image.new('RGBA', tuple(spec['canvas']), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    for item in spec['items']:
        x, y, width, height = map(int, item['rect'])
        draw.rectangle((x, y, x + width - 1, y + height - 1), fill=item['color'])
        if item['part'] == 'ring':
            border = item['border']
            draw.rectangle((x + border, y + border, x + width - border - 1, y + height - border - 1), fill=(0, 0, 0, 0))
        elif item['part'] == 'block':
            draw.rectangle((x, y + 224, x + width - 1, y + height - 1), fill='#394653')
    image.save(root / (spec['key'] + '-layout.png'))
