"""Draw the app mark (a hexagon holding three rising bars) as PNGs for the PDF report and the favicons.
The web app draws the same mark as SVG (src/components/Logo.svelte, public/favicon.svg); keep the geometry in step.
Run: python scripts/make-logo.py  (needs Pillow)."""
from pathlib import Path
from PIL import Image, ImageDraw

HEX = [(16, 1), (29, 8.5), (29, 23.5), (16, 31), (3, 23.5), (3, 8.5)]
BARS = [(9.5, 17, 13, 22), (14.25, 13.5, 17.75, 22), (19, 10, 22.5, 22)]  # x0, y0, x1, y1
NAVY, ICE, INK, WHITE = (27, 42, 71, 255), (201, 214, 242, 255), (14, 19, 28, 255), (255, 255, 255, 255)

def mark(px: int, hexa, bars) -> Image.Image:
    s = 8  # supersample, then downsample for smooth edges
    img = Image.new("RGBA", (px * s, px * s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    k = px * s / 32
    d.polygon([(x * k, y * k) for x, y in HEX], fill=hexa)
    for x0, y0, x1, y1 in BARS:
        d.rounded_rectangle([x0 * k, y0 * k, x1 * k, y1 * k], radius=0.8 * k, fill=bars)
    return img.resize((px, px), Image.LANCZOS)

root = Path(__file__).resolve().parent.parent
mark(256, NAVY, WHITE).save(root / "src/assets/logo-color.png")
mark(256, WHITE, NAVY).save(root / "src/assets/logo-white.png")
mark(64, NAVY, WHITE).save(root / "public/favicon-light.png")
mark(64, ICE, INK).save(root / "public/favicon-dark.png")
