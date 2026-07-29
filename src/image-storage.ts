export async function storeImage(source: string, _id: string): Promise<string> {
  return source;
}
export async function resolveImage(reference: string): Promise<string> {
  return reference;
}
export async function deleteStoredImage(_reference: string): Promise<void> {}
export function isImageStored(_reference: string): boolean {
  return false;
}
