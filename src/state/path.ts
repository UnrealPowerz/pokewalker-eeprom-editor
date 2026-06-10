// Read a value out of the parsed EEPROM tree by path. Used by field
// components so they can take just a `path` prop and figure out the rest.

export const getAtPath = (root: unknown, path: (string | number)[]): unknown => {
    let cur: unknown = root
    for (const seg of path) {
        if (cur == null || typeof cur !== 'object') return undefined
        cur = (cur as Record<string | number, unknown>)[seg]
    }
    return cur
}
