# NotesTimeMachine 发布前验收

日期：2026-11-06（Asia/Hong_Kong）。**完整功能发布不通过，当前不建议面向外部用户开放小规模测试。** 可以继续组织内部、受控、只读的阅读与文献审核，不能将其记为 AI 质量通过。

本轮真实模型已恢复可调用，但发现了实际内容问题；历史文献出处和偶发 Socket 根因仍未通过验收。测试通过不代表这些质量门槛已经满足。

## 1. 当前系统状态

| 维度 | 验收状态 | 范围与依据 |
| --- | --- | --- |
| 基础阅读 | PASS | 当前工作区的阅读、章节、选句、取消和空态测试通过，真实 R2 已用于本轮上下文；不代表线上同版本端到端验收完成 |
| 历史注疏展示 | PASS | 保留原记录，来源详情、AI 身份、待核验提示通过浏览器测试；此项验收展示行为，真实性另见下一项 |
| AI 生成 | FAIL | 3 条真实样本：2 条规则接受、1 条拦截；已接受输出仍有空泛解释、将待核验记述写成确定事实的问题 |
| 引用准确性 | BLOCKED | 已接受输出 6 处引文均匹配馆藏；旧注疏的作者、时代、版本、出处与段落关系没有完整人工证据链 |
| 错误降级 | PASS | 真实错引和错误归属被拦截；隔离测试覆盖额度、限流、网络、超时、权限和模型错误；模型链有限，不会无限重试 |
| 后端稳定性 | BLOCKED | 当前代码 + 远程 D1 的 18 个只读请求符合预期；历史真实 Socket 根因、线上部署差异和客户端差异仍未解决 |

状态限定为 PASS / FAIL / BLOCKED / NOT_TESTED。各 PASS 仅适用于表内范围，不代表全部生产路径、文献或长期可用率。

工作区起始位于 main，HEAD `2923bf692a059d34d28a3291492461edb4e96f58`，已有大量未提交工作。本轮没有提交、推送、部署、购买、升级套餐、迁移或直接修改生产数据库，没有改写历史知识库 JSON 或无关 UI。来源账本仅保存在仓库，没有上传到 R2/D1。

本轮原始证据位于 [release-evidence/2026-11-06](release-evidence/2026-11-06/)。旧评测和报告保留；现有测试默认覆盖旧证据，本轮执行时备份并恢复，另存新结果。

## 2. 报告与当前代码核对

| 历史报告内容 | 当前审计 |
| --- | --- |
| R2 提供真实正文，客户端注疏不能直接作为证据 | 一致。`loadParagraph` 回读段落/目录；interpret 按段落 ID + 注疏 ID 找服务端记录 |
| Llama 3.3 70B fast → Llama 3.2 3B | 一致。文本模型固定两个，实际调用 `env.AI.run`，没有外部 OpenAI 请求；Bindings 中的可选 OpenAI 字段不代表正在使用 |
| grounded-v4；结构、来源、逐字引用、直接署名与书名校验 | 一致，但真实输出证明无法保证语义正确或完整阻止隐含历史事实 |
| 每模型 10 秒、生成总预算 22 秒；额度/超时停止 | 审计前一致。本轮另补限流、网络、供应商超时和权限错误停止规则。R2 时间另计；停止等待不等于取消供应商推理 |
| 1–3 条 reading、引文 8–40 字、解释不超过 50 字 | 这是 Prompt/Schema 目标。应用 `validateReading` 实际允许 1–6 条、引文 2–160 字、解释最多 240 字，不能称为应用严格约束 |
| 来源不会自动被认作 verified | 普通阅读/AI 路径仍保守标 unverified，AI 另标 ai_generated。后来新增的 activation 路径可读取独立清单，字段/关联/全文哈希通过后返回 verified；程序检查不能替代清单内容的人工审核 |
| 317 段、972 注疏、314 条明确 AI、102 个重复注疏 ID | 本轮重算一致；972 条原始注疏仍均缺 source_id/source_title/edition/reference/verification_status。API 适配补字段不等于出处已核实 |
| D1/R2 职责区分、参数校验、batch、安全错误响应和请求编号 | 当前代码一致；本轮没有生产写测试或 Schema 修改 |
| 后端 61/61、前端 23/23 | 属于历史阶段结果。本轮修改前为 83/83、32/32；增加 7 个相关故障测试后最终为 90/90、32/32 |
| 最终 30 条均降级，真实质量未验收 | 对旧文件仍成立；本轮新 3 条单独统计，不与旧 30 条混算 |
| 30 条逐条证实 4006 | 不能这样理解。旧报告末尾已限定：30 条保存的是通用分类，后续诊断才记录 4006，没有逐条原始错误 |
| Socket 已修复 | 旧报告没有这样声称，当前也不能这样声称。invalid upgrade header 的受控修正不能证明 UND_ERR_SOCKET 根因已解决 |

旧 [run-manifest.json](ai-evidence/run-manifest.json) 的 ai.ts、grounding、sources、cases 哈希与本轮真实生成前一致。随后只修改错误分类和日志，没有修改 Prompt、生成参数、来源选择或引用校验。最终文件哈希见新 [manifest.json](release-evidence/2026-11-06/manifest.json)。

## 3. Workers AI 可用性、额度与完整错误记录

应用入口为 `POST /api/analyze`、`POST /api/annotation/interpret`，内部使用远程 AI binding：

- 首选 `@cf/meta/llama-3.3-70b-instruct-fp8-fast`，备选 `@cf/meta/llama-3.2-3b-instruct`。
- 参数为 messages/user、temperature 0.1、max_tokens 1000、JSON Schema，非流式。
- `/api/query` 的 embedding 为 `@cf/qwen/qwen3-embedding-0.6b`、1024 维，无跨模型 fallback；实际索引建库模型/预处理清单仍未取得。

本轮目录 API 返回三个模型均存在。2026-11-06 14:59:24 HKT 发起一次最多输出 1 token 的独立 REST 诊断，约 8,136ms 后 HTTP 200，回复“可”，usage 为 1.2981798648834229 neurons。完整输入、供应商响应正文、Date/CF-Ray 与延迟在 [provider-diagnostic-full.json](release-evidence/2026-11-06/provider-diagnostic-full.json)。它只证明调用时可用，**不是文学质量样本**；应用仍使用 binding。

配置模型与供应商返回模型名均保留：本轮 JSON Mode 首选返回 `@cf/meta/llama-3.3-70b-json`，备选返回 `@cf/meta/llama-3.2-3b-instruct-v2`；REST 普通回复返回 `@cf/meta/llama-3.3-70b-instruct-sd`。没有据内部别名擅改配置。

套餐只读查询为 HTTP 403 / code 10000 Authentication error，因此套餐详情和当日剩余额度为 **BLOCKED**，没有写成“余额为零”或已确认免费套餐；模型目录为 HTTP 200。见 [account-preflight.json](release-evidence/2026-11-06/account-preflight.json)。本轮 3 样本共 4 次推理，供应商报告约 222.594 neurons；另有一次 workerd 路径对照、最多两次推理但无 usage，不能虚构精确总费用。没有购买或调整账户。

### 历史 4006：BLOCKED

旧 [provider-diagnostic.json](ai-evidence/provider-diagnostic.json) 只有安全分类与代码，**没有完整供应商错误正文、HTTP 状态、时间或响应头**。本轮未复现 4006，无法补造历史完整响应，也没有故意耗尽额度制造错误。测试夹具中的错误消息不是供应商真实原文。

当前 [Cloudflare 错误表](https://developers.cloudflare.com/workers-ai/platform/errors/) 将日额度耗尽列为 3036/429、容量不足列为 3040/429，未列 4006。4006 是历史观测代码，不能仅凭数字推断原因。下次真实发生时应在受控诊断中保存完整响应正文、HTTP 状态、Date/CF-Ray/Retry-After、配置模型、任务 ID、时间及耗时，排除 Authorization/Cookie/私文，不将原始异常公开返回客户端。

### 有界降级与故障区分

| 故障 | 当前文本生成处理 | 本轮验证方式 |
| --- | --- | --- |
| 额度耗尽 | model_quota_exceeded；消息证据或已知 3036，立即停止模型链 | 隔离测试；真实未复现 |
| 限流/容量不足 | model_rate_limited；429/3040，停止本请求模型链 | 新隔离测试 |
| 网络/Socket | model_transport；检查最多 4 层 cause，停止模型链 | 新隔离测试和本机受控断开 |
| 应用/供应商超时 | model_timeout / model_provider_timeout，停止后续模型 | 实际计时隔离测试；不声称底层取消 |
| 权限/模型套餐要求 | model_access_denied，停止，不升级 | 新隔离测试 |
| 模型不存在/停用 | model_invalid，只可尝试清单下一模型 | 新隔离测试 |
| JSON/引用/来源/归属不合格 | 记录具体规则，最多尝试下一模型，否则 withheld | 本轮真实复现 |
| 未确定的模型故障 | model_unavailable，安全保留 provider_code，最多两个模型 | 包括“裸 4006 不能直接判额度”的测试 |

无递归、无界循环或后台重试队列。前端仍为一次请求、30 秒等待上限。剩余限制：embedding 单模型路径仍使用通用 model_unavailable 日志，没有单独服务端计时上限；不能据文本生成改进推断检索路径也已完全一致。

## 4. 真实 AI 评测与结果

选择 `clear_source-01`、`clear_source-03`、`clear_source-06`，核对 [《漱玉词》四库本转录](https://zh.wikisource.org/wiki/漱玉詞_(四庫全書本)) 的署名/如梦令/一剪梅、[《全唐诗》卷805](https://zh.wikisource.org/zh-hant/全唐詩/卷805) 的李冶/相思怨。仅确认指定原文片段与署名对照，保留繁简、异体和版本差异，不认证附录注疏。

[evaluate-release.mjs](../cf-worker/scripts/evaluate-release.mjs) 使用当前 Hono 应用 + Wrangler getPlatformProxy 的**真实远程 AI/R2 binding**，不是 Mock，也不是线上已部署 Worker 的端到端验收；仅调用 analyze，不访问 D1。每个模型的完整 Prompt/输入上下文、参数、actual_output、completion ID、usage、延迟/异常，以及应用响应和请求编号均保存在 [real-generation.json](release-evidence/2026-11-06/real-generation.json)。

run_id 为 `931e647a-6643-46ea-a34a-6e17a96f03bd`，Prompt 为 `grounded-v4`，任务 ID 为 `run_id:case_id`。原采集器将“规则拒绝”笼统记作 BLOCKED，原记录保留；**独立审查将首条判为 FAIL，不是额度 BLOCKED**，后续脚本已修正分类。

| 样本 / 输入段落 | request_id | 实际模型调用耗时 | 总耗时 | 工程质量结论 |
| --- | --- | --- | --- | --- |
| clear_source-01 / shuyuci-01-01 | c21bb8a8-01da-45fd-a591-5fbabd28478a | Llama 3.3：8,831ms；Llama 3.2：1,839ms | 21,564ms | FAIL：quote_mismatch / unknown_source；最终 withheld |
| clear_source-03 / shuyuci-02-01 | 0d6b22ea-922b-47ac-9f4a-690644c57fe4 | Llama 3.3：9,950ms | 11,925ms | FAIL：规则接受，但解释空泛，未回应主要语义/观点差异 |
| clear_source-06 / liuye-02-01 | 8ada97df-174e-4994-bbb2-2a02ed42c566 | Llama 3.3：6,926ms | 8,650ms | FAIL：规则接受，但将待核验记述写成确定事实 |

具体审查：

1. 首样本主模型引用“绿肥红瘦， 此语甚新。”与馆藏引号、标点/空格不同，逐字匹配失败，解释还出现未完成的“胡仔认为李清照的词句”。备选将来源 ID 写成 `huzi-shuyuci-01-01`，并把“近时妇人能文词如李易安”误读成近年来妇女词语更成熟、可以与李易安相比。两次真实输出均不能算合格解读，应用没有展示被拒绝的文本。
2. 一剪梅样本的三条解释分别为“描述秋天的景色”“评论李清照的词曲风格”“讨论李清照词曲的风格特点”。引文存在于馆藏，但没有解释相思、两处闲愁、情绪反复，也未交代两段词风泛论的差异和对本词的支持关系。结构通过不能替代产品质量。
3. 相思怨的“海水深不可测，相思更深”有原文支持；另两条却直接说“李冶擅长写五言律诗，内容多为闺情”“李冶的字是季兰，来自吴兴，且是女道士”。这些取自未核验旧记录，即使部分传记有平行文字，也不能自动认证两条旧注疏。现有规则只拦注家署名（高仲武/辛文房），漏过对作品作者李冶的确定事实陈述。通用尾注不能替代每条解释的证据限定。

独立文学专家的事实评分仍为 null / **BLOCKED**，没有将 AI 自评分冒充人工评分。具体证据和工程判定见 [generation-review.json](release-evidence/2026-11-06/generation-review.json)。

按现有脚本 [复算指标](release-evidence/2026-11-06/real-generation-metrics.json)：3/3 HTTP 200、2/3 validated、1/3 withheld、接受引文 6/6 匹配、0 个伪 verified 标签、中位接口耗时 11,925ms。“0 错配”只统计接受输出，不包括已拦截错引，不是零幻觉；2/3 不是事实准确率，拒绝也不能算事实正确，不与旧 30 条混算。

另一次实际 workerd 路径对照同一首段：request_id `253b05b3-150c-41ab-a290-354394afa4f2`，应用日志 10,838ms，分别拦截 quote_mismatch / unverified_attribution。它不是第四条独立样本，见 [first-real-response.json](release-evidence/2026-11-06/first-real-response.json)，未为追求通过而继续重跑。

## 5. 文献可信度与人工审核账本

[source-review-registry.json](../evaluations/ai/source-review-registry.json) 覆盖 317 原文 + 972 注疏，共 1,289 来源项，绑定原内容 SHA-256。

| 状态 | 数量 | 含义 |
| --- | --- | --- |
| verified | 3 | 仅指定原文片段与作者/时代署名的公开转录对照有可人工核查依据；不包含整段版本、注疏、AI 解释 |
| pending_review | 33 | 已列入优先人工审核，不代表核实 |
| unverified | 1,253 | 无足够审查证据；AI 生成身份另列，不作为史料 |

每个 verified 项保留 verification_scope、链接、定位、片段、版本、检查方式，full_record_status 仍为 pending_review。human_signoff 均为 null：这是可核查来源对照，不是文学专家签字。**旧注疏没有升级为 verified；账本没有接入运行时或首次体验清单。**

| 优先级 | 人工核验对象及要求 |
| --- | --- |
| P0 | 首页每日一笺/漱玉词入口 shuyuci-01-01：原文及胡仔、陈郁、沈际飞、王士禛、黄蓼园五条旧注疏，核版本、卷页、全文与归属 |
| P0 | 首次体验候选：上述原文 + 至少两条不同时代注疏。真实 R2 缺 metadata/activation-example.json，当前接口 available=false / verified_example_missing；禁止用测试夹具伪造生产核验 |
| P0 | 首页薛涛推荐句“花开不同赏，花落不同悲”与 xuetao-01-02 至 05 春望词组；首页白头吟的署名、时代及故事证据链，不凭传统归名直接完成认证 |
| P0 | 默认阅读女诫首段 nujie-01-01：马融、范晔、王先谦和现代研究出处；范晔 song/宋代与现有时代体系有歧义，不能默认为赵宋 |
| P0 | shuyuci-01-02“蹴罢秋千”所附陈廷焯批语谈“新来瘦”，本段原文没有此语，关联须重审，保留原记录 |
| P1 | 本轮一剪梅/相思怨附录：通用词风和传记不能直接充当本诗逐句解释的确证；核陈廷焯、张綖、高仲武、辛文房版本/年代/全文 |

每条审核应保留实际作者/朝代证据、影印或可靠转录定位、待比对文字、异文说明、与段落的关系、审核人与日期。字段完整及哈希匹配只证明记录未变，不证明所填出处真实；存疑保持 pending_review/unverified。

## 6. Socket 错误与服务稳定性

### 事实与未解决部分

- 旧 [transport-errors.json](d1-evidence/transport-errors.json) 有真实 UND_ERR_SOCKET，例如传输编号 `1f3b1b65-8009-4610-a5e0-05ebcc3512b7`、`bc82bb29-ef9c-49b8-bdfa-016bf754a3c9`；调用帧为 dev-proxy / Miniflare loopback / undici。历史文件缺时间，随机传输编号也不是应用 request_id，不能事后构造精确接口关联。
- 本轮当前代码 + 远程 D1 的 18 请求为 12×200、1×404、5×400，无非预期 500，逐条编号/状态/耗时见 [remote-read-local.json](release-evidence/2026-11-06/remote-read-local.json)。旧探针缺逐条时间及精确起始时间，证据文件完成时间另存 observations.json，未臆填每条时间。
- 15:06:03.904 HKT，本机受控服务在 HTTP 响应头前主动关闭 TCP，13ms 内复现 TypeError → SocketError/UND_ERR_SOCKET，transport_request_id `56cd30df-8427-4d9a-92d1-d7b3a01ea0d4`。见 [socket-controlled.json](release-evidence/2026-11-06/socket-controlled.json)。**这是症状复现，不是历史远程连接关闭原因，也不是修复。**
- 线上 curl 健康检查两次 200，却没有当前代码的 X-Request-ID；线上 activation/example 为 404，当前代码读取真实 R2 则 available=false。存在部署差异，未确认线上版本 ID，不把工作区测试当作线上已验收。
- 15:05:58–15:06:21 HKT，Python 线上只读探针 6 请求出现 4 个非 JSON 403、2 个 URLError；随后 curl 健康检查成功。见 [production-read-probe.json](release-evidence/2026-11-06/production-read-probe.json)。客户端/代理/网络/边缘拒绝差异未定位，没有将其归因于 D1 或 SQL。
- 短时只读 wrangler tail（status error）有控制连接 ping/pong，但无业务错误事件。不能据此证明失败请求已到应用或没有异常；未部署、未做生产故障注入/写压测。

本轮最小改动：api_request、ai_grounding、dev_transport_error 增加 ISO 时间；文本生成安全日志保留每个失败模型及 provider_code，interpret 同样记录请求关联。普通日志不记录 Prompt、私文、Token、密码、SQL 参数或原始供应商异常。完整输入输出仅来自固定公开文学评测。本轮代码没有部署，传输层与应用编号仍未自动关联，不能宣称已有完整分布式追踪。

### 具体观测与复现方案

1. 固定预发布 Worker、Wrangler/Node/undici 版本、代理与绑定配置，记录起止 UTC/HKT。客户端记录接口模板、时间、X-Request-ID、CF-Ray、Content-Type、状态及错误类型，不存正文/凭证。
2. 对齐应用请求、AI、开发传输与 Workers Logs。传输编号单列 transport_request_id；没有 parent_request_id/trace 时明确 null，仅按窄时间窗列候选，不强行关联。之后在预发布验证安全父子 span 传播，不向第三方盲传用户头。
3. 分段观测浏览器 → 本地 Worker → R2/AI/D1/Vectorize → 开发代理/远程绑定；缺 JSON/应用编号时优先调查外围。HTTP 403 或 CF-Ray 不足以证明业务 SQL 失败。
4. 使用现有只读探针，最多 3 路并发、每轮 18 请求，对照串行/并发与网络允许条件下的代理路径；记录连接关闭阶段、是否复用、安全 cause code。禁止自动重放注册、评论、点赞、进度写入；未知写入先读取核对。
5. 发生非预期 5xx、非 JSON 无编号或网络异常即保存整轮证据并停止扩压，保持 BLOCKED；证据定位后再修。长期稳定性、生产写并发与故障恢复本轮为 NOT_TESTED。

## 7. 测试结果

| 检查 | 状态 | 结果 |
| --- | --- | --- |
| 严格 TypeScript | PASS | npm run typecheck，退出 0 |
| 隔离 D1 业务/故障 | PASS | 24/24 |
| AI/R2/引用/超时/错误分类契约 | PASS | 40/40；新增 7 项，受控 binding 不计真实生成质量 |
| 本地 HTTP/WebSocket | PASS | 4/4 |
| 首次体验/反馈隔离测试 | PASS | 22/22；审核记录是夹具，写入仅临时 D1 |
| 后端合计 | PASS | **90/90**，见 [final/backend-tests.txt](release-evidence/2026-11-06/final/backend-tests.txt) |
| 现有前端，真实无头 Chrome | PASS | **32/32**；原测试页控制 fetch，不代表线上业务/AI 质量，见 [frontend-tests.json](release-evidence/2026-11-06/frontend-tests.json) |
| 当前代码 + 远程 D1 只读 | PASS | 18 请求均符合预期，不等于长期 SLO |
| 本轮真实 AI 质量 | FAIL | 3 条均存在可用输出/内容问题；专家事实分数未完成 |
| 历史完整 4006、真实 Socket 根因、线上一致性 | BLOCKED | 缺证据或差异未定位 |
| 完整 30 条新生成质量、独立专家裁定、长期稳定性 | NOT_TESTED | 本轮限量范围外，不填 PASS |

最终错误分类/日志修改后重跑全部后端检查；前端文件未改，32 项仍对应同一代码。浏览器采集最初连接超时、汇总选择器错误未计入产品失败，修正采集后实际完成全部测试。旧测试证据已恢复，本轮结果单独保存。

## 8. 未通过项目、发布风险与建议

1. **AI FAIL**：先改善语义完整性和逐条证据限定，防止待核验记述变成确定事实。固定新 Prompt/代码后重跑选定样本，再跑完整 30 条并请文学研究者审读；不能靠放宽引用校验或去掉不确定性提示取得高通过率。
2. **来源 BLOCKED**：先核首页/首次体验原文与至少两条不同时代注疏，保留真实版本、定位、全文哈希和审核者。不能把本轮片段对照直接升级为首次体验清单。
3. **稳定性 BLOCKED**：核对拟部署版本，建立请求关联，定位真实 Socket 与 Python/curl 差异；当前日志/分类仅在工作区，不能宣称线上修复。
4. **可用性风险**：余额读取受限；10 秒只是等待上限；R2 时间另计，首样本总耗时已约 21.6 秒；embedding 等待/日志和索引模型清单仍有缺口。

**是否开放小规模测试：当前不建议开放完整功能的外部测试。** 可由少量内部审核者只读核对原文、来源详情和待核验提示，明确 AI 未验收；不能将缺清单的首次体验包装成已核验示例。

对外 5–10 人限量测试前，应完成 AI/来源/稳定性门槛，复核拟部署版本、实际账户限制与观测，再做同版本真实阅读及故障验收。保留 AI 提示、问题反馈和停止入口，出现质量/可用性异常停止扩展。这是建议，本轮未部署或开启测试。

## 9. 交付与复现

交付包括本报告、[生成审查](release-evidence/2026-11-06/generation-review.json)、[来源账本](../evaluations/ai/source-review-registry.json)、[真实生成原始记录](release-evidence/2026-11-06/real-generation.json)、[完整供应商成功响应](release-evidence/2026-11-06/provider-diagnostic-full.json)、[运行清单及哈希](release-evidence/2026-11-06/manifest.json)。

代码改动仅涉及 ai.ts 的错误分类/停止/日志，reliability.ts 与 dev-proxy.cjs 的时间字段，grounding.mjs 的 7 项故障测试，以及新增限量评测脚本。没有修改 Prompt、引用校验、历史数据、数据库或 UI。

```sh
cd cf-worker
npm run typecheck
npm test
# 现有 npm test 会更新原测试证据；需要保留历史时先备份。
# 仅在预算许可时执行真实调用，使用新文件名，不覆盖失败证据。
node scripts/evaluate-release.mjs ../docs/release-evidence/NEW-RUN/real-generation.json
```

需要代理时可使用项目现有 dev-proxy.cjs 预加载方式。限量脚本只选 3 条、每条最多 2 个模型；额度/限流/传输/超时后停止后续样本，拒绝覆盖已有证据。完整生产链路仍须单独验收。
