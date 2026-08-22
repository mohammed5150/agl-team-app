# Regenerates the logo/icon assets from the source wordmark scan at the repo
# root (PHOTO-2026-04-27-21-41-51.jpg.jpeg, the company logo on a black
# background). Run from the repo root:
#
#   python3 scripts/make-logo-assets.py
#
# Outputs:
#   logo-dark.png        wordmark knocked out to white, star in brand colors,
#                        transparent background (used by the Logo component)
#   favicon.png          star mark alone, transparent, 64x64
#   icon-192/512.png     star mark centered on the app navy; sized for the
#                        maskable safe zone (manifest declares "any maskable")
#   apple-touch-icon.png same, 180x180, opaque
#
# Requires: pillow, numpy.

from PIL import Image
import numpy as np

SRC = "PHOTO-2026-04-27-21-41-51.jpg.jpeg"
NAVY = (11, 26, 43, 255)  # theme.bg

src = Image.open(SRC).convert("RGB")
a = np.asarray(src).astype(int)
r, g, b = a[..., 0], a[..., 1], a[..., 2]

# The scan is the logo composited on black, so alpha ~= max(r,g,b);
# un-premultiply to recover each pixel's true color.
alpha = a.max(axis=2)
scale = np.maximum(alpha, 1)
ur = np.clip(r * 255 // scale, 0, 255)
ug = np.clip(g * 255 // scale, 0, 255)
ub = np.clip(b * 255 // scale, 0, 255)

# Warm pixels are the star; everything else is the teal wordmark.
warm = (alpha > 12) & (ur > ub + 10) & (ur > 100)

def trim(im, th=8):
    bbox = im.split()[3].point(lambda v: 255 if v > th else 0).getbbox()
    return im.crop(bbox)

# logo-dark: star keeps its colors, wordmark goes white, background drops out.
rgba = np.zeros((*alpha.shape, 4), dtype=np.uint8)
rgba[..., 0] = np.where(warm, ur, 255)
rgba[..., 1] = np.where(warm, ug, 255)
rgba[..., 2] = np.where(warm, ub, 255)
rgba[..., 3] = np.where(alpha > 12, alpha, 0)
trim(Image.fromarray(rgba)).save("logo-dark.png", optimize=True)

# Star mark alone. The bbox comes from columns/rows with several strong warm
# pixels, so stray JPEG chroma speckles elsewhere cannot inflate it.
strong = warm & (alpha > 90)
xs = np.where(strong.sum(axis=0) >= 3)[0]
ys = np.where(strong.sum(axis=1) >= 3)[0]
srgba = np.zeros((*alpha.shape, 4), dtype=np.uint8)
srgba[..., 0], srgba[..., 1], srgba[..., 2] = ur, ug, ub
srgba[..., 3] = np.where(warm, alpha, 0)
star = Image.fromarray(srgba).crop((int(xs[0]), int(ys[0]), int(xs[-1]) + 1, int(ys[-1]) + 1))

def square(im, canvas, content, bg=None):
    im2 = im.copy()
    im2.thumbnail((content, content), Image.LANCZOS)
    base = Image.new("RGBA", (canvas, canvas), bg or (0, 0, 0, 0))
    base.paste(im2, ((canvas - im2.width) // 2, (canvas - im2.height) // 2), im2)
    return base

square(star, 64, 52).save("favicon.png", optimize=True)
square(star, 512, 300, NAVY).save("icon-512.png", optimize=True)
square(star, 192, 112, NAVY).save("icon-192.png", optimize=True)
square(star, 180, 108, NAVY).convert("RGB").save("apple-touch-icon.png", optimize=True)
print("logo assets regenerated")
