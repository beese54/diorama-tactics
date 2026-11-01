"""Builds a card's art layers for the game from its Seedream sources (cards.md, Part 2 "Composite").

From art/source/candidates/<id>-plate-N.jpg, <id>-character-N.jpg and <id>-front-N.jpg (the
picks are named in scripts/art/prompts/cards.json, or the first of each by default):
- keys the two green-screen layers (key.py's keyer), and places them in the square art as the
  card's `place` says: the figures centred where it puts them, the foreground pieces pushed
  into the lower corners;
- grades the cutouts toward the plate's light, and lays a soft contact shadow under the feet;
- builds a depth map from the layers: the plate's ground rising toward the viewer, the figures
  nearer, the foreground nearest;
- writes public/cards/<id>/: art.jpg (the flat still, also the clip's first and last frame),
  plate.jpg, character.webp, front.webp (full-art RGBA, so the layers stack without offsets),
  depth.png, and layers.json (the files, and the weapon's glint line in art fractions).

Usage: python scripts/art/cardart.py <card id> [--plate N] [--character N] [--front N]
"""
import argparse
import json
import os
import sys

import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

sys.path.insert(0, os.path.dirname(__file__))
from key import despill, erode, key  # noqa: E402

SIZE = 1536
CANDIDATES = 'art/source/candidates'
PROMPTS = 'scripts/art/prompts/cards.json'


def defringe(rgb: np.ndarray, alpha: np.ndarray, band: int = 40) -> np.ndarray:
    """Drops the rim light's glow, which the keyer keeps as a yellow-green halo: near the edge,
    pixels where the green still rises to the red (a warm glow mixed with the screen). The
    figure's own warm colours (gold hair, leather) have green well below red."""
    near = ndimage.distance_transform_edt(alpha > 0.5) <= band
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    glow = near & (g >= 0.9 * r) & (g > 1.3 * b + 10)
    out = np.where(glow, 0, alpha)
    # Keep only the figure and pieces still joined to it, and soften the cut by a pixel.
    return ndimage.gaussian_filter(out, 0.7) * (out > 0.02)


def cutout(path: str) -> np.ndarray:
    """The source keyed off its green: float RGBA, alpha in [0, 1]."""
    rgb = np.asarray(Image.open(path).convert('RGB').resize((SIZE, SIZE), Image.LANCZOS)).astype(np.float32)
    alpha = defringe(rgb, erode(key(rgb)))
    return np.dstack([despill(rgb, alpha), alpha])


def bbox(alpha: np.ndarray, at: float = 0.5):
    ys, xs = np.nonzero(alpha > at)
    return xs.min(), ys.min(), xs.max() + 1, ys.max() + 1


def paste(canvas: np.ndarray, piece: np.ndarray, x: int, y: int) -> None:
    """Puts `piece` (RGBA) on the transparent `canvas` with its top left at (x, y), clipped."""
    h, w = piece.shape[:2]
    x0, y0, x1, y1 = max(0, x), max(0, y), min(SIZE, x + w), min(SIZE, y + h)
    if x0 >= x1 or y0 >= y1:
        return
    src = piece[y0 - y:y1 - y, x0 - x:x1 - x]
    dst = canvas[y0:y1, x0:x1]
    a = src[..., 3:4]
    out_a = a + dst[..., 3:4] * (1 - a)
    rgb = (src[..., :3] * a + dst[..., :3] * dst[..., 3:4] * (1 - a)) / np.maximum(out_a, 1e-6)
    canvas[y0:y1, x0:x1] = np.dstack([rgb, out_a])


def scaled(piece: np.ndarray, s: float) -> np.ndarray:
    h, w = piece.shape[:2]
    size = (max(1, round(w * s)), max(1, round(h * s)))
    # Premultiplied while resampling, so the edges keep their colour.
    pre = np.dstack([piece[..., :3] * piece[..., 3:4], piece[..., 3]])
    chans = [np.asarray(Image.fromarray(pre[..., c].astype(np.float32), 'F').resize(size, Image.LANCZOS)) for c in range(4)]
    out = np.dstack(chans)
    a = np.clip(out[..., 3:4], 0, 1)
    return np.dstack([np.clip(out[..., :3] / np.maximum(a, 1e-6), 0, 255), a])


def place_figures(src: np.ndarray, place: dict) -> tuple[np.ndarray, tuple[float, float, float, float]]:
    """The figures scaled to `height` of the art, centred on `x`, standing on `bottom`; also the
    transform (scale, dx, dy in pixels) that took source pixels to art pixels."""
    x0, y0, x1, y1 = bbox(src[..., 3])
    piece = src[y0:y1, x0:x1]
    s = place['height'] * SIZE / (y1 - y0)
    piece = scaled(piece, s)
    h, w = piece.shape[:2]
    px, py = round(place['x'] * SIZE - w / 2), round(place['bottom'] * SIZE - h)
    canvas = np.zeros((SIZE, SIZE, 4), np.float32)
    paste(canvas, piece, px, py)
    return canvas, (s, px - x0 * s, py - y0 * s)


def place_front(src: np.ndarray, place: dict) -> np.ndarray:
    """The foreground pieces, grouped by side of centre, pushed into the lower corners."""
    canvas = np.zeros((SIZE, SIZE, 4), np.float32)
    # Grass blades and their stone are one piece: label the mask grown by a few pixels.
    labels, n = ndimage.label(ndimage.binary_dilation(src[..., 3] > 0.3, iterations=12))
    groups = {'left': np.zeros(src.shape[:2], bool), 'right': np.zeros(src.shape[:2], bool)}
    for i in range(1, n + 1):
        m = labels == i
        if m.sum() < 400:
            continue
        xs = np.nonzero(m)[1]
        groups['left' if xs.mean() < SIZE / 2 else 'right'] |= m
    for side, m in groups.items():
        if not m.any():
            continue
        alpha = np.where(m, src[..., 3], 0)
        x0, y0, x1, y1 = bbox(alpha, 0.05)
        piece = scaled(np.dstack([src[..., :3], alpha])[y0:y1, x0:x1], place['scale'])
        h, w = piece.shape[:2]
        hang = round(place['overhang'] * SIZE)
        px = -hang if side == 'left' else SIZE + hang - w
        paste(canvas, piece, px, round(place['bottom'] * SIZE - h))
    return canvas


def grade(layer: np.ndarray, plate: np.ndarray, k: float = 0.14) -> np.ndarray:
    """Pulls a cutout's colours toward the plate's overall light, so it sits in the same scene."""
    tint = plate.reshape(-1, 3).mean(0)
    tint = tint / tint.max()
    out = layer.copy()
    out[..., :3] = layer[..., :3] * ((1 - k) + k * tint)
    return out


def contact_shadow(plate: np.ndarray, figures: np.ndarray) -> np.ndarray:
    """Darkens the ground under the feet: the figures' lowest rows, squashed and blurred."""
    a = figures[..., 3]
    _, _, _, y1 = bbox(a)
    band = np.zeros_like(a)
    depth = int(SIZE * 0.035)
    band[y1 - depth:y1] = (a[y1 - depth:y1] > 0.5)
    band = ndimage.binary_dilation(band, iterations=10).astype(np.float32)
    shadow = ndimage.gaussian_filter(band, (8, 22))
    shadow = shadow / max(shadow.max(), 1e-6)
    return plate * (1 - 0.42 * shadow[..., None])


def over(base: np.ndarray, layer: np.ndarray) -> np.ndarray:
    a = layer[..., 3:4]
    return base * (1 - a) + layer[..., :3] * a


def depth_map(figures: np.ndarray, front: np.ndarray, horizon: float) -> np.ndarray:
    """White is near. The sky and the horizon far, the ground rising toward the bottom edge."""
    y = np.linspace(0, 1, SIZE)[:, None].repeat(SIZE, 1)
    d = np.clip((y - horizon) / (1 - horizon), 0, 1) ** 1.3 * 0.55
    d = np.maximum(d, figures[..., 3] * 0.72)
    d = np.maximum(d, front[..., 3] * 0.95)
    return ndimage.gaussian_filter(d, 4)


def pick(card: str, kind: str, n) -> str:
    path = os.path.join(CANDIDATES, f'{card}-{kind}-{n}.jpg')
    if not os.path.exists(path):
        raise SystemExit(f'missing source: {path}')
    return path


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('card')
    for kind in ('plate', 'character', 'front'):
        ap.add_argument(f'--{kind}', default=None)
    ap.add_argument('--horizon', type=float, default=0.42, help='the horizon line, as a fraction of the art from the top')
    a = ap.parse_args()
    poses = json.load(open(PROMPTS, encoding='utf8'))['poses']
    char_cfg, front_cfg = poses[f'{a.card}-character'], poses[f'{a.card}-front']
    picks = {k: getattr(a, k) or poses[f'{a.card}-{k}'].get('pick', 1) for k in ('plate', 'character', 'front')}

    plate = np.asarray(Image.open(pick(a.card, 'plate', picks['plate'])).convert('RGB').resize((SIZE, SIZE), Image.LANCZOS)).astype(np.float32)
    figures, (s, dx, dy) = place_figures(cutout(pick(a.card, 'character', picks['character'])), char_cfg['place'])
    front = place_front(cutout(pick(a.card, 'front', picks['front'])), front_cfg['place'])
    figures, front = grade(figures, plate), grade(front, plate)
    ground = contact_shadow(plate, figures)
    art = over(over(ground, figures), front)

    out = os.path.join('public', 'cards', a.card)
    os.makedirs(out, exist_ok=True)
    u8 = lambda x: np.clip(x, 0, 255).round().astype(np.uint8)  # noqa: E731
    Image.fromarray(u8(art)).save(os.path.join(out, 'art.jpg'), quality=90)
    Image.fromarray(u8(ground)).save(os.path.join(out, 'plate.jpg'), quality=88)
    for name, layer in (('character', figures), ('front', front)):
        rgba = np.dstack([layer[..., :3], layer[..., 3] * 255])
        Image.fromarray(u8(rgba), 'RGBA').save(os.path.join(out, f'{name}.webp'), quality=90, method=6)
    depth = depth_map(figures, front, a.horizon)
    Image.fromarray(u8(depth * 255), 'L').resize((768, 768), Image.LANCZOS).save(os.path.join(out, 'depth.png'), optimize=True)

    # The glint line: source fractions → source pixels (the cutout was resized to SIZE) → art fractions.
    glint = [[round((gx * SIZE * s + dx) / SIZE, 4), round((gy * SIZE * s + dy) / SIZE, 4)] for gx, gy in char_cfg.get('glint', [])]
    layers = {'art': 'art.jpg', 'plate': 'plate.jpg', 'character': 'character.webp', 'front': 'front.webp', 'depth': 'depth.png', 'glint': glint}
    with open(os.path.join(out, 'layers.json'), 'w', encoding='utf8') as f:
        json.dump(layers, f, indent=1)
        f.write('\n')
    sizes = ', '.join(f'{n} {os.path.getsize(os.path.join(out, n)) // 1024} KB' for n in sorted(os.listdir(out)))
    print(f'{out}: {sizes}; glint {glint}')


if __name__ == '__main__':
    main()
