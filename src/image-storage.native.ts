import { Directory, File, Paths } from "expo-file-system";

const imageDirectory = new Directory(Paths.document, "fashion-canvas-images");

function extension(contentType: string | null) {
  if (contentType?.includes("png")) return "png";
  if (contentType?.includes("webp")) return "webp";
  return "jpg";
}

export async function storeImage(source: string, id: string): Promise<string> {
  if (!imageDirectory.exists) imageDirectory.create({ intermediates: true, idempotent: true });
  const response = await fetch(source);
  if (!response.ok) throw new Error(`Could not save generated image (${response.status}).`);
  const file = new File(imageDirectory, `${id}.${extension(response.headers.get("content-type"))}`);
  file.create({ overwrite: true, intermediates: true });
  file.write(new Uint8Array(await response.arrayBuffer()));
  return file.uri;
}

export async function resolveImage(reference: string): Promise<string> { return reference; }

export async function deleteStoredImage(reference: string): Promise<void> {
  if (!reference.includes("/fashion-canvas-images/")) return;
  const file = new File(reference);
  if (file.exists) file.delete();
}

export function isImageStored(reference: string): boolean { return reference.includes("/fashion-canvas-images/"); }
