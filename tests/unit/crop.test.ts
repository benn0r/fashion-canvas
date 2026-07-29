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

test("rounds fractional pixel boundaries and never returns an empty crop", () => {
  assert.deepEqual(cropPixels({ left: .104, top: .204, right: .806, bottom: .906 }, 101, 203), {
    originX: 11,
    originY: 41,
    width: 70,
    height: 143,
  });
  assert.deepEqual(cropPixels({ left: .5, top: .5, right: .5, bottom: .5 }, 100, 100), {
    originX: 50,
    originY: 50,
    width: 1,
    height: 1,
  });
});

test("resizes every crop edge and clamps it to the image bounds", () => {
  const crop = { left: .2, top: .25, right: .8, bottom: .75 };
  assert.ok(Math.abs(resizeCrop(crop, "left", .1).left - .3) < Number.EPSILON);
  assert.deepEqual(resizeCrop(crop, "left", -1), { ...crop, left: 0 });
  assert.ok(Math.abs(resizeCrop(crop, "right", .1).right - .9) < Number.EPSILON);
  assert.deepEqual(resizeCrop(crop, "right", 1), { ...crop, right: 1 });
  assert.ok(Math.abs(resizeCrop(crop, "top", .1).top - .35) < Number.EPSILON);
  assert.deepEqual(resizeCrop(crop, "top", -1), { ...crop, top: 0 });
  assert.ok(Math.abs(resizeCrop(crop, "bottom", .1).bottom - .85) < Number.EPSILON);
  assert.deepEqual(resizeCrop(crop, "bottom", 1), { ...crop, bottom: 1 });
});

test("honors a custom minimum crop size for every edge", () => {
  const crop = { left: .2, top: .2, right: .8, bottom: .8 };
  assert.equal(resizeCrop(crop, "left", 1, .3).left, .5);
  assert.equal(resizeCrop(crop, "right", -1, .3).right, .5);
  assert.equal(resizeCrop(crop, "top", 1, .3).top, .5);
  assert.equal(resizeCrop(crop, "bottom", -1, .3).bottom, .5);
});
