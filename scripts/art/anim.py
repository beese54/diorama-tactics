"""Turns a set of Google Flow animation frames into sprites that line up with each other.

key.py crops and scales every image on its own, which is right for a still but makes an
animation wobble. Here every frame of a set is keyed at one shared scale, and each gets an
anchor: the feet line and the middle of the torso, so the engine stands every frame on the
same spot. Pose images come from separate generations, each framed a little differently, so
each pose finds its own anchor; video frames share the first frame's anchor (the camera is
locked, so the figure's own movement is kept).

Writes <out>/<name>.webp per frame (WebP keeps the alpha at a sixth of PNG's size) and <out>/frames.json: [{file, w, h, ax, ay}], plus the
standing figure's height in pixels ("stand", from the first frame) so the engine can size
the set against the other art.

Usage:
  python scripts/art/anim.py set <name>   (a character from scripts/art/sets.json, into public/battle/anim/<name>-poses/)
  python scripts/art/anim.py poses <out_dir> <stand_height> <name=in.jpg[:loose][*factor]>...
  python scripts/art/anim.py video <out_dir> <stand_height> <in.mp4> <first> <last> <step>
A pose marked :loose drops pieces not joined to the figure (Flow's ghost copies of a sword).
A pose ending *<factor> is drawn that much larger (a generator that zoomed out to fit a raised
weapon draws the figure smaller than its other poses).
"""
import json
import os
import subprocess
import sys
import tempfile

import numpy as np
from PIL import Image
from scipy import ndimage

sys.path.insert(0, os.path.dirname(__file__))
from key import despill, erode, key  # noqa: E402


def matte(path: str, loose: bool) -> np.ndarray:
    """RGBA float array of the keyed figure, full frame (no crop)."""
    rgb = np.asarray(Image.open(path).convert('RGB')).astype(np.float32)
    alpha = erode(key(rgb))
    if loose:
        solid = alpha > 0.16
        lab, n = ndimage.label(solid)
        if n > 1:
            sizes = ndimage.sum(solid, lab, range(1, n + 1))
            body = ndimage.binary_dilation(lab == 1 + int(np.argmax(sizes)), iterations=2)
            alpha = np.where(body, alpha, 0)
    return np.dstack([despill(rgb, alpha), alpha * 255])


def anchor(alpha: np.ndarray) -> tuple[float, float, float]:
    """(feet y, torso x, figure height): the lowest solid row, the median x of the band
    30 to 60 percent of the way up the figure, and the solid height."""
    ys, xs = np.nonzero(alpha > 128)
    top, feet = ys.min(), ys.max() + 1
    h = feet - top
    band = (ys < feet - 0.3 * h) & (ys > feet - 0.6 * h)
    return float(feet), float(np.median(xs[band])), float(h)


def write(frames: list[tuple[str, np.ndarray, float, float, float]], out: str, scale: float, stand: float) -> None:
    """Crops each frame to its figure, scales it, and records where its anchor lands. Frames
    made at another resolution than the first (Flow at 2048, Seedream at 1536) are scaled by
    the ratio, so a character drawn at the same share of the frame comes out the same size."""
    os.makedirs(out, exist_ok=True)
    meta = []
    width = frames[0][1].shape[1]
    for name, rgba, feet, mid, factor in frames:
        k = scale * width / rgba.shape[1] * factor
        ys, xs = np.nonzero(rgba[..., 3] > 8)
        pad = 4
        y0, y1 = max(0, ys.min() - pad), min(rgba.shape[0], ys.max() + 1 + pad)
        x0, x1 = max(0, xs.min() - pad), min(rgba.shape[1], xs.max() + 1 + pad)
        img = Image.fromarray(rgba[y0:y1, x0:x1].clip(0, 255).astype(np.uint8), 'RGBA')
        w, h = max(1, round(img.width * k)), max(1, round(img.height * k))
        img.resize((w, h), Image.LANCZOS).save(os.path.join(out, f'{name}.webp'), 'WEBP', quality=92, method=6)
        meta.append({'file': f'{name}.webp', 'w': w, 'h': h, 'ax': round((mid - x0) * k, 1), 'ay': round((feet - y0) * k, 1)})
    with open(os.path.join(out, 'frames.json'), 'w', encoding='utf8') as f:
        json.dump({'stand': stand, 'frames': meta}, f, indent=1)
        f.write('\n')
    print(f'{out}: {len(meta)} frames, stand {stand}px, scale {scale:.3f}')


def poses(out: str, stand: int, specs: list[str]) -> None:
    frames, scale = [], None
    for spec in specs:
        name, src = spec.split('=', 1)
        src, _, factor = src.partition('*')
        loose = src.endswith(':loose')
        rgba = matte(src.removesuffix(':loose'), loose)
        feet, mid, h = anchor(rgba[..., 3])
        # The first pose is the stance: it sets the scale for the whole set.
        scale = scale or stand / h
        frames.append((name, rgba, feet, mid, float(factor or 1)))
    write(frames, out, scale, stand)


def video(out: str, stand: int, src: str, first: int, last: int, step: int) -> None:
    with tempfile.TemporaryDirectory() as tmp:
        subprocess.run(['ffmpeg', '-v', 'error', '-i', src, os.path.join(tmp, 'f%03d.png')], check=True)
        mattes = [(i, matte(os.path.join(tmp, f'f{i + 1:03d}.png'), False)) for i in range(first, last + 1, step)]
    # The first frame is the stance: its anchor and height hold for every frame.
    feet, mid, h = anchor(mattes[0][1][..., 3])
    frames = [(f'f{i:03d}', rgba, feet, mid, 1.0) for i, rgba in mattes]
    write(frames, out, min(1.0, stand / h), stand if stand <= h else h)


def from_manifest(name: str) -> None:
    """Rebuilds one character's set from scripts/art/sets.json, clearing the old frames first."""
    with open(os.path.join(os.path.dirname(__file__), 'sets.json'), encoding='utf8') as f:
        manifest = json.load(f)
    out = os.path.join('public', 'battle', 'anim', f'{name}-poses')
    if os.path.isdir(out):
        for old in os.listdir(out):
            os.remove(os.path.join(out, old))
    poses(out, manifest['stand'], [f'{pose}={os.path.join("art", "source", src)}' for pose, src in manifest['sets'][name].items()])


if __name__ == '__main__':
    if sys.argv[1] == 'set':
        from_manifest(sys.argv[2])
        sys.exit(0)
    kind, out, stand, *rest = sys.argv[1:]
    if kind == 'poses':
        poses(out, int(stand), rest)
    else:
        video(out, int(stand), rest[0], int(rest[1]), int(rest[2]), int(rest[3]))
