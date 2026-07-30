export type Base64ImageData = {
  contentType: string;
  payload: string;
};

const invalidImageData = () => new Error('Could not save generated image: invalid image data.');

export function parseBase64ImageData(source: string): Base64ImageData | null {
  if (!source.startsWith('data:')) return null;

  const separator = source.indexOf(',');
  if (separator < 0) throw invalidImageData();

  const [contentType, ...parameters] = source.slice(5, separator).split(';');
  const payload = source.slice(separator + 1).trim();
  if (
    !contentType?.toLowerCase().startsWith('image/') ||
    !parameters.some((parameter) => parameter.toLowerCase() === 'base64') ||
    !payload
  )
    throw invalidImageData();

  return { contentType: contentType.toLowerCase(), payload };
}
