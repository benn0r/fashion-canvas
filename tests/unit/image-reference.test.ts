import assert from 'node:assert/strict';
import test from 'node:test';
import { storedImageName } from '../../src/image-reference';

test('reads stable stored image references', () => {
  assert.equal(storedImageName('fashion-canvas-image://outfit-1.jpg'), 'outfit-1.jpg');
});

test('recovers filenames from legacy iOS container paths', () => {
  assert.equal(
    storedImageName('file:///old-container/Documents/fashion-canvas-images/outfit-1.jpg'),
    'outfit-1.jpg',
  );
});

test('recovers filenames from legacy Android app-storage paths', () => {
  assert.equal(
    storedImageName('file:///data/user/0/app.example/files/fashion-canvas-images/piece-1.webp'),
    'piece-1.webp',
  );
});

test('leaves remote and data images untouched', () => {
  assert.equal(storedImageName('https://example.com/outfit.jpg'), null);
  assert.equal(storedImageName('data:image/png;base64,abc'), null);
});

test('rejects empty stored and legacy image references', () => {
  assert.equal(storedImageName('fashion-canvas-image://'), null);
  assert.equal(storedImageName('file:///container/Documents/fashion-canvas-images/'), null);
});

test('preserves filenames and extensions from stored references', () => {
  assert.equal(
    storedImageName('fashion-canvas-image://piece-with-spaces.png'),
    'piece-with-spaces.png',
  );
  assert.equal(
    storedImageName('file:///container/fashion-canvas-images/generated.webp'),
    'generated.webp',
  );
});
