import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Config PostCSS inline: impedisce a Vite di risalire al postcss.config.js
  // del frontend (che richiede tailwind, non installato qui).
  css: { postcss: {} },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
