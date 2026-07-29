import test from "node:test";
import assert from "node:assert/strict";
import { addCategory, deleteCategory, initialLibrary, renameCategory, UNCATEGORIZED_OUTFIT, UNCATEGORIZED_PIECE } from "../../src/library";

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
  state.pieces.push({ id: "p1", outfitId: "o1", image: "image", label: "Top", description: "AI piece description", aiCategory: "top", categoryId: pieceCategory.id });
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
