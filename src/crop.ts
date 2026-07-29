export type CropRect = { left: number; top: number; right: number; bottom: number };

export const FULL_CROP: CropRect = { left: 0, top: 0, right: 1, bottom: 1 };

export function cropPixels(crop: CropRect, width: number, height: number) {
  const originX = Math.round(crop.left * width);
  const originY = Math.round(crop.top * height);
  return {
    originX,
    originY,
    width: Math.max(1, Math.round(crop.right * width) - originX),
    height: Math.max(1, Math.round(crop.bottom * height) - originY),
  };
}

export function resizeCrop(crop: CropRect, edge: "left" | "right" | "top" | "bottom", delta: number, minimum = .12): CropRect {
  if (edge === "left") return { ...crop, left: Math.max(0, Math.min(crop.right - minimum, crop.left + delta)) };
  if (edge === "right") return { ...crop, right: Math.min(1, Math.max(crop.left + minimum, crop.right + delta)) };
  if (edge === "top") return { ...crop, top: Math.max(0, Math.min(crop.bottom - minimum, crop.top + delta)) };
  return { ...crop, bottom: Math.min(1, Math.max(crop.top + minimum, crop.bottom + delta)) };
}
