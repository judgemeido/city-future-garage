const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
fs.copyFileSync(path.join(root, 'dist/index.html'), path.join(root, '城市未来车厂-双击打开.html'));
console.log('Standalone offline HTML updated.');
