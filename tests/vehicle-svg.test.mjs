import test from 'node:test';
import assert from 'node:assert/strict';
import { vehicleSVG } from '../src/car-art.ts';

test('every vehicle exports a self-contained scalable side and top view with themeable paint', () => {
  for (const body of ['city', 'touring', 'sport']) for (const view of ['side', 'top']) {
    const svg = vehicleSVG('#e97652', body, view);
    assert.match(svg, /xmlns="http:\/\/www.w3.org\/2000\/svg"/);
    const bounds = svg.match(/viewBox="([^"]+)"/)?.[1].split(' ').map(Number);
    assert.equal(bounds?.length, 4);
    assert.ok(bounds.every(Number.isFinite) && bounds[2] > 0 && bounds[3] > 0);
    assert.ok(svg.includes('#e97652'), `${body} ${view} did not receive the selected paint`);
    assert.doesNotMatch(svg, /<(?:image|script|foreignObject)\b|(?:href|src)=|url\(https?:/i);
    assert.ok((svg.match(/<path /g) ?? []).length >= 8);
  }
});

test('untrusted paint and body names cannot inject SVG markup; unknown bodies use the city model', () => {
  const injected = vehicleSVG('"><script>alert(1)</script>', '<img onerror=alert(1)>', 'side');
  assert.doesNotMatch(injected, /<script|<img|onerror|alert/);
  assert.equal(injected, vehicleSVG('#62bd95', 'city', 'side'));
});

test('wheel rotation changes side artwork while the paint and body geometry remain present', () => {
  const stationary = vehicleSVG('#e97652', 'city', 'side', 0);
  const moving = vehicleSVG('#e97652', 'city', 'side', Math.PI / 2);
  assert.notEqual(stationary, moving);
  assert.match(moving, /rotate\(-?90 /);
  assert.equal((stationary.match(/<path /g) ?? []).length, (moving.match(/<path /g) ?? []).length);
});
