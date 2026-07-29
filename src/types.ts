export type CategoryKind = 'outfit' | 'piece';
export type GridColumns = 2 | 3 | 4;
export type ThemePreference = 'light' | 'dark' | 'system';

export interface Category {
  id: string;
  name: string;
  kind: CategoryKind;
}

export interface SavedOutfit {
  id: string;
  image: string;
  description: string;
  categoryId: string;
  createdAt: string;
}

export interface SavedPiece {
  id: string;
  outfitIds: string[];
  outfitId?: string;
  image: string;
  label: string;
  description: string;
  aiCategory: string;
  categoryId: string;
}

export interface LibraryState {
  outfits: SavedOutfit[];
  pieces: SavedPiece[];
  outfitCategories: Category[];
  pieceCategories: Category[];
  settings: {
    outfitGridColumns: GridColumns;
    pieceGridColumns: GridColumns;
    theme: ThemePreference;
  };
}

export interface ApiPiece {
  id: string;
  image: string;
  label: string;
  description: string;
  category: string;
}
export interface OutfitApiResult {
  styledOutfit: string;
  pieces: ApiPiece[];
}
