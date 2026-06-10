// Tiny hash-based router. navigate() updates state synchronously AND syncs
// the URL hash for back/forward + bookmarks. The hashchange listener handles
// the reverse direction (browser nav buttons / external link / manual edit).

const readFromHash = (): string => {
    if (typeof window === 'undefined') return 'general'
    const hash = window.location.hash
    return hash.replace(/^#\/?/, '') || 'general'
}

// Eager init so `state.route` is fully populated before any consumer
// (including a $derived(...) reader) touches it. Lazy init inside
// currentRoute() used to mutate state on the first read, which Svelte 5
// forbids from a derived context.
const state = $state({ route: readFromHash() })
if (typeof window !== 'undefined') {
    window.addEventListener('hashchange', () => {
        state.route = readFromHash()
    })
}

export const currentRoute = (): string => state.route

export const navigate = (route: string): void => {
    state.route = route
    if (typeof window !== 'undefined') {
        const target = `#/${route}`
        if (window.location.hash !== target) {
            window.location.hash = target
        }
    }
}
