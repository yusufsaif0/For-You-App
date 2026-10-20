import { PDFDocument } from 'pdf-lib';
import { openLocalImage } from './document-image';
import { openLocalPdf } from './pdf-renderer';
import {
  checkProcessing, encodeWithinLimit, MAX_DOCUMENT_BYTES, MAX_PDF_PAGES, outputFilename,
  type ProcessedDocument, type ProcessingOptions,
} from '@/utils/documentTools';

export async function processDocument(
  source: ProcessedDocument,
  options: ProcessingOptions,
  signal?: AbortSignal,
  progress: (message: string) => void = () => {},
): Promise<{ files: ProcessedDocument[]; unchanged: boolean }> {
  checkProcessing(signal);
  const pdfSource = source.mimeType === 'application/pdf';
  const { operation } = options;
  if ((operation === 'pdf-to-jpg' && !pdfSource) || ((operation === 'jpg-to-pdf' || operation === 'resize') && pdfSource)) {
    throw new Error('Choose a file that matches this operation.');
  }
  if (options.mode === 'manual' && operation !== 'pdf-to-jpg' && !options.targetBytes) throw new Error('Enter a target size in KB or MB.');
  const target = options.mode === 'manual' ? options.targetBytes : undefined;
  if (operation === 'compress' && target && source.bytes.length <= target) return { files: [source], unchanged: true };

  if (!pdfSource) {
    const image = await openLocalImage(source.bytes, source.mimeType);
    try {
      const bounds = operation === 'resize' ? { width: options.width, height: options.height } : undefined;
      const bytes = await encodeWithinLimit(async (quality, edge) => {
        progress('Optimizing image quality and dimensions…');
        const encoded = await image.encode(quality, edge, bounds);
        if (operation !== 'jpg-to-pdf') return encoded.bytes;
        const pdf = await PDFDocument.create();
        const embedded = await pdf.embedJpg(encoded.bytes);
        // Use points at 96 dpi; keep the image's aspect ratio.
        pdf.addPage([encoded.width * 0.75, encoded.height * 0.75]).drawImage(embedded, {
          x: 0, y: 0, width: encoded.width * 0.75, height: encoded.height * 0.75,
        });
        return pdf.save();
      }, target, signal);
      if (operation === 'compress' && bytes.length >= source.bytes.length) return { files: [source], unchanged: true };
      return { unchanged: false, files: [{
        bytes,
        filename: outputFilename(source.filename, operation === 'jpg-to-pdf' ? 'converted' : operation === 'resize' ? 'resized' : 'compressed', operation === 'jpg-to-pdf' ? 'pdf' : 'jpg'),
        mimeType: operation === 'jpg-to-pdf' ? 'application/pdf' : 'image/jpeg',
      }] };
    } finally {
      await image.close();
    }
  }

  const pdf = await openLocalPdf(source.bytes);
  try {
    if (pdf.pageCount < 1 || pdf.pageCount > MAX_PDF_PAGES) throw new Error('Choose a PDF with 1 to 60 pages.');
    if (operation === 'pdf-to-jpg') {
      const files: ProcessedDocument[] = [];
      let total = 0;
      for (let index = 0; index < pdf.pageCount; index += 1) {
        checkProcessing(signal);
        progress(`Converting page ${index + 1} of ${pdf.pageCount}…`);
        const page = await pdf.render(index, 2400, 0.88);
        checkProcessing(signal);
        total += page.bytes.length;
        if (page.bytes.length > MAX_DOCUMENT_BYTES || total > 40 * 1024 * 1024) throw new Error('This PDF produces too many large images. Convert a smaller PDF (up to 40 MB of JPG output).');
        files.push({ bytes: page.bytes, filename: outputFilename(source.filename, `page-${index + 1}`, 'jpg'), mimeType: 'image/jpeg' });
      }
      return { files, unchanged: false };
    }
    const bytes = await encodeWithinLimit(async (quality, edge) => {
      const output = await PDFDocument.create();
      let embeddedBytes = 0;
      for (let index = 0; index < pdf.pageCount; index += 1) {
        checkProcessing(signal);
        progress(`Compressing page ${index + 1} of ${pdf.pageCount}…`);
        const page = await pdf.render(index, edge, quality);
        checkProcessing(signal);
        embeddedBytes += page.bytes.length;
        if (embeddedBytes > 40 * 1024 * 1024) throw new Error('This PDF is too complex to process safely on this device. Try a PDF with fewer pages.');
        const embedded = await output.embedJpg(page.bytes);
        output.addPage([page.width, page.height]).drawImage(embedded, { x: 0, y: 0, width: page.width, height: page.height });
      }
      return output.save();
    }, target, signal);
    if (bytes.length >= source.bytes.length) return { files: [source], unchanged: true };
    return { unchanged: false, files: [{ bytes, filename: outputFilename(source.filename, 'compressed', 'pdf'), mimeType: 'application/pdf' }] };
  } finally {
    await pdf.close();
  }
}
