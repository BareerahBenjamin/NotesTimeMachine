# 注疏时光机

注疏时光机是一个中国古代女性文学阅读站，收录西汉至清代的 17 部作品。读者可以从作者或作品进入原文，逐段对照不同时代的注疏，查看文献出处及核验状态。

[打开线上站点](https://zhushu-notes.pages.dev)

## 已实现功能

- **馆藏与阅读**。浏览书架和作者简介，按章节阅读原文、切换时代注疏、展开来源详情，并分享定位到段落的链接。夜读模式和减少动态效果偏好适用于阅读界面。
- **语义检索与 AI 解读**。跨书搜索可以跳到匹配段落。AI 解读由读者主动触发，Worker 提供原文和来源上下文，检查输出中的引文和归属。生成失败或校验未通过时，原文与注疏仍可阅读。
- **首次阅读体验**。完整体验需要一条核验原文与至少两条分属不同时代的核验注疏。缺少合格清单时，入口会引导读者浏览普通馆藏。
- **账号与社区**。支持注册、登录、发帖、评论、点赞，以及保存和恢复登录用户的阅读进度。旧版弱哈希账号可在维护者核验身份并签发恢复码后重置密码。
- **可选反馈与分析**。反馈入口支持文献纠错及阅读体验反馈。PostHog 行为分析由读者选择是否允许。两项默认关闭。

## 架构与目录

静态前端以原生 HTML、CSS 和 JavaScript ES Modules 实现，由 Cloudflare Pages 托管。前端调用 Cloudflare Worker 上的 Hono API。D1 保存账号、社区和阅读进度，R2 提供馆藏 JSON。语义搜索用 Workers AI 的 Qwen Embedding 生成 1024 维向量，经 Vectorize 找到段落，再从 R2 取回文本与注疏。AI 解读也使用 Workers AI。

| 路径 | 用途 |
| --- | --- |
| `index.html`、`privacy.html`、`css/`、`js/`、`images/` | 网站入口、隐私说明和静态资源 |
| `cf-worker/` | API、Wrangler 配置、D1 基础 Schema、可选反馈迁移、测试和发布脚本 |
| `knowledge_base/` | 馆藏元数据、原文与注疏、离线内容工具 |
| `tests/`、`evaluations/ai/` | 浏览器和分析测试、AI 评测样本及评分标准 |
| `config/`、`docs/`、`prototypes/` | 配置模板、维护资料及交互原型 |

站点样式、文字层级和动效入口见 [前端设计与排版](docs/V2-DESIGN.md)。

## 本地运行

需要 Node.js 22、npm 和 Python 3。在仓库根目录执行下面的命令，初始化本地 D1，导入《漱玉词》首章并启动 API。

```bash
cd cf-worker
npm ci
npm run db:init:local
npx wrangler r2 object put zhushu-knowledge-base/metadata/classics.json --local --file ../knowledge_base/metadata/classics.json
npx wrangler r2 object put zhushu-knowledge-base/content/shuyuci/shuyuci-01.json --local --file ../knowledge_base/content/shuyuci/shuyuci-01.json
npm run dev
```

在另一个终端进入仓库根目录，启动静态前端。

```bash
python3 -m http.server 8080 --bind 127.0.0.1
```

打开 [本地站点](http://127.0.0.1:8080)，在书架选择《漱玉词》。前端会连接 `http://localhost:8787` 的本地 API。其余章节可用同样的 `r2 object put --local` 命令导入，保持对象键结构。社区登录和注册需先设置 `JWT_SIGNING_KEY`。

D1 和 R2 在本地运行。Workers AI 调用使用远程服务和额度，Vectorize 在默认本地配置下不可用。无需调用真实模型即可运行下方的隔离测试。离线内容处理和评测工具按需安装 [Python 依赖](knowledge_base/requirements.txt)。

### 环境变量

| 配置 | 用途 |
| --- | --- |
| `ENVIRONMENT` | `npm run dev` 设为 `development`，Worker 发布配置使用 `production` |
| `JWT_SIGNING_KEY` | 账号签名需要由 32 字节安全随机数据生成的 64 位十六进制值。本地写入已忽略的 `cf-worker/.dev.vars`，部署环境使用 Cloudflare Worker Secret |
| `FEEDBACK_ENABLED`、`FEEDBACK_ALLOWED_ORIGINS` | Worker 开关和允许来源。启用前按反馈指南执行增量迁移，并设置独立的 `FEEDBACK_RATE_LIMIT_SECRET`、`FEEDBACK_ADMIN_TOKEN` |
| `ANALYTICS_ENABLED`、`ANALYTICS_ENVIRONMENT`、`POSTHOG_PROJECT_KEY`、`POSTHOG_API_HOST` | 生成 Pages 分析配置时使用。项目采集键会进入前端，私人 API 密钥不得填入此处。开发、预发与生产使用独立项目 |

绑定名和资源名见 [Wrangler 配置](cf-worker/wrangler.jsonc)。功能配置见 [反馈指南](docs/USER-FEEDBACK.md)、[反馈模板](config/feedback.example)、[分析指南](docs/PRODUCT-ANALYTICS.md) 和 [分析模板](config/analytics.example)。

## 测试与部署

```bash
# Worker 类型检查、测试和本地打包
cd cf-worker
npm run typecheck
npm test
npm run deploy -- --dry-run --outdir /tmp/ntm-worker-build
cd ..

# 前端逻辑与 Chrome 浏览器回归
node --experimental-default-type=module --test tests/analytics.mjs
node tests/browser-activation.cjs
NTM_ANALYTICS_TEST=true node tests/browser-activation.cjs
NTM_FEEDBACK_TEST=true node tests/browser-activation.cjs
```

浏览器脚本可通过 `CHROME_BIN` 指定 Chrome，三种模式应顺序运行。使用 `NTM_TEST_OUTPUT` 指定浏览器输出目录。部分 Worker 和前端单测也会写入 `docs/*-evidence/`，如需保留历史结果，请在独立副本运行。仓库目前没有独立 Lint 命令，Worker 使用 TypeScript 检查，静态前端无需编译。更多复现入口见 [发布 QA](docs/V2-RELEASE-QA.md) 和 [AI 评测标准](evaluations/ai/RUBRIC.md)。

GitHub Actions 的 `V2 checks` 会验证 PR。仅更新前端且未启用自动发布时，可从已合并的提交运行 `node cf-worker/scripts/deploy-pages.mjs --prepare-only` 检查工件，再以 `BRANCH=main node cf-worker/scripts/deploy-pages.mjs` 发布 `zhushu-notes`。Pages 的 `/release.json` 记录实际发布的提交。预览域名默认使用同源 API，需要为预览配置独立 API 路由。

同时更新 Worker 和 Pages 时，可从 `main` 运行 `Deploy zhushu-notes` 工作流。工作流使用 GitHub `production` 环境的 Cloudflare 账号变量和部署 Token，并通过 Worker 的 `/api/health` 核对版本。启用合并后自动发布由 `AUTO_DEPLOY_PRODUCTION` 控制。发布前核对资源绑定、签名 Secret 和回退版本。 [生产发布记录](docs/V2-PRODUCTION-RELEASE.md)

## 已知限制与优化方向

- 普通馆藏包含待核验资料。完整首次体验依赖部署环境提供人工审核后的 R2 清单。优先补齐来源版本、卷页定位和人工审读记录。 [知识库结构](knowledge_base/design.md) · [首次阅读体验](docs/USER-ACTIVATION-V2.md)
- AI 和语义检索依赖 Workers AI 与索引服务。自动引用校验覆盖引文匹配和归属，文学解释仍需独立审读。仓库当前缺少可运行的 Vectorize 索引重建脚本。 [AI 验收记录](docs/AI-RELEASE-READINESS.md)
- 浏览器夹具覆盖交互和受控故障。发布验收仍需核对真机字体与输入法、真实服务绑定、模型可用性和线上稳定性。 [发布 QA](docs/V2-RELEASE-QA.md)
