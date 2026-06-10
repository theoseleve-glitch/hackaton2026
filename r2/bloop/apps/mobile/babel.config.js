// babel-preset-expo auto-wires the reanimated/worklets plugin when installed.
module.exports = function (api) {
  api.cache(true);
  return { presets: ['babel-preset-expo'] };
};
