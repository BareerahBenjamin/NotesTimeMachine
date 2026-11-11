# 注疏时光机

**Women's Classical Literature Through Time**

面向古典文学读者、教师与学生的中国古代女性文学阅读站。站点收录从西汉到清代的 17 部作品。读者可以逐段阅读原文，在时间轴上对照不同时代的注疏，并展开来源详情。

[线上体验](https://zhushu-notes.pages.dev) · [V2 正式发布报告](docs/V2-PRODUCTION-RELEASE.md)

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

## V2 功能

- **作品与注疏**。浏览书架和作者，按作品、章节及原文段落阅读。时间轴支持年代筛选、原文定位、段落分享和来源详情。来源标签区分已核验、待核验及 AI 生成资料。
- **跨书语义搜索**。Workers AI 生成与索引模型匹配的中文向量，Vectorize 检索关联段落，R2 提供原文与注疏。结果可以定位到作品的具体段落。
- **AI 辅助解读**。读者主动触发后，Worker 从 R2 载入原文、注疏和来源上下文，并核对生成内容的引文与归属。模型不可用、超时或输出未通过校验时显示降级提示，原文和时间轴仍可使用。自动引用校验与人工文献审读分别记录。
- **一键体验千年注疏**。有人工审核的原文和至少两条合格注疏时进入完整体验。缺少批准清单时，读者会看到原因并可继续浏览普通馆藏。
- **账号与社区**。支持注册、登录、发帖、评论、点赞及阅读进度保存与恢复。V2 候选使用加盐密码哈希和独立 JWT 签名 Secret。存量弱哈希账号需要核验身份后重置，用户和业务记录继续保留。
- **反馈和可选产品分析**。反馈入口支持交互问题和文献纠错，启用依赖反馈 Schema、来源白名单和独立 Secret。PostHog 事件遵守同意设置，生产与测试配置独立。两项默认关闭。
- **响应式界面与动效**。首页、阅读器、社区及来源弹窗适配手机和桌面。交互动效支持系统减少动态效果偏好。

## 技术架构

| 层 | 实现 |
| --- | --- |
| 前端 | HTML、CSS、原生 JavaScript、Cloudflare Pages |
| API | Cloudflare Workers、Hono、jose |
| 关系数据 | D1，保存用户、帖子、评论、阅读进度和可选反馈 |
| 知识库 | R2，保存作品、章节原文、注疏及来源元数据 |
| 检索 | Workers AI Qwen 中文 Embedding、Vectorize 1024 维索引 |
| 生成 | Workers AI 模型链、来源校验、有限降级 |

## 本地运行与测试

需要 Node.js 22。Python 仅用于知识库与离线评测脚本。

~~~bash
cd cf-worker
npm ci
npm run typecheck
npm test
~~~

从项目根目录运行前端测试：

~~~bash
node --experimental-default-type=module --test tests/analytics.mjs
node tests/browser-activation.cjs
~~~

浏览器验收脚本使用隔离夹具，可用 CHROME_BIN 指定 Chrome。完整测试需要本地端口和浏览器进程。后端测试会写入本地验收证据目录，建议在独立检出目录执行。

~~~bash
cd cf-worker
npm run db:init:local
npx wrangler r2 object put zhushu-knowledge-base/metadata/classics.json --local --file ../knowledge_base/metadata/classics.json
npx wrangler r2 object put zhushu-knowledge-base/content/shuyuci/shuyuci-01.json --local --file ../knowledge_base/content/shuyuci/shuyuci-01.json
npm run dev
~~~

本地页面使用 http://localhost:8787。可在已忽略的 cf-worker/.dev.vars 中配置仅供本地使用的 JWT_SIGNING_KEY。Wrangler 配置的本地绑定不启用远程连接。测试 AI 与向量搜索使用受控夹具，生产数据验收须单独执行。

## 现有发布流程

Worker 使用 cf-worker 下的 npm run deploy。Pages 使用 node cf-worker/scripts/deploy-pages.mjs 对既有 zhushu-notes 项目进行静态上传，部署元数据记录构建提交。给脚本传入 --prepare-only 可在本地验证工件。发布前需核对 Pages 项目的生产分支、Worker 的绑定和 Secret、已合并的提交以及预发数据隔离。

生产 Worker 要求通过 Cloudflare Secret 提供由安全随机源生成的 64 位十六进制 JWT_SIGNING_KEY。旧签名值须移除，旧会话会失效。反馈 Schema 仅在启用反馈前按审核后的增量迁移执行。生产更新前确认备份和版本回退目标。非生产 Pages 域名默认使用同源 API，接入 Preview 时须先配置独立的后端和数据库。现有生产 URL 见页首。

## 评测与已知限制

| 项目 | 记录 |
| --- | --- |
| 阶段回归及性能验收 | [V2 发布前 QA](docs/V2-RELEASE-QA.md) |
| AI 真实评测、引用校验、服务降级 | [AI 发布前验收](docs/AI-RELEASE-READINESS.md) |
| D1 故障隔离与并发一致性 | [D1 可靠性报告](docs/D1-RELIABILITY-REPORT.md) |
| 首次体验与来源要求 | [首次体验](docs/USER-ACTIVATION-V2.md) |
| 反馈迁移与事件配置 | [用户反馈](docs/USER-FEEDBACK.md) · [产品分析](docs/PRODUCT-ANALYTICS.md) |

真实模型生成质量、人工审读的体验清单、生产反馈和 PostHog 接收、真机触屏及长期线上稳定性仍待验收。
