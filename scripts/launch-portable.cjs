// NSIS launches Electron without forwarding its stderr pipe. Use explicit local
// inspector/CDP ports to test the real portable EXE instead of its unpacked copy.
const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const net = require('node:net');
const path = require('node:path');

async function freePort() {
  const server = net.createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}
async function endpoint(port, resource, child) {
  const started = Date.now();
  while (Date.now() - started < 60000) {
    if (child.exitCode !== null) throw new Error(`Portable launcher exited: ${child.exitCode}`);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/${resource}`);
      if (response.ok) return await response.json();
    } catch { /* The portable runtime is still extracting. */ }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error('Portable runtime did not expose its local QA port within 60 seconds.');
}
async function launchPortable(executablePath, profile) {
  const inspectorPort = await freePort(), browserPort = await freePort();
  const child = spawn(executablePath, [`--inspect=${inspectorPort}`, `--remote-debugging-port=${browserPort}`, `--user-data-dir=${profile}`], {
    cwd: path.dirname(executablePath), windowsHide: true, stdio: 'ignore',
  });
  let spawnError;
  child.on('error', e => { spawnError = e; });
  let browser, socket;
  try {
    const endpoints = await endpoint(inspectorPort, 'json/list', child);
    if (spawnError) throw spawnError;
    socket = new WebSocket(endpoints[0].webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true });
      socket.addEventListener('error', reject, { once: true });
    });
    let nextId = 0;
    const pending = new Map();
    socket.addEventListener('message', e => {
      const message = JSON.parse(e.data);
      const waiter = pending.get(message.id);
      if (!waiter) return;
      pending.delete(message.id);
      message.error ? waiter.reject(new Error(message.error.message)) : waiter.resolve(message.result);
    });
    const send = (method, params) => new Promise((resolve, reject) => {
      const id = ++nextId;
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });
    await endpoint(browserPort, 'json/version', child);
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${browserPort}`);
    let page = browser.contexts()[0].pages()[0];
    if (!page) page = await browser.contexts()[0].waitForEvent('page');
    return {
      firstWindow: async () => page,
      async evaluate(fn, arg) {
        const expression = `(async()=>{const value=await (${fn.toString()})(process.mainModule.require('electron'),${JSON.stringify(arg) ?? 'undefined'});return Buffer.isBuffer(value)?Array.from(value):value;})()`;
        const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
        if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
        return result.result.value;
      },
      async close() {
        try { await send('Runtime.evaluate', { expression: "setTimeout(()=>process.mainModule.require('electron').app.quit(), 50);undefined" }); } catch { /* Already closed. */ }
        socket.close();
        await browser.close().catch(() => {});
        if (child.exitCode === null) await new Promise(resolve => {
          const timer = setTimeout(() => { child.kill(); resolve(); }, 10000);
          child.once('exit', () => { clearTimeout(timer); resolve(); });
        });
      },
    };
  } catch (error) {
    socket?.close();
    await browser?.close().catch(() => {});
    child.kill();
    throw error;
  }
}
module.exports = { launchPortable };
