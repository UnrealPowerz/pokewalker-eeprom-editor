import { defineConfig } from 'vitest/config'
import { svelte } from '@sveltejs/vite-plugin-svelte'

export default defineConfig({
    // The svelte plugin handles `.svelte.ts` files (Svelte 5 rune files) — without
    // it the `$state` etc. macros are seen as undefined globals.
    plugins: [svelte({ hot: false })],
    test: {
        environment: 'jsdom',
    },
})
