# Contact sheet from stills.  python3 tools/contact.py out/contact.png img1.png[:label] img2.png[:label] ... [--cols 4]
import sys
from PIL import Image, ImageDraw, ImageFont
args = sys.argv[1:]
cols = 4
if '--cols' in args:
    i = args.index('--cols'); cols = int(args[i + 1]); del args[i:i + 2]
out, items = args[0], args[1:]
ims = []
for it in items:
    p, _, lab = it.partition(':')
    ims.append((Image.open(p).convert('RGB'), lab or p.split('/')[-1]))
tw = 480; th = int(tw * ims[0][0].height / ims[0][0].width)
pad, lh = 14, 30
rows = (len(ims) + cols - 1) // cols
sheet = Image.new('RGB', (cols * (tw + pad) + pad, rows * (th + lh + pad) + pad), (22, 20, 30))
try:
    font = ImageFont.truetype('fonts/Figtree-SemiBold.ttf', 18)
except Exception:
    font = ImageFont.load_default()
d = ImageDraw.Draw(sheet)
for k, (im, lab) in enumerate(ims):
    x = pad + (k % cols) * (tw + pad); y = pad + (k // cols) * (th + lh + pad)
    sheet.paste(im.resize((tw, th), Image.LANCZOS), (x, y + lh))
    d.text((x, y + 4), lab, fill=(230, 222, 200), font=font)
sheet.save(out)
print(out, sheet.size)
