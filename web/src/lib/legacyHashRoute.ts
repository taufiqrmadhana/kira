/** Convert old hash bookmarks without dropping the workspace or selected filters. */
export function legacyHashRoute(href: string): string | null {
    const current = new URL(href);
    if (!current.hash.startsWith('#/')) return null;

    const route = new URL(current.hash.slice(1), current.origin);
    if (route.origin !== current.origin) return null;

    const merged = new URLSearchParams();
    const keys = new Set([...current.searchParams.keys(), ...route.searchParams.keys()]);
    for (const key of keys) {
        // A filter in the bookmarked route intentionally wins over the outer query.
        const source = route.searchParams.has(key) ? route.searchParams : current.searchParams;
        for (const value of source.getAll(key)) merged.append(key, value);
    }
    route.search = merged.toString();
    return route.pathname + route.search + route.hash;
}
