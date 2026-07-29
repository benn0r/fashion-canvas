import test from "node:test";
import assert from "node:assert/strict";
import { cropPixels, FULL_CROP, resizeCrop } from "../../src/crop";

test("converts a normalized crop to source-image pixels", () => {
  assert.deepEqual(cropPixels({ left: .1, top: .2, right: .8, bottom: .9 }, 1000, 2000), {
    originX: 100, originY: 400, width: 700, height: 1400,
  });
  assert.deepEqual(cropPixels(FULL_CROP, 1200, 800), { originX: 0, originY: 0, width: 1200, height: 800 });
});

test("keeps dragged crop edges inside the image with a minimum crop size", () => {
  assert.equal(resizeCrop(FULL_CROP, "left", .95).left, .88);
  assert.equal(resizeCrop(FULL_CROP, "top", -.4).top, 0);
  assert.equal(resizeCrop({ left: .2, top: .2, right: .8, bottom: .8 }, "right", -.9).right, .32);
});
