const assert = require('node:assert/strict');
const path = require('node:path');
const vm = require('node:vm');
const Metro = require('@expo/metro/metro');
const { loadConfig } = require('@expo/metro/metro-config');
const { getDefaultConfig } = require('expo/metro-config');

async function main() {
  const projectRoot = path.dirname(require.resolve('../package.json'));
  const config = await loadConfig({ cwd: projectRoot, maxWorkers: 2 }, getDefaultConfig(projectRoot));
  const resolveRequest = config.resolver.resolveRequest;
  // Expo CLI prefers the browser/module entry points for web clients.
  config.resolver.resolveRequest = (context, name, platform) => {
    const clientContext = platform === 'web' ? { ...context, mainFields: ['browser', 'module', 'main'] } : context;
    return (resolveRequest ?? context.resolveRequest)(clientContext, name, platform);
  };
  // Execute the actual Expo/Metro output: a successful export alone cannot catch
  // dependency interop failures that happen when the browser evaluates a module.
  const serialize = config.serializer.customSerializer;
  config.serializer.customSerializer = async (...args) => {
    const result = await serialize(...args);
    // VM checks do not consume source maps. Avoid Metro's fallback map generator
    // for development output, which includes Expo's prebuilt runtime source map.
    return typeof result === 'string'
      ? { code: result, map: JSON.stringify({ version: 3, sources: [], names: [], mappings: '' }) }
      : result;
  };
  config.reporter = { update() {} };
  for (const platform of ['web', 'android']) {
    for (const dev of [true, false]) {
      const bundle = await Metro.runBuild(config, {
        entry: 'scripts/fixtures/pdf-runtime.js', platform, dev, minify: false,
      });
      const context = vm.createContext({ console, setTimeout, clearTimeout, setImmediate, clearImmediate });
      context.window = context;
      context.self = context;
      vm.runInContext(bundle.code, context, { filename: `${platform}-pdf-runtime.bundle.js`, timeout: 15000 });
      assert.ok(context.pdfRuntimeCheck, 'The PDF bundle did not initialize.');
      const result = await context.pdfRuntimeCheck;
      assert.equal(result.pages, 1);
      console.log(`${platform} (${dev ? 'development' : 'production'}): PDF library initialized, created and reopened a ${result.bytes}-byte PDF.`);
    }
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
