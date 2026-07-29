import { fetch } from "expo/fetch";
import { File as ExpoFile } from "expo-file-system";
import type { OutfitApiResult } from "./types";

const API_URL = (process.env.EXPO_PUBLIC_FASHION_CANVAS_API_URL ?? "http://localhost:3000").replace(/\/$/, "");

export async function createOutfit(photo: { uri: string; fileName?: string | null; mimeType?: string | null; file?: File }): Promise<OutfitApiResult> {
  const body = new FormData();
  if (photo.file) body.append("photo", photo.file, photo.fileName ?? "mirror-selfie.jpg");
  else {
    // Expo's fetch implementation expects a Blob-compatible file, not React Native's
    // legacy `{ uri, name, type }` FormData object.
    const file = new ExpoFile(photo.uri);
    body.append("photo", file as unknown as Blob, photo.fileName ?? file.name ?? "mirror-selfie.jpg");
  }
  const response = await fetch(`${API_URL}/api/outfits`, { method: "POST", body });
  const payload = await response.json() as OutfitApiResult & { error?: string };
  if (!response.ok) throw new Error(payload.error ?? "The outfit could not be created.");
  return payload;
}
