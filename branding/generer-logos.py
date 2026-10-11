from PIL import Image, ImageOps
src = Image.open("/in/esaat-logo.png  # source : Intranet/intranet/frontend/public/esaat-logo.png").convert("RGBA")
px = src.load(); w, h = src.size
# Statistiques : couleurs présentes (transparence des lettres ?)
from collections import Counter
c = Counter(px[x, y] for x in range(0, w, 3) for y in range(0, h, 3))
print("couleurs principales:", c.most_common(5))
# Boîte englobante du disque sombre
dark = [(x, y) for x in range(w) for y in range(h) if px[x, y][3] > 128 and sum(px[x, y][:3]) < 200]
xs = [p[0] for p in dark]; ys = [p[1] for p in dark]
box = (min(xs), min(ys), max(xs) + 1, max(ys) + 1); print("disque:", box)
mark = src.crop(box)
side = max(mark.size); pad = round(side * 0.04); S = side + 2 * pad
sq = Image.new("RGBA", (S, S), (0, 0, 0, 0)); sq.paste(mark, ((S - mark.size[0]) // 2, (S - mark.size[1]) // 2))
# Version sombre : disque charcoal, lettres et points transparents (le fond de la page passe au travers)
def recolor(img, disc):
    # Les lettres et les points sont déjà transparents : on ne change que la couleur du disque
    out = Image.new("RGBA", img.size, (*disc, 0))
    out.putalpha(img.getchannel("A"))
    return Image.alpha_composite(Image.new("RGBA", img.size, (*disc, 0)), out)
dark_logo = recolor(sq, (0x29, 0x29, 0x29))   # sur fond clair
light_logo = recolor(sq, (0xf5, 0xf0, 0xeb))  # sur fond sombre
for name, im in [("logo.png", dark_logo), ("logo-white.png", light_logo)]:
    im.resize((200, 200), Image.LANCZOS).save("/out/" + name, optimize=True)
for s in (16, 32):
    dark_logo.resize((s, s), Image.LANCZOS).save(f"/out/favicon-{s}x{s}.png")
dark_logo.resize((64, 64), Image.LANCZOS).save("/out/favicon.ico", sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])
dark_logo.resize((512, 512), Image.LANCZOS).save("/out/apple-touch-icon.png")
print("ok")
