import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'jsdom',
        // jsdom + Vite's asset loader is enough for the pokewalker code.
    },
});
