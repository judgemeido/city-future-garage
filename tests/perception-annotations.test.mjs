import test from 'node:test';
import assert from 'node:assert/strict';
import { PERCEPTION_SCENES } from '../src/games/perception-scenes.ts';
import { annotationRect, scanTargetAt, clickTargetAt, drawSceneAnnotations } from '../src/games/perception-annotations.ts';

test('each scene exposes independent same-category instances with boxes inside the original photo', () => {
  for (const scene of PERCEPTION_SCENES) {
    assert.equal(new Set(scene.targets.map(target => target.id)).size, scene.targets.length, scene.id);
    for (const target of scene.targets) {
      assert.ok(target.x >= 0 && target.y >= 0 && target.w > 0 && target.h > 0 && target.x + target.w <= 1 && target.y + target.h <= 1, `${scene.id}: ${target.name}`);
    }
    for (const category of ['vehicle', 'cyclist', 'pedestrian', 'signal', 'road', 'landmark']) {
      const instances = scene.targets.filter(target => target.category === category);
      if (instances.length) assert.equal(instances[0].id, category, 'legacy scanned primary instances keep their identifiers');
    }
  }
});

test('every target centre is individually scannable even in crowded photos and after resizing', () => {
  for (const image of [{ x: 16, y: 40, w: 800, h: 600 }, { x: 10, y: 20, w: 320, h: 240 }]) {
    for (const scene of PERCEPTION_SCENES) for (const target of scene.targets) {
      const rect = annotationRect(target, image);
      assert.equal(scanTargetAt(scene.targets, image, rect.x + rect.w / 2, rect.y + rect.h / 2)?.id, target.id, `${scene.id}: ${target.name}`);
    }
  }
});

test('clicking a small nested target prefers it over a surrounding landmark', () => {
  const scene = PERCEPTION_SCENES.find(scene => scene.id === 'hangzhou-leifeng');
  const cone = scene.targets.find(target => target.name === '雷峰塔顶层塔檐');
  const image = { x: 0, y: 0, w: 1000, h: 660 };
  const rect = annotationRect(cone, image);
  assert.equal(clickTargetAt(scene.targets, image, rect.x + rect.w / 2, rect.y + rect.h / 2)?.id, cone.id);
  assert.equal(scanTargetAt(scene.targets, image, -10, -10), undefined);
  assert.equal(clickTargetAt(scene.targets, image, -10, -10), undefined);
});

test('finding requires a point inside the actual target, with no nearby-click fallback', () => {
  const target = PERCEPTION_SCENES[0].targets[0];
  const image = { x: 16, y: 40, w: 968, h: 602 };
  const rect = annotationRect(target,image);
  assert.equal(clickTargetAt([target],image,rect.x-1,rect.y+rect.h/2),undefined);
  assert.equal(clickTargetAt([target],image,rect.x+rect.w+1,rect.y+rect.h/2),undefined);
  assert.equal(clickTargetAt([target],image,rect.x+rect.w/2,rect.y-1),undefined);
});

test('each goal has a real clickable location despite nested and overlapping boxes', () => {
  const image = {x:0,y:0,w:1,h:1};
  for (const scene of PERCEPTION_SCENES) for (const target of scene.targets) {
    let reachable=false;
    for(let row=1;row<10&&!reachable;row++)for(let col=1;col<10;col++) {
      if(clickTargetAt(scene.targets,image,target.x+target.w*col/10,target.y+target.h*row/10)?.id===target.id){reachable=true;break;}
    }
    assert.ok(reachable,`${scene.id}: ${target.name} must be findable in the photo`);
  }
});

test('only manually marked boxes appear, preserve their card numbers, and disappear on restore', () => {
  const targets = PERCEPTION_SCENES[0].targets;
  const drawn = [], labels = [];
  const ctx = new Proxy({
    strokeRect: (...rect) => drawn.push(rect),
    fillText: text => labels.push(text),
    measureText: text => ({ width: text.length * 10 })
  }, { get: (object, key) => object[key] ?? (() => {}) });
  const image = { x: 16, y: 40, w: 968, h: 602 };
  const marked = new Set();
  drawSceneAnnotations(ctx, targets, image, targets[0].id, marked);
  assert.deepEqual(drawn, [], 'a selected target is not automatically marked');
  marked.add(targets[3].id);
  drawSceneAnnotations(ctx, targets, image, targets[0].id, marked);
  assert.equal(drawn.length, 1);
  assert.match(labels[0], /^4 ✓ /, 'photo number must still match the fourth card');
  marked.clear(); drawn.length = 0; labels.length = 0;
  drawSceneAnnotations(ctx, targets, image, targets[3].id, marked);
  assert.deepEqual(drawn, []);
  assert.deepEqual(labels, []);
});
