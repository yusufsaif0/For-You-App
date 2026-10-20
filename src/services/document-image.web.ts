import { fitDimensions } from '@/utils/documentTools';

export async function openLocalImage(bytes: Uint8Array, mimeType: string) {
  const buffer = new ArrayBuffer(bytes.length);
  new Uint8Array(buffer).set(bytes);
  const image = await createImageBitmap(new Blob([buffer], { type: mimeType }));
  return {
    width: image.width,
    height: image.height,
    encode: async (quality: number, edge: number, bounds?: { width?: number; height?: number }) => {
      const size = fitDimensions(image.width, image.height, edge, bounds);
      const canvas = document.createElement('canvas');
      canvas.width = size.width;
      canvas.height = size.height;
      try {
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Image processing is unavailable in this browser.');
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, size.width, size.height);
        context.drawImage(image, 0, 0, size.width, size.height);
        const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
          (result) => result ? resolve(result) : reject(new Error('Could not encode this image.')), 'image/jpeg', quality,
        ));
        return { bytes: new Uint8Array(await blob.arrayBuffer()), ...size };
      } finally {
        canvas.width = 0;
        canvas.height = 0;
      }
    },
    close: async () => image.close(),
  };
}
