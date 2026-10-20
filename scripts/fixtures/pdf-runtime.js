import { PDFDocument } from 'pdf-lib';

// Run inside the bundle's own realm, including its Uint8Array constructors.
globalThis.pdfRuntimeCheck = (async () => {
  const document = await PDFDocument.create();
  document.addPage([600, 400]);
  const bytes = await document.save();
  const restored = await PDFDocument.load(bytes);
  if (restored.getPageCount() !== 1 || restored.getPage(0).getWidth() !== 600) {
    throw new Error('The bundled PDF library did not round-trip a document.');
  }
  return { pages: restored.getPageCount(), bytes: bytes.length };
})();
