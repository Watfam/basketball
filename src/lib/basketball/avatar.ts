/**
 * A player's picture until there are real ones: their initials on a
 * colour picked from their id, so each kid keeps the same colour on every
 * screen and phone.
 */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : (parts[0][1] ?? "");
  return (first + last).toUpperCase();
}

/** Muted tones that read with white initials in light and dark themes. */
const TONES = ["#c2410c", "#0f766e", "#4338ca", "#a21caf", "#15803d", "#b45309", "#1d4ed8", "#be123c"];

export function avatarTone(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return TONES[h % TONES.length];
}
