// Electron 45 downloads its development runtime lazily. Resolve it once so the
// installer builder can use exactly the same verified runtime as desktop QA.
const fs = require('node:fs');
const electron = require('electron');
if (!fs.existsSync(electron)) throw new Error('Electron runtime is missing.');
if (!fs.existsSync('dist/index.html')) throw new Error('Build the offline HTML first.');
console.log('Desktop runtime ready:', require('electron/package.json').version);
