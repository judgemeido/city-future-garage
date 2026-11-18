const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

const routes = ['home', 'perception', 'factory', 'ai', 'regen', 'parking', 'repair', 'charging', 'grip', 'report'];
const sizes = [[1920, 1080], [1366, 768], [1280, 720], [1024, 600], [800, 540], [640, 600], [390, 844], [320, 568]];

async function runOptimizationQA(page, { base = 'http://127.0.0.1:5173/', output = 'output/optimization/final' } = {}) {
  output = path.resolve(output);
  await fs.mkdir(output, { recursive: true });
  const errors = [], requests = [], audit = [], checks = [];
  const onError = e => errors.push(e.message);
  const onRequest = r => { if (base.startsWith('file:') && /^https?:/.test(r.url())) requests.push(r.url()); };
  page.on('pageerror', onError);
  page.on('request', onRequest);
  page.setDefaultTimeout(12000);
  const visit = async id => {
    await page.goto(`${base}#${id}`);
    await page.locator(id === 'home' ? '.games-grid' : id === 'report' ? '.report-grid' : '#game-host canvas').first().waitFor({ state: 'attached' });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  };
  const shot = name => page.screenshot({ path: path.join(output, `${name}.jpg`), type: 'jpeg', quality: 85, scale: 'css' });
  const visibleShot = async (selector, name) => { await page.locator(selector).first().scrollIntoViewIfNeeded(); await shot(name); };
  const state = () => page.evaluate(() => JSON.parse(localStorage.getItem('city-future-garage-v1')));
  try {
    for (const [width, height] of sizes) {
      await page.setViewportSize({ width, height });
      for (const route of routes) {
        await visit(route);
        const metrics = await page.evaluate(() => {
          const overlays = [...document.querySelectorAll('.as-overlay,.aib-stage-overlay')].filter(e => !e.hidden);
          const bounds = e => { const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; };
          return {
            viewport: innerWidth, scrollWidth: document.documentElement.scrollWidth,
            navBottom: document.querySelector('.sidebar-bottom').getBoundingClientRect().bottom,
            overlays: overlays.map(e => ({ ...bounds(e), clipped: [...e.children].some(c => {
              const b = c.getBoundingClientRect(), p = e.getBoundingClientRect();
              return b.top < p.top - 1 || b.bottom > p.bottom + 1 || b.right > p.right + 1;
            }) })),
            canvases: [...document.querySelectorAll('#game-host canvas[data-logical-width]')].filter(c => c.getBoundingClientRect().width && getComputedStyle(c).visibility !== 'hidden').map(c => ({
              ...bounds(c), ratio: Number(c.dataset.logicalWidth) / Number(c.dataset.logicalHeight),
              pixels: c.width * c.height,
            })),
          };
        });
        assert.ok(metrics.scrollWidth <= metrics.viewport + 1, `${route} ${width}: horizontal overflow`);
        if (width > 600) assert.ok(metrics.navBottom <= height + 1, `${route}: sidebar tools cut off`);
        assert.ok(metrics.overlays.every(o => !o.clipped), `${route} ${width}: overlay buttons/text clipped`);
        for (const c of metrics.canvases) assert.ok(Math.abs(c.w / c.h - c.ratio) < 0.02, `${route}: stretched canvas`);
        audit.push({ route, width, height, ...metrics });
        if ([1366, 320].includes(width)) {
          await shot(`${route}-${width}-initial`);
          if (!['home', 'report'].includes(route)) await visibleShot('#game-host', `${route}-${width}-workbench`);
        }
      }
    }
    checks.push('80 route/viewport checks: overflow, utility navigation, canvas geometry, intro clipping');

    await page.setViewportSize({ width: 1366, height: 768 });
    await visit('home');
    assert.equal(await page.locator('[data-game-card]').count(), 8);
    await page.locator('[data-filter="drive"]').click();
    assert.equal(await page.locator('[data-game-card]:visible').count(), 3);
    await page.locator('[data-filter="all"]').click();
    assert.equal(await page.locator('[data-game-card]:visible').count(), 8);
    await page.locator('[data-action="profile"]').first().click();
    await page.locator('#nickname').fill('优化回归工程师');
    await page.getByRole('button', { name: '保存签名' }).click();
    await page.reload();
    assert.equal(await page.locator('[data-profile-name]').first().textContent(), '优化回归工程师');
    checks.push('lobby filters and nickname persisted after reload');

    await visit('perception');
    await page.waitForFunction(() => document.querySelector('.perception-experience').dataset.imageState === 'ready');
    for (const button of await page.locator('button.perception-scene').all()) {
      await button.click();
      await page.waitForFunction(() => document.querySelector('.perception-experience').dataset.imageState === 'ready');
      assert.ok(await button.locator('img').evaluate(img => img.complete && img.naturalWidth >= 1280));
    }
    await page.locator('.perception-photo-zoom').click();
    await page.locator('.perception-zoom-image').evaluate(img => img.decode());
    await shot('perception-enlarged');
    await page.locator('.perception-zoom-close').click();
    await page.setViewportSize({ width: 320, height: 568 });
    const weather = page.locator('.perception-weather-item input').first();
    await weather.focus();
    const before = await weather.inputValue();
    await weather.press('ArrowRight');
    assert.notEqual(await weather.inputValue(), before);
    await visibleShot('.perception-weather-controls', 'perception-weather-mobile');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    checks.push('six photos decoded, enlarged image and mobile weather slider operated');

    await page.setViewportSize({ width: 1366, height: 768 });
    await visit('factory');
    await page.locator('[data-setup]').first().click();
    await page.locator('[data-view-mode="xray"]').click();
    await page.locator('.factory-save').click();
    assert.equal((await state()).progress.factory.data.saved, true);
    await visibleShot('.factory-stage', 'factory-configured');
    checks.push('factory blueprint, X-ray view and saved configuration');

    await visit('ai');
    await page.locator('[data-aib-ov-train]').click();
    await page.waitForFunction(() => document.querySelector('.aib-root').dataset.running === 'true');
    await page.locator('[data-aib-pause]').click();
    assert.match(await page.locator('[data-aib-pause]').textContent(), /继续/);
    await visibleShot('.aib-stage', 'ai-paused');
    checks.push('AI training start and pause');

    await visit('regen');
    await page.locator('[data-start="manual"]').click();
    await page.keyboard.down('w');
    await page.waitForTimeout(300);
    await page.keyboard.up('w');
    await page.locator('[data-pause]').click();
    await page.locator('[data-paused]').waitFor();
    await visibleShot('.as-stage-wrap', 'regen-paused');
    await page.locator('[data-resume]').click();
    await page.locator('[data-save]:visible').first().click();
    checks.push('manual regeneration input, pause, resume and save');

    await visit('parking');
    await page.locator('[data-play]:visible').click();
    await page.keyboard.down('w');
    await page.waitForTimeout(300);
    await page.keyboard.up('w');
    const wheel = page.locator('[data-wheel-slider]');
    await wheel.focus();
    await wheel.press('ArrowRight');
    await page.locator('[data-save]:visible').first().click();
    await visibleShot('.as-stage-wrap', 'parking-driving');
    checks.push('parking forward input, wheel slider and saved canvas');

    await visit('repair');
    const nodes = [{ x: 648, y: 342 }, { x: 525, y: 274 }, { x: 755, y: 410 }, { x: 425, y: 396 }, { x: 245, y: 448 }];
    await page.locator('#game-host canvas').first().scrollIntoViewIfNeeded();
    const b = await page.locator('#game-host canvas').first().boundingBox();
    for (const n of nodes) await page.mouse.click(b.x + n.x * b.width / 1000, b.y + n.y * b.height / 560);
    assert.match(await page.locator('[data-probe-count]').textContent(), /5 \/ 5/);
    await page.locator('[data-fix="calibrate_lidar"]').click();
    await page.locator('[data-result]').waitFor();
    await visibleShot('[data-result]', 'repair-result');
    await page.setViewportSize({ width: 320, height: 568 });
    await visibleShot('[data-result]', 'repair-result-mobile');
    assert.ok(await page.locator('[data-result]').evaluate(e => e.scrollHeight <= e.clientHeight + 1));
    checks.push('five actual node clicks and evidence-based repair; mobile result card');

    await page.setViewportSize({ width: 390, height: 844 });
    await visit('charging');
    await page.locator('[data-mode="hard"]').click();
    await page.locator('[data-start]').click();
    for (let i = 0; i < 10; i++) {
      await page.locator('[data-opt="0"]').waitFor();
      await page.locator('[data-q-prompt]').scrollIntoViewIfNeeded();
      await page.keyboard.press('1');
      if (i < 9) await page.waitForFunction(count => {
        const s = document.querySelector('[data-answered-count]').textContent;
        return s.includes(`已提交 ${count} /`);
      }, i + 1);
    }
    await page.locator('[data-view="finished"]').waitFor({ timeout: 20000 });
    await page.locator('[data-save]').click();
    await visibleShot('[data-view="finished"]', 'charging-result-mobile');
    checks.push('ten-question hard quiz completed through actual answers and result saved');

    await page.setViewportSize({ width: 320, height: 568 });
    await visit('grip');
    await page.locator('[data-start]').click();
    await page.keyboard.down('Space');
    await page.waitForTimeout(200);
    await page.keyboard.up('Space');
    await page.locator('[data-pause]').click();
    await page.locator('[data-paused]').waitFor();
    await visibleShot('[data-paused]', 'grip-paused-mobile');
    await page.locator('[data-resume]').click();
    await page.locator('[data-save]:visible').first().click();
    checks.push('mobile grip start, emergency brake, pause, resume and save');

    await visit('report');
    assert.equal(await page.locator('.report-card').count(), 8);
    assert.ok(await page.locator('.report-card img').count() >= 4);
    await shot('report-mobile');
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('[data-action="download-report"]').click()]);
    await download.saveAs(path.join(output, 'report.html'));
    assert.ok((await fs.readFile(path.join(output, 'report.html'), 'utf8')).includes('data:image/'));
    await page.setViewportSize({ width: 800, height: 540 });
    await visit('parking');
    await shot('parking-small');
    assert.deepEqual(errors, []);
    assert.deepEqual(requests, []);
    const result = { passed: true, base, checks, audit, errors, remoteRequests: requests };
    await fs.writeFile(path.join(output, 'audit.json'), JSON.stringify(result, null, 2));
    console.log(`PASS ${checks.length} functional checks and ${audit.length} layout checks: ${output}`);
    return { passed: true, checks, layoutChecks: audit.length, output };
  } finally {
    page.off('pageerror', onError);
    page.off('request', onRequest);
  }
}

module.exports = { runOptimizationQA };
if (require.main === module) (async () => {
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: true, executablePath: process.env.QA_BROWSER_PATH || (process.platform === 'win32' ? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe' : undefined) });
  try {
    const context = await browser.newContext({ acceptDownloads: true });
    if (process.env.QA_URL?.startsWith('file:')) await context.setOffline(true);
    await runOptimizationQA(await context.newPage(), { base: process.env.QA_URL, output: process.env.QA_OUTPUT });
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
