import test from "node:test";
import assert from "node:assert/strict";
import { addCategory, deleteCategory, initialLibrary, mergePieces, pieceOutfitIds, removeOutfit, renameCategory, UNCATEGORIZED_OUTFIT, UNCATEGORIZED_PIECE } from "../../src/library";

test("adds and renames outfit categories", () => {
  const added = addCategory(initialLibrary(), "outfit", "Travel");
  const category = added.outfitCategories.find((item) => item.name === "Travel");
  if (!category) throw new Error("Category was not added");
  assert.equal(renameCategory(added, "outfit", category.id, "Weekend").outfitCategories.find((item) => item.id === category.id)?.name, "Weekend");
});

test("deleting categories remaps saved entities to Uncategorized", () => {
  const state = initialLibrary();
  const outfitCategory = state.outfitCategories.find((item) => item.name === "Casual")!;
  const pieceCategory = state.pieceCategories.find((item) => item.name === "Tops")!;
  state.outfits.push({ id: "o1", image: "image", description: "AI outfit description", categoryId: outfitCategory.id, createdAt: "2026-01-01" });
  state.pieces.push({ id: "p1", outfitIds: ["o1"], image: "image", label: "Top", description: "AI piece description", aiCategory: "top", categoryId: pieceCategory.id });
  const withoutOutfitCategory = deleteCategory(state, "outfit", outfitCategory.id);
  const withoutPieceCategory = deleteCategory(withoutOutfitCategory, "piece", pieceCategory.id);
  assert.equal(withoutPieceCategory.outfits[0]?.categoryId, UNCATEGORIZED_OUTFIT);
  assert.equal(withoutPieceCategory.pieces[0]?.categoryId, UNCATEGORIZED_PIECE);
  assert.equal(withoutPieceCategory.pieces[0]?.description, "AI piece description");
});

test("protects Uncategorized categories", () => {
  const state = initialLibrary();
  assert.equal(deleteCategory(state, "outfit", UNCATEGORIZED_OUTFIT), state);
  assert.equal(deleteCategory(state, "piece", UNCATEGORIZED_PIECE), state);
});

test("defaults outfit and piece grids to two columns", () => {
  assert.deepEqual(initialLibrary().settings, { outfitGridColumns: 2, pieceGridColumns: 2 });
});

test("merges same-category pieces, outfit links, and AI descriptions", () => {
  const state = initialLibrary();
  state.pieces = [
    { id: "target", outfitIds: ["o1"], image: "target-image", label: "Linen shirt", description: "First description", aiCategory: "top", categoryId: "piece-tops" },
    { id: "source", outfitIds: ["o2"], image: "source-image", label: "Shirt", description: "Second description", aiCategory: "top", categoryId: "piece-tops" },
  ];
  const merged = mergePieces(state, "target", "source");
  assert.equal(merged.pieces.length, 1);
  assert.deepEqual(pieceOutfitIds(merged.pieces[0]!), ["o1", "o2"]);
  assert.equal(merged.pieces[0]?.description, "First description · Second description");
});

test("does not merge pieces from different categories", () => {
  const state = initialLibrary();
  state.pieces = [
    { id: "top", outfitIds: ["o1"], image: "top", label: "Top", description: "Top", aiCategory: "top", categoryId: "piece-tops" },
    { id: "bottom", outfitIds: ["o2"], image: "bottom", label: "Bottom", description: "Bottom", aiCategory: "bottom", categoryId: "piece-bottoms" },
  ];
  assert.equal(mergePieces(state, "top", "bottom"), state);
});

test("merges pieces from different categories using the selected piece data", () => {
  const state = initialLibrary();
  state.pieces = [
    { id: "other", outfitIds: ["o1"], image: "other-image", label: "Other title", description: "Other description", aiCategory: "bottom", categoryId: "piece-bottoms" },
    { id: "current", outfitIds: ["o2"], image: "current-image", label: "Current title", description: "Current description", aiCategory: "top", categoryId: "piece-tops" },
  ];
  const merged = mergePieces(state, "other", "current", "source");
  assert.equal(merged.pieces.length, 1);
  assert.deepEqual(merged.pieces[0], {
    id: "other",
    outfitIds: ["o1", "o2"],
    image: "current-image",
    label: "Current title",
    description: "Current description",
    aiCategory: "top",
    categoryId: "piece-tops",
  });
});

test("removing an outfit keeps shared pieces linked to their remaining outfits", () => {
  const state = initialLibrary();
  state.outfits = [
    { id: "o1", image: "one", description: "One", categoryId: UNCATEGORIZED_OUTFIT, createdAt: "2026-01-01" },
    { id: "o2", image: "two", description: "Two", categoryId: UNCATEGORIZED_OUTFIT, createdAt: "2026-01-02" },
  ];
  state.pieces = [{ id: "shared", outfitIds: ["o1", "o2"], image: "piece", label: "Coat", description: "Shared coat", aiCategory: "outerwear", categoryId: "piece-outerwear" }];
  const next = removeOutfit(state, "o1");
  assert.deepEqual(pieceOutfitIds(next.pieces[0]!), ["o2"]);
});
