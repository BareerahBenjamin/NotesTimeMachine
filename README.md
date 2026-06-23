# 注疏时光机

**Women's Classical Literature Through Time**

点击任一句古籍原文，展开从汉代到现代的注疏时间轴，看千年学术对话如何诠释她们的才华。

一个专注于中国历代女性古典文学的交互式注疏阅读平台。收录从西汉到清代 **17 部**女性文学作品，以时间轴可视化展示历代学者的注疏演变，并结合 AI 技术生成思想史脉络分析。

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

**跨书语义搜索** — 基于 ChromaDB 向量检索，在全部 17 部作品中搜索语义相近的内容。搜索结果可直接跳转到对应段落。

**作者详情** — 17 位作者的生平简介、代表作品、经典评语，以卡片和弹窗形式展示。

**社区讨论** — 内置论坛系统，支持用户注册登录、发帖、评论、点赞。

**深色模式** — 明暗主题一键切换，偏好自动保存到 localStorage。

**响应式设计** — 桌面端与移动端自适应，移动端有独立的汉堡菜单导航。

---

## 技术栈

### 前端

纯静态站点，无构建步骤，无 package.json。

- HTML5 / CSS3（CSS 自定义属性、Grid、Flexbox）
- 原生 JavaScript（ES 模块，事件委托模式）
- [marked.js](https://github.com/markedjs/marked) — Markdown 渲染
- Google Fonts（Noto Serif SC + ZCOOL XiaoWei）

### 后端

- Python 3.10+ / Flask / Flask-CORS
- [ChromaDB](https://www.trychroma.com/) — 向量数据库，存储段落和注疏的 Embedding
- OpenAI 兼容 API — 用于 Embedding 生成和文本分析
- SQLite — 社区功能数据存储

---

## 快速开始

### 前端

前端是纯静态文件，但 ES 模块需要通过 HTTP 服务访问，不能直接用 `file://` 打开。

```bash
# 在项目根目录启动任意 HTTP 服务器
python3 -m http.server 8000
```

浏览器访问 `http://localhost:8000`。

### 后端

```bash
cd knowledge_base

# 创建虚拟环境并安装依赖
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt

# 构建向量数据库（写入 embeddings/chroma/）
python scripts/build_knowledge_base.py

# 启动 API 服务（必须使用 5001 端口以匹配前端）
PORT=5001 python scripts/api_server.py
```

> 前端在 `localhost` 环境下会自动连接 `http://localhost:5001`，无需额外配置。

### 环境变量

在 `knowledge_base/.env` 中配置：

```
OPENAI_API_KEY=your_api_key
OPENAI_BASE_URL=https://api.example.com/v1
OPENAI_MODEL=your_model
EMBEDDING_MODEL=text-embedding-3-small
```

> **注意**：`build_knowledge_base.py` 和 `query_service.py` 中的 Embedding 模型必须一致，否则语义搜索会失效。

### 离线模式

即使不启动后端，前端也能正常运行。应用会自动降级为演示模式，展示李清照《如梦令》的一个段落及预置注疏。

---

## 项目结构

```
注疏时光机/
├── index.html                 # 单页应用入口
├── css/                       # 样式（15 个模块化文件）
│   ├── main.css               # 主样式（@import 其他模块）
│   ├── variables.css           # CSS 自定义属性（颜色、字体、间距）
│   ├── reset.css               # 基础重置与排版
│   ├── header.css              # 头部导航
│   ├── hero.css                # 首页英雄区
│   ├── pages.css               # 页面容器切换
│   ├── bookshelf.css           # 书架样式
│   ├── reader.css              # 阅读器样式
│   ├── authors.css             # 作者卡片与详情弹窗
│   ├── search.css              # 搜索栏
│   ├── components.css          # 通用组件
│   ├── sections.css            # 区块标题
│   ├── animations.css          # 关键帧动画
│   ├── responsive.css          # 移动端适配（768px）
│   └── community.css           # 社区论坛样式
├── js/                        # JavaScript 模块（ES Modules）
│   ├── main.js                # 入口：事件委托、主题、导航
│   ├── config.js              # 配置、书目数据、作者资料
│   ├── state.js               # 全局状态管理
│   ├── api.js                 # API 请求封装
│   └── ui/                    # UI 组件
│       ├── reader.js          # 阅读器（段落渲染、章节导航）
│       ├── timeline.js        # 注疏时间轴（朝代筛选、展开收起）
│       ├── bookshelf.js       # 书架（书脊渲染）
│       ├── aiPanel.js         # AI 分析面板（Markdown 渲染）
│       ├── search.js          # 语义搜索
│       ├── authorCards.js     # 作者卡片与详情弹窗
│       ├── bookDetail.js      # 作品详情弹窗
│       ├── community.js       # 社区页面
│       └── communityApi.js    # 社区 API 请求
├── images/                    # 图片资源
└── knowledge_base/            # Python RAG 后端
    ├── .env                   # API 密钥配置
    ├── requirements.txt       # Python 依赖
    ├── content/               # 作品内容 JSON（17 个目录）
    ├── metadata/              # 元数据（classics.json, authors.json）
    ├── embeddings/chroma/     # ChromaDB 向量存储
    ├── community.db           # 社区 SQLite 数据库
    └── scripts/
        ├── api_server.py                # Flask API 服务（端口 5001）
        ├── build_knowledge_base.py      # 构建向量库
        ├── query_service.py             # RAG 查询服务
        ├── generate_female_classics.py  # 内容生成
        ├── community_db.py              # 社区数据库操作
        └── community_routes.py          # 社区 API 路由
```

---

## API 端点

### 知识库

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/health` | 健康检查，返回 `rag_available` 状态 |
| GET | `/api/classics` | 获取全部 17 部作品元数据 |
| GET | `/api/chapters/<classic_id>` | 获取某作品的章节列表 |
| GET | `/api/paragraphs/<chapter_id>` | 获取某章节的段落及注疏 |
| GET | `/api/paragraph/<paragraph_id>` | 获取某段落详情 |
| POST | `/api/analyze` | AI 注疏分析（`{"paragraph_id": "..."}`） |
| POST | `/api/query` | 语义搜索（`{"query": "...", "top_k": 5}`） |
| POST | `/api/search` | 多维筛选搜索 |
| POST | `/api/annotation/interpret` | 单条注疏 AI 解读 |

### 社区

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/community/register` | 用户注册 |
| POST | `/api/community/login` | 用户登录 |
| GET | `/api/community/posts` | 帖子列表（支持分页、分类筛选） |
| POST | `/api/community/posts` | 发帖 |
| GET | `/api/community/posts/<id>` | 帖子详情 |
| POST | `/api/community/posts/<id>/comments` | 评论 |
| POST | `/api/community/posts/<id>/like` | 点赞 |

---

## 重新生成内容

```bash
cd knowledge_base
python scripts/generate_female_classics.py
```

---

## 许可证

MIT
