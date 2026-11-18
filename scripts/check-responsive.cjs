// Run against Vite or a built offline HTML file. Requires Playwright on NODE_PATH.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const base = process.env.QA_URL || 'http://127.0.0.1:5173/';
const failures = [];
async function check(name, run) {
  try { await run(); console.log('PASS', name); }
  catch (error) { failures.push(name); console.error('FAIL', name, error.message); }
}
(async () => {
  const { PERCEPTION_SCENES } = await import('../src/games/perception-scenes.ts');
  const { clickTargetAt } = await import('../src/games/perception-annotations.ts');
  const browser = await chromium.launch({ headless: true, channel: process.env.QA_BROWSER_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined) });
  const page = await browser.newPage();
  if (base.startsWith('file:')) await page.context().setOffline(true);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  fs.mkdirSync('output/responsive', { recursive: true });
  const visit = async route => {
    await page.goto(`${base}#${route}`);
    await page.waitForLoadState('networkidle');
    if (['perception', 'factory', 'ai', 'regen'].includes(route)) await page.waitForSelector('canvas[data-logical-width]');
    if (route === 'perception') await page.locator('.perception-experiment-settings').evaluate(el => el.open = true);
  };
  const clickGoal = async id => {
    const sceneId = await page.locator('.perception-experience').getAttribute('data-scene');
    const scene = PERCEPTION_SCENES.find(item => item.id === sceneId), target = scene.targets.find(item => item.id === id);
    let point;
    for(let row=1;row<10&&!point;row++)for(let col=1;col<10;col++) {
      const x=target.x+target.w*col/10,y=target.y+target.h*row/10;
      if(clickTargetAt(scene.targets,{x:0,y:0,w:1,h:1},x,y)?.id===id){point={x,y};break;}
    }
    assert.ok(point,`target ${id} needs a real click location`);
    await page.locator('.perception-photo-viewport').scrollIntoViewIfNeeded();
    const p = await page.evaluate(({x,y})=>{
      const b=document.querySelector('.perception-playfield canvas').getBoundingClientRect(),photo=document.querySelector('.perception-scene[aria-pressed=true] img'),scale=Math.min(968/photo.naturalWidth,602/photo.naturalHeight),w=photo.naturalWidth*scale,h=photo.naturalHeight*scale;
      return{x:b.x+(16+(968-w)/2+x*w)/1000*b.width,y:b.y+(40+(602-h)/2+y*h)/660*b.height};
    },point);
    await page.mouse.click(p.x,p.y);
  };
  await check('marking requires a click or keyboard confirmation, and restore persists per scene', async () => {
    await page.setViewportSize({ width: 1366, height: 900 }); await visit('perception');
    await page.waitForFunction(() => document.querySelector('.perception-experience')?.dataset.imageState === 'ready');
    const markedCount = () => page.locator('[data-target].is-found').count();
    assert.equal(await markedCount(), 0);
    assert.equal(await page.locator('.perception-restore').isDisabled(), true);
    await page.locator('.perception-photo-zoom').click();
    await page.locator('.perception-zoom-image').evaluate(img => img.decode());
    assert.doesNotMatch(await page.locator('.perception-zoom-image').getAttribute('alt'), /手动标记/);
    await page.locator('.perception-zoom-close').click();
    await page.locator('.perception-playfield').screenshot({ path: 'output/responsive/perception-manual-before.png' });
    const targetPoint = async (x, y) => { await page.locator('.perception-photo-viewport').scrollIntoViewIfNeeded(); return page.evaluate(({ x, y }) => {
      const canvas = document.querySelector('.perception-playfield canvas').getBoundingClientRect();
      const photo = document.querySelector('[data-scene][aria-pressed="true"] img');
      const scale = Math.min(968 / photo.naturalWidth, 602 / photo.naturalHeight);
      const w = photo.naturalWidth * scale, h = photo.naturalHeight * scale;
      return { x: canvas.x + (16 + (968 - w) / 2 + x * w) / 1000 * canvas.width,
        y: canvas.y + (40 + (602 - h) / 2 + y * h) / 660 * canvas.height };
    }, { x, y }); };
    await page.locator('[data-view="scan"]').click();
    const car = await targetPoint(.573, .8885);
    await page.mouse.move(car.x, car.y); await page.waitForTimeout(800);
    assert.equal(await markedCount(), 0, 'hovering a target must not mark it');
    await page.mouse.click(car.x, car.y);
    assert.equal(await markedCount(), 1);
    assert.equal(await page.locator('[data-target="vehicle"].is-found').count(), 1);
    await page.locator('[data-target="vehicle"]').click();
    assert.equal(await markedCount(), 1, 'clicking a marked target is idempotent');
    await page.locator('.perception-zoom-close').click();
    await page.locator('.perception-playfield').focus();
    const signal = await targetPoint(.2065, .823);
    await page.mouse.move(signal.x, signal.y); await page.waitForTimeout(800);
    assert.equal(await markedCount(), 1, 'moving to another target must not mark it');
    await page.keyboard.press('Enter');
    assert.equal(await markedCount(), 2);
    await page.locator('.perception-playfield').screenshot({ path: 'output/responsive/perception-manual-marked.png' });
    await page.locator('.perception-photo-zoom').click();
    assert.match(await page.locator('.perception-zoom-image').getAttribute('alt'), /含 2 个手动标记/);
    await page.locator('.perception-zoom-close').click();
    await page.locator('button[data-scene="hangzhou-baima"]').click();
    await page.waitForFunction(() => document.querySelector('.perception-experience')?.dataset.imageState === 'ready');
    assert.equal(await markedCount(), 0);
    await page.locator('[data-target="vehicle"]').click();
    assert.equal(await markedCount(), 0, 'a checklist click only selects the goal');
    await clickGoal('vehicle');
    await page.locator('.perception-restore').click();
    assert.equal(await markedCount(), 0);
    await page.locator('button[data-scene="hangzhou-qianjiang"]').click();
    await page.waitForFunction(() => document.querySelector('.perception-experience')?.dataset.imageState === 'ready');
    assert.equal(await markedCount(), 2, 'restoring one scene must preserve another scene');
    const awards = await page.evaluate(() => JSON.parse(localStorage.getItem('city-future-garage-v1')).progress.perception.awards);
    await page.locator('.perception-restore').click();
    assert.equal(await markedCount(), 0);
    assert.equal(await page.locator('.perception-restore').isDisabled(), true);
    await page.locator('.perception-playfield').screenshot({ path: 'output/responsive/perception-manual-restored.png' });
    await page.reload();
    await page.waitForFunction(() => document.querySelector('.perception-experience')?.dataset.imageState === 'ready');
    assert.equal(await markedCount(), 0, 'restored markers must remain cleared after reload');
    const record = await page.evaluate(() => JSON.parse(localStorage.getItem('city-future-garage-v1')).progress.perception);
    assert.deepEqual(record.data.discovered, []);
    assert.equal(record.data.scanCompleted, false);
    assert.deepEqual(record.awards, awards);
  });
  await check('primary perception picture uses a larger desktop area', async () => {
    for (const [width, height] of [[1920, 1080], [1920, 900], [1440, 900], [1366, 768], [1280, 720]]) {
      await page.setViewportSize({ width, height }); await visit('perception');
      const rect = await page.locator('.perception-playfield').boundingBox();
      assert.ok(rect.width >= 800, `${width}×${height}: picture is only ${Math.round(rect.width)}px wide`);
    }
  });
  await check('six different scenes load, switch targets and persist selection', async () => {
    await page.setViewportSize({ width: 1366, height: 900 }); await visit('perception');
    const buttons = page.locator('button[data-scene]');
    assert.equal(await buttons.count(), 6);
    const sceneIds = await buttons.evaluateAll(elements => elements.map(e => e.dataset.scene));
    const pictures = new Set();
    for (const id of sceneIds) {
      await page.locator(`button[data-scene="${id}"]`).click();
      await page.waitForFunction(id => document.querySelector('.perception-experience').dataset.scene === id && document.querySelector('.perception-experience').dataset.imageState === 'ready', id);
      assert.match(await page.locator('.perception-data-chip').textContent(), /浙江杭州/);
      assert.equal(await page.locator('.perception-annotations').getAttribute('aria-pressed'), 'true');
      const ids = await page.locator('[data-target]').evaluateAll(elements => elements.map(e => e.dataset.target));
      assert.equal(new Set(ids).size, ids.length, 'every annotated instance needs a unique selection');
      assert.ok(ids.length >= 6, 'each scene has visible road subjects, facilities or landmarks');
      await page.locator('.perception-playfield').screenshot({ path: `output/responsive/${id}-before-marking.png` });
      if (id === sceneIds[0]) await page.screenshot({ path: 'output/responsive/perception-hangzhou.png', fullPage: true });
      await page.locator('.perception-photo-zoom').click();
      const image = page.locator('.perception-zoom-image');
      await image.evaluate(img => img.decode()); pictures.add(await image.getAttribute('src'));
      assert.ok(await image.evaluate(img => img.naturalWidth >= 1000));
      await page.locator('.perception-zoom-close').click();
      for (const target of await page.locator('[data-target]').evaluateAll(elements => elements.map(e => e.dataset.target))) {
        await clickGoal(target);
        await page.waitForFunction(target => document.querySelector(`[data-target="${target}"]`).classList.contains('is-found'), target);
        await page.locator(`[data-target="${target}"]`).click();
        await page.locator('.perception-zoom-close').click();
        await page.locator('.perception-target-zoom').click();
        await image.evaluate(img => img.decode());
        assert.ok(await image.evaluate(img => img.naturalWidth > 0 && img.naturalHeight > 0));
        await page.locator('.perception-zoom-close').click();
      }
      assert.equal(await page.locator('[data-target].is-found').count(), ids.length);
    }
    assert.equal(pictures.size, 6, 'scene choices must show different photographs');
    await page.locator('.perception-capture').click(); await page.reload();
    await page.waitForSelector('canvas[data-logical-width]');
    assert.equal(await page.locator('.perception-experience').getAttribute('data-scene'), sceneIds.at(-1));
    const record = await page.evaluate(() => JSON.parse(localStorage.getItem('city-future-garage-v1')).progress.perception);
    assert.equal(record.data.discovered.length, 4);
    assert.equal(record.data.scanCompleted, true);
    assert.equal(Object.keys(record.awards).filter(key => key.startsWith('target-')).length, 4, 'changing scenes must not create duplicate category awards');
    assert.match(record.data.report.find(row => row.label === '观察场景').value, /西湖环湖路.*浙江杭州/);
  });
  await check('annotation visibility changes both the photo and its enlarged view', async () => {
    await visit('perception');
    await page.locator('.perception-annotations').click();
    assert.equal(await page.locator('.perception-experience').getAttribute('data-annotations'), 'false');
    await page.locator('.perception-photo-zoom').click();
    const image = page.locator('.perception-zoom-image');
    await image.evaluate(img => img.decode());
    const raw = await image.getAttribute('src');
    assert.doesNotMatch(await image.getAttribute('alt'), /手动标记/);
    await page.locator('.perception-zoom-close').click();
    await page.locator('.perception-annotations').click();
    await page.locator('.perception-photo-zoom').click();
    await image.evaluate(img => img.decode());
    assert.match(await image.getAttribute('alt'), /手动标记/);
    assert.notEqual(await image.getAttribute('src'), raw);
    await page.locator('.perception-zoom-close').click();
    await page.locator('.perception-capture').click();
    await page.reload();
    await page.waitForFunction(() => document.querySelector('.perception-experience')?.dataset.imageState === 'ready');
    assert.equal(await page.locator('.perception-annotations').getAttribute('aria-pressed'), 'true');
  });
  await check('old overseas scene records migrate to unscanned Hangzhou photographs', async () => {
    await visit('home');
    await page.addInitScript(() => {
      if (sessionStorage.getItem('hangzhou-migration-seeded')) return;
      const state = JSON.parse(localStorage.getItem('city-future-garage-v1'));
      state.progress.perception.data.sceneId = 'amsterdam-cycleway';
      delete state.progress.perception.data.sceneCatalog;
      state.progress.perception.data.discovered = ['vehicle', 'pedestrian', 'cyclist', 'signal'];
      state.progress.perception.data.discoveredByScene = { 'amsterdam-cycleway': ['vehicle', 'pedestrian', 'cyclist', 'signal'] };
      state.progress.perception.data.scanCompleted = true;
      localStorage.setItem('city-future-garage-v1', JSON.stringify(state));
      sessionStorage.setItem('hangzhou-migration-seeded', 'true');
    });
    await page.reload();
    await visit('perception');
    await page.waitForFunction(() => document.querySelector('.perception-experience')?.dataset.imageState === 'ready');
    assert.equal(await page.locator('.perception-experience').getAttribute('data-scene'), 'hangzhou-qianjiang');
    assert.equal(await page.locator('[data-target].is-found').count(), 0);
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('city-future-garage-v1')).progress.perception.data.sceneCatalog === 'hangzhou-landmarks-2026-11-12');
    const record = await page.evaluate(() => JSON.parse(localStorage.getItem('city-future-garage-v1')).progress.perception);
    assert.deepEqual(record.data.discovered, []);
    assert.equal(record.data.scanCompleted, false);
    assert.ok(Object.keys(record.data.discoveredByScene).every(id => id.startsWith('hangzhou-')));
    assert.equal(Object.keys(record.awards).filter(key => key.startsWith('target-')).length, 4);
    assert.match(record.data.report.find(row => row.label === '观察场景').value, /钱江新城.*浙江杭州/);
    await clickGoal('vehicle');
    await page.waitForFunction(() => document.querySelector('[data-target="vehicle"]').classList.contains('is-found'));
    await page.locator('.perception-capture').click();
    await page.reload();
    await page.waitForFunction(() => document.querySelector('.perception-experience')?.dataset.imageState === 'ready');
    assert.equal(await page.locator('[data-target="vehicle"].is-found').count(), 1);
    assert.equal(await page.locator('[data-target="cyclist"].is-found').count(), 0);
  });
  await check('all pages fit wide and narrow browser windows', async () => {
    for (const width of [1920, 1440, 1366, 1280, 1100, 1024, 900, 768, 600, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      for (const route of ['home', 'perception', 'factory', 'ai', 'regen', 'report']) {
        await visit(route);
        const sizes = await page.evaluate(() => ({ page: document.documentElement.scrollWidth, viewport: innerWidth }));
        assert.ok(sizes.page <= sizes.viewport + 1, `${route} at ${width}px overflows by ${sizes.page - sizes.viewport}px`);
        for (const canvas of await page.locator('canvas[data-logical-width]').all()) {
          const ratio = await canvas.evaluate(c => { const r = c.getBoundingClientRect(); return (r.width / r.height) / (Number(c.dataset.logicalWidth) / Number(c.dataset.logicalHeight)); });
          assert.ok(Math.abs(ratio - 1) < .02, `${route} at ${width}px stretches its canvas`);
        }
      }
    }
  });
  await check('resize preserves split, scene and enabled controls', async () => {
    await page.setViewportSize({ width: 1366, height: 768 }); await visit('perception');
    await page.locator('[data-view="compare"]').click();
    await page.locator('#perception-split').fill('70');
    await page.setViewportSize({ width: 1024, height: 768 });
    assert.equal(await page.locator('#perception-split').inputValue(), '70');
    await page.locator('.perception-playfield').scrollIntoViewIfNeeded();
    const stage = await page.locator('.perception-playfield canvas').boundingBox();
    await page.mouse.move(stage.x + stage.width * .6936, stage.y + stage.height * .5);
    await page.mouse.down(); await page.mouse.move(stage.x + stage.width * .3064, stage.y + stage.height * .5, { steps: 10 }); await page.mouse.up();
    assert.ok(Math.abs(Number(await page.locator('#perception-split').inputValue()) - 30) < 3, 'split dragging must still map mouse coordinates after resize');
    await page.locator('.perception-tools summary').click();
    await page.waitForSelector('.perception-tool-playfield canvas[data-logical-width]');
    await page.locator('#perception-distance').fill('30');
    assert.match(await page.locator('[data-value="distance"]').textContent(), /30/);
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: 'output/responsive/perception-desktop.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: 'output/responsive/perception-narrow.png', fullPage: true });
  });
  if (!base.startsWith('file:')) await check('failed photograph can be retried without stale scene content', async () => {
    await page.route('**/hangzhou-civic.jpg*', route => route.abort());
    await visit('perception');
    await page.locator('button[data-scene="hangzhou-civic"]').click();
    await page.waitForFunction(() => document.querySelector('.perception-experience').dataset.imageState === 'error');
    assert.equal(await page.locator('.perception-photo-zoom').isDisabled(), true);
    await page.unroute('**/hangzhou-civic.jpg*');
    await page.locator('.perception-image-retry').click();
    await page.waitForFunction(() => document.querySelector('.perception-experience').dataset.imageState === 'ready');
    assert.equal(await page.locator('.perception-photo-zoom').isEnabled(), true);
  });
  await check('no browser runtime errors', async () => assert.deepEqual(errors, []));
  await browser.close();
  if (failures.length) { console.error(`${failures.length} checks failed: ${failures.join(', ')}`); process.exitCode = 1; }
})();
