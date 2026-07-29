import assert from "node:assert/strict";
import test from "node:test";
import { parseOutfitResponse } from "../../src/api-response";

const result = { styledOutfit: "data:image/png;base64,outfit", pieces: [{ id: "1", image: "data:image/png;base64,piece", label: "Blazer", description: "Tailored blazer", category: "outerwear" }] };

test("parses a valid generated outfit", () => {
  assert.deepEqual(parseOutfitResponse(200, JSON.stringify(result)), result);
  assert.deepEqual(parseOutfitResponse(299, JSON.stringify({ styledOutfit: "image", pieces: [] })), { styledOutfit: "image", pieces: [] });
});

test("surfaces the server's rate-limit message", () => {
  assert.throws(() => parseOutfitResponse(429, JSON.stringify({ error: "Upload limit reached. Try again later." }), "42"), /Upload limit reached/);
});

test("adds a retry hint when a rate-limit response has no message", () => {
  assert.throws(() => parseOutfitResponse(429, "", "42"), /about 42 seconds/);
  assert.throws(() => parseOutfitResponse(429, "", "invalid"), /few minutes/);
});

test("surfaces server errors and handles non-JSON failures", () => {
  assert.throws(() => parseOutfitResponse(502, JSON.stringify({ error: "Generation failed." })), /Generation failed/);
  assert.throws(() => parseOutfitResponse(503, "Service unavailable"), /HTTP 503/);
  assert.throws(() => parseOutfitResponse(199, JSON.stringify(result)), /HTTP 199/);
  assert.throws(() => parseOutfitResponse(300, JSON.stringify(result)), /HTTP 300/);
  assert.throws(() => parseOutfitResponse(500, JSON.stringify({ error: 123 })), /HTTP 500/);
});

test("rejects malformed successful responses", () => {
  assert.throws(() => parseOutfitResponse(200, "not json"), /invalid outfit response/);
  assert.throws(() => parseOutfitResponse(200, "null"), /invalid outfit response/);
  assert.throws(() => parseOutfitResponse(200, JSON.stringify({ pieces: [] })), /invalid outfit response/);
  assert.throws(() => parseOutfitResponse(200, JSON.stringify({ styledOutfit: "image" })), /invalid outfit response/);
  assert.throws(() => parseOutfitResponse(200, JSON.stringify({ styledOutfit: 1, pieces: [] })), /invalid outfit response/);
  assert.throws(() => parseOutfitResponse(200, JSON.stringify({ styledOutfit: "image", pieces: null })), /invalid outfit response/);
  assert.throws(() => parseOutfitResponse(200, JSON.stringify({ styledOutfit: "image", pieces: [null] })), /invalid outfit response/);
  assert.throws(() => parseOutfitResponse(200, JSON.stringify({ styledOutfit: "image", pieces: [{ id: 1 }] })), /invalid outfit response/);
  assert.throws(() => parseOutfitResponse(200, JSON.stringify({ styledOutfit: "image", pieces: [{ ...result.pieces[0], label: 1 }] })), /invalid outfit response/);
});
