import type { Category, LibraryState } from "./types";

export const UNCATEGORIZED_OUTFIT = "outfit-uncategorized";
export const UNCATEGORIZED_PIECE = "piece-uncategorized";

export function initialLibrary(): LibraryState {
  return {
    outfits: [], pieces: [],
    outfitCategories: [
      { id: UNCATEGORIZED_OUTFIT, name: "Uncategorized", kind: "outfit" },
      { id: "outfit-casual", name: "Casual", kind: "outfit" },
      { id: "outfit-work", name: "Work", kind: "outfit" },
      { id: "outfit-evening", name: "Evening", kind: "outfit" },
    ],
    pieceCategories: [
      { id: UNCATEGORIZED_PIECE, name: "Uncategorized", kind: "piece" },
      ...["Tops", "Bottoms", "Dresses", "Outerwear", "Footwear", "Bags", "Accessories"].map((name) => ({ id: `piece-${name.toLowerCase()}`, name, kind: "piece" as const })),
    ],
  };
}

export function addCategory(state: LibraryState, kind: "outfit" | "piece", name: string): LibraryState {
  const trimmed = name.trim();
  if (!trimmed) return state;
  const key = kind === "outfit" ? "outfitCategories" : "pieceCategories";
  const category: Category = { id: `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name: trimmed, kind };
  return { ...state, [key]: [...state[key], category] };
}

export function renameCategory(state: LibraryState, kind: "outfit" | "piece", id: string, name: string): LibraryState {
  const trimmed = name.trim();
  if (!trimmed) return state;
  const key = kind === "outfit" ? "outfitCategories" : "pieceCategories";
  return { ...state, [key]: state[key].map((category) => category.id === id ? { ...category, name: trimmed } : category) };
}

export function deleteCategory(state: LibraryState, kind: "outfit" | "piece", id: string): LibraryState {
  const fallback = kind === "outfit" ? UNCATEGORIZED_OUTFIT : UNCATEGORIZED_PIECE;
  if (id === fallback) return state;
  if (kind === "outfit") return { ...state, outfitCategories: state.outfitCategories.filter((category) => category.id !== id), outfits: state.outfits.map((outfit) => outfit.categoryId === id ? { ...outfit, categoryId: fallback } : outfit) };
  return { ...state, pieceCategories: state.pieceCategories.filter((category) => category.id !== id), pieces: state.pieces.map((piece) => piece.categoryId === id ? { ...piece, categoryId: fallback } : piece) };
}
