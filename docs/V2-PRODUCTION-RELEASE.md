# 注疏时光机 V2.0 生产发布报告

**发布结论 · BLOCKED**

验收日期为 2026-11-11（Asia/Hong_Kong）。本轮完成旧账号恢复流程和阅读进度权限修复，并更新了本地候选。GitHub 尚未更新，Pages 和 Worker 均未部署，生产 D1 无本轮备份、查询、迁移或写入。正式站点尚未验收。

## 1. 候选版本与 GitHub

| 项目 | 结果 |
| --- | --- |
| GitHub | [BareerahBenjamin/NotesTimeMachine](https://github.com/BareerahBenjamin/NotesTimeMachine) |
| 发布分支 | 隔离检出的 `release/v2-final`，路径为 `/private/tmp/ntm-v2-release.01QqODuw/repo` |
| 上轮候选 | `2de982d` 包含 V2 功能、测试和反馈迁移脚本，共 118 个变更路径。`5098bde` 只更新 README 和发布报告 |
| 本轮代码提交 | `3f31139dcb393ff0682c33ea993ce87441bd3425`。分支在此基础上另有本报告的文档提交 |
| 原工作区 | `main` 仍在 `2923bf6`，与本地缓存的 `origin/main` 相同。原有 V2 未提交内容及本轮修复均保留。无未合并索引条目 |
| 远端差异及仓库权限 | `git ls-remote` 受网络阻断。远端最新 SHA、分支保护、当前账号权限和必需检查待核对 |
| 推送、PR、CI、合并 | 均未执行，无 PR、合并 SHA 或本轮 CI |
| 候选内容审查 | 上轮候选中的 UI、动效、一键体验、AI 降级、文献来源、D1 可靠性、PostHog、反馈与移动端代码均保留。本轮 8 个代码及测试路径通过暂存区模式扫描，无匹配 |

原仓库的 Git 元数据在本会话中只读。本轮在既有隔离分支提交，在原工作区保留源码和报告。完整候选可从仓库忽略目录下的 `outputs/ntm-v2-release.bundle` 恢复。Bundle 以 `2923bf6` 为前置提交，验证命令见第 7 节。

## 2. 连接与部署

| 检查 | 结果 |
| --- | --- |
| `git remote -v` | fetch 和 push 都指向上述仓库 |
| GitHub 网络 | 配置使用 `127.0.0.1:7897`，该代理连接失败。本会话直连无法解析 GitHub 主机名 |
| `gh auth status` | CLI 报告当前登录无效，服务端认证和实际仓库权限尚未复核 |
| `wrangler whoami` | CLI 报告登录已过期且无法刷新。首次诊断还遇到默认日志目录写入 `EPERM`，本地构建改用临时日志路径后完成 |
| Cloudflare 网络 | 同一代理连接失败，直连无法解析 Cloudflare API 与 Pages 主机名。账户、项目权限和线上配置尚未复核 |
| 本地监听 | 原生套接字在 IPv4、IPv6 回环监听都返回 `EPERM`，与 Miniflare、WebSocket 和浏览器测试的失败一致 |
| Pages | 既有项目 `zhushu-notes`。仓库提供显式记录 Commit 的 Wrangler 静态上传脚本。候选组装 50 个静态文件通过。平台当前是否配置 Git 自动部署与生产分支待确认 |
| Worker | 既有 Worker `zhushu-notes-api`。Wrangler 4.151.1 dry-run 通过。构建 SHA-256 为 `9195f082f3f122227f342dee53bff1784597f32cd8dab603e7e810a1913ec3df` |
| 本地配置绑定 | `DB` → `zhushu-community`，`KNOWLEDGE_BUCKET` → `zhushu-knowledge-base`，`VECTOR_INDEX` → `zhushu-annotations`，另有 `AI`。生产与 Preview 的实际资源、路由、套餐和 Secret 类型待核对 |
| 正式站点 | [zhushu-notes.pages.dev](https://zhushu-notes.pages.dev)。本会话未获得站点响应，独立读取也未取得页面。本轮无部署时间、平台版本或线上 Commit |

## 3. 账号与凭据

### 已实现并在本地验证

- 旧 `h_` 哈希及恢复中的账号均无法通过密码登录。登录仍使用加盐的 PBKDF2-SHA256，签名校验要求独立的 `JWT_SIGNING_KEY`、HS256、发行方、有效期和合法用户 ID。换用新签名值后，先前会话应全部失效。本地验证旧密钥、无发行方及过期 JWT 均被拒绝。新版前端启动后检查已有会话，服务端明确返回 401 时清除对应缓存会话。
- 详细阅读进度、章节位置、最近阅读时间和在读数量只向本人返回。匿名访问进度返回 401，其他账号返回 403。个人页保留公开发帖记录。更新进度以登录账号为准。
- 旧账号重置使用核验后交付的 256 位随机恢复码，30 分钟有效。数据库只存摘要和有效期，写入现有 `users.password_hash`。用户在登录弹窗提交原用户名、恢复码和新密码，条件更新一次性消耗恢复码，重置成功后回到登录。重发替换旧码，错误账号和失效码均被拒绝。已迁移到新哈希的账号不能通过此工具签发旧账号恢复码。
- 代码只更新已核验账号的密码字段，用户 ID、帖子、评论和进度的关联保持原样。无批量重置。日志用例检查了恢复码、新密码和 JWT 均未进入应用日志。

### 生产处理与剩余风险

1. **P0 · 旧账号归属待核验。** 仓库 Schema 只有用户名和公开资料字段，没有已验证邮箱或手机。上线前先做第 4 节的聚合盘点。维护者须用已有且可信的账号归属记录或可核验的既有联系渠道确认账号 ID，再在同一受控渠道交付恢复码。用户名、昵称、公开活动及可碰撞的旧密码均不能充当归属证据。未建立证据的账号保持锁定，关联数据保留。本轮未获生产身份记录，未签发真实恢复码。
2. **P0 · JWT 轮换待核实。** 历史审计发现旧 Worker 使用公开示例签名配置。核对当前部署实际绑定和依赖，生成独立随机 32 字节的新值，通过加密 Secret 配置为 64 位十六进制。将签名轮换和安全代码放在同一候选 Worker 版本中，核对新版本已清除旧明文变量及任何旧凭据依赖后切流。在可控预发及生产分别核对旧会话失效、新会话可用和受保护请求权限。仅向当前旧代码设置新名称的 Secret 无法修复旧代码的验证路径。 [Cloudflare Workers Secrets](https://developers.cloudflare.com/workers/configuration/secrets/)
3. **P0 · 历史 API 凭据撤销待核实。** 历史审计发现 `8522cfe` 及更早提交含 API 密钥样式值。由具备供应商权限的维护者核查使用记录，确认是否仍有服务依赖，安全更新依赖后撤销旧值或记录已撤销证据。当前 Workers AI 生成路径使用平台绑定。本轮未尝试使用历史凭据，也未轮换生产凭据。 [历史审计](V2-FINAL-RELEASE-REPORT.md)
4. **P1 · 生产运行预算与流量保护待验证。** 在同套餐预发验证登录、注册及重置的 PBKDF2 CPU 开销和异常流量限制。生产浏览器的移动端触控、缓存会话更新及重置回跳也待验。 [Cloudflare Workers 限制](https://developers.cloudflare.com/workers/platform/limits/)

如果现网仍使用已公开的 JWT 签名值，优先在平台侧限制受影响的认证和受保护写入入口，待安全版本就绪后恢复。回退使用确认安全且与现有数据兼容的版本，避免恢复公开签名值、旧密码校验或已撤销凭据。Worker 版本回退与 D1 恢复分别处理。 [Cloudflare Worker 版本与部署](https://developers.cloudflare.com/workers/versions-and-deployments/)

## 4. D1 数据库准备

| 项目 | 本轮结果 |
| --- | --- |
| 生产 Schema | 未连接。上轮引用的历史审计曾看到六张社区表，且没有反馈工作流表。当前结构和行数待只读复核 |
| 旧账号恢复 | 现有 `users.password_hash TEXT` 可容纳新格式，无需 DDL。隔离库验证签发、过期、重发、并发领取、账号 ID 与关联数据保留 |
| 反馈迁移 | `schema-proposals/001-content-feedback.sql` 和 `002-feedback-workflow.up.sql` 尚未在生产执行。它们不会随 Wrangler 自动迁移。隔离 SQLite 验证了正向、归档回退和恢复。生产配置默认 `FEEDBACK_ENABLED=false`，启用反馈前才需对缺失对象执行对应迁移 |
| 生产备份及完整性 | 未取得 Time Travel 书签或私有备份，未验证线上数据完整性 |

恢复访问后，先核对账户、D1 数据库 ID 和 Worker 线上绑定。对比 `sqlite_schema`、`PRAGMA table_info(users)`、六张核心表行数及外键关联，仅将结构和聚合数据写进报告。使用以下查询盘点账号哈希格式，必要时单独复核分类为其他的账号，禁止输出密码哈希明细。

```sql
SELECT CASE
  WHEN substr(password_hash, 1, 2) = 'h_' AND length(password_hash) = 18
    AND substr(password_hash, 3) NOT GLOB '*[^0-9a-f]*' THEN 'legacy'
  WHEN substr(password_hash, 1, 12) = 'recovery-v1$' THEN 'pending_recovery'
  WHEN substr(password_hash, 1, 17) = 'pbkdf2-sha256-v1$' THEN 'current'
  ELSE 'other'
END AS credential_format, COUNT(*) AS account_count
FROM users GROUP BY 1;
```

迁移前用 `wrangler d1 time-travel info zhushu-community` 记录书签及有效恢复窗口。若需导出，置于受限且加密的存储，在隔离库演练恢复。反馈按 001 → 002 顺序只应用缺失且相容的对象，之后复核 Schema、外键和核心行数。故障优先关闭反馈并保留新增表。确需结构回退时执行已演练的归档脚本并保留恢复路径。Time Travel 会改变整库状态，只有评估并发写入及影响后才用于恢复。 [Cloudflare D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/)

### 已核验旧账号的单人恢复

在隔离环境完成演练、生产绑定与归属已确认后，维护者用可信随机源生成每次独立的 64 位小写十六进制码，通过隐藏输入将码交给本地 SQL 生成器。以下命令在 macOS zsh 的项目根目录运行，输出只有目标账号 ID、摘要和更新条件。

```zsh
set +x
read -rs 'ntm_recovery_code?输入本次随机恢复码（隐藏）：'
printf '\n'
printf '%s' "$ntm_recovery_code" | node cf-worker/scripts/prepare-account-recovery.mjs <已核验数字账号ID>
unset ntm_recovery_code
```

将尖括号占位符替换为数字后执行。人工核对目标库和生成的 SQL，在该库执行一次，核对恰好一个目标 ID 被更新，随后只通过已核验的私密渠道交付恢复码。运维记录保留账号 ID、核验结果、操作者和时间。若签发有误或码疑似泄露，立即撤销待用记录或用新码替换，账号继续锁定，直到归属重新核实。 [OWASP 密码恢复指南](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html)

## 5. 本轮实际测试

| 测试 | 结果 | 范围 |
| --- | --- | --- |
| 社区、D1 与鉴权 | 29/29 | 运行仓库用例，以隔离 SQLite 和 R2 夹具替代 Miniflare 绑定。覆盖正确及错误密码、碰撞、相似账号、旧账号、重置、JWT 及数据隔离 |
| AI grounding 与契约 | 40/40 | 仓库原测试，覆盖引用、来源、模型错误及模拟额度耗尽。未调用真实生成 |
| 一键体验与反馈入口 | 22/22 | 隔离 SQLite/R2，文献核验记录为测试夹具 |
| 反馈工作流及迁移 | 39/39 | 隔离 SQLite/R2，含并发、权限、归档和恢复 |
| 最终 Worker 构建产物 | 8/8 | 本机 workerd 无监听端口运行，使用隔离绑定夹具。覆盖旧账号、重置、碰撞、进度权限及私密文件路径 |
| 前端会话和重置请求 | 4/4 | Node 内的模拟浏览器 API，验证清除失效会话、临时故障和并发登录、重置只用 POST 正文。无实际 DOM 交互 |
| PostHog | 34/34 | 前端单测，使用内存发送夹具，无真实分析事件 |
| 构建 | 通过 | TypeScript、Wrangler dry-run、前端两个入口打包及 Pages 50 文件组装 |
| 完整 `npm test`、Miniflare、传输测试 | 受环境阻断 | `npm test` 在第一组的本地监听失败，独立 WebSocket 测试同样返回 `EPERM`。传输组 4 条用例未执行 |
| 浏览器回归 | 未执行 | 仓库脚本无法监听。无端口 Chrome 探测退出，浏览器连接工具也未连通。新增的移动端重置场景待在 Mac 或预发复跑 |
| 预发和生产 | 未验证 | 未读取线上 Worker 日志，未验证真实 D1、R2、Vectorize、PostHog 或真实 AI 生成质量 |

## 6. 正式站点验收与放行

本轮没有生产部署。以下线上验收均待执行。

| 路径 | 上线后核对 |
| --- | --- |
| 首页与阅读 | 核对实际页面对应的 Commit。完成首页 → 一键体验 → 真实作品 → 原文 → 注疏时间轴 → 文献来源 → AI 解读或正常降级 → 继续阅读 |
| 跨书检索 | 检查真实 Vectorize 返回、结果跳转和原文定位 |
| 账号及社区 | 使用可控测试账号确认旧会话失效、重新登录、本人进度恢复、跨账号拒绝、发帖与评论 |
| 反馈与分析 | 安全迁移和开关启用后验证反馈。生产 PostHog 仅使用真实已同意流量验收，合成事件留在隔离项目 |
| 客户端与数据 | 桌面、移动端触屏、控制台、Worker 日志、线上绑定和生产数据完整性 |
| AI | 记录真实额度、降级和生成评测。额度不可用时确认原文和历史注疏可读，生成质量仍待验 |

### 当前放行阻断

- **P0** · 生产旧账号范围和可信归属核验流程尚未落实。生产 JWT 的独立签名配置、旧会话失效及历史 API 密钥撤销状态尚未核实。
- **P1** · GitHub 和 Cloudflare 连接、登录、权限、实际 CI/CD 和安全回退目标待核实。生产 D1 的 Schema、备份和数据完整性待核对。
- **P1** · 完整 Miniflare、浏览器和同套餐预发验证待执行。真实文献示例、Workers AI 生成质量和反馈/埋点生产链路尚未验收。
- **P2** · 真机长期运行和线上性能指标待测。

## 7. Mac 本机续跑

在正常 Mac 终端确认 `127.0.0.1:7897` 对应的代理已启动。如果网络可直连且不使用该代理，在当前终端或当前命令移除失效代理配置。先只读测试连接，再用各 CLI 的浏览器授权流程登录。

```zsh
cd /Users/bareerah/Development/NotesTimeMachine
git ls-remote origin HEAD refs/heads/main refs/heads/release/v2-final
gh auth status
gh auth login -h github.com
gh repo view BareerahBenjamin/NotesTimeMachine --json viewerPermission,defaultBranchRef
cd cf-worker
npx --no-install wrangler login
npx --no-install wrangler whoami
npx --no-install wrangler pages project list
npx --no-install wrangler deployments list
npx --no-install wrangler secret list
```

仅在不用代理且直连有效时，可用 `env -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY -u http_proxy -u https_proxy -u all_proxy git -c http.proxy= ls-remote origin HEAD` 做单次诊断。登录和密钥配置在本机终端、密码管理器或平台控制台完成。

恢复本地发布分支时，从原仓库验证并读取 Bundle，创建分支后使用独立 worktree 执行测试。若同名本地分支已存在，先比较差异，保留其历史。

```zsh
cd /Users/bareerah/Development/NotesTimeMachine
git bundle verify outputs/ntm-v2-release.bundle
git fetch outputs/ntm-v2-release.bundle refs/heads/release/v2-final
git branch release/v2-final FETCH_HEAD
git worktree add ../NotesTimeMachine-v2-release release/v2-final
cd ../NotesTimeMachine-v2-release/cf-worker
npm ci
npm run typecheck
npm test
cd ..
NTM_TEST_OUTPUT="$(mktemp -d /tmp/ntm-browser.XXXXXXXX)" node tests/browser-activation.cjs
```

最后按远端规则推送发布分支，创建 PR 并等待必需检查，合并后使用同一 Commit 构建生产 Pages 和 Worker。Pages 若已启用 Git 集成，沿用现有自动部署。若确认使用 Wrangler，沿用仓库的 Pages 脚本及平台实际生产分支。Worker 需协调 JWT 轮换时可用 Wrangler 上传带 Commit 标签及新 Secret 的版本，核对绑定后再切流。用平台部署记录、线上资源和完整使用路径确认版本。 [Cloudflare Wrangler 版本命令](https://developers.cloudflare.com/workers/wrangler/commands/workers/)
