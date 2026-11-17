import { createHash, createHmac } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const sha256 = value => createHash('sha256').update(value).digest('hex');
const hmac = (key, value) => createHmac('sha256', key).update(value).digest();
const encode = value => encodeURIComponent(value).replace(/[!'()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
const mimeTypes = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };
const extensions = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };

export function makeFilename(template, filename, bytes, timestamp = Date.now()) {
  const ext = path.extname(filename).slice(1).toLowerCase();
  const name = path.basename(filename, path.extname(filename)).replace(/[^\p{L}\p{N}._-]/gu, '_');
  const result = template.replace(/\[(timestamp|name|ext|hash(?::\d+)?)\]/g, (_, token) => {
    if (token === 'timestamp') return String(timestamp);
    if (token === 'name') return name;
    if (token === 'ext') return ext;
    const length = Number(token.split(':')[1] || 64);
    if (length < 1 || length > 64) throw new Error('Hash length must be between 1 and 64.');
    return sha256(bytes).slice(0, length);
  });
  if (!result || /[\[\]<>:"/\\|?*\x00-\x1f]/.test(result) || result === '.' || result === '..') {
    throw new Error('Filename template must produce a single safe filename.');
  }
  if (path.extname(result).toLowerCase() !== `.${ext}`) throw new Error('Filename template must preserve .[ext].');
  return result;
}

export function signR2({ method, url, body = Buffer.alloc(0), headers = {}, accessKeyId, secretAccessKey, now = new Date() }) {
  const date = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const shortDate = date.slice(0, 8);
  const target = new URL(url);
  const payloadHash = sha256(body);
  const signed = { ...headers, host: target.host, 'x-amz-date': date, 'x-amz-content-sha256': payloadHash };
  const names = Object.keys(signed).sort();
  const canonicalHeaders = names.map(key => `${key}:${String(signed[key]).trim().replace(/\s+/g, ' ')}\n`).join('');
  const query = [...target.searchParams].map(([key, value]) => [encode(key), encode(value)])
    .sort(([ak, av], [bk, bv]) => ak < bk ? -1 : ak > bk ? 1 : av < bv ? -1 : av > bv ? 1 : 0)
    .map(pair => pair.join('=')).join('&');
  const canonical = [method, target.pathname, query, canonicalHeaders, names.join(';'), payloadHash].join('\n');
  const scope = `${shortDate}/auto/s3/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', date, scope, sha256(canonical)].join('\n');
  const signingKey = hmac(hmac(hmac(hmac(`AWS4${secretAccessKey}`, shortDate), 'auto'), 's3'), 'aws4_request');
  signed.authorization = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${names.join(';')}, Signature=${hmac(signingKey, stringToSign).toString('hex')}`;
  return signed;
}

export async function loadSettings() {
  const directory = process.env.IMAGE_HOST_CONFIG_DIR || path.join(process.env.LOCALAPPDATA || '', 'Codex', 'image-host-webpic');
  const config = JSON.parse((await readFile(path.join(directory, 'config.json'), 'utf8')).replace(/^\uFEFF/, ''));
  const ps = `
    $ErrorActionPreference = 'Stop'
    Import-Module (Join-Path $PSHOME 'Modules/Microsoft.PowerShell.Security/Microsoft.PowerShell.Security.psd1')
    $encrypted = (Get-Content -LiteralPath (Join-Path $env:IMAGE_HOST_CONFIG_DIR 'credentials.dpapi') -Raw).Trim()
    $secure = ConvertTo-SecureString $encrypted
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try { [Console]::Out.Write([Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
  `;
  const decoded = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], {
    encoding: 'utf8', windowsHide: true, timeout: 15000,
    env: { ...process.env, IMAGE_HOST_CONFIG_DIR: directory },
  });
  if (decoded.status !== 0) throw new Error('Cannot decrypt local credentials. Run as the Windows user who configured them.');
  let credentials;
  try { credentials = JSON.parse(decoded.stdout); } catch { throw new Error('Local credential file is invalid.'); }
  const settings = { ...config, ...credentials, directory };
  if (!/^[a-f\d]{32}$/i.test(settings.accountId) || !settings.accessKeyId || !settings.secretAccessKey || !settings.tinifyKey) {
    throw new Error('Missing or invalid R2/Tinify credentials.');
  }
  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(settings.bucket)) throw new Error('Invalid bucket name.');
  const publicUrl = new URL(settings.publicBaseUrl);
  if (publicUrl.protocol !== 'https:' || publicUrl.username || publicUrl.password || publicUrl.search || publicUrl.hash) {
    throw new Error('Public image base URL must be an HTTPS URL without credentials, query or fragment.');
  }
  settings.publicBaseUrl = publicUrl.href.replace(/\/$/, '');
  const jurisdiction = settings.jurisdiction ? `${settings.jurisdiction}.` : '';
  if (!['', 'eu.', 'us.', 'fedramp.'].includes(jurisdiction)) throw new Error('Unknown R2 jurisdiction.');
  settings.endpoint = `https://${settings.accountId}.${jurisdiction}r2.cloudflarestorage.com`;
  return settings;
}

async function request(url, options = {}) {
  try {
    return await fetch(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(45000) });
  } catch (error) {
    throw new Error(`Network request failed for ${new URL(url).hostname} (${error.cause?.code || error.name}).`);
  }
}

async function r2(settings, method, key = '', body = Buffer.alloc(0), headers = {}) {
  const url = `${settings.endpoint}/${encode(settings.bucket)}${key ? `/${encode(key)}` : ''}`;
  return request(url, { method, headers: signR2({ method, url, body, headers, ...settings }), ...(method === 'PUT' ? { body } : {}) });
}

async function requireR2(response, action) {
  if (response.ok) return;
  const xml = await response.text();
  const code = xml.match(/<Code>([A-Za-z\d]+)<\/Code>/)?.[1] || 'UnknownError';
  throw new Error(`R2 ${action} failed: HTTP ${response.status} ${code}.`);
}

async function checkBucket(settings) {
  const response = await r2(settings, 'HEAD');
  await requireR2(response, 'bucket access');
  return response.status;
}

function tinifyAuth(settings) {
  return { authorization: `Basic ${Buffer.from(`api:${settings.tinifyKey}`).toString('base64')}` };
}

export async function check(settings) {
  const bucketStatus = await checkBucket(settings);
  const response = await request('https://api.tinify.com/shrink', { method: 'POST', headers: tinifyAuth(settings), body: '' });
  const data = await response.json();
  if (response.status !== 400 || data.error !== 'InputMissing') {
    throw new Error(`Tinify validation failed: HTTP ${response.status} ${data.error || 'UnknownError'}.`);
  }
  return { bucket: settings.bucket, r2: 'authenticated', r2HttpStatus: bucketStatus, tinify: 'authenticated',
    compressionCount: response.headers.get('compression-count'), publicBaseUrl: settings.publicBaseUrl,
    filenameTemplate: settings.filenameTemplate, publicDelivery: 'Requires an uploaded image to verify.' };
}

async function compress(settings, input) {
  const cachePath = path.join(settings.directory, 'compression-cache', `${sha256(input)}.json`);
  try {
    const cached = JSON.parse(await readFile(cachePath, 'utf8'));
    const bytes = Buffer.from(cached.base64, 'base64');
    if (sha256(bytes) === cached.sha256 && extensions[cached.type]) return { bytes, type: cached.type, cached: true };
  } catch (error) { if (error.code && error.code !== 'ENOENT') throw error; }
  const response = await request('https://api.tinify.com/shrink', {
    method: 'POST', headers: { ...tinifyAuth(settings), 'content-type': 'application/octet-stream' }, body: input,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`Tinify compression failed: HTTP ${response.status} ${data.error || 'UnknownError'}.`);
  const outputUrl = new URL(data.output?.url);
  if (outputUrl.origin !== 'https://api.tinify.com' || !outputUrl.pathname.startsWith('/output/')) {
    throw new Error('Tinify returned an unexpected download URL.');
  }
  const output = await request(outputUrl, { headers: tinifyAuth(settings) });
  if (!output.ok) throw new Error(`Tinify download failed: HTTP ${output.status}.`);
  const bytes = Buffer.from(await output.arrayBuffer());
  const type = (output.headers.get('content-type') || data.output.type || '').split(';')[0];
  if (!extensions[type]) throw new Error('Tinify returned an unsupported image format.');
  await mkdir(path.dirname(cachePath), { recursive: true });
  await writeFile(cachePath, JSON.stringify({ type, sha256: sha256(bytes), base64: bytes.toString('base64') }));
  return { bytes, type, cached: false };
}

export async function uploadImage(settings, filename, template = settings.filenameTemplate) {
  if (!mimeTypes[path.extname(filename).toLowerCase()]) throw new Error('Supported image formats: PNG, JPEG and WebP.');
  // Check access and template before spending a Tinify compression.
  makeFilename(template, filename, Buffer.alloc(0));
  await checkBucket(settings);
  const input = await readFile(filename);
  const compressed = await compress(settings, input);
  const outputName = `${path.basename(filename, path.extname(filename))}.${extensions[compressed.type]}`;
  const key = makeFilename(template, outputName, compressed.bytes);
  const contentHash = sha256(compressed.bytes);
  const response = await r2(settings, 'PUT', key, compressed.bytes, {
    'content-type': compressed.type,
    'cache-control': 'public, max-age=31536000, immutable',
    'x-amz-meta-sha256': contentHash,
    'if-none-match': '*',
  });
  if (response.status === 412) {
    const existing = await r2(settings, 'HEAD', key);
    await requireR2(existing, 'collision check');
    if (existing.headers.get('x-amz-meta-sha256') !== contentHash) {
      throw new Error('Filename collision with different content. Use [timestamp] or a longer hash. Existing image was preserved.');
    }
  } else { await requireR2(response, 'upload'); }
  const url = `${settings.publicBaseUrl}/${encode(key)}`;
  const publicResponse = await request(url);
  if (!publicResponse.ok) throw new Error(`Image uploaded, but public URL returned HTTP ${publicResponse.status}: ${url}`);
  const delivered = Buffer.from(await publicResponse.arrayBuffer());
  if (sha256(delivered) !== contentHash) throw new Error(`Image uploaded, but public URL content differs from the uploaded file: ${url}`);
  return { source: path.resolve(filename), key, url, html: `<img src="${url}" alt="" loading="lazy" decoding="async">`,
    inputBytes: input.length, outputBytes: compressed.bytes.length,
    savedPercent: Number(((1 - compressed.bytes.length / input.length) * 100).toFixed(1)),
    sha256: contentHash, compressionCacheHit: compressed.cached, existingObjectReused: response.status === 412, publicVerified: true };
}

async function main() {
  const args = process.argv.slice(2);
  const command = args.shift();
  if (!command || command === '--help') {
    console.log('node scripts/image-host.mjs check\nnode scripts/image-host.mjs upload image.png [more.jpg] [--template "[name]_[hash:6].[ext]"] [--manifest output/images.json]');
    return;
  }
  if (!['check', 'upload'].includes(command)) throw new Error('Unknown command. Use check or upload.');
  let template, manifest;
  const files = [];
  while (args.length) {
    const arg = args.shift();
    if (arg === '--template' || arg === '--manifest') {
      const value = args.shift();
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${arg}.`);
      if (arg === '--template') template = value; else manifest = value;
    } else if (arg.startsWith('--')) throw new Error(`Unknown option: ${arg}`);
    else files.push(arg);
  }
  if (command === 'upload' && !files.length) throw new Error('Provide at least one image file.');
  const settings = await loadSettings();
  if (command === 'check') { console.log(JSON.stringify(await check(settings), null, 2)); return; }
  const results = [];
  for (const file of files) {
    results.push(await uploadImage(settings, file, template || settings.filenameTemplate));
    // Save after each upload so completed URLs survive a later failure.
    if (manifest) {
      await mkdir(path.dirname(path.resolve(manifest)), { recursive: true });
      await writeFile(manifest, JSON.stringify(results, null, 2) + '\n');
    }
    console.log(JSON.stringify(results.at(-1), null, 2));
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(`Image host: ${error.message}`); process.exitCode = 1; });
}
