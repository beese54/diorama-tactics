/**
 * Where a small window goes beside a point on screen (a unit's head): up and to its right, clear
 * of the units crowding round it; to its left if it would leave the screen there, and below the
 * point if there is no room above. Kept inside the screen and clear of the `bottom` px reserved
 * below (the tucked hand). All in CSS px.
 */
export function placeWindow(
  at: { x: number; y: number },
  size: { w: number; h: number },
  view: { w: number; h: number },
  { gap = 24, margin = 8, bottom = 0 } = {},
): { left: number; top: number } {
  let left = at.x + gap;
  if (left + size.w > view.w - margin) left = at.x - gap - size.w;
  left = Math.max(margin, Math.min(left, view.w - margin - size.w));
  let top = at.y - gap - size.h;
  if (top < margin) top = at.y + gap;
  top = Math.max(margin, Math.min(top, view.h - bottom - margin - size.h));
  return { left: Math.round(left), top: Math.round(top) };
}
