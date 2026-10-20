const { cpSync, mkdirSync } = require('node:fs');
const { dirname, join } = require('node:path');
const root = dirname(require.resolve('pdfjs-dist/package.json'));
const destination = join(dirname(require.resolve('../package.json')), 'public', 'document-tools');
mkdirSync(destination, { recursive: true });
cpSync(join(root, 'legacy', 'build', 'pdf.worker.min.mjs'), join(destination, 'pdf.worker.min.mjs'));
for (const folder of ['cmaps', 'standard_fonts', 'wasm']) {
  cpSync(join(root, folder), join(destination, folder), { recursive: true });
}
