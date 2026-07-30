import assert from 'node:assert/strict';
import test from 'node:test';
import { parseBase64ImageData } from '../../src/image-data';

test('base64 image data URLs are separated into their MIME type and payload', () => {
  assert.deepEqual(parseBase64ImageData('data:image/png;base64,aGVsbG8='), {
    contentType: 'image/png',
    payload: 'aGVsbG8=',
  });
  assert.deepEqual(parseBase64ImageData('data:IMAGE/JPEG;charset=utf-8;BASE64, YWJjZA== '), {
    contentType: 'image/jpeg',
    payload: 'YWJjZA==',
  });
});

test('ordinary image URLs remain available to the network storage path', () => {
  assert.equal(parseBase64ImageData('https://example.test/outfit.jpg'), null);
  assert.equal(parseBase64ImageData('file:///outfit.jpg'), null);
});

test('unsupported or malformed image data URLs are rejected', () => {
  for (const source of [
    'data:image/png;base64',
    'data:;base64,aGVsbG8=',
    'data:text/plain;base64,aGVsbG8=',
    'data:image/png,aGVsbG8=',
    'data:image/png;base64,',
  ])
    assert.throws(() => parseBase64ImageData(source), /invalid image data/);
});
