#!/usr/bin/env node
import { cpSync, existsSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const SCRIPT_DIR = resolve(import.meta.dirname ?? process.cwd());
const WORKER_DIR = resolve(SCRIPT_DIR, '..');
const PROJECT_ROOT = resolve(WORKER_DIR, '..');

const INCLUDE_GLOBS_ROOT = [
  'index.html',
  'favicon.ico',
  'robots.txt',
  'site.webmanifest',
];

const INCLUDE_DIRS = [
  'css',
  'js',
  'assets',
  'fonts',
  'images',
  'img',
  'icons',
];

function copyIfExists(relPath, dest) {
  const src = join(PROJECT_ROOT, relPath);
  if (!existsSync(src)) return 0;
  const st = statSync(src);
  const dst = join(dest, relPath);
  if (st.isDirectory()) {
    cpSync(src, dst, { recursive: true, dereference: true });
    console.log(`  ✅ 目录  ${relPath}/`);
    return 1;
  }
  cpSync(src, dst, { dereference: true });
  console.log(`  ✅ 文件  ${relPath}`);
  return 1;
}

function main() {
  console.log('\n📦 准备 Pages 部署工件（只包含前端静态文件）...\n');

  const tmp = mkdtempSync(join(tmpdir(), 'zhushu-pages-'));
  try {
    let copied = 0;
    for (const f of INCLUDE_GLOBS_ROOT) copied += copyIfExists(f, tmp);
    for (const d of INCLUDE_DIRS) copied += copyIfExists(d, tmp);

    if (copied === 0) {
      console.error('❌ 没有找到任何可部署的前端文件');
      process.exit(1);
    }

    console.log(`\n🚀 开始部署 Pages（项目名: zhushu-notes）...\n`);

    const args = ['pages', 'deploy', tmp, '--project-name', 'zhushu-notes'];
    const branch = process.env.BRANCH;
    if (branch) args.push('--branch', branch);

    const res = spawnSync('npx', ['wrangler', ...args], {
      cwd: PROJECT_ROOT,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
    process.exit(res.status ?? 1);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

main();
