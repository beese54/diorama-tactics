"""Builds a card's art layers for the game from its Seedream sources (cards.md, Part 2 "Composite").

From art/source/candidates/<id>-plate-N.jpg, <id>-character-N.jpg and <id>-front-N.jpg (the
picks are named in scripts/art/prompts/cards.json, or the first of each by default):
- keys the two green-screen layers (key.py's keyer), and places them in the square art as the
  card's `place` says: the figures centred where it puts them, the foreground pieces pushed
  into the lower corners;
- grades the cutouts toward the plate's light, and lays a soft contact shadow under the feet;
- builds the plate's depth map: the sky and horizon far, the ground rising toward the viewer
  (the figures and foreground are layers of their own, each at its own depth);
- writes public/cards/<id>/: art.jpg (the flat still, also the clip's first and last frame),
  plate.jpg, character.webp, front.webp (full-art RGBA, so the layers stack without offsets),
  depth.png, and layers.json (the files, and the weapon's glint line in art fractions).

It also lists the card in public/cards/index.json, the manifest the game reads to know which
cards have art.

With --clip <file.mp4>, it instead installs that clip as the card's hover clip: re-encoded
(H.264, no audio, fast start) to public/cards/<id>/motion.mp4 and listed in layers.json.

Usage: python scripts/art/cardart.py <card id> [--plate N] [--character N] [--front N]
       python scripts/art/cardart.py <card id> --clip <file.mp4>
"""
import argparse
import json
import os
import subprocess
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


def unlight(rgb: np.ndarray, alpha: np.ndarray, figures: bool = True) -> np.ndarray:
    """Drops light that the model painted on the green screen (a shaft of sun, a moon glow, a
    lightning flare). Mixed with the screen it stays green-tinted or cyan, which the figures never are
    (their prompts allow no green), though it is far enough from the screen's colour to key as
    solid. For figures, its white core, cut off from them once the tinted wash is gone, is dropped
    too: a piece that touches the picture's edge and isn't the figures themselves. (Foreground
    pieces sit in the corners by design, so they keep theirs.)"""
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    # Green-tinted (a warm or white light on the screen), or cyan (a blue light on it): green well
    # above red and close to blue. Blue cloth and steel keep blue far above green, so they stay.
    tinted = (g > np.maximum(r, b) + 22) | ((g > r + 35) & (g > 0.8 * b))
    out = np.where(tinted, 0, alpha)
    labels, n = ndimage.label(out > 0.3)
    if figures and n > 1:
        sizes = ndimage.sum(np.ones_like(out), labels, range(1, n + 1))
        main = 1 + int(np.argmax(sizes))
        edge = set(np.unique(np.concatenate([labels[0], labels[-1], labels[:, 0], labels[:, -1]]))) - {0, main}
        if edge:
            out = np.where(np.isin(labels, list(edge)), 0, out)
    return out


def warm(rgb: np.ndarray) -> np.ndarray:
    """A fire's or a lamp's glow over the screen keys as a yellow-green haze, green just above red.
    It is meant to be there, so it keeps its alpha and loses the green: green goes just under red,
    a warm yellow-orange. The figures' own golds and flames already keep red above green."""
    out = rgb.copy()
    r, g, b = out[..., 0], out[..., 1], out[..., 2]
    out[..., 1] = np.where((g > r) & (g > 1.3 * b + 10), r * 0.95, g)
    return out


def cutout(path: str, figures: bool = True) -> np.ndarray:
    """The source keyed off its green: float RGBA, alpha in [0, 1]."""
    rgb = np.asarray(Image.open(path).convert('RGB').resize((SIZE, SIZE), Image.LANCZOS)).astype(np.float32)
    alpha = defringe(rgb, unlight(rgb, erode(key(rgb)), figures))
    return np.dstack([warm(despill(rgb, alpha)), alpha])


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
    # A foreground that runs across the middle (grass or mud along the whole bottom edge) can't be
    # split at the centre without a hard seam: it goes in whole, as drawn (or scaled by `wholeScale`
    # about its foot's middle, where it doesn't reach the sides), moved down so its foot sits on `bottom`.
    for i in range(1, n + 1):
        xs = np.nonzero(labels == i)[1]
        if xs.size >= 400 and xs.min() < SIZE * 0.4 and xs.max() > SIZE * 0.6:
            k = place.get('wholeScale', 1.0)
            piece = scaled(src, k) if k != 1.0 else src
            _, _, _, y1 = bbox(piece[..., 3], 0.05)
            paste(canvas, piece, round((SIZE - piece.shape[1]) / 2), round(place['bottom'] * SIZE - y1))
            return canvas
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


def depth_map(horizon: float) -> np.ndarray:
    """The plate's depth, white near: the sky and the horizon far, the ground rising toward the
    bottom edge. The figures and the foreground are layers of their own, each at its own depth,
    so they stay out of it: a plate warped around their outlines would show at their edges."""
    y = np.linspace(0, 1, SIZE)[:, None].repeat(SIZE, 1)
    return np.clip((y - horizon) / (1 - horizon), 0, 1) ** 1.3


def pick(card: str, kind: str, n) -> str:
    path = os.path.join(CANDIDATES, f'{card}-{kind}-{n}.jpg')
    if not os.path.exists(path):
        raise SystemExit(f'missing source: {path}')
    return path


def manifest(card: str) -> None:
    """Adds the card to public/cards/index.json, the list of cards that have art."""
    path = os.path.join('public', 'cards', 'index.json')
    ids = json.load(open(path, encoding='utf8'))['cards'] if os.path.exists(path) else []
    with open(path, 'w', encoding='utf8') as f:
        json.dump({'cards': sorted(set(ids) | {card})}, f, indent=1)
        f.write('\n')


def install_clip(card: str, clip: str) -> None:
    """Re-encodes `clip` as the card's hover clip and lists it in its layers.json."""
    out = os.path.join('public', 'cards', card)
    layers_path = os.path.join(out, 'layers.json')
    if not os.path.exists(layers_path):
        raise SystemExit(f'build the card first: {layers_path} is missing')
    dest = os.path.join(out, 'motion.mp4')
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', clip, '-an', '-c:v', 'libx264', '-crf', '20', '-preset', 'slow',
                    '-pix_fmt', 'yuv420p', '-movflags', '+faststart', dest], check=True)
    layers = json.load(open(layers_path, encoding='utf8'))
    layers['motion'] = 'motion.mp4'
    with open(layers_path, 'w', encoding='utf8') as f:
        json.dump(layers, f, indent=1)
        f.write('\n')
    print(f'{dest}: {os.path.getsize(dest) // 1024} KB from {clip}')


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('card')
    ap.add_argument('--clip', help="install this mp4 as the card's hover clip instead of building its art")
    for kind in ('plate', 'character', 'front'):
        ap.add_argument(f'--{kind}', default=None)
    ap.add_argument('--horizon', type=float, default=None, help="the horizon line, as a fraction of the art from the top (default: the plate's `horizon` in cards.json, else 0.42)")
    a = ap.parse_args()
    if a.clip:
        install_clip(a.card, a.clip)
        return
    poses = json.load(open(PROMPTS, encoding='utf8'))['poses']
    char_cfg, front_cfg = poses[f'{a.card}-character'], poses[f'{a.card}-front']
    picks = {k: getattr(a, k) or poses[f'{a.card}-{k}'].get('pick', 1) for k in ('plate', 'character', 'front')}

    plate = np.asarray(Image.open(pick(a.card, 'plate', picks['plate'])).convert('RGB').resize((SIZE, SIZE), Image.LANCZOS)).astype(np.float32)
    figures, (s, dx, dy) = place_figures(cutout(pick(a.card, 'character', picks['character'])), char_cfg['place'])
    front = place_front(cutout(pick(a.card, 'front', picks['front']), figures=False), front_cfg['place'])
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
    horizon = a.horizon if a.horizon is not None else poses[f'{a.card}-plate'].get('horizon', 0.42)
    depth = depth_map(horizon)
    Image.fromarray(u8(depth * 255), 'L').resize((768, 768), Image.LANCZOS).save(os.path.join(out, 'depth.png'), optimize=True)

    # The glint line: source fractions → source pixels (the cutout was resized to SIZE) → art fractions.
    glint = [[round((gx * SIZE * s + dx) / SIZE, 4), round((gy * SIZE * s + dy) / SIZE, 4)] for gx, gy in char_cfg.get('glint', [])]
    layers = {'art': 'art.jpg', 'plate': 'plate.jpg', 'character': 'character.webp', 'front': 'front.webp', 'depth': 'depth.png', 'glint': glint}
    # A clip installed earlier stays listed: rebuilding the art doesn't drop it.
    if os.path.exists(os.path.join(out, 'motion.mp4')):
        layers['motion'] = 'motion.mp4'
    with open(os.path.join(out, 'layers.json'), 'w', encoding='utf8') as f:
        json.dump(layers, f, indent=1)
        f.write('\n')
    manifest(a.card)
    sizes = ', '.join(f'{n} {os.path.getsize(os.path.join(out, n)) // 1024} KB' for n in sorted(os.listdir(out)))
    print(f'{out}: {sizes}; glint {glint}')


if __name__ == '__main__':
    main()
