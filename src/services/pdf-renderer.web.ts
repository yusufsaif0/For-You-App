import type { LocalPdf } from './pdf-renderer';

export const canRenderPdf = true;

export async function openLocalPdf(bytes: Uint8Array): Promise<LocalPdf> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  // The worker, fonts and CMaps ship with the app; documents never go to a CDN.
  const base = `${window.location.origin}/document-tools/`;
  pdfjs.GlobalWorkerOptions.workerSrc = `${base}pdf.worker.min.mjs`;
  const task = pdfjs.getDocument({
    data: bytes.slice(), useSystemFonts: true,
    cMapUrl: `${base}cmaps/`, cMapPacked: true,
    standardFontDataUrl: `${base}standard_fonts/`, wasmUrl: `${base}wasm/`,
  });
  try {
    const pdf = await task.promise;
    return {
      pageCount: pdf.numPages,
      render: async (index, edge, quality) => {
        const page = await pdf.getPage(index + 1);
        const original = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: Math.min(3, edge / Math.max(original.width, original.height)) });
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(viewport.width));
        canvas.height = Math.max(1, Math.round(viewport.height));
        try {
          await page.render({ canvas, viewport, background: '#ffffff' }).promise;
          const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
            (result) => result ? resolve(result) : reject(new Error('Could not render this PDF page.')), 'image/jpeg', quality,
          ));
          return { bytes: new Uint8Array(await blob.arrayBuffer()), width: original.width, height: original.height };
        } finally {
          canvas.width = 0;
          canvas.height = 0;
          page.cleanup();
        }
      },
      close: () => task.destroy(),
    };
  } catch (error) {
    await task.destroy();
    throw error;
  }
}
