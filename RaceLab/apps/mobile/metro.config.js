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

module.exports = config;
