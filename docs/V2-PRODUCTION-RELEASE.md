# 注疏时光机 V2.0 正式发布报告

**发布结论 · BLOCKED**

验收日期为 2026-11-11，Asia/Hong_Kong。已整理并验证本地候选的一部分。GitHub 未更新，Cloudflare Pages 与 Worker 均未部署，线上同版验收未执行。

## 1. GitHub 更新

| 项目 | 结果 |
| --- | --- |
| GitHub 仓库 | [BareerahBenjamin/NotesTimeMachine](https://github.com/BareerahBenjamin/NotesTimeMachine) |
| 本地发布分支 | 隔离检出 /tmp/ntm-v2-release.01QqODuw/repo 中的 release/v2-final |
| 已测试的代码提交 | 2de982d7e2a455f2cc859ff05f1816dbfa55396e，2026-11-11 14:52 +08:00 |
| 原工作区 | main，HEAD 为 2923bf692a059d34d28a3291492461edb4e96f58，V2 改动仍在原工作区 |
| 本地 origin/main 缓存 | 与原 HEAD 一致，缓存的 ahead/behind 为 0/0 |
| 实时远端差异及保护规则 | 未验证。git ls-remote 与 GitHub API 都无法访问 |
| 推送、PR、CI、合并 | 均未执行，PR 链接无 |
| 最终工作区 | 隔离发布分支干净。原工作区保留未提交 V2 文件、本次修复及本报告。无暂存合并冲突 |

原工作区的 .git 无法创建发布引用，因此在隔离检出中建立分支并提交。Git 配置使用的本地代理无法连接，直连也无法解析 GitHub 主机。没有强制推送、重置原工作区或改写历史。

发布提交包含 V2 UI、动效、来源和引用校验、D1 可靠性、一键体验、埋点、反馈、移动端改动以及相关测试与文档。保留的产物包括依赖锁文件和正式构建脚本。运行日志、原始 QA 证据、未发布截图、本地输出和私密配置未进入提交。对 118 个暂存文件做模式扫描，四处匹配均为隔离测试夹具。历史提交中仍能检出此前报告识别的 API 密钥样式值，当前凭据撤销或轮换状态未知。详见 [此前发布审计](V2-FINAL-RELEASE-REPORT.md)。

## 2. Cloudflare 配置和部署

| 项目 | 当前结果 |
| --- | --- |
| 正式站点 | [zhushu-notes.pages.dev](https://zhushu-notes.pages.dev)。本会话代理无法连接，未取得站点响应 |
| Pages | 仓库提供对既有 zhushu-notes 项目的 Wrangler 静态上传流程。本地从候选提交组装 50 项静态资产成功，未上传。当前项目是否启用 Git 自动部署及生产分支待平台确认 |
| Worker | 既有项目 zhushu-notes-api。Wrangler 4.151.1 dry-run 成功，未上传或切换流量。构建文件 SHA-256 为 4b1178bfab5683afda5f513fc3fa4e184f401ea85ff63cab5848cb706d66380f |
| Worker 绑定 | dry-run 解析到 DB → zhushu-community、KNOWLEDGE_BUCKET → zhushu-knowledge-base、VECTOR_INDEX → zhushu-annotations 和 AI。线上实际绑定、索引模型及可用性未验证 |
| 环境和凭据 | 候选要求 JWT_SIGNING_KEY Secret，移除了部署配置中的明文签名示例值。反馈开关为 false，来源列表为空。线上 Secret、域名、路由、部署版本、套餐和日志均未验证 |
| 开发及 Preview | 移除了 Wrangler 绑定的 remote 配置。默认 Preview 域名只访问同源 API，已验证其不会指向生产 Worker。独立 Preview Worker、D1、R2、Vectorize 和 PostHog 项目待实际核对 |
| 部署时间、平台版本及 Commit | 无本次生产部署记录 |

Wrangler whoami 显示本地授权已过期，且无法联系 Cloudflare 刷新。当前生产版本证据来自既有审计，不能据此确认本次线上状态。Pages 构建只从提交中列出的静态路径复制文件，显式传入提交 SHA。本次通过本地构建及 Preview 拒绝生产 PostHog 配置的检查。

### D1 迁移和回退

- 密码哈希使用现有 users.password_hash TEXT 字段。候选上线所需的哈希格式升级无需改表。旧哈希账号需要核验身份后重置，现有用户 ID、帖子、评论和阅读进度不作批量改写。
- 反馈 001 创建主表。002 增加工作流、处理历史、限流、索引及查看视图。隔离 SQLite 验证了正向、回滚及恢复脚本，并核对原反馈与状态历史保留。生产反馈开关关闭时无需预先执行这些迁移。
- 本次没有生产 D1 查询、备份、迁移或写入。上线前先只读比对生产 Schema、确认 Time Travel 书签或私有导出，记录核心表行数与关联检查，再按 001、002 顺序仅执行缺失且已在独立预发验证的增量。迁移后复查核心数据、反馈对象和写入权限。 [Cloudflare D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/)
- 发生故障时先关闭新增反馈写入，使用此前确认安全的 Pages 与 Worker 版本回退，并检查 API 与 Schema 兼容。反馈表默认保留，必要时使用归档和恢复脚本。签名密钥不回退到公开示例值。当前可用的安全生产回退版本待核对。 [Pages 回滚](https://developers.cloudflare.com/pages/configuration/rollbacks/) · [Worker 回滚](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/)

## 3. 本次测试

已读取 V2-AUDIT、AI-ACCURACY-EVALUATION、D1-RELIABILITY-REPORT、AI-RELEASE-READINESS、USER-ACTIVATION-V2、PRODUCT-ANALYTICS、USER-FEEDBACK、V2-RELEASE-QA 与 V2-FINAL-RELEASE-REPORT。下表为本次实际运行结果。

| 测试 | 结果 | 范围 |
| --- | --- | --- |
| TypeScript 和 Worker 打包 | 通过 | npm run typecheck、Wrangler dry-run |
| AI grounding / 契约 | 40/40 | 执行仓库原测试，覆盖 R2 上下文、逐字引用及归属、检索约束、模型错误、模拟额度耗尽与降级 |
| D1 / 社区可靠性 | 27/27 | 原用例在本地 SQLite 和 R2 夹具下运行，覆盖登录与拒绝、发帖、评论、进度覆盖保存、权限、故障、并发和事务 |
| 一键体验 / 反馈入口 API | 22/22 | 同样使用隔离绑定，覆盖缺失、夹具满足核验条件、资料变动、反馈关闭、提交及重试。核验用例只用测试文献夹具 |
| 反馈工作流与迁移 | 39/39 | 同样使用隔离绑定，覆盖匿名、白名单、限流、幂等、事务、并发、归档及恢复 |
| 最终 Worker 构建产物专项 | 6/6 | 在本机 workerd 内运行，使用测试数据库夹具。覆盖注册、正常密码、碰撞密码、缺 Secret、旧弱哈希和私密文件路径拒绝 |
| 前端埋点 | 34/34 | 测试同意、撤回、事件白名单、去重和测试标记。测试事件在内存模拟发送 |
| 前端构建和 Pages 工件 | 通过 | 原生模块打包检查、静态工件组装及环境隔离检查 |
| 完整 npm test 及传输 | 未跑通 | Miniflare 和 HTTP/WebSocket 测试需要本地监听，当前环境返回 listen EPERM。传输套件 4 条用例未执行 |
| 桌面、移动端、控制台 | 未验证 | 浏览器测试服务器同样遇到 listen EPERM，Chrome 无法启动。当前真机及浏览器回归结果无 |
| 真实模型和线上 Worker 日志 | 未验证 | 未向 Workers AI 发送真实生成请求，未测当前余额或生成质量，未读取线上日志 |

三组替换绑定的后端用例共 88/88，通过 SQLite SQL 语义和隔离夹具验证。与 40 条正常执行的契约用例合计 128 条，通过范围限于上述环境。完整 Miniflare 测试、独立 Preview 和生产测试仍待执行。前端埋点脚本在首次运行时更新了历史目录的合成事件文件，未找到与旧清单哈希一致的原事件文件。测试摘要文件内容仍与旧清单一致，后续复测在隔离目录运行。

### 核心用户路径

| 路径 | 本地覆盖 | 生产验收 |
| --- | --- | --- |
| 首页 → 一键体验 → 作品 → 原文 → 时间轴 → 来源 → AI 或降级 → 继续阅读 | 阅读数据、来源、正反向门控、降级等 API 用例已通过。浏览器整条交互和正式文献示例待验 | 未执行 |
| 跨书搜索和结果跳转 | 向量契约和来源返回已覆盖。真实 Vectorize 召回及浏览器跳转待验 | 未执行 |
| 登录、鉴权、社区、进度恢复 | 账号 API、帖子、评论、用户隔离、保存与读取在本地通过。旧账号安全恢复和浏览器续读待验 | 未执行 |
| 反馈和纠错 | 启用后的隔离 API 与工作流通过。正式迁移和开关待验 | 未执行 |
| PostHog | 34 条用例和非生产隔离通过。真实接收、仪表板和生产项目待验 | 未执行 |
| 加载失败、网络错误、重试 | 后端注入故障和反馈幂等通过。浏览器交互、远端 Socket 根因和长时观测待验 | 未执行 |

## 4. 遗留问题

| 优先级 | 状态 | 说明和处理 |
| --- | --- | --- |
| P0 | 本地已修复并验证，生产未解决 | 候选使用带随机盐的 PBKDF2-SHA256，拒绝碰撞密码及旧弱哈希登录。正式上线前须只读核对受影响账号范围、落实已核验身份的重置方式，并在现有 Cloudflare 计划下验证登录 CPU 预算。未购买任何服务。 [OWASP 密码存储](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html) · [Workers CPU 限制](https://developers.cloudflare.com/workers/platform/limits/) |
| P0 | 本地已修复并验证，生产未解决 | 候选强制独立 JWT_SIGNING_KEY，拒绝缺失及不合规密钥。此前审计发现线上明文示例签名值。本轮无法确认已轮换。需通过 Secret 配置新签名值、清除旧明文配置并验证旧会话失效。 [Workers Secrets](https://developers.cloudflare.com/workers/configuration/secrets/) |
| P0 | 尚未解决 | 历史 API 密钥撤销状态未知。需在提供方撤销或轮换并核对使用记录。 |
| P1 | 受阻 | GitHub 实时远端、分支保护、Cloudflare 授权、同版预发和正式部署未验证。恢复访问后核对远端是否前进和现有发布流程。 |
| P1 | 未验证 | R2 正式体验清单的人工审读、真实 AI 生成质量和当前额度。此前记录的质量缺口仍开放。 |
| P1 | 未验证 | 生产备份、反馈迁移、PostHog 接收、线上日志、真机及真实用户路径待验。 |
| P2 | 未验证 | 长时内存、线上核心网页指标和低端设备表现。 |

## 5. 发布结论和续跑顺序

**BLOCKED**。本地候选提交和打包可追溯。尚未满足远程访问、安全和生产验收条件。

1. 恢复 GitHub 和 Cloudflare 认证及网络访问。只读核对分支保护、生产绑定、现网版本、现有安全回退点及 D1 Schema。
2. 处理历史凭据和线上签名值。确认旧账号范围与核验身份后的重置流程。使用独立 Preview 的测试账号、文献、数据库及分析项目，执行完整 npm test、浏览器回归和鉴权 CPU 验收。
3. 在可验证的远端基线上推送 release/v2-final，创建 PR，等待必需 CI 通过后按规则合并。记录最终可部署 SHA。
4. 按确认的现有 Cloudflare 流程发布同一提交。反馈启用前完成备份、增量迁移和完整性核对。比对 Worker 版本、Pages 部署记录与实际前端文件，再跑生产全路径和控制台、日志检查。生产埋点数据验收使用获准的真实同意流量，合成事件留在隔离项目。
