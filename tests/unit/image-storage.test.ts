import assert from 'node:assert/strict';
import test from 'node:test';
import {
  deleteStoredImage,
  isImageStored,
  resolveImage,
  storeImage,
} from '../../src/image-storage';

test('the platform-neutral image storage keeps source references unchanged', async () => {
  const source = 'data:image/png;base64,example';
  assert.equal(await storeImage(source, 'outfit-1'), source);
  assert.equal(await resolveImage(source), source);
  assert.equal(isImageStored(source), false);
  await assert.doesNotReject(deleteStoredImage(source));
});
