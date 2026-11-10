/** The designer is a full-bleed, dark, nav-free canvas — this matches it immediately instead of
 * flashing the ordinary light shell first. See the parent /plays segment's own loading.tsx for why
 * that one stays neutral rather than dark: it's the ancestor fallback for every route under /plays,
 * not just this one. */
export default function Loading() {
  return <div className="theme-dark fixed inset-0 bg-background" />;
}
