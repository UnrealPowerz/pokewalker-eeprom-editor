// Tiny hash-based router. The current route is a `$state` that mirrors the
// part of window.location.hash after the `#/` prefix. Setting `currentRoute`
// pushes a new hash; subscribing to it gives you the current tab.
//
// No router library needed for our use case (12 known tabs, no nested
// routes, no path params).

let initialised = false
let current = $state('identity')

const readFromHash = () => {
    const hash = window.location.hash
    // Strip leading `#/` or `#`
    return hash.replace(/^#\/?/, '') || 'identity'
}

const init = () => {
    if (initialised) return
    initialised = true
    if (typeof window === 'undefined') return
    current = readFromHash()
    window.addEventListener('hashchange', () => {
        current = readFromHash()
    })
}

export const currentRoute = () => {
    init()
    return current
}

export const navigate = (route: string) => {
    init()
    window.location.hash = `/${route}`
}
