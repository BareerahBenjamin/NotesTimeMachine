# NotesTimeMachine V2 最终版本对账与发布准备

核查日期：2026-11-06，Asia/Hong_Kong。远程查询与本轮回归的精确 UTC 时间见各证据文件。

**发布判断：NO-GO。当前不满足完整产品的小规模公开测试条件。** 本地功能回归通过，但密码校验存在已复现的 P0；线上 Worker 使用公开示例 JWT 密钥；历史 Git 含需要撤销/轮换的硬编码 API 密钥样式值。六轮候选代码尚未提交，也未上线；正式文献示例、真实 AI 质量与生产反馈/分析链路没有通过验收。

可以继续在隔离环境进行内部、受控的阅读和文献审查，不把它记作公开测试或真实增长成果。本轮没有修复业务功能、提交、推送、部署、执行生产迁移、购买服务或调用真实 AI 推理。生产 D1 只执行 sqlite_master 的 SELECT，返回 rows_written=0、changed_db=false。

本报告以当前工作区文件哈希标识候选版本，不能用 HEAD 表示未提交改动。证据目录：[final-release-evidence/2026-11-06](final-release-evidence/2026-11-06/)。

## 1. 六轮任务的实际完成状态

PASS 只适用于所列范围；FAIL 表示已发现不符合要求；BLOCKED 表示必要数据、配置或证据缺失；NOT_TESTED 表示本轮及可复用证据没有覆盖。实现、测试、上线是三个独立判断。

| 轮次 | 已实现/已交付 | 已测试 | 未验证或阻断 | 实际结论 |
| --- | --- | --- | --- | --- |
| 1. AI 发布前质量验收 | 真实 R2 上下文、来源分类、逐字引用/归属校验、有限模型降级、错误分类与日志、审查账本及发布报告 | 3 条真实样本、4 次真实文本模型调用；当前 grounding 40/40、后端可靠性 24/24、传输 4/4 | 3 条样本工程质量均未通过；规则接受的 2 条仍有空泛解释、把待核验说法当事实的问题；历史 4006 完整响应缺失；当前额度不可确认；Socket 根因未定位 | **真实 AI 质量 FAIL，文献/稳定性 BLOCKED**；不能把旧 30/30 降级或本轮 Mock 算作质量通过 |
| 2. 一键体验千年注疏 | 首页入口、公开深链、定位/高亮、导览、时间轴、年代切换、来源、继续阅读、游客路径与减少动态效果 | 后端 activation/feedback 22/22；此前浏览器 17 组；本轮四宽度实际隔离 Worker 的缺失示例分支通过 | 尚无获人工批准、至少两条可核查历史注疏的正式体验清单；正向获批路径使用明确 TEST ONLY 夹具，不是真实文献验收；线上接口 404 | **交互实现 PASS，正式内容与线上可用性 BLOCKED** |
| 3. PostHog 产品埋点 | 10 个统一事件、匿名标识、同意/撤回、UTM 白名单、会话去重、两条注疏可见时长判定、隐私说明和配置构建 | 本轮单元 34/34、浏览器 17 组；无正式分析网络请求 | 默认禁用、没有实际项目配置；生产接收、看板、项目隔离、平台保留/IP 设置及真实漏斗均未验收；线上新增脚本不存在 | **本地实现 PASS，生产数据链路 BLOCKED** |
| 4. 用户反馈和纠错 | 三类入口、匿名可选说明、验证/来源/幂等/限流、五状态、受保护最小查看 CLI、可保留数据的迁移/回滚脚本 | 本轮 workflow 39/39、浏览器专项见第 3 节；正常/错误/重复/匿名/数据库故障等隔离用例 | 生产缺 001/002 对象，线上路由 404；候选配置默认关闭，正式来源/密钥尚未配置 | **本地实现 PASS，生产服务 BLOCKED** |
| 5. 移动端/性能验收 | 首屏字体请求和脚本等待优化、移动点击热区、迟到动效不重新隐藏内容；测试和性能报告 | 已有 Lighthouse/CDP 测量；本轮 375/390/768/1440px 回归 17/17；145 个既有 QA 清单文件哈希均未改变 | 真实手机、Safari/Firefox、系统输入法、屏幕阅读器、真实 INP/RUM、长期稳定性未验证；安全门槛仍 FAIL | **实验室/模拟交互 PASS，完整发布验收 FAIL** |
| 6. 用户研究和冷启动实验准备 | 5–8 人访谈方案、A–D 任务、指标、四渠道八组草稿/脚本/UTM、记录/复盘/简历模板 | 8 次离线合成归因检查，网络 0；准备清单检查通过 | 无真实访谈、发布、曝光或用户数据；文学对照稿须等正式来源批准；公开实验受安全/产品/埋点门槛阻断 | **材料准备 PASS，真实实验 NOT_TESTED/BLOCKED** |

原报告保留：[AI](AI-RELEASE-READINESS.md)、[激活](USER-ACTIVATION-V2.md)、[Analytics](PRODUCT-ANALYTICS.md)、[反馈](USER-FEEDBACK.md)、[QA](V2-RELEASE-QA.md)、[增长](PRODUCT-GROWTH-EXPERIMENT.md)。没有把文档存在视为生产能力已交付。

## 2. 代码、远程与部署版本对应关系

### 2.1 Git 工作区

| 对象 | 实测状态 |
| --- | --- |
| 当前分支/HEAD | main，`2923bf692a059d34d28a3291492461edb4e96f58` |
| 本地 origin/main 缓存 | 同上 |
| 远程实时 heads | 只读 `git ls-remote --heads origin` 成功；只有 main，SHA 同上 |
| 本地功能分支 | 无；没有承载六轮成果的功能分支提交 |
| 工作区 | 起始快照 26 个已跟踪文件修改，大量未跟踪代码/测试/报告；暂存区为空。未跟踪数量随审计证据增加，不作版本标识 |
| 候选标识 | 本轮 manifest.json 的源码/配置哈希；六轮候选不等于已提交 HEAD |

因此“最新代码已经提交到功能分支”这一项为 **FAIL**。本轮只核查，不替用户创建提交，也没有操作 main。证据：[git-local.json](final-release-evidence/2026-11-06/git-local.json)、[git-remote.json](final-release-evidence/2026-11-06/git-remote.json)。

### 2.2 线上部署

| 对象 | 平台记录/公开资源实测 | 与本地关系 |
| --- | --- | --- |
| Pages zhushu-notes | 列表首项生产部署 `13ca510f-e995-4934-8999-c1e01e3f9b65`；Branch main，Source `8522cfe`；公开域名与该部署地址的 index.html 哈希相同 | 抽样 index.html 和 js/main.js 的字节哈希匹配本地 **HEAD**，不匹配工作区，也不匹配 `8522cfe` 的对应文件。部署 Source 元数据不能作为实际文件的可靠完整版本证明 |
| Pages 新文件 | js/ui/sourceDetails.js、js/analytics/config.js、privacy.html 均返回 HTTP 200，但 MIME 为 text/html，内容哈希等于首页 | 是静态站回退首页，不能判为文件已上线；本轮来源/隐私/埋点代码不可据此宣称上线 |
| Worker zhushu-notes-api | 最近 10 条记录中最新部署 `b3adea51-a0f7-4fdc-83e5-599bfe5a0bbf`，2026-07-14T11:58:04.697Z；100% 指向版本 `91414d01-cead-4f9b-ba26-6e55bc1234e2` | 版本无提交 SHA 证明，不能断言完整 Worker 与哪个 Git commit 一致；不是本轮新功能部署 |
| Worker 公开 GET | health/classics/paragraph/community/categories 均 200；activation/example 与 feedback/availability 均 404 | 基础资源可访问；新功能并未在线上提供 |
| 线上段落来源 | 抽样 shuyuci-01-01 返回无 verification_status、无 ai_generated | 候选版的来源透明策略尚不能代表线上展示已通过 |

线上地址：[Pages](https://zhushu-notes.pages.dev)、[Worker 健康检查](https://zhushu-notes-api.bareerahmoooo.workers.dev/api/health)。公开 GET 的毫秒数仅为单次代理/网络观测，不当作端到端性能或服务 SLO。无生产登录、发帖、搜索推理、反馈 POST 或安全攻击测试。

证据：[pages-remote.json](final-release-evidence/2026-11-06/pages-remote.json)、[worker-remote.json](final-release-evidence/2026-11-06/worker-remote.json)、[worker-version-remote.json](final-release-evidence/2026-11-06/worker-version-remote.json)、[online-http.json](final-release-evidence/2026-11-06/online-http.json)。抽样字节一致不证明整站一致；Worker 未提供可核验构建哈希。

部署脚本会从当时工作区打包、动态生成分析配置，BRANCH 是可选值，缺少强制干净工作区/不可变提交映射。不能直接运行当前脚本作为本次发布动作。发布包应另存提交 SHA、文件哈希、配置摘要和平台版本 ID。

## 3. 自动化、浏览器与真机结果

### 3.1 本轮重新执行

| 测试 | 结果 | 环境/限制 |
| --- | --- | --- |
| 后端 npm test | **129/129 PASS**：24 reliability + 40 grounding + 4 transport + 22 activation/feedback + 39 workflow | 临时 Miniflare D1/R2、受控 AI/向量绑定；不代表真实模型内容质量或生产迁移已通过 |
| TypeScript typecheck | PASS | 当前 Worker 代码 |
| Analytics 单元 | **34/34 PASS** | 全部事件为 TEST ONLY，发送拦截 |
| 实际本地 Worker 浏览器 | **17/17 PASS，未捕获 JS 异常 0** | 四宽度、缺失核验示例→馆藏原文→定位→时间轴→来源→AI 降级→反馈→继续阅读；搜索打开正确作品；登录错误/成功、社区发帖/评论/主页返回、进度写读；网络失败/恢复；reduced-motion；30 次循环观察 |
| Analytics 浏览器 | **17/17 PASS，未捕获 JS 异常 0** | 同意前零标识/零事件、去重/归因、两条注疏可见时长、切书 ID、主动 AI/分享/反馈、服务故障、撤回、DNT/GPC、测试隔离 |
| 反馈浏览器 | **15/15 PASS，未捕获 JS 异常 0** | 本地拦截接口，无真实后端或生产写入；表单/焦点/重试/匿名/去重 |
| 共享前端模块回归 | **35/35 PASS** | 专项浏览器脚本共同运行的模块测试，只计一套，不累计为多套新增覆盖 |
| 密码碰撞安全门槛 | **FAIL**，预期 401，实际 200 且获得 token | 仅向自建 test 环境临时账号提交两个不同的合成密码；无生产账户。此结果与上述常规登录功能 PASS 不矛盾 |

初次受限环境执行后端测试遇本地端口 EPERM，未运行完；允许本地监听后完整重跑成功，未将环境错误计作产品故障。历史测试产物在执行前备份、执行后恢复，本轮副本另存。

当前浏览器：macOS arm64 上 Headless Chrome **156.0.8078.80**，CDP 原生输入；375/390/768px 使用触屏模拟，1440px 桌面输入。实际应用与 Worker/D1/R2 在本机，AI unavailable 与语义检索向量为 TEST ONLY 绑定：搜索的交互/作品关联通过，**真实跨书语义召回质量没有验收**。生产登录和社区写路径因安全问题未测试。

证据：[test-execution.json](final-release-evidence/2026-11-06/test-execution.json)、current-*.json、[browser/functional.json](final-release-evidence/2026-11-06/browser/functional.json)、analytics-browser、feedback-browser、[security-gate.json](final-release-evidence/2026-11-06/security-gate.json)。安全探针内 production_jwt_secret_status 仅指探针未测生产；独立只读平台查询已确认线上示例值，见第 7 节。

### 3.2 复用已有性能证据

本轮没有重复跑 Lighthouse。此前 QA manifest 中 **145/145 文件 SHA-256 仍一致**，因此复用同一候选的实验室数据；不是线上或真实用户指标。

| 数据 | 既有实测 |
| --- | --- |
| Lighthouse 13.6 mobile 三次 | 98/98/98；LCP 中位数约 1.808s，CLS 0.01822，TBT 0ms |
| Lighthouse desktop | 100；LCP 约 0.444s，CLS 0.001095 |
| 独立 CDP mobile 390×844，CPU 4×、RTT 150ms、下载 204800B/s | LCP 2476ms、CLS 0.06890；一次 65ms 长任务 |
| 动效/内存 | 已有减少动态效果和迟到脚本采样；30 次循环内存/节点/监听观察不构成无泄漏证明；trace 曾有约 154ms renderer task / 119ms layout，不宣称全程 60FPS |
| 真实 INP/CrUX/RUM | 未获得；不能用 TBT 或模拟点击替代 |

证据：[prior-qa-hash-comparison.json](final-release-evidence/2026-11-06/prior-qa-hash-comparison.json)、[性能汇总](v2-release-evidence/2026-11-06/performance-summary.json)、[V2 QA](V2-RELEASE-QA.md)。

**真实手机、Safari、Firefox、系统软键盘、VoiceOver/TalkBack：NOT_TESTED。** 当前没有接入真机硬件和真实用户性能数据。发布前人工步骤：

1. iPhone Safari、Android Chrome 各至少一台，记录机型/OS/浏览器/网络；冷开与回访，纵横屏、375/390 附近实际 CSS 宽度，另测平板和桌面。
2. 对同一预发构建完成首页→获批示例→定位/选句→两个时期→来源→反馈→AI 降级→继续阅读；刷新、返回、切作品后位置和 IDs 正确。
3. 搜索、登录、反馈调起中文输入法，检查候选栏、底部安全区、键盘遮挡、滚动冲突、旋转、关闭/返回；用系统减少动态效果及屏幕阅读器/外接键盘检查焦点、状态播报和关闭恢复。
4. 弱网/断网/恢复、后台返回、第三方资源失败；修复 P0 后使用专门预发账户测登录/社区/进度。保存录屏、版本、时间和问题编号，不能在正式库放测试内容。

## 4. 数据库迁移状态

生产只读 SELECT 成功。存在 users/posts/comments/categories/likes/reading_progress 等原有业务表；**不存在 content_feedback、feedback_workflow、feedback_status_history、feedback_rate_limits、feedback_review，也不存在 d1_migrations 台账表。**

| 脚本 | 本地隔离执行 | 当前生产结构 | 状态 |
| --- | --- | --- | --- |
| schema-proposals/001-content-feedback.sql | 已在测试临时库应用 | content_feedback 不存在 | **待应用** |
| schema-proposals/002-feedback-workflow.up.sql | 已在测试临时库应用 | 三表及 feedback_review 不存在 | **待应用，依赖 001** |
| 001/002 down 与 restore | 先前隔离回滚/恢复测试通过 | 本轮没有执行 | 备用方案，不能当作已回滚 |

它们仍是 proposal 文件，不在 Wrangler 自动迁移注册目录中，不能认为下次部署会自动迁移。仅结构缺失已足以确认当前目标库未具备反馈功能；没有读取用户密码、反馈正文或其他用户行。

人工发布步骤：先修复安全项、冻结候选；负责人对目标数据库名/ID、备份及可恢复性签字，在预发同结构库验证 001→002→冒烟→回滚/恢复。获得独立生产变更授权后，保持 FEEDBACK_ENABLED=false，再顺序应用 001、002，读取结构检查、配置密钥和允许来源，确认服务版本匹配后单独启用。当前报告不授权执行生产 SQL。

回退先关闭写入/内部审阅并备份；优先只回退应用版本，保留加法表。确需结构回退时按 002 down→仅限全新安装的 001 down，数据改名归档，不删除；重复归档名须人工处理，禁止覆盖已有档案。重新启用用 restore，不能盲目重复 CREATE。生产反馈表没有 is_test/environment 等字段，所有演练必须用隔离库。

证据：[d1-remote.json](final-release-evidence/2026-11-06/d1-remote.json)、[反馈方案](USER-FEEDBACK.md)。本轮没有运行可能隐式创建台账的远程 migrations list/init。

## 5. AI 服务、额度和文献可信度

候选文本生成使用 Workers AI binding `env.AI.run`，主模型 `@cf/meta/llama-3.3-70b-instruct-fp8-fast`，备选 `@cf/meta/llama-3.2-3b-instruct`，Prompt `grounded-v4`。每模型等待最多 10s、生成链总预算 22s；已知额度/限流/网络/超时/权限错误停止，不无限重试。停止等待不等于供应商推理一定被取消，R2 时间另计。搜索 embedding 为 `@cf/qwen/qwen3-embedding-0.6b`/1024 维，仍缺一致的独立等待上限证据。

| 项目 | 状态与证据边界 |
| --- | --- |
| 真实生成质量 | **FAIL**，继承同日真实评测 3 条样本/4 次调用，非 Mock，详见 AI 报告及 real-generation.json；逐字引用匹配不等于观点可靠 |
| 当前模型可调用性 | **NOT_TESTED**；本轮没有增加真实推理费用。线上 binding 存在、health 200 都不能证明模型当前能生成 |
| 当前剩余额度/计费预算 | **BLOCKED**；既有额度读取 403，无可确认额度/预算值；不能因以前成功就推断现在有额度，或因 4006 推断额度耗尽 |
| 历史 4006 | **BLOCKED**，原始完整错误响应尚未找回；当前没有重现，不编造 provider 响应 |
| Socket 根因/线上同版稳定性 | **BLOCKED**；本轮公开只读采样成功，不能代替长期观测或宣称已修复；线上没有候选版 X-Request-ID |

人工步骤：账户负责人在 Cloudflare Workers AI 用量/计费界面记录日期、额度与已批准调用上限，核对模型可用性；固定预发提交/Prompt 后执行限量真实样本，保留输入上下文、actual_output、completion/task/request IDs、引用、延迟、供应商错误与人工判分。出现预算/限流/传输错误停止；真实 30 条完整质量评测和文学审读仍需随后完成。不得升级套餐或把 Fallback 计为真实质量。

可信度策略的实际范围：

- 普通阅读/AI 的服务端归一化将旧历史记录保守标为 unverified；识别的 AI 注疏标 ai_generated/ai_interpretation，前端明确不是历史证据，不采信旧 JSON 自填 verified。原文也不因入库就自动 verified。
- 来源详情显示作者、朝代、版本、出处和“待核验”；AI 引用校验检查服务端馆藏文本与归属，不证明古籍真实出处或历史观点。来源链接仅允许合法 HTTPS。
- activation 可依据独立清单的段落关联、来源字段、全文 SHA-256 等返回 verified，并至少要求两条不同允许历史时期的非 AI 注疏；**语法/哈希校验不能代替人工批准**。正式清单需留可人工访问的书目页码/扫描页/权威链接、核验人及日期，排除 TEST ONLY 夹具。
- offline source-review-registry 有 verified/pending_review/unverified 审查状态，但 human_signoff 仍为空；程序摘录核对不等于人工历史注疏认证。pending_review 没有作为所有运行时来源的独立展示状态，不能称全链路三态已完成。
- 正式一键体验的文献数据仍未满足门槛。线上抽样响应尚无这些新增来源标签；候选策略未上线，线上真实性展示 **未通过**。

Socket 人工观测：预发部署同一候选后，在浏览器和 Worker/代理分段关联 ISO 时间、request_id、接口、错误类型、CF-Ray/外层请求、R2/AI/D1/Vectorize 耗时与模型 provider_code；保存客户端网络/代理环境、取消/超时状态。连续观察不同网络与冷/热请求，区分外围 403/非 JSON、传输失败和业务 SQL 错误。日志不得含凭证、私文或整段 AI 对话。未取得复现及调用链证据前维持 BLOCKED。

## 6. PostHog、测试数据隔离与反馈可用性

候选本地默认 analytics enabled=false、无 projectKey/host；隐私页面与设置已实现。没有真实生产 PostHog 接收证据、看板、真实用户指标或留存结果。

本轮 Analytics 浏览器 17/17 和单元 34/34 验证：landing_view/start_exploration/reading_opened/search_submitted/search_result_clicked/annotation_opened/comparison_completed/ai_interpretation_used/content_shared/feedback_submitted 的触发/适用属性、归因、去重、撤回与网络失败。只上传白名单字段；缺失作者/来源属性不编造；不发送搜索词、阅读笔记、评论、AI 对话、登录凭证、Cookie 原文或完整 URL。

comparison_completed 的实现是同一段落、同一会话，两条不同书目来源或已知时期的非 AI 注疏分别在前台连续至少 50% 可见 5s，每会话最多一次。这是可观测的行为代理，不代表理解程度或文献真实。周独立用户指标按匿名 ID 去重，换设备/清存储无法可靠合并；分析拒绝者不纳入可观测 UV，不能当成全站真实 UV。

测试隔离已核查：

1. 单元发送函数与浏览器采集被本地拦截；浏览器使用 phc_TEST_ONLY、environment=test、is_test=true，外部 HTTPS 被阻断。没有本轮测试事件进入真实 PostHog 的通道。
2. 实际联调所有注册/帖子/评论/进度/反馈只进入临时 Miniflare；生产只执行公开 GET 和结构 SELECT。增长草稿 8 次归因检查也只在内存中，所有真实数据 N/A。
3. 正式采集默认关闭，线上新模块尚未上线。因此不能用“零真实事件”宣称生产漏斗工作正常。
4. `is_test` 标记不是强隔离。启用前必须使用独立预发 PostHog project/key，配置构建检查 environment 与 key/project 对应关系；生产看板至少筛选 environment=production、is_test=false、正确 schema_version，排除内部人员/演练。**绝不为验证生产而发送假装真实的测试事件。**
5. 平台端的接收、项目隔离、地域/保留期、IP 丢弃配置与历史测试污染审计 **BLOCKED**，因未有实际项目访问/配置证据。客户端 $geoip_disable/profile=false 不等于平台保证不保存 IP。由负责人登录后台核对捕获项目、事件属性、过滤与删除策略，留脱敏截图；不要在聊天中提供管理密钥。

反馈：本地 enabled 的隔离环境可提交/重试并查工作流；候选生产默认 false，线上 availability 404，生产不可用。须先完成迁移、FEEDBACK_ALLOWED_ORIGINS 和高强度限流密钥，内部查看另配管理密钥；仅在用户收到服务端成功回执后统计反馈成功，不以打开表单计成功。当前 ai_response_id 仅可选客户端元数据，真实 AI 路由尚无权威响应 ID，不宣称能精确关联到每条供应商生成。

## 7. 敏感配置与遗留问题

已扫描全部 4 个可达 Git 提交及当前候选中不超过 2MB 的常见文本文件/已知密钥模式，记录文件、行号、类型和不可逆短指纹，没有记录密钥值。没有已跟踪 .env/.dev.vars/private-key 文件；这不是完备的凭证泄漏证明。

**新确认：**当前线上版本资源中 JWT_SECRET 为 plain_text，且等于仓库公开示例值；secret list 为空。这是配置值检查，未进行线上伪造 token/账户攻击。Git 历史 `8522cfe` 及更早提交中，query_service.py:35 与 service/__init__.py:21 含相同硬编码 OPENAI_API_KEY 样式值；当前 HEAD 已移除这些文件。没有尝试使用该值，也不能确认是否仍有效；应按已暴露处理，由持有者撤销/轮换并检查供应商使用记录。删除当前文件不能清除公开历史/已有克隆。历史清理如需改写远程历史必须另行授权，本轮没有执行。

| 级别 | 问题 | 发布门槛/处理 |
| --- | --- | --- |
| **P0** | 密码函数不是安全密码哈希，不同密码碰撞，当前实际错误密码登录 200/token | 换用适合运行环境的加盐密码 KDF、版本化旧凭证迁移/重置策略；错误密码/碰撞/兼容/令牌撤销专项验收。不能仅补一条特殊字符串判断 |
| **P0** | 线上使用公开 JWT 示例值 | 负责人轮换为安全 secret、清除明文变量并确认令牌失效策略；修复后平台配置与预发/生产授权验收。不可回滚到该密钥 |
| **P0** | 历史硬编码 API-key 样式值暴露，撤销状态未知 | 确认所有者、撤销/轮换、审查账单及使用记录；不测试该凭证，不等待证明被滥用才处理 |
| P1 | 六轮候选没有功能分支提交，部署元数据与抽样字节不能完整对应，线上版本落后 | 冻结文件清单，人工审查新文件，功能分支提交/锁定构建/预发同版验证；不提交或推送 main |
| P1 | AI 真实质量 FAIL，正式历史注疏核验示例缺失，线上无新增来源标签 | 文学审读、批准正式清单、真实模型验收；不能开放声称已核验的体验 |
| P1 | 反馈 schema/路由未上线，分析无正式链路 | 按授权变更流程迁移/配置，独立预发项目验证；不能开展依赖这些闭环的公开增长实验 |
| P1 | Socket 根因、请求链关联和长期稳定性未验证 | 保留观测门槛；公开 GET 几次成功不足以关闭问题 |
| P1 | 真机/系统键盘/辅助技术及线上同版完整回归缺失 | 完成第 3 节人工验证并留证据 |
| P2 | .dev.vars/.dev.vars.* 未被当前 .gitignore 排除；目前文件不存在且未被跟踪 | 后续配置前补忽略与提交前扫描，避免引入真实密钥 |
| P2 | lockfile 被忽略、部署脚本缺干净构建和提交映射强制约束 | 冻结工具/依赖版本与可复现产物；不把本机 node_modules 当发布依据 |
| P2 | 长时内存/帧率及真实用户 CWV 未获得 | 增加预发长时观测，合法同意后再收集实际 RUM；当前不虚构指标 |

P1 的真机缺口不表示已发现所有设备都失败；P0 的安全缺陷则已有明确复现/配置证据。证据：[sensitive-config-audit.json](final-release-evidence/2026-11-06/sensitive-config-audit.json)、[historical-key-review.json](final-release-evidence/2026-11-06/historical-key-review.json)、[secrets-remote.json](final-release-evidence/2026-11-06/secrets-remote.json)。

## 8. 发布与回滚方案（待批准执行，本轮未执行）

1. **安全止血由负责人单独实施**：撤销/轮换暴露 API 凭证、线上 JWT；评估旧 token/会话与旧密码哈希风险。不能把存在已知安全问题的线上版本当安全回滚目标。必要时由负责人限制账号/写入面向外部的可达性。
2. 在功能分支整理候选；审查未跟踪代码和数据/原始证据，避免将密钥/测试账户/不必要产物带入发布包；记录提交 SHA、依赖版本、构建配置摘要及文件哈希。用户禁止提交/推送 main，遵守该边界。
3. 用独立 Worker、D1、R2 示例清单和 PostHog project 创建同版本预发；新安全修复后重跑相关测试，完成真实文献/AI、真机、登录/社区/搜索召回质量与故障回归。AI、反馈和分析的功能开关按实际通过情况记录，不得只用前端隐藏替代后端权限。
4. 生产变更另行审批：备份并演练恢复；先兼容的加法 schema，再后端，再前端。核对构建 SHA/Pages deployment/Worker version/流量、静态 MIME、来源标签、feature flags、允许来源和密钥名称；通过只读冒烟后才开放获批功能。正式测试事件留预发，生产不造假事件。
5. 小规模公开测试须有明确开放范围、人数/时间、负责人、错误率/延迟/反馈监测、隐私与分析同意设置。先建立基线再定义停止阈值，不编造当前 SLO 或用户数据。发现鉴权异常、错误数据、重大来源误标或迁移错误立即停止开放并回退。

**回滚准备**：分别保存经验证安全的 Pages 不可变部署和 Worker version，含兼容 API/schema/配置；前后端独立回滚时检查协议兼容。Pages 的版本切换、Worker 的版本/流量切换均由负责人批准后操作。回滚应用不会自动恢复 D1 或 secrets，JWT/API key 轮换不得恢复旧暴露值。默认保留新增反馈表；若 schema 故障必须结构回退，先关闭写入/查看、备份，再按第 4 节归档/恢复方案执行。不删除历史业务和反馈数据。

当前记录的 Pages `13ca510f…` 与 Worker `91414d01…` 只作“本轮看到的线上版本”，**不是已获批准的安全回滚版本**。没有有效安全回滚目标时不得启动公开发布。

## 9. 最终验收与重新评审条件

| 维度 | 状态 | 说明 |
| --- | --- | --- |
| 基础阅读（候选本地） | PASS | 四宽度、游客、定位、时间轴、来源与继续阅读 |
| 历史注疏展示交互（候选本地） | PASS | 来源/年代操作正常；真实性不在此 PASS 范围 |
| AI 真实生成 | FAIL | 真实样本内容未通过；当前额度另为 BLOCKED |
| 引用与文献真实性 | BLOCKED | 引文匹配不等于出处核实；无正式核验示例 |
| 错误降级（候选本地） | PASS | 有限模型链及受控故障，未证明生产当前配置 |
| 后端稳定性/生产同版 | BLOCKED | 老版本线上、Socket 根因与长期观测不足 |
| 身份安全 | FAIL | 密码碰撞 + 线上示例 JWT + 历史凭证撤销未知 |
| 生产反馈/Analytics/激活 | BLOCKED | 路由/迁移/配置/内容/平台验收缺失 |
| 浏览器模拟/实验室性能 | PASS | 明确限定本地实验室与模拟，不是真机/RUM |
| 真实手机与真实增长实验 | NOT_TESTED | 需人工设备和真实参与者，尚未开展 |

**结论：NO-GO。** 只有在 P0 关闭并复测、候选完成可追溯功能分支/安全构建、同版预发和人工真机验收通过、正式体验文献及来源策略获批，并按开放范围完成反馈/隐私/Analytics/AI 门槛后，才重新评审是否可小规模公开测试。不能把“内部受控审阅可继续”解读为 CONDITIONAL GO。
