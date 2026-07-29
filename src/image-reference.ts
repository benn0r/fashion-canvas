export const STORED_IMAGE_PREFIX = 'fashion-canvas-image://';

export function storedImageName(reference: string): string | null {
  if (reference.startsWith(STORED_IMAGE_PREFIX))
    return reference.slice(STORED_IMAGE_PREFIX.length) || null;
  if (!reference.includes('/fashion-canvas-images/')) return null;
  return reference.split('/').pop() || null;
}
