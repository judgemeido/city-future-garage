import test from 'node:test';
import assert from 'node:assert/strict';
import { makeFilename } from '../scripts/image-host.mjs';

test('uses millisecond timestamp and the first six SHA-256 characters', () => {
  assert.equal(makeFilename('[timestamp]_[hash:6].[ext]', 'photo.png', Buffer.from('abc'), 1234567890123), '1234567890123_ba7816.png');
});

test('supports original names and Unicode without creating path segments', () => {
  assert.equal(makeFilename('[name]_[hash:6].[ext]', '封面 photo.JPG', Buffer.from('abc')), '封面_photo_ba7816.jpg');
});

test('rejects paths, unresolved placeholders and wrong extensions', () => {
  for (const template of ['../[name].[ext]', '[unknown].[ext]', '[name].html', '[hash:0].[ext]', '[hash:65].[ext]']) {
    assert.throws(() => makeFilename(template, 'cover.png', Buffer.from('abc')));
  }
});
