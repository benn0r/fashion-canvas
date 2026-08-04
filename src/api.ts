import { fetch } from 'expo/fetch';
import { File as ExpoFile } from 'expo-file-system';
import { parseOutfitResponse } from './api-response';
import type { OutfitApiResult } from './types';

const API_URL = (process.env.EXPO_PUBLIC_FASHION_CANVAS_API_URL ?? 'http://localhost:3000').replace(
  /\/$/,
  '',
);

export async function createOutfit(
  photo: {
    uri: string;
    fileName?: string | null;
    mimeType?: string | null;
    file?: File;
  },
  token: string,
): Promise<OutfitApiResult> {
  const body = new FormData();
  if (photo.file) body.append('photo', photo.file, photo.fileName ?? 'mirror-selfie.jpg');
  else {
    // Expo's fetch implementation expects a Blob-compatible file, not React Native's
    // legacy `{ uri, name, type }` FormData object.
    const file = new ExpoFile(photo.uri);
    body.append(
      'photo',
      file as unknown as Blob,
      photo.fileName ?? file.name ?? 'mirror-selfie.jpg',
    );
  }
  let response: Awaited<ReturnType<typeof fetch>>;
  try {
    response = await fetch(`${API_URL}/api/outfits`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body,
    });
  } catch {
    throw new Error(
      'The Fashion Canvas server is unavailable. Check your connection and try again.',
    );
  }
  return parseOutfitResponse(
    response.status,
    await response.text(),
    response.headers.get('retry-after'),
  );
}
