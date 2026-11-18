// Actual packaged-runtime QA. Dialogs select files inside a disposable QA folder.
const { _electron } = require('playwright');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');

const output = path.resolve(process.env.QA_DESKTOP_OUTPUT || 'output/playwright/windows-offline/final');
const executablePath = process.env.QA_DESKTOP_EXE || path.resolve('release/windows/城市未来车厂-双击运行.exe');
const games = ['perception', 'factory', 'ai', 'regen', 'parking', 'repair', 'charging', 'grip'];

(async () => {
  await fs.mkdir(output, { recursive: true });
  const profile = await fs.mkdtemp(path.join(output, 'profile-'));
  const isPortable = process.env.QA_DESKTOP_PORTABLE === '1' || path.basename(executablePath) !== 'CityFutureGarage.exe';
  const electronApp = isPortable
    ? await require('./launch-portable.cjs').launchPortable(executablePath, profile)
    : await _electron.launch({ executablePath, cwd: path.dirname(executablePath), args: [`--user-data-dir=${profile}`], timeout: 30000 });
  const page = await electronApp.firstWindow();
  const errors = [], requests = [], checks = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (/^(https?|wss?):/.test(request.url())) requests.push(request.url()); });
  page.setDefaultTimeout(10000);
  const capture = async name => {
    const bytes = await electronApp.evaluate(async ({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      const image = await window.capturePage();
      const [width, height] = window.getContentSize();
      return image.resize({ width, height, quality: 'best' }).toJPEG(85);
    });
    await fs.writeFile(path.join(output, `${name}.jpg`), Buffer.from(bytes));
  };
  try {
    await page.locator('.games-grid').waitFor();
    await page.context().setOffline(true);
    await page.reload();
    await page.locator('.games-grid').waitFor();
    assert.equal(await electronApp.evaluate(({ app }) => app.isPackaged), true);
    await capture('home');
    for (const id of games) {
      await page.locator(`.side-nav a[href="#${id}"]`).click();
      await page.locator('#game-host canvas[data-logical-width]').first().waitFor();
      if (id === 'perception') {
        const photos = await page.locator('#game-host img[src]').evaluateAll(images => images.filter(image => image.src.startsWith('data:image/')).map(image => [image.complete, image.naturalWidth]));
        assert.equal(photos.length, 6);
        assert.ok(photos.every(([ready, width]) => ready && width >= 1280));
      }
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${id}: horizontal overflow`);
      await capture(id);
      if (id === 'parking') {
        await page.locator('[data-play]:visible').click();
        await page.locator('[data-save]:visible').first().click();
        await capture('parking-saved');
      }
      checks.push(`${id}: offline Canvas`);
    }
    await page.locator('.side-nav a[href="#grip"]').click();
    await page.locator('[data-start]').click();
    await page.locator('[data-pause]').click();
    await capture('grip-paused');
    await page.locator('[data-action="profile"]').first().click();
    await page.locator('#nickname').fill('完整离线测试');
    await page.getByRole('button', { name: '保存签名' }).click();
    await page.reload();
    assert.equal(await page.locator('[data-profile-name]').first().textContent(), '完整离线测试');
    await page.locator('.side-nav a[href="#report"]').click();
    await electronApp.evaluate(({ dialog }, directory) => {
      globalThis.qaCanceled = false;
      globalThis.qaSaved = [];
      dialog.showSaveDialog = async (_window, options) => {
        if (globalThis.qaCanceled) return { canceled: true };
        const filename = options.defaultPath.split(/[\\/]/).at(-1);
        globalThis.qaSaved.push(filename);
        return { canceled: false, filePath: `${directory}/${filename}` };
      };
      dialog.showMessageBox = async () => ({ response: 0 });
    }, output.replaceAll('\\', '/'));
    await page.locator('[data-action="download-report"]').click();
    await page.locator('[data-action="vehicle-png"]').click();
    await page.locator('[data-action="print-report"]').click();
    const expected = ['完整离线测试-未来车报告.html', '我的未来号-车辆作品.png', '城市未来车厂-作品.pdf'];
    for (const filename of expected) {
      let bytes;
      for (let i = 0; i < 50; i++) {
        bytes = await fs.readFile(path.join(output, filename)).catch(() => undefined);
        if (bytes?.length) break;
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      assert.ok(bytes?.length > 1000, `Missing export: ${filename}`);
      if (filename.endsWith('.png')) assert.equal(bytes.subarray(1, 4).toString(), 'PNG');
      if (filename.endsWith('.pdf')) assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
      if (filename.endsWith('.html')) { assert.ok(bytes.toString().includes('data:image/')); assert.equal((bytes.toString().match(/<article class="report-card">/g) || []).length, 8); }
    }
    await electronApp.evaluate(() => { globalThis.qaCanceled = true; });
    await page.locator('[data-action="print-report"]').click();
    await electronApp.evaluate(() => { globalThis.qaCanceled = false; });
    await page.locator('[data-action="print-report"]').click();
    await capture('report');
    await electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1024, 768));
    await page.locator('.side-nav a[href="#home"]').click();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await capture('home-1024');
    assert.deepEqual(errors, []);
    assert.deepEqual(requests, []);
    const runtime = await electronApp.evaluate(({ app }) => ({ appPath: app.getAppPath(), portableFile: process.env.PORTABLE_EXECUTABLE_FILE || null }));
    if (runtime.portableFile) {
      const repeated = spawn(executablePath, [`--user-data-dir=${profile}`], { cwd: path.dirname(executablePath), stdio: 'ignore', windowsHide: true });
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => { repeated.kill(); reject(new Error('Repeated portable launch did not finish.')); }, 20000);
        repeated.once('error', error => { clearTimeout(timer); reject(error); });
        repeated.once('exit', code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(`Repeated launch exited with ${code}`)); });
      });
      assert.equal(await electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length), 1);
      await page.reload();
      await page.locator('.games-grid').waitFor();
      checks.push('single EXE startup and repeated launch without damaging active runtime');
    }
    const result = { executablePath, profile, runtime, checks, exports: expected, errors, remoteRequests: requests, passed: true };
    await fs.writeFile(path.join(output, 'audit.json'), JSON.stringify(result, null, 2));
    console.log('PASS packaged offline boot, eight current games, embedded photos, profile, HTML/PNG/PDF exports, canceled PDF and small window.');
  } finally { await electronApp.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
