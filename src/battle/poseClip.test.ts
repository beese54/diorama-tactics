import { describe, expect, it } from 'vitest';
import { breath, clipSeconds, sample, type Beat } from './poseClip';

const CLIP: Beat[] = [
  { pose: 'stance', seconds: 1, body: { x: 0 } },
  { pose: 'wind-up', seconds: 1, body: { x: -10 } },
  { pose: 'slash', seconds: 0.5, body: { x: 40, squash: 1.04 }, snap: true, cue: 'strike' },
  { pose: 'follow', seconds: 1.5, body: { x: 0, squash: 1 } },
];

describe('sample', () => {
  it('adds up the beats', () => {
    expect(clipSeconds(CLIP)).toBe(4);
  });

  it('shows each beat\'s pose for its time', () => {
    expect([0, 0.99, 1, 2, 2.49, 2.5, 3.99].map((t) => sample(CLIP, t).pose)).toEqual(
      ['stance', 'stance', 'wind-up', 'slash', 'slash', 'follow', 'follow']);
  });

  it('eases the body to each key, slow at both ends', () => {
    expect(sample(CLIP, 1).body.x).toBeCloseTo(0);
    expect(sample(CLIP, 1.5).body.x).toBeCloseTo(-5);
    expect(sample(CLIP, 1.1).body.x).toBeGreaterThan(-1);
    expect(sample(CLIP, 1.99).body.x).toBeCloseTo(-10, 1);
  });

  it('snaps at once when the beat says so', () => {
    expect(sample(CLIP, 2).body.x).toBe(40);
    expect(sample(CLIP, 2).body.squash).toBeCloseTo(1.04);
  });

  it('moves at a steady speed when the beat is linear', () => {
    const clip: Beat[] = [{ pose: 'run', seconds: 1, body: { x: 0 } }, { pose: 'run', seconds: 1, body: { x: 100 }, linear: true }];
    expect(sample(clip, 1.25).body.x).toBeCloseTo(25);
    expect(sample(clip, 1.75).body.x).toBeCloseTo(75);
  });

  it('keeps what a key leaves out', () => {
    // The wind-up names only x: the squash stays at rest.
    expect(sample(CLIP, 1.5).body.squash).toBe(1);
    expect(sample(CLIP, 1.5).body.lean).toBe(0);
  });

  it('fires a cue as its beat starts, with how long ago and where (a snap: where it lands)', () => {
    expect(sample(CLIP, 1.9).cues).toEqual([]);
    const [c] = sample(CLIP, 2.25).cues;
    expect(c.cue).toBe('strike');
    expect(c.age).toBeCloseTo(0.25);
    expect(c.x).toBeCloseTo(40);
    const eased: Beat[] = [{ pose: 'a', seconds: 1, body: { x: 5 } }, { pose: 'b', seconds: 1, body: { x: 9 }, cue: 'step' }];
    expect(sample(eased, 1.5).cues[0].x).toBeCloseTo(5);
  });

  it('loops, starting from where it ends', () => {
    expect(sample(CLIP, 4.5).pose).toBe('stance');
    expect(sample(CLIP, 4.5).body.x).toBeCloseTo(sample(CLIP, 0.5).body.x);
    expect(sample(CLIP, 0).cues).toEqual([]);
  });

  it('falls back to the next pose in a list the set does not have', () => {
    const clip: Beat[] = [{ pose: ['ready', 'stance'], seconds: 1 }];
    expect(sample(clip, 0.5, (p) => p !== 'ready').pose).toBe('stance');
    expect(sample(clip, 0.5).pose).toBe('ready');
  });

  it('breathes only in beats that ask for it', () => {
    const clip: Beat[] = [{ pose: 'stance', seconds: 2, breathe: true }, { pose: 'x', seconds: 2 }];
    expect(sample(clip, 0.4).body.squash).toBeCloseTo(breath(0.4));
    expect(breath(0.4)).toBeGreaterThan(1.007);
    expect(sample(clip, 2.4).body.squash).toBe(1);
  });
});
