import { NativeModules, Platform } from 'react-native';
import { Directory, File, Paths } from 'expo-file-system';
import * as Crypto from 'expo-crypto';

export interface RenderedPdfPage { bytes: Uint8Array; width: number; height: number }
export interface LocalPdf {
  pageCount: number;
  render: (index: number, edge: number, quality: number) => Promise<RenderedPdfPage>;
  close: () => Promise<void>;
}

export const canRenderPdf = Platform.OS === 'android' && !!NativeModules.DocumentTools;

export async function openLocalPdf(bytes: Uint8Array): Promise<LocalPdf> {
  if (!canRenderPdf) throw new Error(Platform.OS === 'android'
    ? 'PDF processing needs the latest Android build. Rebuild and reinstall the app to enable it.'
    : 'PDF compression and PDF to JPG are available on Android and web.');
  const directory = new Directory(Paths.cache, `document-tools-${Crypto.randomUUID()}`);
  directory.create();
  const source = new File(directory, 'source.pdf');
  try {
    source.write(bytes);
    const pageCount: number = await NativeModules.DocumentTools.pageCount(source.uri);
    return {
      pageCount,
      render: async (index, edge, quality) => {
        const output = new File(directory, 'page.jpg');
        try {
          const size: { width: number; height: number } = await NativeModules.DocumentTools.renderPage(source.uri, index, edge, quality, output.uri);
          return { ...size, bytes: await output.bytes() };
        } finally {
          if (output.exists) output.delete();
        }
      },
      close: async () => { if (directory.exists) directory.delete(); },
    };
  } catch (error) {
    if (directory.exists) directory.delete();
    throw error;
  }
}
