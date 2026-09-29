import {describe, expect, test} from 'bun:test';
import '../../public/art-lab/lifecycle.js';
const {phases, duration, sample, pose, wrap, hash} = globalThis.EmberLifecycle;
describe('Emberwing animation lifecycle', () => {
  test('covers every instant of a 30 second loop without gaps', () => {
    expect(duration).toBe(30);
    expect(phases).toHaveLength(10);
    for (let i = 0; i < phases.length; i++) {
      const p = phases[i];
      expect(p.start).toBe(i ? phases[i - 1].end : 0);
      expect(sample(p.start).phase.id).toBe(p.id);
      expect(sample(p.end - 1e-6).phase.id).toBe(p.id);
    }
  });
  test('seeking and repeat playback give identical poses', () => {
    for (let t = 0; t < duration; t += .125) {
      const a = pose(t);
      pose(29); pose(3);
      expect(pose(t)).toEqual(a);
      expect(sample(t + duration).phase.id).toBe(sample(t).phase.id);
      for (const n of Object.values(a)) expect(Number.isFinite(n)).toBe(true);
      expect(a.visibility).toBeGreaterThanOrEqual(0);
      expect(a.visibility).toBeLessThanOrEqual(1);
    }
  });
  test('ash and summoning have no visible body; death fully dissolves', () => {
    expect(pose(1).visibility).toBe(0);
    expect(pose(25).visibility).toBe(0);
    expect(pose(23.9999).dissolve).toBeCloseTo(1, 5);
    expect(pose(29.99).visibility).toBe(1);
  });
  test('wrap handles negative seeks and exact end boundaries', () => {
    expect(wrap(-1)).toBe(29);
    expect(sample(30).phase.id).toBe('summon');
    expect(sample(-30).phase.id).toBe('summon');
    expect(hash(42)).toBe(hash(42));
    expect(hash(42)).not.toBe(hash(43));
  });
});

test('poses are continuous at state boundaries, including the loop seam', () => {
  for (const phase of phases) {
    const before = pose(phase.start - 1e-7), after = pose(phase.start + 1e-7);
    for (const key of Object.keys(before)) expect(Math.abs(before[key] - after[key])).toBeLessThan(.001);
  }
});
