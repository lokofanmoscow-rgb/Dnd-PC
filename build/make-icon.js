/* Генерация иконки приложения (build/icon.png и build/icon.ico) через Playwright.
   Запуск: node build/make-icon.js  (нужен пакет playwright) */
const path = require('path');
const fs = require('fs');

const HTML = `<!doctype html><html><body style="margin:0;background:transparent">
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <radialGradient id="g" cx="50%" cy="40%" r="65%">
      <stop offset="0" stop-color="#d94a3a"/><stop offset="0.7" stop-color="#8e1f17"/><stop offset="1" stop-color="#4a0d09"/>
    </radialGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffe9a8"/><stop offset="1" stop-color="#c9952f"/>
    </linearGradient>
  </defs>
  <polygon points="256,14 466,135 466,377 256,498 46,377 46,135" fill="url(#g)" stroke="url(#gold)" stroke-width="20" stroke-linejoin="round"/>
  <polygon points="256,110 384,330 128,330" fill="rgba(255,255,255,0.10)" stroke="rgba(255,233,168,0.85)" stroke-width="10" stroke-linejoin="round"/>
  <line x1="256" y1="14" x2="256" y2="110" stroke="rgba(255,233,168,0.6)" stroke-width="8"/>
  <line x1="466" y1="135" x2="384" y2="330" stroke="rgba(255,233,168,0.6)" stroke-width="8"/>
  <line x1="46" y1="135" x2="128" y2="330" stroke="rgba(255,233,168,0.6)" stroke-width="8"/>
  <line x1="256" y1="498" x2="128" y2="330" stroke="rgba(255,233,168,0.6)" stroke-width="8"/>
  <line x1="256" y1="498" x2="384" y2="330" stroke="rgba(255,233,168,0.6)" stroke-width="8"/>
  <text x="256" y="292" text-anchor="middle" font-family="Georgia, serif" font-weight="bold" font-size="150" fill="url(#gold)" stroke="#3a0a06" stroke-width="6">20</text>
</svg></body></html>`;

function pngToIco(pngs) {
  // ICO с PNG-кадрами (поддерживается Windows Vista и новее)
  const count = pngs.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(count, 4);
  const entries = [];
  let offset = 6 + 16 * count;
  for (const { size, data } of pngs) {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0);
    e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt8(0, 2);
    e.writeUInt8(0, 3);
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(data.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += data.length;
    entries.push(e);
  }
  return Buffer.concat([header, ...entries, ...pngs.map((p) => p.data)]);
}

(async () => {
  const { chromium } = require('playwright');
  const browser = await chromium.launch();
  const out = [];
  for (const size of [512, 256, 128, 64, 48, 32, 16]) {
    const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
    await page.setContent(HTML.replace('width="512" height="512"', `width="${size}" height="${size}"`));
    const buf = await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
    if (size === 512) fs.writeFileSync(path.join(__dirname, 'icon.png'), buf);
    else out.push({ size, data: buf });
    await page.close();
  }
  fs.writeFileSync(path.join(__dirname, 'icon.ico'), pngToIco(out));
  await browser.close();
  console.log('icon.png и icon.ico созданы');
})();
