# NotesTimeMachine 产品行为分析

验收日期：2026-11-06。事件协议：`schema_version=1`。实现状态：本地验证通过，默认关闭；真实 PostHog 接收和生产看板尚未验证。

## 1. 现状与交付边界

检索现有页面、前端模块、依赖、部署配置及文档，没有发现运行中的 PostHog、GA、Plausible 或自建产品事件上报。Cloudflare 类型声明中的 AnalyticsEngineDataset 不等于已接入分析。因此增加一个显式事件接口，直接适配 PostHog Capture API，没有再安装自动采集 SDK。

已经实现十种事件、匿名标识、会话去重、注疏可见阅读判断、UTM 白名单、告知与选择界面、撤回和测试隔离。未创建真实 PostHog 项目或看板，未提供实际项目 Capture Token、区域或生产环境配置。仓库中的配置保持 `enabled:false`，本轮真实 PostHog 请求为零；没有真实用户指标可报告。

Capture Token 是随前端发布的公共采集令牌，不是管理密钥。请求使用官方区域入口 `/i/v0/e/`，显式设置事件、随机 distinct_id 和禁用个人档案属性。[PostHog Capture API](https://posthog.com/docs/api/capture)

## 2. 核心指标与会话口径

**每周完成有效注疏对照的独立用户数**：在 Asia/Hong_Kong 时区、周一 00:00 至下周一 00:00 的半开区间内，满足生产过滤条件的 `comparison_completed` 事件中，不同 `anonymous_user_id` 的数量。

所有生产图表共同过滤：`environment=production`、`is_test=false`、`schema_version=1`。主指标另筛选 `identity_persistence=local`；无法保存标识的 `memory` 数据单独展示，不能混入可靠的周独立用户/回访口径。独立用户实际上是同意分析后的浏览器随机标识，不是登录账号或自然人。清除存储、跨设备、无痕、90 天标识到期或撤回后重新同意都会改变标识；多人共用浏览器也会合并。

初版有效对照进一步落为可观测规则 `visible_5s_two_sources_or_eras_v1`：

1. 当前阅读会话成功打开实际存在的原文章节，失败页和离线演示不记作成功原文打开。
2. 同一作品、同一原文段落内，至少两条不同的非 AI 注疏分别达到连续 5 秒的前台可见暴露。
3. 每条正文可见面积至少 50%，页面可见、有焦点，正文中心未被其他元素遮挡；打开隐私选择、模态窗、关闭面板、切换年代、失焦或进入后台会重置未完成计时。
4. 两条记录的书目键不同，或已知时期不同，才视为不同来源/时期。书目键从公开来源标题提取《书名》并结合注家标识/姓名，在本机比较；同一本书不同卷次不因此变成不同来源。没有足够来源/时期元数据时不推断。
5. 一个阅读会话最多记录一次 `comparison_completed`。重复展开同一注疏、刷新、返回及在同会话完成另一段对照不会再次计数。

两条注疏可以在同屏分别达到阈值，不要求点击顺序；“打开两条”本身不等于有效阅读。5 秒是初版产品代理阈值，不能证明理解、注意力或文献真实性。遮挡/可见性由浏览器观测与计时边界检查判断，不是眼动追踪；超长注疏无法达到 50% 可见时会保守漏计。不支持 IntersectionObserver 的浏览器不宣称完成对照。

`engaged_ms=5000` 表示**每条注疏的最低连续阈值**，不是总阅读时长。`annotation_count` 是该段落已达到阈值的非 AI 记录数。`source_verification=all_verified` 仅在参与记录均带应用的已核验标记时产生，否则为 `mixed_or_unverified`；该字段不代替人工文献验收。当前首次体验所需的完整人工核验示例仍有数据缺口，见 [首次体验交付](USER-ACTIVATION-V2.md)。不能把测试核验夹具当成馆藏真实批准。

标识与会话：

| 项目 | 实现 |
| --- | --- |
| anonymous_user_id | 同意后创建的随机 UUID，本机有效 90 天，不读取账号或凭证 |
| session_id / $session_id | 相同 UUIDv7；每标签页一个会话，30 分钟无已记录活动或最长 24 小时后更新 |
| 刷新/返回 | 同一标签页 sessionStorage 保存会话、去重键、已开原文与有限对照进度 |
| 再次访问 | 新会话可沿用仍有效的 anonymous_user_id，用于回访分析 |
| 无法使用存储 | 内存降级，标记 identity_persistence=memory，不影响阅读 |
| 过期 | 下一次访问/检查时清除过期状态，不宣称浏览器关闭后会自动定时删除 |

这里是自定义标签页会话，不使用 PostHog SDK 的跨标签页会话管理。UUIDv7 的时间戳对应本机会话起点，符合 PostHog 自定义 session ID 的格式要求。[PostHog sessions](https://posthog.com/docs/data/sessions)

## 3. 事件字典与埋点位置

所有事件都经过 `js/analytics/core.js` 的固定名称和属性白名单；未定义、未知或不适用的字段直接省略，不补造默认值。

| 事件 | 实际触发条件与位置 | 专有属性 | 去重口径 |
| --- | --- | --- | --- |
| landing_view | `js/analytics/index.js`，首次可见访问；包括直接进入作品，允许分析后只记录当前状态 | 公共属性 | 每会话一次，切页和重复初始化不重发 |
| start_exploration | `js/ui/activation.js`，主动点击首页“开启一场千年阅读” | entry_point=home_cta、exploration_id | 每会话一次；恢复地址、重试不算新点击 |
| reading_opened | `js/ui/reader.js`，实际章节成功渲染且阅读页可见；可见页恢复补检查 | work_id、author_id、chapter_id | 章节 × 体验阶段；刷新和返回去重 |
| search_submitted | `js/ui/search.js`，非空搜索主动提交 | search_id、query_length | 每次搜索操作随机 ID；不发送搜索词 |
| search_result_clicked | `js/ui/search.js`，实际点击某条搜索结果 | search_id、result_position（从 1 开始）、work_id、author_id、paragraph_id、entry_point=search | 搜索 ID × 结果段落；两个结果容器共享去重 |
| annotation_opened | `js/analytics/engagement.js`，当前原文对应的非 AI 注疏正文实际达到可见条件 | work_id、author_id、paragraph_id、annotation_id，若已知则 source_id、era | 作品 × 段落 × 注疏 × 体验阶段；表示暴露，不表示读满 5 秒 |
| comparison_completed | `js/analytics/core.js`，满足第 2 节完整规则 | work_id、author_id、paragraph_id、annotation_count、engaged_ms、comparison_rule、source_verification | 每会话一次 |
| ai_interpretation_used | `js/ui/aiPanel.js` / `timeline.js`，主动发起 AI 辅助分析或注疏解读请求 | work_id、author_id、paragraph_id、可选 annotation_id、usage_kind=analysis/annotation | 每次真实请求意图一次；缓存再次展开不计新请求 |
| content_shared | `js/ui/share.js`，系统分享调用完成，或复制公开阅读链接成功 | work_id、author_id、chapter_id、paragraph_id、share_method=native/clipboard | 进行中重复点击拦截，每次完成操作一次 |
| feedback_submitted | `js/ui/feedback.js`，业务接口明确 received=true 后 | work_id、author_id、paragraph_id、可选 annotation_id、target、rating、可选 issue_type | 已确认的业务 submission_id 在本地作为去重键；不上传此业务 ID |

`ai_interpretation_used` 衡量主动使用尝试，不代表模型成功、引用正确或质量通过。`content_shared` 衡量分享操作完成/链接复制成功，不代表收件人收到或打开。反馈服务未启用、失败或未确认不记录成功。每次明确再次发起的新操作允许成为新事件，不能把不同搜索/分享一概去重掉。

为了按顺序衡量“先读作品，后来点击首次体验”的用户，首次 CTA 后会产生新的 `exploration_id`。同一章节此前仅在普通阅读阶段打开时，CTA 后实际再次打开允许产生一条带该 ID 的 reading_opened；仍不会重复计算 comparison_completed。landing 通常早于 CTA，没有 exploration_id，五步漏斗不能要求全部步骤此属性相同。

### 公共属性

| 字段 | 来源与处理 |
| --- | --- |
| anonymous_user_id、session_id | 同意后的分析模块自行产生；调用方不能覆盖 |
| timestamp | UTC ISO 时间，同时作为事件顶层时间与属性；图表按香港时区分桶 |
| source、medium、campaign | 当前会话开始时 URL 中的 utm_source/utm_medium/utm_campaign，仅接收部署批准白名单中的标签，固定至会话结束；没有值就省略 |
| work_id | 已知公开作品目录中的真实 ID；对内容事件未知作品直接不发送 |
| author_id | 作品和作者元数据中姓名精确且唯一匹配的真实 ID，缺失/歧义省略 |
| device_type | 视口宽度：<768 mobile，768–1023 tablet，≥1024 desktop；是布局类别，不是设备指纹 |
| environment、is_test、schema_version | 来自安全发布配置，测试/预发不混入生产 |
| identity_persistence | local 或 memory，用于区分回访可解释性 |
| exploration_id | 首次体验点击后才存在的本会话关联 ID |

另有协议字段 event、uuid、distinct_id、$session_id、$process_person_profile=false、$geoip_disable=true。没有自动 URL、referrer、IP 属性、账号信息或 DOM 文本。公开来源书目键只在本地做有界比较，不随事件上传。UTM 白名单为空时不发送归因字段；不猜测 direct/organic，也不接受邮箱样式、任意自由输入作为活动名。

## 4. 复用接口、去重和故障隔离

业务模块统一导入 `analytics` 与 `EVENTS`，调用 `track()`；原文和注疏使用 `readingOpened()`、`annotationOpened()`、`annotationRead()`。无需在各页面分别安装 SDK 或重新绑定全局监听器。初始化幂等，视图关闭销毁观察器和计时器；反馈/分享绑定当前不可变作品上下文，避免异步结果沿用另一作品 ID。

队列在下一轮任务异步发送，不等待网络即可继续阅读。每次请求 3 秒取消，最多 50 条待发送/进行中任务，不重试、不写持久网络队列。拒绝/撤回时取消待发任务及进行中的请求，并清除本机分析标识与会话，不改账号登录存储。已开始的连接可能已经到达平台，不能承诺撤回能收回已发送数据。

客户端先记去重再尝试发送，因此断网、关闭页面、拦截器、队列上限会漏计。每会话最多保存 500 个去重键、100 个已开章节、100 个段落进度和每段 20 条注疏。达到上限后保守停止新增，不能宣称“恰好一次送达”。事件 UUID 支持平台按相同事件身份去重，但 PostHog 去重是最终一致的；下游仍应对 session_id / anonymous_user_id 做去重聚合。克隆标签页或恶意客户端也不受全局原子去重保证，行为事件不能用作计费或安全凭据。[PostHog event deduplication](https://posthog.com/docs/data/events)

## 5. 隐私与用户选择

入口为页尾“分析与隐私设置”和 [独立说明页](../privacy.html)。已配置服务时展示非阻断告知，“允许匿名分析”“仅必要功能”和关闭按钮可触屏、键盘操作；关闭不等于同意，拒绝不限制阅读。未配置时不自动弹出，设置内明确说明尚未启用。

所有地区统一采取事先明确 opt-in，不根据未知地区猜测豁免。未同意时不生成分析标识、不存分析会话、不请求 PostHog；仅在用户选择后保存必要的选择记录，90 天有效。DNT/GPC 优先于允许选择，跨标签页撤回同步停止采集。不同地区的存储/访问技术要求可能包括 localStorage，不能因为没用 Cookie 就假定无需告知。[ICO storage and access technologies guidance](https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guidance-on-the-use-of-storage-and-access-technologies/what-are-storage-and-access-technologies/?search=iss)

严格禁止发往分析平台：阅读笔记正文、私人评论、反馈补充说明、搜索词、登录凭证、Cookie 原文、AI 输入/输出或对话、完整 URL/referrer、邮箱或账号标识。不使用 identify/alias，不关联登录用户，不启用自动采集、录屏、设备指纹。公开阅读链接分享前去除全部查询参数，分析事件也不包含该链接。

这是去身份化的随机标识，不是不可关联的绝对匿名。服务商在网络层仍会收到 IP。正式启用时，运营者须在 PostHog Project Settings → General 的 IP capture 中选择丢弃 IP，并关闭 GeoIP 转换；事件已设置 `$geoip_disable=true`。单独丢弃 IP 不会自动关闭地理解析。[PostHog data collection controls](https://posthog.com/docs/privacy/data-collection)

**尚待运营者完成**：实际适用地区与处理依据确认、最终服务区域、平台保存期限、供应商/跨境安排、删除请求流程和联系方式，并更新公开说明。不能仅凭前端实现宣称所有地区合规。平台保留期限没有在本轮账号设置中验证，不能声称已经限制为 90 天；90 天仅为本机选择/标识有效期。以上未完成前保持默认关闭。

## 6. 安全配置与上线步骤

涉及文件：

| 范围 | 文件 |
| --- | --- |
| 统一协议与默认配置 | js/analytics/core.js、index.js、config.js、catalog.js |
| 可见阅读检测 | js/analytics/engagement.js、js/ui/timeline.js |
| 业务触发 | js/main.js、js/ui/activation.js、reader.js、search.js、aiPanel.js、feedback.js |
| 分享交互 | js/ui/share.js、js/ui/reader.js |
| 告知/设置 | index.html、privacy.html、css/components.css |
| 发布配置生成 | scripts/configure-analytics.mjs、config/analytics.example、cf-worker/scripts/deploy-pages.mjs、.gitignore |
| 验证 | tests/analytics.mjs、tests/analytics-browser-scenarios.cjs、tests/browser-activation.cjs |

使用独立测试项目和生产项目。复制 `config/analytics.example` 到已忽略的 `.env.analytics`，或由 CI 环境注入：

| 变量 | 配置要求 |
| --- | --- |
| ANALYTICS_ENABLED | 显式 true 才能开启；默认 false |
| POSTHOG_PROJECT_KEY | 实际项目公共 Capture Token（phc_）；拒绝个人/管理密钥，不在聊天或文档粘贴真实值 |
| POSTHOG_API_HOST | 实际项目官方区域：https://us.i.posthog.com 或 https://eu.i.posthog.com |
| ANALYTICS_ENVIRONMENT | 显式 production / staging / development / test；非 production 自动 is_test=true |
| ANALYTICS_UTM_ALLOWLIST | JSON 的 source/medium/campaign 标签数组，批准非个人化活动名；缺省为空 |

只生成本地静态工件的示例（不会部署）：

```sh
node --env-file=.env.analytics scripts/configure-analytics.mjs --out /tmp/ntm-static-artifact
```

该命令生成工件中的 config.js/catalog.js，不复制整站。现有 Pages 发布脚本已在完整静态工件复制后调用配置生成器；未启用时生成关闭配置，启用但缺字段时中止。它是会部署的脚本，**本轮没有执行**。直接上传仓库文件的发布方式会继续使用默认关闭的 config.js，需要明确采用配置工件步骤。公共采集令牌最终可从浏览器看到，环境变量避免的是硬编码和误放管理密钥，不是让公共令牌成为秘密。

启用前按顺序完成隐私设置、预发项目验证、生产过滤与看板，再按现有发布流程发布；本轮未发布、未提交或推送 main、未修改生产数据。

## 7. 分析配置与漏斗

以下是可执行的项目配置步骤和统一口径，真实账户设置状态均为 NOT_TESTED。所有看板先应用第 2 节的生产过滤；预发验证必须使用独立项目且 is_test=true，不能取消过滤混入生产。

### 首次体验漏斗

1. 新建有序漏斗，依次选择 landing_view → start_exploration → reading_opened → annotation_opened → comparison_completed。
2. 主漏斗按唯一会话统计，保持 `session_id` 相同，转化窗口最长 24 小时；不允许跨会话拼成一次激活。若账户 UI 不支持按会话或跨步骤固定属性，使用保存查询按此规则聚合，不用普通用户级漏斗冒充同会话漏斗。
3. 另建独立用户漏斗，明确这是同意分析后的浏览器用户；不要与会话转化率混用。可增加首次观测 landing 的用户 cohort，用于“新用户”；它只是首次观测，不证明此前没来过。
4. 五步都固定 session_id，不要求 landing 的 exploration_id 存在。第二步之后可用 exploration_id 辅助排查。会话若已在 CTA 前完成核心对照，不属于该 CTA 的增量激活，不能补造第二次完成事件。
5. 按 source / medium / campaign 分解，并分别查看 mobile/tablet/desktop；缺失归因显示“未获得批准归因”，不解释为直接访问。以会话首次批准的 UTM 为归因，不做跨设备、末次点击或历史归因推断。

同时建立：

| 分析 | 分子 / 分母或设置 |
| --- | --- |
| 首次体验入口率 | 同会话 landing 后 start 的唯一 session_id / landing 唯一 session_id |
| 首次体验完成率 | 同会话按序 start→reading→annotation→comparison 的唯一 session_id / start 唯一 session_id |
| 注疏使用率 | reading 后有 annotation 暴露的唯一 session_id / reading 唯一 session_id |
| 核心对照使用率 | reading 后 comparison 的唯一 session_id / reading 唯一 session_id |
| AI 辅助使用率 | reading 后 AI 请求意图的唯一 session_id / reading 唯一 session_id；不能命名为 AI 成功率 |
| 周核心用户 | comparison 的唯一 anonymous_user_id，按周、local 标识聚合；另按作品和 source_verification 分组 |
| 来源质量视图 | all_verified 与 mixed_or_unverified 的对照分别展示，不合并成已核实文献激活 |

趋势图应把默认事件次数改成 Unique users，并确认其 distinct_id 与 anonymous_user_id 相同；需要精确属性分组时使用去重查询。[PostHog trends](https://posthog.com/docs/product-analytics/trends/overview)

### 回访

以浏览器首次观测的 comparison_completed 为 cohort 起点，后续**不同 session_id** 的 reading_opened 或 comparison_completed 为返回，分别观察 D1、D7、W1。明确采用香港日历日/周，按同一 anonymous_user_id 关联；只纳入 local 标识、已成熟观察窗口。不要把尚未走满 7 天的 cohort 算成未回访。

可以按事件建立 Retention，再核对它的时间分桶和身份口径；若 UI 无法表达新会话或首次观测条件，使用保存查询。本轮未在真实项目运行这些查询，没有提供虚构留存率。[PostHog retention](https://posthog.com/docs/product-analytics/retention)

不建议用 Lifecycle 图直接替代：PostHog 的该图排除匿名事件，而本实现明确不创建已识别的个人档案。[PostHog lifecycle](https://posthog.com/docs/product-analytics/lifecycle)

### 搜索点击

搜索 CTR = 有至少一条 search_result_clicked 的唯一 search_id / search_submitted 的唯一 search_id，在相同会话/时间窗口内关联。缺 search_id 的记录不拼接；同一次搜索点击多条结果仍只计一个有点击搜索。不能用总点击数 / 总搜索数冒充 CTR。另看 result_position 分布和作品分布，不上传搜索词。

现有十事件不包含搜索结果返回事件，因此无法准确区分“零结果”“搜索服务错误”“有结果但未点击”；不能据此推断搜索相关性。需要进一步诊断时应先审查扩展协议，不临时上传查询正文。

## 8. 验证结果

证据在 [analytics-evidence/2026-11-06](analytics-evidence/2026-11-06/)。所有标识、反馈正文和活动标签均为明确 TEST ONLY 夹具。浏览器运行真实应用 HTML/JS/CSS，业务 API 受控，PostHog fetch 仅在本机截获，外网请求阻断。没有将 Mock 输出作为真实用户数据，也没有验证真实平台入库。

| 检查 | 状态 | 证据/结果 |
| --- | --- | --- |
| 分析核心测试 | PASS | core-tests.json：34/34，包括 UUIDv7、UTM、阈值、去重、过期、隐私、网络失败 |
| 浏览器分析流程 | PASS | browser/browser-flows.json：17/17 组，无未捕获错误 |
| 现有前端模块回归 | PASS | browser/module-tests.json、activation-regression/module-tests.json：各 35/35，同一套测试非 70 个独立用例 |
| 默认关闭时首次体验回归 | PASS | activation-regression/browser-flows.json：17/17 组，含 375/390/768/1440px、游客/登录、刷新/返回、错误和减少动效 |
| 后端回归和类型检查 | PASS | backend/：90/90（24+40+4+22），typecheck 通过；未修改业务后端逻辑 |
| 离线发布配置与语法 | PASS | configuration-checks.json：默认关闭/测试开启两种工件，18 个文件语法检查与 git diff --check 通过；没有运行部署 |
| 真实 PostHog 接收、项目 IP/GeoIP 设置 | BLOCKED | 未配置真实项目；不等同于接收失败 |
| 真实漏斗、周活跃、留存、CTR | NOT_TESTED | 尚无实际用户数据或项目看板 |
| 全量历史文献真实性/完整核验示例 | BLOCKED | 属既有数据核验缺口；分析事件不改变其结论 |

浏览器覆盖：首次可见页、同意前零采集、重复初始化、单次点击去重、不同作品/作者 ID、游客匿名、刷新/返回、批准 UTM、搜索隐私、两条各 5 秒、快速切换/失焦、主动 AI、成功/取消分享、已确认/未启用反馈、分析断网、撤回保留账号、GPC。模块测试另覆盖同来源重复、不同段落不能拼接、AI 注疏不计、过期状态清理、内存降级、同意撤回取消待发任务。

保留初次浏览器失败记录 browser-flows-initial.json / browser-flows-before-network-assertion.json：分别是测试选择器及错误的“总事件数恒定”断言；后者忽略了新出现的合法注疏暴露。修正测试后按事件 UUID 和具体动作验证无自动重试，最终完整重跑通过。没有删除失败记录冒充首次全绿。

## 9. 后续观测与限制

上线前先完成真实预发项目 Capture 接收/属性检查、区域与隐私设置及生产过滤验证，再开始收集真实趋势。首批观察周核心用户、入口到原文/注疏/对照各步流失、各来源和布局类别转化、搜索有点击比例与位置、成熟 cohort 回访，以及 verified 分层。阈值变更须使用新 comparison_rule/协议版本，避免历史周指标静默变化。

分析平台只代表同意且成功送达的人群，不能代表所有访问者；未同意者没有平台事件，因此无法从这些事件直接计算全站同意率。网络丢失率也不能凭未送达事件估算，需要受控验证或另外设计有适当依据的服务观测。不把零事件解释成零用户，不设虚构目标达成率。现有客户端事件可能被拦截或伪造；移动 Safari 原生分享、真实跨设备回访及生产平台行为尚未实测。
