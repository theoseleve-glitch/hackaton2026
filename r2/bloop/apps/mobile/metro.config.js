// Expo SDK 52+ auto-configures Metro for monorepos (watchFolders +
// nodeModulesPaths derived from the pnpm workspace root, symlink-aware for
// pnpm's default isolated installs) — do NOT hand-roll those. The one gap:
// @bloop/* workspace packages ship raw TS source whose relative imports are
// NodeNext-style ('./messages.js'); vitest/esbuild/wrangler/tsc all redirect
// '.js' -> '.ts', Metro does not. The resolver below retries '.js' -> '.ts'
// ONLY after default resolution fails, so it is a no-op for everything else.
// Contingency (documented, not expected): if pnpm's isolated layout ever
// breaks native-package resolution, set `nodeLinker: hoisted` in the root
// pnpm-workspace.yaml and reinstall — but try `pnpm install --force` first.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver.resolveRequest = (context, moduleName, platform) => {
  try {
    return context.resolveRequest(context, moduleName, platform);
  } catch (err) {
    if (/^\.\.?\/.+\.js$/.test(moduleName)) {
      return context.resolveRequest(context, moduleName.replace(/\.js$/, '.ts'), platform);
    }
    throw err;
  }
};

module.exports = config;
