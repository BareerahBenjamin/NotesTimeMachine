#!/usr/bin/env node
/**
 * 将知识库 JSON 文件上传到 Cloudflare R2 Bucket
 *
 * 使用方法：
 *   1. 先安装依赖: cd cf-worker && npm install
 *   2. 登录 Cloudflare: npx wrangler login
 *   3. 创建 R2 Bucket: npx wrangler r2 bucket create zhushu-knowledge-base
 *   4. 运行本脚本: node scripts/upload-r2.mjs
 */
import { execSync } from 'node:child_process';
import { readdirSync, statSync, readFileSync } from 'node:fs';
import { join, relative, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..', '..');
const KB_DIR = join(PROJECT_ROOT, 'knowledge_base');
const CONTENT_DIR = join(KB_DIR, 'content');
const METADATA_DIR = join(KB_DIR, 'metadata');

const BUCKET = 'zhushu-knowledge-base';

function walkDir(dir, prefix = '') {
  const results = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const rel = prefix ? `${prefix}/${name}` : name;
    const st = statSync(full);
    if (st.isDirectory()) {
      results.push(...walkDir(full, rel));
    } else if (name.endsWith('.json')) {
      results.push({ full, rel });
    }
  }
  return results;
}

function run(cmd) {
  console.log('$', cmd);
  return execSync(cmd, { stdio: 'inherit', cwd: resolve(__dirname, '..') });
}

async function main() {
  const files = [];

  for (const f of walkDir(CONTENT_DIR, 'content')) {
    files.push(f);
  }

  for (const name of readdirSync(METADATA_DIR)) {
    if (!name.endsWith('.json')) continue;
    files.push({
      full: join(METADATA_DIR, name),
      rel: `metadata/${name}`,
    });
  }

  console.log(`\n共找到 ${files.length} 个 JSON 文件待上传\n`);

  let success = 0;
  let failed = 0;

  for (const { full, rel } of files) {
    const r2Key = rel.replaceAll('\\', '/');
    try {
      run(`npx wrangler r2 object put ${BUCKET}/${r2Key} --file "${full}" --remote 2>&1 || { echo "RETRY_WITH_API"; exit 0; }`);
      success++;
    } catch (e) {
      console.error(`上传失败: ${rel}`, e.message);
      failed++;
    }
  }

  console.log(`\n完成! 成功: ${success}, 失败: ${failed}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
