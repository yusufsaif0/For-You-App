import AsyncStorage from '@react-native-async-storage/async-storage';
import { copyAsync, deleteAsync, documentDirectory, getInfoAsync, makeDirectoryAsync } from 'expo-file-system/legacy';

const GALLERY_KEY = 'daily-life-photo-gallery';
const GALLERY_DIRECTORY = 'photo-gallery/';

export interface GalleryPhoto {
  id: string;
  uri: string;
  savedAt: string;
}

export async function getGalleryPhotos(): Promise<GalleryPhoto[]> {
  const saved = await AsyncStorage.getItem(GALLERY_KEY);
  if (!saved) return [];
  const parsed: unknown = JSON.parse(saved);
  if (!Array.isArray(parsed) || parsed.some((photo) =>
    typeof photo !== 'object' || photo === null ||
    !('id' in photo) || typeof photo.id !== 'string' ||
    !('uri' in photo) || typeof photo.uri !== 'string' ||
    !('savedAt' in photo) || typeof photo.savedAt !== 'string'
  )) {
    throw new Error('The saved photo gallery data is invalid. Remove the app gallery data and try again.');
  }
  return parsed as GalleryPhoto[];
}

export async function saveGalleryPhoto(sourceUri: string): Promise<GalleryPhoto> {
  if (!documentDirectory) throw new Error('Private photo storage is not available on this platform.');
  const directory = `${documentDirectory}${GALLERY_DIRECTORY}`;
  const directoryInfo = await getInfoAsync(directory);
  if (!directoryInfo.exists) await makeDirectoryAsync(directory, { intermediates: true });
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const photo: GalleryPhoto = { id, uri: `${directory}${id}.jpg`, savedAt: new Date().toISOString() };
  await copyAsync({ from: sourceUri, to: photo.uri });
  try {
    const photos = await getGalleryPhotos();
    await AsyncStorage.setItem(GALLERY_KEY, JSON.stringify([photo, ...photos]));
  } catch (failure) {
    await deleteAsync(photo.uri, { idempotent: true });
    throw failure;
  }
  return photo;
}

export async function deleteGalleryPhoto(photo: GalleryPhoto): Promise<void> {
  await deleteAsync(photo.uri, { idempotent: true });
  const photos = await getGalleryPhotos();
  await AsyncStorage.setItem(GALLERY_KEY, JSON.stringify(photos.filter((item) => item.id !== photo.id)));
}
