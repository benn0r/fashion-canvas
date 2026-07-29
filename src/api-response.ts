import type { OutfitApiResult } from './types';

function errorMessage(value: unknown): string | null {
  return typeof value === 'object' &&
    value !== null &&
    'error' in value &&
    typeof value.error === 'string'
    ? value.error
    : null;
}

function isOutfitResult(value: unknown): value is OutfitApiResult {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('styledOutfit' in value) ||
    !('pieces' in value)
  )
    return false;
  if (typeof value.styledOutfit !== 'string' || !Array.isArray(value.pieces)) return false;
  return value.pieces.every(
    (piece) =>
      typeof piece === 'object' &&
      piece !== null &&
      ['id', 'image', 'label', 'description', 'category'].every(
        (key) => key in piece && typeof (piece as Record<string, unknown>)[key] === 'string',
      ),
  );
}

export function parseOutfitResponse(
  status: number,
  body: string,
  retryAfter?: string | null,
): OutfitApiResult {
  let payload: unknown = null;
  try {
    payload = body ? JSON.parse(body) : null;
  } catch {
    /* handled below */
  }

  if (status === 429) {
    const retrySeconds = retryAfter && /^\d+$/.test(retryAfter) ? Number(retryAfter) : null;
    const retryHint = retrySeconds
      ? ` Try again in about ${retrySeconds} seconds.`
      : ' Please wait a few minutes and try again.';
    throw new Error(errorMessage(payload) ?? `Upload limit reached.${retryHint}`);
  }
  if (status < 200 || status >= 300)
    throw new Error(
      errorMessage(payload) ??
        `The server could not create the outfit (HTTP ${status}). Please try again.`,
    );
  if (!isOutfitResult(payload))
    throw new Error('The server returned an invalid outfit response. Please try again.');
  return payload;
}
