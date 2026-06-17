const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

// Monorepo: the app imports racelab-engine source + the KB bundle from ../../packages
const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "..", "..");

const config = getDefaultConfig(projectRoot);
config.watchFolders = [path.join(workspaceRoot, "packages")];
config.resolver.nodeModulesPaths = [
  path.join(projectRoot, "node_modules"),
  path.join(workspaceRoot, "node_modules"),
];

// Path alias: @racelab/<pkg> → ../../packages/<pkg>/src
const _defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName.startsWith("@racelab/")) {
    const pkgName = moduleName.slice("@racelab/".length);
    const resolved = path.join(workspaceRoot, "packages", pkgName, "src");
    return { filePath: resolved + "/index.ts", type: "sourceFile" };
  }
  if (_defaultResolveRequest) {
    return _defaultResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
