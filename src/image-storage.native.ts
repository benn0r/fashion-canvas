import { Directory, EncodingType, File, Paths } from 'expo-file-system';
import { parseBase64ImageData } from './image-data';
import { STORED_IMAGE_PREFIX, storedImageName } from './image-reference';

const imageDirectory = new Directory(Paths.document, 'fashion-canvas-images');

function extension(contentType: string | null) {
  if (contentType?.includes('png')) return 'png';
  if (contentType?.includes('webp')) return 'webp';
  return 'jpg';
}

export async function storeImage(source: string, id: string): Promise<string> {
  if (!imageDirectory.exists) imageDirectory.create({ intermediates: true, idempotent: true });
  const imageData = parseBase64ImageData(source);
  if (imageData) {
    const file = new File(imageDirectory, `${id}.${extension(imageData.contentType)}`);
    file.create({ overwrite: true, intermediates: true });
    file.write(imageData.payload, { encoding: EncodingType.Base64 });
    return `${STORED_IMAGE_PREFIX}${file.name}`;
  }

  const response = await fetch(source);
  if (!response.ok) throw new Error(`Could not save generated image (${response.status}).`);
  const file = new File(imageDirectory, `${id}.${extension(response.headers.get('content-type'))}`);
  file.create({ overwrite: true, intermediates: true });
  file.write(new Uint8Array(await response.arrayBuffer()));
  return `${STORED_IMAGE_PREFIX}${file.name}`;
}

export async function resolveImage(reference: string): Promise<string> {
  const name = storedImageName(reference);
  if (!name) return reference;
  const file = new File(imageDirectory, name);
  return file.exists ? file.uri : reference;
}

export async function deleteStoredImage(reference: string): Promise<void> {
  const name = storedImageName(reference);
  if (!name) return;
  const file = new File(imageDirectory, name);
  if (file.exists) file.delete();
}

export function isImageStored(reference: string): boolean {
  return storedImageName(reference) !== null;
}
