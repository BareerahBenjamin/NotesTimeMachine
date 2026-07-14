#!/usr/bin/env node
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { copyFileSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const Jimp = require('jimp');
const jimp = Jimp.default ?? Jimp.Jimp ?? Jimp;

const WORKER_DIR = resolve(__dirname, '..');
const PROJECT_ROOT = resolve(WORKER_DIR, '..');
const ICON_PATH = resolve(PROJECT_ROOT, 'images', 'icon.png');
const BACKUP_PATH = resolve(PROJECT_ROOT, 'images', 'icon-original.png');

const TOLERANCE = 30;
const FEATHER_TOLERANCE = 55;

function colorDist(a, b) {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function sampleBgColor(image) {
  const w = image.getWidth();
  const h = image.getHeight();
  const samples = [];
  const corners = [
    [0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1],
    [Math.floor(w / 2), 0], [Math.floor(w / 2), h - 1],
    [0, Math.floor(h / 2)], [w - 1, Math.floor(h / 2)],
  ];
  for (const [x, y] of corners) {
    const c = jimp.intToRGBA(image.getPixelColor(x, y));
    samples.push(c);
  }
  const center = { r: 0, g: 0, b: 0 };
  for (const s of samples) {
    center.r += s.r;
    center.g += s.g;
    center.b += s.b;
  }
  center.r = Math.round(center.r / samples.length);
  center.g = Math.round(center.g / samples.length);
  center.b = Math.round(center.b / samples.length);
  console.log(`\n检测到背景色 (四角+四边中点平均): rgb(${center.r},${center.g},${center.b})`);
  return center;
}

async function main() {
  console.log(`读取图标: ${ICON_PATH}`);
  copyFileSync(ICON_PATH, BACKUP_PATH);
  console.log(`备份原图 → ${BACKUP_PATH}\n`);

  const image = await jimp.read(ICON_PATH);
  const w = image.getWidth();
  const h = image.getHeight();
  const bg = sampleBgColor(image);

  let removed = 0;
  let feathered = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = image.getPixelIndex(x, y);
      const rgba = jimp.intToRGBA(image.bitmap.data.readUInt32BE(idx));
      const d = colorDist(rgba, bg);
      if (d <= TOLERANCE) {
        image.bitmap.data[idx + 3] = 0;
        removed++;
      } else if (d <= FEATHER_TOLERANCE) {
        const t = (d - TOLERANCE) / (FEATHER_TOLERANCE - TOLERANCE);
        const alpha = Math.max(0, Math.min(255, Math.round((rgba.a ?? 255) * t)));
        image.bitmap.data[idx + 3] = alpha;
        feathered++;
      }
    }
  }

  await image.writeAsync(ICON_PATH);
  const total = w * h;
  const pct = ((removed + feathered) / total * 100).toFixed(1);
  console.log(`完成! 共处理 ${total} 像素:`);
  console.log(`  ✅ 完全透明: ${removed} 像素`);
  console.log(`  🌫  渐变边缘: ${feathered} 像素`);
  console.log(`  📐 合计占比: ${pct}%`);
  console.log(`\n输出覆盖: ${ICON_PATH}`);
  console.log(`原图备份: ${BACKUP_PATH} (可随时恢复)\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
