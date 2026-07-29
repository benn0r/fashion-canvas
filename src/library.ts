import type { Category, LibraryState } from './types';

export const UNCATEGORIZED_OUTFIT = 'outfit-uncategorized';
export const UNCATEGORIZED_PIECE = 'piece-uncategorized';

export function pieceOutfitIds(piece: LibraryState['pieces'][number]): string[] {
  return piece.outfitIds ?? (piece.outfitId ? [piece.outfitId] : []);
}

export function mergeDescriptions(first: string, second: string): string {
  const descriptions = [first, second].map((value) => value.trim()).filter(Boolean);
  return [...new Set(descriptions)].join(' · ');
}

export function filterImportedPieces<T extends { id: string }>(
  pieces: T[],
  imports: Record<string, boolean>,
): T[] {
  return pieces.filter((piece) => imports[piece.id] !== false);
}

export type MergeDataSource = 'target' | 'source' | 'combine';

export function mergePieces(
  state: LibraryState,
  targetId: string,
  sourceId: string,
  dataSource: MergeDataSource = 'combine',
): LibraryState {
  if (targetId === sourceId) return state;
  const target = state.pieces.find((piece) => piece.id === targetId);
  const source = state.pieces.find((piece) => piece.id === sourceId);
  if (!target || !source || (dataSource === 'combine' && target.categoryId !== source.categoryId))
    return state;
  const selectedData = dataSource === 'source' ? source : target;
  return {
    ...state,
    pieces: state.pieces
      .filter((piece) => piece.id !== sourceId)
      .map((piece) =>
        piece.id === targetId
          ? {
              ...piece,
              ...(dataSource === 'combine'
                ? { description: mergeDescriptions(target.description, source.description) }
                : {
                    image: selectedData.image,
                    label: selectedData.label,
                    description: selectedData.description,
                    aiCategory: selectedData.aiCategory,
                    categoryId: selectedData.categoryId,
                  }),
              outfitIds: [...new Set([...pieceOutfitIds(target), ...pieceOutfitIds(source)])],
            }
          : piece,
      ),
  };
}

export function removeOutfit(state: LibraryState, outfitId: string): LibraryState {
  return {
    ...state,
    outfits: state.outfits.filter((outfit) => outfit.id !== outfitId),
    pieces: state.pieces.flatMap((piece) => {
      const outfitIds = pieceOutfitIds(piece).filter((id) => id !== outfitId);
      return outfitIds.length ? [{ ...piece, outfitIds }] : [];
    }),
  };
}

export function initialLibrary(): LibraryState {
  return {
    outfits: [],
    pieces: [],
    settings: { outfitGridColumns: 2, pieceGridColumns: 2, theme: 'system' },
    outfitCategories: [
      { id: UNCATEGORIZED_OUTFIT, name: 'Uncategorized', kind: 'outfit' },
      { id: 'outfit-casual', name: 'Casual', kind: 'outfit' },
      { id: 'outfit-work', name: 'Work', kind: 'outfit' },
      { id: 'outfit-evening', name: 'Evening', kind: 'outfit' },
    ],
    pieceCategories: [
      { id: UNCATEGORIZED_PIECE, name: 'Uncategorized', kind: 'piece' },
      ...['Tops', 'Bottoms', 'Dresses', 'Outerwear', 'Footwear', 'Bags', 'Accessories'].map(
        (name) => ({ id: `piece-${name.toLowerCase()}`, name, kind: 'piece' as const }),
      ),
    ],
  };
}

export function addCategory(
  state: LibraryState,
  kind: 'outfit' | 'piece',
  name: string,
): LibraryState {
  const trimmed = name.trim();
  if (!trimmed) return state;
  const key = kind === 'outfit' ? 'outfitCategories' : 'pieceCategories';
  const category: Category = {
    id: `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: trimmed,
    kind,
  };
  return { ...state, [key]: [...state[key], category] };
}

export function renameCategory(
  state: LibraryState,
  kind: 'outfit' | 'piece',
  id: string,
  name: string,
): LibraryState {
  const trimmed = name.trim();
  if (!trimmed) return state;
  const key = kind === 'outfit' ? 'outfitCategories' : 'pieceCategories';
  return {
    ...state,
    [key]: state[key].map((category) =>
      category.id === id ? { ...category, name: trimmed } : category,
    ),
  };
}

export function deleteCategory(
  state: LibraryState,
  kind: 'outfit' | 'piece',
  id: string,
): LibraryState {
  const fallback = kind === 'outfit' ? UNCATEGORIZED_OUTFIT : UNCATEGORIZED_PIECE;
  if (id === fallback) return state;
  if (kind === 'outfit')
    return {
      ...state,
      outfitCategories: state.outfitCategories.filter((category) => category.id !== id),
      outfits: state.outfits.map((outfit) =>
        outfit.categoryId === id ? { ...outfit, categoryId: fallback } : outfit,
      ),
    };
  return {
    ...state,
    pieceCategories: state.pieceCategories.filter((category) => category.id !== id),
    pieces: state.pieces.map((piece) =>
      piece.categoryId === id ? { ...piece, categoryId: fallback } : piece,
    ),
  };
}
