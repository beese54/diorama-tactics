/**
 * The four transitions B8 adds, each switchable so the user can see them and choose which to
 * keep (the ones dropped are then removed): the wipe from the board into a battle and back, the
 * turn banners, the played card flying to the turn box, and the battle's intro and outro.
 * All on by default; `?fx=wipe,intro` turns on only those listed, `?fx=none` none.
 */
export type FxName = 'wipe' | 'banners' | 'cardfly' | 'intro';
export const FX_NAMES: readonly FxName[] = ['wipe', 'banners', 'cardfly', 'intro'];
export type FxFlags = Record<FxName, boolean>;

/** The flags for a `?fx=` value (null: all on). Pure. */
export function parseFx(param: string | null): FxFlags {
  const on = param === null ? new Set<string>(FX_NAMES) : new Set(param.split(',').map((s) => s.trim()));
  return Object.fromEntries(FX_NAMES.map((n) => [n, on.has(n)])) as FxFlags;
}

/** The app's flags, from its own address. */
export const fx: FxFlags = parseFx(typeof location === 'undefined' ? null : new URLSearchParams(location.search).get('fx'));
