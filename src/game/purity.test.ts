import { describe, expect, it } from 'vitest';

/** The source of every module under src, keyed by its path inside src ("game/units.ts", "map/props.ts"). */
const SOURCES = Object.fromEntries(
  Object.entries(import.meta.glob<string>(['../**/*.ts', '!../**/*.test.ts'], { query: '?raw', import: 'default', eager: true }))
    .map(([k, v]) => [k.startsWith('./') ? `game/${k.slice(2)}` : k.slice(3), v]),
);

/** Resolves `spec` imported by the module at `from` to a SOURCES key. */
function resolve(from: string, spec: string): string {
  const parts = from.split('/').slice(0, -1);
  for (const p of spec.split('/')) {
    if (p === '..') parts.pop();
    else if (p !== '.') parts.push(p);
  }
  return `${parts.join('/')}.ts`;
}

/** Every module the rules core loads, followed through relative imports, with the packages each one imports. */
function imports(): Map<string, string[]> {
  const seen = new Map<string, string[]>();
  const todo = Object.keys(SOURCES).filter((k) => k.startsWith('game/'));
  while (todo.length) {
    const file = todo.pop()!;
    if (seen.has(file)) continue;
    const source = SOURCES[file];
    if (source === undefined) throw new Error(`unresolved import ${file}`);
    const specs = [...source.matchAll(/from '([^']+)'/g)].map((m) => m[1]);
    seen.set(file, specs.filter((s) => !s.startsWith('.')));
    for (const s of specs.filter((s) => s.startsWith('.'))) todo.push(resolve(file, s));
  }
  return seen;
}

describe('rules core', () => {
  it('loads nothing from three.js, not even through the map modules it uses', () => {
    const all = imports();
    expect([...all.keys()]).toContain('map/terrain.ts');
    for (const [file, packages] of all) expect(packages, file).not.toContain('three');
  });
});
