"""Turns a Google Flow character image on a flat green background into a game-ready sprite.

Keys out the background (its colour sampled from the image's border, since Flow's green
varies), removes green spill from the edges, crops to the figure with its feet on the bottom
row, scales it to a fixed height, and optionally bakes a red variant for the enemy side by
turning the blue cloth red (steel, skin, hair and leather keep their colours).

Usage: python scripts/art/key.py <in.jpg|png> <out.png> [--height 512] [--red <out-red.png>]
"""
import argparse
import colorsys

import numpy as np
from PIL import Image


def key(rgb: np.ndarray) -> np.ndarray:
    """Alpha in [0, 1] from each pixel's distance to the border's median colour."""
    border = np.concatenate([rgb[:8].reshape(-1, 3), rgb[-8:].reshape(-1, 3), rgb[:, :8].reshape(-1, 3), rgb[:, -8:].reshape(-1, 3)])
    bg = np.median(border, axis=0)
    # Greenness: how far green rises above the other two channels, relative to the background's.
    g = rgb[..., 1] - np.maximum(rgb[..., 0], rgb[..., 2])
    g_bg = bg[1] - max(bg[0], bg[2])
    dist = np.linalg.norm(rgb - bg, axis=-1)
    # Opaque where the colour is far from the background or not green-dominant at all.
    a_dist = np.clip((dist - 40) / 70, 0, 1)
    a_green = np.clip(1 - (g - 0.15 * g_bg) / (0.55 * g_bg), 0, 1)
    return np.maximum(a_dist, a_green) * (a_dist > 0.02)


def despill(rgb: np.ndarray, alpha: np.ndarray) -> np.ndarray:
    """Pulls green back to the other channels wherever it pokes above them (the green halo)."""
    out = rgb.copy()
    cap = np.maximum(out[..., 0], out[..., 2]) * 1.02
    out[..., 1] = np.where(out[..., 1] > cap, cap, out[..., 1])
    return out


def erode(alpha: np.ndarray) -> np.ndarray:
    """Shaves one pixel off the edge (a 3x3 minimum), where JPEG fringes live."""
    p = np.pad(alpha, 1, mode='edge')
    stack = [p[1 + dy:p.shape[0] - 1 + dy, 1 + dx:p.shape[1] - 1 + dx] for dy in (-1, 0, 1) for dx in (-1, 0, 1)]
    return np.min(stack, axis=0)


def redden(rgba: np.ndarray) -> np.ndarray:
    """Blue cloth to red: hues from cyan to violet with real colour in them turn crimson."""
    out = rgba.copy()
    flat = out[..., :3].reshape(-1, 3) / 255.0
    hsv = np.array([colorsys.rgb_to_hsv(*p) for p in flat])
    h, s, v = hsv[:, 0], hsv[:, 1], hsv[:, 2]
    blue = (h > 0.52) & (h < 0.75) & (s > 0.28)
    h = np.where(blue, (h - 0.62 + 0.995) % 1.0, h)
    s = np.where(blue, np.minimum(1, s * 1.05), s)
    v = np.where(blue, v * 0.92, v)
    rgb = np.array([colorsys.hsv_to_rgb(*p) for p in np.stack([h, s, v], 1)])
    out[..., :3] = (rgb.reshape(out.shape[0], out.shape[1], 3) * 255).round()
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('src')
    ap.add_argument('out')
    ap.add_argument('--height', type=int, default=512)
    ap.add_argument('--red')
    a = ap.parse_args()
    rgb = np.asarray(Image.open(a.src).convert('RGB')).astype(np.float32)
    alpha = erode(key(rgb))
    rgb = despill(rgb, alpha)
    ys, xs = np.nonzero(alpha > 0.5)
    pad = 6
    y0, y1 = max(0, ys.min() - pad), ys.max() + 1
    x0, x1 = max(0, xs.min() - pad), min(rgb.shape[1], xs.max() + 1 + pad)
    rgba = np.dstack([rgb, alpha * 255])[y0:y1, x0:x1].clip(0, 255).astype(np.uint8)
    img = Image.fromarray(rgba, 'RGBA')
    scale = a.height / img.height
    img = img.resize((round(img.width * scale), a.height), Image.LANCZOS)
    img.save(a.out, optimize=True)
    print(f'{a.out}: {img.width}x{img.height} (crop {x1 - x0}x{y1 - y0} from {rgb.shape[1]}x{rgb.shape[0]})')
    if a.red:
        Image.fromarray(redden(np.asarray(img)), 'RGBA').save(a.red, optimize=True)
        print(f'{a.red}: red variant')


if __name__ == '__main__':
    main()
