/**
 * The ancestor fallback for every route under /plays — playbook, philosophy, the export picker, and
 * the designer all nest under this segment, so whatever shows here can flash briefly for any of them
 * on a cold navigation, before each route's own more specific loading.tsx takes over. Stays neutral
 * and light for exactly that reason: a forced-dark full-bleed rectangle (which this used to be, sized
 * for the designer alone) flashed under the OTHER three routes too, since none of them had their own
 * loading.tsx yet. Each of those four routes now has one; this one only needs to not be jarring.
 */
export default function Loading() {
  return <div className="fixed inset-0 bg-background" />;
}
