import test from "node:test";
import assert from "node:assert/strict";
import { addCategory, deleteCategory, filterImportedPieces, initialLibrary, mergeDescriptions, mergePieces, pieceOutfitIds, removeOutfit, renameCategory, UNCATEGORIZED_OUTFIT, UNCATEGORIZED_PIECE } from "../../src/library";

test("creates the complete default library without sharing mutable arrays", () => {
  const first = initialLibrary();
  const second = initialLibrary();

  assert.deepEqual(first.outfits, []);
  assert.deepEqual(first.pieces, []);
  assert.deepEqual(first.outfitCategories.map(({ name, kind }) => ({ name, kind })), [
    { name: "Uncategorized", kind: "outfit" },
    { name: "Casual", kind: "outfit" },
    { name: "Work", kind: "outfit" },
    { name: "Evening", kind: "outfit" },
  ]);
  assert.deepEqual(first.pieceCategories.map((category) => category.name), ["Uncategorized", "Tops", "Bottoms", "Dresses", "Outerwear", "Footwear", "Bags", "Accessories"]);
  assert.notEqual(first.outfitCategories, second.outfitCategories);
  assert.notEqual(first.pieceCategories, second.pieceCategories);
});

test("reads current, legacy, and absent outfit links from pieces", () => {
  const base = { image: "image", label: "Top", description: "Description", aiCategory: "top", categoryId: "piece-tops" };
  assert.deepEqual(pieceOutfitIds({ ...base, id: "current", outfitIds: ["o1", "o2"], outfitId: "ignored" }), ["o1", "o2"]);
  assert.deepEqual(pieceOutfitIds({ ...base, id: "empty", outfitIds: [], outfitId: "ignored" }), []);
  assert.deepEqual(pieceOutfitIds({ ...base, id: "legacy", outfitId: "o1" } as never), ["o1"]);
  assert.deepEqual(pieceOutfitIds({ ...base, id: "orphan" } as never), []);
});

test("combines unique, trimmed descriptions and ignores empty values", () => {
  assert.equal(mergeDescriptions("  Linen shirt  ", "Relaxed fit"), "Linen shirt · Relaxed fit");
  assert.equal(mergeDescriptions("Same", " Same "), "Same");
  assert.equal(mergeDescriptions("", "  Kept  "), "Kept");
  assert.equal(mergeDescriptions("  ", ""), "");
});

test("adds and renames outfit categories", () => {
  const added = addCategory(initialLibrary(), "outfit", "Travel");
  const category = added.outfitCategories.find((item) => item.name === "Travel");
  if (!category) throw new Error("Category was not added");
  assert.equal(renameCategory(added, "outfit", category.id, "Weekend").outfitCategories.find((item) => item.id === category.id)?.name, "Weekend");
});

test("adds trimmed piece categories only to the requested collection", () => {
  const state = initialLibrary();
  const added = addCategory(state, "piece", "  Knitwear  ");
  const category = added.pieceCategories.at(-1);

  assert.equal(category?.name, "Knitwear");
  assert.equal(category?.kind, "piece");
  assert.match(category?.id ?? "", /^piece-\d+-[a-z0-9]{5}$/);
  assert.equal(added.outfitCategories, state.outfitCategories);
  assert.equal(state.pieceCategories.some((item) => item.name === "Knitwear"), false);
});

test("ignores blank category names when adding or renaming", () => {
  const state = initialLibrary();
  assert.equal(addCategory(state, "outfit", " \n\t "), state);
  assert.equal(renameCategory(state, "piece", "piece-tops", "   "), state);
});

test("renames only the matching category and trims its name", () => {
  const state = initialLibrary();
  const renamed = renameCategory(state, "piece", "piece-tops", "  Shirts  ");
  assert.equal(renamed.pieceCategories.find((category) => category.id === "piece-tops")?.name, "Shirts");
  assert.equal(renamed.pieceCategories.find((category) => category.id === "piece-bottoms")?.name, "Bottoms");
  assert.equal(state.pieceCategories.find((category) => category.id === "piece-tops")?.name, "Tops");
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
  assert.deepEqual(initialLibrary().settings, { outfitGridColumns: 2, pieceGridColumns: 2, theme: "system" });
});

test("filters pieces explicitly excluded from result import", () => {
  const pieces = [{ id: "keep" }, { id: "skip" }, { id: "default" }];
  assert.deepEqual(filterImportedPieces(pieces, { keep: true, skip: false }).map((piece) => piece.id), ["keep", "default"]);
});

test("keeps all imported pieces when no explicit exclusions exist", () => {
  const pieces = [{ id: "one", value: 1 }, { id: "two", value: 2 }];
  assert.deepEqual(filterImportedPieces(pieces, {}), pieces);
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

test("does not merge a piece into itself or merge missing pieces", () => {
  const state = initialLibrary();
  state.pieces = [{ id: "piece", outfitIds: [], image: "image", label: "Top", description: "Description", aiCategory: "top", categoryId: "piece-tops" }];
  assert.equal(mergePieces(state, "piece", "piece"), state);
  assert.equal(mergePieces(state, "missing", "piece"), state);
  assert.equal(mergePieces(state, "piece", "missing"), state);
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

test("can keep target data while merging links from another category", () => {
  const state = initialLibrary();
  state.pieces = [
    { id: "target", outfitIds: ["o1", "shared"], image: "target-image", label: "Target", description: "Target description", aiCategory: "top", categoryId: "piece-tops" },
    { id: "source", outfitIds: ["shared", "o2"], image: "source-image", label: "Source", description: "Source description", aiCategory: "bottom", categoryId: "piece-bottoms" },
    { id: "untouched", outfitIds: ["o3"], image: "other", label: "Other", description: "Other description", aiCategory: "bag", categoryId: "piece-bags" },
  ];

  const merged = mergePieces(state, "target", "source", "target");
  assert.deepEqual(merged.pieces[0], {
    id: "target",
    outfitIds: ["o1", "shared", "o2"],
    image: "target-image",
    label: "Target",
    description: "Target description",
    aiCategory: "top",
    categoryId: "piece-tops",
  });
  assert.deepEqual(merged.pieces[1], state.pieces[2]);
});

test("removing an outfit keeps shared pieces linked to their remaining outfits", () => {
  const state = initialLibrary();
  state.outfits = [
    { id: "o1", image: "one", description: "One", categoryId: UNCATEGORIZED_OUTFIT, createdAt: "2026-01-01" },
    { id: "o2", image: "two", description: "Two", categoryId: UNCATEGORIZED_OUTFIT, createdAt: "2026-01-02" },
  ];
  state.pieces = [{ id: "shared", outfitIds: ["o1", "o2"], image: "piece", label: "Coat", description: "Shared coat", aiCategory: "outerwear", categoryId: "piece-outerwear" }];
  const next = removeOutfit(state, "o1");
  assert.deepEqual(next.outfits.map((outfit) => outfit.id), ["o2"]);
  assert.deepEqual(pieceOutfitIds(next.pieces[0]!), ["o2"]);
});

test("removing an outfit removes pieces that are no longer used", () => {
  const state = initialLibrary();
  state.outfits = [{ id: "o1", image: "one", description: "One", categoryId: UNCATEGORIZED_OUTFIT, createdAt: "2026-01-01" }];
  state.pieces = [
    { id: "only", outfitIds: ["o1"], image: "piece", label: "Coat", description: "Only here", aiCategory: "outerwear", categoryId: "piece-outerwear" },
    { id: "legacy", outfitIds: undefined as never, outfitId: "o1", image: "legacy", label: "Shoes", description: "Legacy link", aiCategory: "footwear", categoryId: "piece-footwear" },
  ];

  const next = removeOutfit(state, "o1");
  assert.deepEqual(next.outfits, []);
  assert.deepEqual(next.pieces, []);
  assert.equal(state.pieces.length, 2);
});

test("deleting an unknown category leaves saved entity assignments unchanged", () => {
  const state = initialLibrary();
  state.outfits = [{ id: "o1", image: "one", description: "One", categoryId: "outfit-casual", createdAt: "2026-01-01" }];
  state.pieces = [{ id: "p1", outfitIds: ["o1"], image: "piece", label: "Top", description: "Top", aiCategory: "top", categoryId: "piece-tops" }];

  const withoutUnknownOutfitCategory = deleteCategory(state, "outfit", "missing");
  const withoutUnknownPieceCategory = deleteCategory(state, "piece", "missing");
  assert.equal(withoutUnknownOutfitCategory.outfits[0]?.categoryId, "outfit-casual");
  assert.equal(withoutUnknownPieceCategory.pieces[0]?.categoryId, "piece-tops");
});
