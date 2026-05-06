import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  base: './', // use relative paths so file:// loads assets correctly
  plugins: [vue()],
  root: '.',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    // Use esbuild for minification (much lower memory than terser)
    minify: 'esbuild',
    cssMinify: true,
    // Raise the chunk warning threshold to avoid noisy output
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        // Split vendors into smaller, focused chunks so Rollup
        // never needs to hold the entire bundle in memory at once
        manualChunks(id) {
          if (id.includes('node_modules/three/src/renderers') ||
              id.includes('node_modules/three/src/core') ||
              id.includes('node_modules/three/src/math')) {
            return 'vendor-three-core';
          }
          if (id.includes('node_modules/three')) return 'vendor-three-extras';
          if (id.includes('node_modules/vue') || id.includes('node_modules/@vue')) return 'vendor-vue';
        }
      },
      // Limit concurrent file reads to reduce peak memory
      maxParallelFileOps: 3,
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src')
    }
  },
  server: {
    port: 5173,
    strictPort: true
  }
});


