import { defineConfig } from 'vite';

export default defineConfig({
  assetsInclude: ['**/*.vert', '**/*.frag'],
  build: { target: 'es2020', cssCodeSplit: true, sourcemap: false },
});
