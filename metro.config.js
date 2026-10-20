const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = path.dirname(require.resolve('./package.json'));
const config = getDefaultConfig(projectRoot);
const pdfLibRoot = path.dirname(require.resolve('pdf-lib/package.json'));
const pdfLibHelpers = path.join(
  path.dirname(require.resolve('tslib', { paths: [pdfLibRoot] })),
  'tslib.es6.js',
);

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const origin = path.relative(pdfLibRoot, context.originModulePath);
  if (moduleName === 'tslib' && !path.isAbsolute(origin) && !origin.startsWith(`..${path.sep}`)) {
    // tslib 1.x's "import" entry destructures a missing CJS default export in
    // Metro. pdf-lib uses named helpers, which its direct ESM entry provides.
    // Keep this workaround scoped to pdf-lib; other dependencies use tslib 2.x.
    return { type: 'sourceFile', filePath: pdfLibHelpers };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
