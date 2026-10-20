import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as Crypto from 'expo-crypto';
import type { ImageRef } from 'expo-image-manipulator';
import { fitDimensions } from '@/utils/documentTools';

export async function openLocalImage(bytes: Uint8Array, mimeType: string) {
  const directory = new Directory(Paths.cache, `document-tools-${Crypto.randomUUID()}`);
  directory.create();
  const source = new File(directory, `source.${mimeType.split('/')[1]}`);
  source.write(bytes);
  const context = ImageManipulator.manipulate(source.uri);
  let original: ImageRef;
  try {
    original = await context.renderAsync();
  } catch (error) {
    context.release();
    if (directory.exists) directory.delete();
    throw error;
  }
  return {
    width: original.width,
    height: original.height,
    encode: async (quality: number, edge: number, bounds?: { width?: number; height?: number }) => {
      const dimensions = fitDimensions(original.width, original.height, edge, bounds);
      const resize = ImageManipulator.manipulate(original);
      let image: ImageRef | undefined;
      let output: File | undefined;
      try {
        image = await resize.resize(dimensions).renderAsync();
        const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: quality });
        output = new File(saved.uri);
        return { bytes: await output.bytes(), ...dimensions };
      } finally {
        if (output?.exists) output.delete();
        image?.release();
        resize.release();
      }
    },
    close: async () => {
      original.release();
      context.release();
      if (directory.exists) directory.delete();
    },
  };
}
