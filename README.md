# 注疏时光机

**Women's Classical Literature Through Time**

点击任一句古籍原文，展开从汉代到现代的注疏时间轴，看千年学术对话如何诠释她们的才华。

一个专注于中国历代女性古典文学的交互式注疏阅读平台。收录从西汉到清代 **17 部**女性文学作品，以时间轴可视化展示历代学者的注疏演变，并结合 Workers AI 生成思想史脉络分析。

---

## 收录作品

| 朝代 | 作者 | 作品 | 类别 |
|------|------|------|------|
| 西汉 | 班婕妤 | 《怨歌行》 | 诗歌 |
| 西汉 | 卓文君 | 《白头吟》 | 诗歌 |
| 东汉 | 班昭 | 《女诫》 | 女训 |
| 东汉 | 蔡文姬 | 《悲愤诗》 | 诗歌 |
| 东晋 | 谢道韫 | 《泰山吟》 | 诗歌 |
| 唐代 | 上官婉儿 | 《彩书怨》 | 诗歌 |
| 唐代 | 薛涛 | 《薛涛诗》 | 诗歌 |
| 唐代 | 李冶 | 《李冶诗》 | 诗歌 |
| 唐代 | 徐惠 | 《拟小山篇》 | 诗歌 |
| 唐代 | 刘采春 | 《刘采春曲》 | 曲 |
| 唐代 | 鱼玄机 | 《鱼玄机诗》 | 诗歌 |
| 五代十国 | 花蕊夫人 | 《宫词》 | 诗歌 |
| 宋代 | 魏玩 | 《魏夫人词》 | 词 |
| 宋代 | 李清照 | 《漱玉词》 | 词 |
| 宋代 | 朱淑真 | 《朱淑真词》 | 词 |
| 明代 | 黄峨 | 《黄峨散曲》 | 曲 |
| 清代 | 顾太清 | 《东海渔歌》 | 词 |

---

## 功能特性

**注疏时间轴** — 点击任意句子，在时间轴上查看从汉代到现代历代学者对该句的注解与评论，按朝代用不同颜色标注。支持按朝代筛选（汉、魏晋、唐、宋、明、清、现代）。

**AI 思想史分析** — 选中句子后自动生成历代注疏演变脉络的综合解读。每条注疏还支持单独的「AI 解读」按钮，获取针对该条注疏的深度阐释。

**跨书语义搜索** — 基于 Cloudflare Vectorize 向量检索 + Workers AI 中文 Embedding，在全部 17 部作品中搜索语义相近的内容。搜索结果可直接跳转到对应段落。

**个人主页** — 每位用户拥有独立个人主页，展示个人资料、获赞与发帖统计、读书进度（带进度条）与发帖记录。可从帖子作者昵称、评论作者、用户菜单「我的主页」入口跳转。

**读书进度自动记录** — 登录后在读书页翻章或选段会自动节流保存阅读进度（`chapter_index`、`paragraph_id`、`progress_pct`）。在个人主页点击进度卡片可直接跳转到上次阅读的章节段落。

**作者详情** — 17 位作者的生平简介、代表作品、经典评语，以卡片和弹窗形式展示。

**社区讨论** — 内置论坛系统，支持用户注册登录、发帖、评论、点赞、分类筛选。

**深色模式** — 明暗主题一键切换，导航栏、移动端菜单、卡片均适配暗色配色，偏好自动保存到 localStorage。

**响应式设计** — 桌面端与移动端自适应，移动端有独立的汉堡菜单导航。

---

## 技术栈

### 前端

纯静态站点，无构建步骤，通过 Cloudflare Pages 部署。

- HTML5 / CSS3（CSS 自定义属性、Grid、Flexbox、明暗主题 CSS 变量覆盖）
- 原生 JavaScript（ES 模块，统一的 `document` 事件委托模式，避免动态 DOM 后事件丢失）
- [marked.js](https://github.com/markedjs/marked) — Markdown 渲染
- Google Fonts（Noto Serif SC + ZCOOL XiaoWei）

### 后端（Cloudflare 全家桶，替换原 Flask/ChromaDB/SQLite/Supabase）

- **Cloudflare Workers + Hono** — API 服务（处理 `/api/*` 路由、CORS 原点反射、JWT 鉴权）
- **Cloudflare R2** — 知识库 JSON 存储（`content/` 章节内容、`metadata/` 元数据）
- **Cloudflare D1** — 社区关系数据库（users、posts、comments、likes、categories、reading_progress）
- **Cloudflare Vectorize**（维度 1024）— 语义向量索引
- **Workers AI** — Embedding（`@cf/qwen/qwen3-embedding-0.6b` / `@cf/baai/bge-m3`）与文本生成（`@cf/meta/llama-3.2-3b-instruct` 为主链，配合多模型 fallback）
- **Cloudflare Pages** — 前端静态托管
- **jose** — JWT 签发与校验（替代 `hono/jwt`，支持无状态会话）
- **Wrangler 4.x** — 本地开发与部署（支持中文 BGE Vectorize 预设）

### 离线内容构建（Python，仅用于生成知识库 JSON）

- Python 3.10+ — 爬取 / 生成内容、清洗注疏、构建 `content/*.json` 与 `metadata/*.json`
- 构建产物通过 `cf-worker/scripts/upload-r2.mjs` 上传到 R2（而非打包进 Pages）

---

## 快速开始（本地开发）

### 前置条件

- 注册 Cloudflare 账号，开通 Workers / R2 / D1 / Vectorize / Pages
- 安装 Node.js 18+，并全局或项目内使用 Wrangler 4.x
- Python 3.10+（仅当需要重新构建知识库 JSON 时）

### 步骤 1 — 创建 Cloudflare 资源（首次）

```bash
cd cf-worker
npm install

# 1) R2 存储桶
npx wrangler r2 bucket create zhushu-knowledge

# 2) D1 数据库
npx wrangler d1 create zhushu-community
# 把输出的 database_id 填到 cf-worker/wrangler.jsonc

# 3) Vectorize 向量索引（必须 1024 维以匹配 Embedding 模型）
npx wrangler vectorize create zhushu-annotations --dimensions=1024 --metric=cosine --preset=@cf/baai/bge-m3
```

### 步骤 2 — 初始化 D1 表

```bash
cd cf-worker
npx wrangler d1 execute zhushu-community --remote --file=./schema.sql
```

### 步骤 3 — 上传知识库 JSON 到 R2

```bash
cd cf-worker
node scripts/upload-r2.mjs --remote
```

### 步骤 4 — 设置 JWT 密钥

```bash
cd cf-worker
npx wrangler secret put JWT_SECRET --remote
# 输入一段高强度随机字符串
```

### 步骤 5 — 本地开发（Worker + 前端静态资源）

```bash
cd cf-worker
npx wrangler dev --remote
```

> 所有 AI / Vectorize / R2 / D1 绑定在 `wrangler.jsonc` 中均配置了 `"remote": true`，本地 `wrangler dev` 会直接使用云端资源。

浏览器访问 `http://localhost:8787`。

### 步骤 6 — 本地验证接口

```bash
curl http://localhost:8787/api/health
curl -X POST http://localhost:8787/api/query -H 'Content-Type: application/json' -d '{"query":"相思","top_k":3}'
```

### 离线模式（不启动 Worker）

即使不启动 Worker，前端也能正常显示界面，并降级为演示模式（展示李清照《如梦令》的一个段落及预置注疏），方便静态页面 UI 开发。

---

## 部署

### 部署后端 Worker

```bash
cd cf-worker
npx wrangler deploy
```

部署成功后会得到 Worker 域名，例如：`https://zhushu-notes-api.你的用户名.workers.dev`。

把 `js/config.js` 中的 `WORKERS_PROD_URL` 改成实际的 Worker 域名。

### 构建 / 重建 Vectorize 向量索引

如果后续更换了 Embedding 模型或 `knowledge_base/content/` 有新增内容：

```bash
cd cf-worker
# 分批重建（避免 Free 计划 50 subrequest 限制）
curl -X POST "https://<你的-worker>/api/_rebuild_vectorize?start=0&limit=30"
# 根据返回的 next_cursor 继续下一批，直到返回 has_more=false
```

### 部署前端 Pages

项目提供了自动排除大文件的部署脚本（通过临时目录 + `.pagesignore` 策略，避免 25 MiB 单文件限制）：

```bash
# 在项目根目录执行
node cf-worker/scripts/deploy-pages.mjs
```

> 脚本会自动复制 `index.html`、`css/`、`js/`、`images/` 到临时目录，然后调用 `wrangler pages deploy`，避免把 `knowledge_base/embeddings/chroma/chroma.sqlite3` 这类大文件送进 Pages。

首次部署会得到 Pages 预览域名，可在 Cloudflare Pages 控制台绑定自定义域名。

---

## 项目结构

```
注疏时光机/
├── index.html                 # 单页应用入口（header / 5 个 page / footer / 脚本引入）
├── css/                       # 样式（模块化，main.css 统一 @import）
│   ├── main.css               # 主样式（通过 URL query 版本号刷新浏览器缓存）
│   ├── variables.css          # CSS 自定义属性（浅色 + [data-theme="dark"] 暗色覆盖）
│   ├── reset.css
│   ├── header.css             # 头部导航、主题按钮、用户菜单、移动端汉堡
│   ├── hero.css
│   ├── pages.css
│   ├── bookshelf.css
│   ├── reader.css
│   ├── authors.css
│   ├── search.css
│   ├── components.css
│   ├── sections.css           # 个人主页、Tab、进度条、卡片、footer
│   ├── animations.css
│   ├── responsive.css
│   └── community.css
├── js/                        # 原生 ES Modules
│   ├── main.js                # 入口：导航、主题切换、初始化、document 级事件委托
│   ├── config.js              # API_BASE / BOOKS / BOOK_NAMES / AUTHOR_DATA / DEMO_DATA
│   ├── state.js               # 全局状态：currentBook、navigateTo、pendingRead、getCurrentUserId
│   ├── api.js                 # 知识库 API（章节、段落、analyze、query、interpret）
│   └── ui/
│       ├── reader.js          # 段落渲染、章节切换、选段、节流保存阅读进度
│       ├── timeline.js        # 注疏时间轴朝代筛选 / 展开收起
│       ├── bookshelf.js
│       ├── aiPanel.js         # AI 分析 Markdown 面板
│       ├── search.js          # 首页 / 阅读页双重语义搜索输入框，活动查询探测
│       ├── authorCards.js
│       ├── bookDetail.js
│       ├── community.js       # 帖子列表 / 详情 / 评论 / 分类 / 分页（事件委托）
│       ├── communityApi.js    # 社区 + 个人主页 API（基于 API_BASE 绝对路径）
│       └── profile.js         # 个人主页：资料卡 / 读书进度列表 + 进度条 / 发帖记录 Tab
├── images/                    # logo、作者头像、站点图标
├── knowledge_base/            # 纯内容构建 Python 工程，不参与线上运行
│   ├── metadata/              # classics.json, authors.json（上传到 R2 的 metadata/）
│   ├── content/               # 每部书一个子目录，每章一个 JSON（上传到 R2 的 content/）
│   ├── scripts/               # 爬取 / 生成 / 清洗 / Embedding 构建（仅离线使用）
│   └── embeddings/            # 旧 ChromaDB 产物（不上传 Git / Pages，仅本地参考）
├── cf-worker/                 # Cloudflare Workers 后端
│   ├── package.json           # wrangler、hono、jose
│   ├── wrangler.jsonc         # Worker 配置：名称、入口、所有 binding（R2/D1/Vectorize/AI）
│   ├── schema.sql             # D1 表结构：users/posts/comments/likes/categories/reading_progress
│   ├── src/
│   │   ├── index.ts           # Hono 入口 + CORS + /api 路由分发 + 非 API 404
│   │   └── routes/
│   │       ├── knowledge.ts   # 知识库：/api/classics、chapters、paragraphs
│   │       ├── community.ts   # 社区 + 个人主页 + 读书进度 API
│   │       └── ai.ts          # AI 文本分析、语义搜索、注疏解读（模型 fallback 链）
│   └── scripts/
│       ├── upload-r2.mjs      # 批量上传 knowledge_base/{content,metadata} 到 R2
│       └── deploy-pages.mjs   # 部署前端 Pages（排除大文件，临时目录策略）
├── .pagesignore               # Pages 部署忽略：node_modules、knowledge_base、.wrangler 等
├── .gitignore
└── README.md
```

---

## API 端点

所有接口都挂在 Worker 的 `/api/*` 下；前端 `js/config.js` 根据是否 `localhost` 自动选择 `API_BASE`。

### 知识库

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/health` | 健康检查，返回 `{ rag_available, postgres_available, vectorize_available }` 等 |
| GET | `/api/classics` | 全部 17 部作品元数据（`classics.json`） |
| GET | `/api/chapters/<classic_id>` | 某作品的章节列表（按 `chapter_id` 中文排序） |
| GET | `/api/paragraphs/<chapter_id>` | 某章节的段落及该段落下的注疏 ID 列表 |
| GET | `/api/paragraph/<paragraph_id>` | 某段落详情 + 该段落所有注疏完整内容 |
| POST | `/api/analyze` | AI 注疏综合分析，Body：`{"paragraph_id": "..."}` |
| POST | `/api/query` | 语义搜索，Body：`{"query": "...", "top_k": 5}` |
| POST | `/api/annotation/interpret` | 单条注疏 AI 解读，Body：`{"content": "...", "era": "...", "author": "..."}` |

### 社区 / 个人主页

| 方法 | 路径 | 鉴权 | 说明 |
|------|------|------|------|
| POST | `/api/community/register` | | 注册：`username, password, nickname?`，返回 JWT |
| POST | `/api/community/login` | | 登录：`username, password`，返回 JWT + user |
| GET  | `/api/community/user` | Bearer | 当前登录用户资料 |
| GET  | `/api/community/categories` | | 分类列表 |
| GET  | `/api/community/posts` | | 帖子列表（`page, per_page, category_id`） |
| POST | `/api/community/posts` | Bearer | 发帖：`title, content, category_id` |
| GET  | `/api/community/posts/:id` | | 帖子详情 + 评论列表 |
| DELETE | `/api/community/posts/:id` | Bearer | 删除自己的帖子 |
| POST | `/api/community/posts/:id/comments` | Bearer | 评论 |
| DELETE | `/api/community/comments/:id` | Bearer | 删除自己的评论 |
| POST | `/api/community/posts/:id/like` | Bearer | 点赞 / 取消点赞 |
| GET  | `/api/community/users/:id` | | 个人主页资料统计（在读古籍数、发帖数、获赞、阅读量、评论数） |
| GET  | `/api/community/users/:id/posts` | | 该用户发帖记录（分页） |
| GET  | `/api/community/users/:id/reading-progress` | | 该用户读书进度列表 |
| POST | `/api/community/me/reading-progress` | Bearer | 更新自己的阅读进度（`classic_id, chapter_index, progress_pct, paragraph_id?`） |

### 运维（临时）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/_rebuild_vectorize?start=0&limit=30` | 重建 Vectorize 索引（游标分页，每次最多 30 条避开 Free 计划 subrequest 限制）|

---

## 重新生成 / 构建知识库内容

```bash
cd knowledge_base
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
# 按实际脚本生成 content/ 与 metadata/
python scripts/<对应构建脚本>.py
```

构建完成后重新上传 R2 并重建 Vectorize：

```bash
cd ../cf-worker
node scripts/upload-r2.mjs --remote
# 然后分批次 POST /api/_rebuild_vectorize
```

---

## 已弃用的架构（历史参考）

项目早期使用过以下组件，均已在 2026-07 迁移到 Cloudflare 全家桶，相关代码与 DEPLOY.md 已删除：

- Supabase Storage / PostgreSQL / Auth / Edge Functions
- 阿里云函数计算 + Python Flask（api_server.py、handler.py 等）
- 本地 ChromaDB（`knowledge_base/embeddings/chroma/chroma.sqlite3`，仅保留目录作离线备份，不参与部署）
- `hono/jwt` 鉴权中间件（已替换为 `jose`，统一签发与校验）

---

## 许可证

MIT
