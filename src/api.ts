import type { OutfitApiResult } from "./types";

const API_URL = (process.env.EXPO_PUBLIC_FASHION_CANVAS_API_URL ?? "http://localhost:3000").replace(/\/$/, "");

export async function createOutfit(photo: { uri: string; fileName?: string | null; mimeType?: string | null; file?: File }): Promise<OutfitApiResult> {
  const body = new FormData();
  if (photo.file) body.append("photo", photo.file, photo.fileName ?? "mirror-selfie.jpg");
  else body.append("photo", { uri: photo.uri, name: photo.fileName ?? "mirror-selfie.jpg", type: photo.mimeType ?? "image/jpeg" } as unknown as Blob);
  const response = await fetch(`${API_URL}/api/outfits`, { method: "POST", body });
  const payload = await response.json() as OutfitApiResult & { error?: string };
  if (!response.ok) throw new Error(payload.error ?? "The outfit could not be created.");
  return payload;
}
