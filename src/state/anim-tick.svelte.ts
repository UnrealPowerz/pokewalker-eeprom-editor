// Shared animation tick — one setInterval drives every AnimatedSprite so
// they flip in lockstep instead of drifting against each other.

const FRAME_MS = 300

const state = $state({ tick: 0 })
let started = false

const start = () => {
    if (started) return
    started = true
    if (typeof window === 'undefined') return
    setInterval(() => { state.tick += 1 }, FRAME_MS)
}

export const animTick = (): number => {
    start()
    return state.tick
}
