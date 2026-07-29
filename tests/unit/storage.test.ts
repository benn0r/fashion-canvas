import assert from "node:assert/strict";
import test from "node:test";
import { initialLibrary } from "../../src/library";
import { loadLibrary, saveLibrary } from "../../src/storage";

const STORAGE_KEY = "fashion-canvas-library-v1";

class MemoryStorage {
  private values = new Map<string, string>();

  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, String(value)); }
}

const memory = new MemoryStorage();
Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage: memory } });

function resetStorage() { memory.clear(); }

test("loads a fresh default library when no state has been stored", async () => {
  resetStorage();
  assert.deepEqual(await loadLibrary(), initialLibrary());
});

test("falls back to a fresh library for malformed or null JSON", async () => {
  resetStorage();
  memory.setItem(STORAGE_KEY, "not json");
  assert.deepEqual(await loadLibrary(), initialLibrary());

  memory.setItem(STORAGE_KEY, "null");
  assert.deepEqual(await loadLibrary(), initialLibrary());
});

test("merges partial stored settings with new defaults", async () => {
  resetStorage();
  memory.setItem(STORAGE_KEY, JSON.stringify({ settings: { outfitGridColumns: 4 } }));
  const loaded = await loadLibrary();

  assert.deepEqual(loaded.settings, { outfitGridColumns: 4, pieceGridColumns: 2, theme: "system" });
  assert.deepEqual(loaded.outfits, []);
  assert.equal(loaded.outfitCategories.some((category) => category.id === "outfit-casual"), true);
  assert.equal(loaded.pieceCategories.some((category) => category.id === "piece-tops"), true);
});

test("merges an empty stored object with all current defaults", async () => {
  resetStorage();
  memory.setItem(STORAGE_KEY, "{}");
  assert.deepEqual(await loadLibrary(), initialLibrary());
});

test("migrates legacy single outfit links while preserving current link arrays", async () => {
  resetStorage();
  const defaults = initialLibrary();
  memory.setItem(STORAGE_KEY, JSON.stringify({
    ...defaults,
    pieces: [
      { id: "legacy", outfitId: "o1", image: "legacy", label: "Top", description: "Legacy", aiCategory: "top", categoryId: "piece-tops" },
      { id: "current", outfitId: "ignored", outfitIds: ["o2", "o3"], image: "current", label: "Coat", description: "Current", aiCategory: "outerwear", categoryId: "piece-outerwear" },
      { id: "orphan", image: "orphan", label: "Bag", description: "Orphan", aiCategory: "bag", categoryId: "piece-bags" },
    ],
  }));

  const loaded = await loadLibrary();
  assert.deepEqual(loaded.pieces.map((piece) => piece.outfitIds), [["o1"], ["o2", "o3"], []]);
  assert.equal(loaded.pieces[0]?.outfitId, "o1");
});

test("serializes the complete library under the app storage key", async () => {
  resetStorage();
  const state = initialLibrary();
  state.settings = { outfitGridColumns: 3, pieceGridColumns: 4, theme: "dark" };
  state.outfits.push({ id: "o1", image: "outfit", description: "Evening outfit", categoryId: "outfit-evening", createdAt: "2026-07-29" });

  await saveLibrary(state);
  assert.deepEqual(JSON.parse(memory.getItem(STORAGE_KEY) ?? "null"), state);
  assert.deepEqual(await loadLibrary(), state);
});
