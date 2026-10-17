/** Where the player came from (for a Back link), kept only when it is a path inside this player's own area. Never a full address, never another player. */
export function safeFrom(from: string | undefined | null, playerId: string): string | null {
  if (!from || !from.startsWith(`/players/${playerId}/`) || from.includes("//") || from.includes("\\") || /[\u0000-\u001f]/.test(from)) return null;
  return from;
}
