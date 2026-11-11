#!/usr/bin/env node
import { copyFileSync, lstatSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { writeAnalyticsConfig } from '../../scripts/configure-analytics.mjs';

const WORKER_DIR = resolve(import.meta.dirname, '..');
const PROJECT_ROOT = resolve(WORKER_DIR, '..');
const STATIC_PATHS = [
  'index.html', 'privacy.html', 'favicon.ico', 'robots.txt', 'site.webmanifest',
  'css', 'js', 'assets', 'fonts', 'images', 'img', 'icons',
];

async function main() {
  const { values } = parseArgs({
    options: {
      'prepare-only': { type: 'boolean' },
      'output-directory': { type: 'string' },
    },
  });
  const prepareOnly = values['prepare-only'];
  const outputDirectory = values['output-directory'];
  if (outputDirectory && !prepareOnly) {
    throw new Error('--output-directory requires --prepare-only.');
  }

  const git = (...args) => execFileSync('git', args, { cwd: PROJECT_ROOT, encoding: 'utf8' });
  const branch = process.env.BRANCH || git('branch', '--show-current').trim();
  if (!branch) throw new Error('设置 BRANCH，明确 Pages 部署分支。');
  const dirty = git('status', '--porcelain', '--', ...STATIC_PATHS, 'knowledge_base/metadata',
    'scripts/configure-analytics.mjs', 'cf-worker/scripts/deploy-pages.mjs');
  if (dirty) throw new Error('提交所有 Pages 构建输入后再部署。');

  if (process.env.ANALYTICS_ENABLED === 'true' &&
      (branch === 'main') !== (process.env.ANALYTICS_ENVIRONMENT === 'production')) {
    throw new Error('Pages 分支和 PostHog 数据环境不匹配。');
  }

  const commit = git('rev-parse', 'HEAD').trim();
  const assets = git('ls-tree', '-rz', '--name-only', commit, '--', ...STATIC_PATHS).split('\0').filter(Boolean);
  if (!assets.includes('index.html')) throw new Error('Pages 工件缺少 index.html。');
  const output = outputDirectory ? resolve(outputDirectory) : mkdtempSync(join(tmpdir(), 'zhushu-pages-'));
  if (outputDirectory) mkdirSync(output);
  let keepOutput = false;
  try {
    for (const asset of assets) {
      const source = join(PROJECT_ROOT, asset);
      const destination = join(output, asset);
      if (!lstatSync(source).isFile()) throw new Error('Pages 工件只允许普通文件：' + asset);
      mkdirSync(dirname(destination), { recursive: true });
      copyFileSync(source, destination);
    }
    await writeAnalyticsConfig(output);
    writeFileSync(join(output, 'release.json'), JSON.stringify({ commit }) + '\n');
    console.log('Pages 工件就绪，提交 ' + commit + '，分支 ' + branch + '，静态文件 ' + assets.length + ' 项。');
    if (prepareOnly) {
      keepOutput = Boolean(outputDirectory);
      return;
    }

    const wrangler = join(WORKER_DIR, 'node_modules/wrangler/bin/wrangler.js');
    const result = spawnSync(process.execPath, [
      wrangler, 'pages', 'deploy', output, '--project-name', 'zhushu-notes',
      '--branch', branch, '--commit-hash', commit, '--commit-dirty=false',
    ], { cwd: WORKER_DIR, stdio: 'inherit' });
    if (result.error) throw result.error;
    process.exitCode = result.status ?? 1;
  } finally {
    if (!keepOutput) rmSync(output, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
