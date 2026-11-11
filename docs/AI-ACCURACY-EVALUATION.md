# AI 解读可信度审计与评测

> 本文为 2026-10-19 的历史实验快照。2026-11-06 的可用性、真实生成与发布判断见 [AI-RELEASE-READINESS.md](AI-RELEASE-READINESS.md)，不要把历史额度状态当作当前状态。

日期：2026-10-19（Asia/Hong_Kong）。范围：真实 Worker/Workers AI/R2/Vectorize 链路、知识库生成脚本、阅读器的 AI/来源展示。不修改无关动效，不删除旧数据，不修改或迁移生产数据库，不部署、不提交/推送 main。

## 结论

本轮把自由生成的“历史综述”改为基于馆藏正文的 AI 辅助解读，增加结构和引用核验、来源分类、证据不足提示，以及失败时拒绝展示未经校验文本的路径。

**这不是“事实准确率已达标”的结论。** 逐字引文匹配只能证明该片段出现在馆藏记录中，不能证明注家归属、版本真实、与原文相关，更不能证明现代解释正确。旧注疏的系统性出处核验尚未完成，所有未经人工确认的旧来源仍为 unverified。真实远程绑定也仍有传输失败。

## 1. 实际发现的内容问题

| 等级 | 问题 | 证据与影响 |
| --- | --- | --- |
| P0 | 模拟历史人物的生成内容可能冒充真实注疏 | `ai_historical_annotator.py` 以“你是郭象/成玄英/朱熹”等提示生成文字，写入真实书名但原来不写 ai_generated；本地目前没有对应庄子/诗经内容，因此证实的是生成路径缺陷，不能声称现有全部历史注疏均由此生成 |
| P1 | 综述只收到注家/时代名单，没有注疏正文和原文作者 | 旧 `/analyze` 提示给出数量/时代/注家/视角，却要求生成观点分歧；模型只能补写并不在输入中的观点 |
| P1 | 任意客户端注疏对象可成为模型上下文 | 旧 `/annotation/interpret` 直接相信 annotation.content/author/source，无 R2 回查，容易误署名或提示注入 |
| P1 | 出处缺失与 ID 重复 | 本地 317 段、972 条注疏，314 条明确 AI；972 条均缺 source_id/source_title/edition/reference/verification_status，102 个注疏 ID 跨段重复。原 `source` 书名字段不是已核验出处 |
| P1 | AI 标记在部分 API 丢失 | 单段详情及语义/筛选结果重组字段时丢掉 ai_generated，时间轴无法一致识别 |
| P1 | 注疏与原文关联存在疑点 | “蹴罢秋千”段落附有谈“新来瘦”的批语；相同泛论被复制到多首诗词。引用存在不等于与本段原文有直接关系 |
| P1 | 年代编码歧义 | 范晔记录 era=song、era_name=宋代；现有筛选体系无法区分刘宋和赵宋，可能形成错误历史顺序。本轮保留原值并提示归属待核验，没有擅改原数据 |
| P1 | 同维度模型被当作可互换 embedding | Qwen 与 bge-m3 都是 1024 维，但向量空间不相同；原 fallback 只检查维度，可能降低检索正确性 |
| P1 | 模型成功 HTTP 并不表示输出正确 | 基线 30 次均 200，仍出现虚构作品名、年代错配和无据观点；没有结构、引用或归属校验 |
| P1 | 多模型超时拖慢交互 | 实验 V1/V2 多次连续超时，等待约 23–24 秒；提高 JSON 合规率不能靠连续延长超时 |

真实失败原文、case ID 和依据保存在 `docs/ai-evidence/reviewed-failures.json`，不是为测试编写的假模型输出。

## 2. Prompt 与模型调用修改

- 不再模拟出版社编辑或历史人物。明确当前任务为现代的“AI 辅助解读”。
- 上下文取自 R2 实际段落、作品目录元数据及注疏正文；排除 AI 整理内容作为历史证据，最多纳入 8 条来源并返回未纳入数量。来源块作为数据处理，不执行其中的指令。
- 要求区分原文记述、待核验历史注疏、现代研究和现代解释；不虚构注家、生平、年代、书名或创作背景，不把现代生成内容归给历史人物。
- 请求 JSON Schema：readings 包含 source_id、逐字 quote、现代 explanation，另有 uncertainty。短输出 1–3 个视角，原文必须被引用，多来源比较不能只给一个来源。
- 最终模型链为 `@cf/meta/llama-3.3-70b-instruct-fp8-fast` → `@cf/meta/llama-3.2-3b-instruct`，沿用 Workers AI binding，无新供应商或大型 SDK。较强模型替代弱小模型优先生成，原因是已记录的真实事实错误和 JSON 失败；仍不能据此保证准确。
- 每次模型等待最多 10 秒，总生成预算 22 秒。格式/引用不合格可尝试下一模型；**超时或账户额度耗尽立即停止 fallback**，避免在不可取消的 binding 调用后叠加推理。R2 读取时间另计，客户端仍有原来的 30 秒总等待限制。
- embedding 不跨模型 fallback，保留原先首选 Qwen 1024 维模型，验证有限数值。**实际生产索引建库模型未获得可核查清单，不能声称向量空间已完全对齐。** 未重建或改写生产索引。

调用参数按 [Workers AI JSON Mode](https://developers.cloudflare.com/workers-ai/features/json-mode/) 和 [Llama 3.3 fast 模型接口](https://developers.cloudflare.com/workers-ai/models/llama-3.3-70b-instruct-fp8-fast/) 实现；JSON Schema 成功仍需应用侧校验。

## 3. 输出校验与来源核验

`grounding.ts` 验证 JSON 类型、允许字段、条数、非空解释、来源 ID、重复 ID、原文锚点及多来源覆盖。每条引文必须逐字包含在对应服务端来源正文中；不存在的来源、AI 生成来源、错引片段、模型伪造 verified 字段全部拒绝。

V4 另外拒绝在现代解释中直接使用待核验来源的署名作为归属，以及上下文不存在的《书名》。这些规则针对实测失败，不是通用史实判定器。不能发现所有隐含错误、同名人物错配或无姓名的间接归属，仍需人工复核。

校验成功返回 `generation_status=validated`，含义仅为结构与引用规则通过。引用状态固定为 `context_matched`，**不等于 verified**。失败时返回 `generation_status=withheld`、真实来源和明确拒绝提示，不展示失败模型的散文。R2 故障返回 503，资料不存在返回 404，非法输入返回 400。外围开发代理可能在应用执行前失败，详见 D1 报告。

来源回查使用段落 ID + 注疏 ID，忽略客户端传来的正文、作者、书名；语义结果也回查 R2，跳过已经失效的索引注疏 ID。筛选检索遍历 R2 分页，移除原来仅扫描前 30 个文件的截断。

## 4. 数据结构与保留策略

没有 D1 Schema 变更，没有生产迁移或 R2 上传。通过 API 适配器为原内容添加字段，旧字段和原内容保留：

| 字段 | 处理 |
| --- | --- |
| source_id | 原文 `段落ID:original`；注疏 `段落ID:annotation:旧ID`，避免跨段冲突 |
| source_title | 沿用已有 source_title/source；没有则 null |
| author / dynasty | 沿用目录或原记录，不通过模型补全、不自动订正历史归属 |
| edition / reference | 有原字段则保留，否则 null，不从书名猜版本/卷页 |
| content_type | original_text / historical_annotation / modern_research / ai_interpretation |
| verification_status | unverified / ai_generated；本轮没有给未经审定的资料升级为 verified |
| ai_generated | 保留显式标记，并识别已确认生成脚本的 AI 前缀与模拟前缀 |

历史注疏类型表示“馆藏按此类收录”，不是真实性认证。现代研究元数据同样待核验。生成脚本今后新写记录会明确标注 AI 模拟、ai_generated 和 provenance_note，不再遗漏生成身份；重复生成检查改用实际 author_id，避免以不相等的 id_prefix 查重而反复追加。没有运行生成脚本或改写原数据。

无需数据库迁移；回滚可撤回本轮 API 适配、Prompt/校验及前端来源组件，原知识库和 D1 行完全不变。未来如需持久化来源审核，先另行提供非破坏性迁移：新增来源表/核验记录、保留原 source 与内容、分批回填、只读核对、回滚时停止读新字段；**本轮没有执行该方案**。

## 5. 前端交付与浏览器验收

- AI 面板和生成内容明确标为“AI 辅助解读”。
- 时间轴保留原文和全部旧注疏，历史/现代来源显示“出处待核验”；AI 模拟显示“非历史人物原文，不作历史依据”。
- 新增原生 details/summary 来源详情：类型、编号、题名、署名、原记录时代、版本、定位、核验状态及来源正文。缺失字段写“未提供”。
- 原生键盘展开可用；内容经 textContent 渲染，不执行模型 HTML/URL；引文匹配只显示“已匹配馆藏文本”，不显示“文献已核实”。
- 保留原选句取消、版本隔离和动效模块；只添加来源排版 CSS。
- 真实浏览器重新运行原前端回归：20/20，另加3项来源安全测试，合计23/23。固定 iframe 宽度 375/390/768/1440 下，展开来源详情后无横向溢出；这不是实体手机性能测试。

## 6. 评测集、脚本与实验

`evaluations/ai/cases.json` 固定 30 条：10 条明确原文平行来源、10 条多观点、10 条出处/年代含混或证据不足。明确来源只覆盖原文及作者，不把附录注疏视作已验证史料。10 条原文样本的外部 reference、定位、比对短句与版本范围已逐条保存。

外部对照为 [《漱玉词》四库转录](https://zh.wikisource.org/wiki/漱玉詞_(四庫全書本))、[《全唐诗》卷803](https://zh.wikisource.org/zh-hant/全唐詩/卷803)、[卷805](https://zh.wikisource.org/zh-hant/全唐詩/卷805)、[《赠邻女》](https://zh.wikisource.org/wiki/赠邻女) 等公开原文转录。繁简、异体、曉/晚、時節/佳節等异文保留，未把平行文本替换为生产版本。它们不是独立学术校勘认证。

- `run-live.py`：通过已有 Worker 真正调用 R2/Workers AI，默认并发 2；保存每条输出、状态和耗时，支持已有结果续跑；重测另用文件，不覆盖失败。
- `evaluate.py`：复算结构、来源、逐字引文、视角数量、不确定性及延迟指标。
- `RUBRIC.md`：事实准确性、引用真实性、解读完整性、观点区分、不确定性五项 0–2 分锚点。未获独立人工裁定的事实维度保留 null，禁止用“拒绝输出”或“200”充当事实正确。
- `cf-worker/tests/grounding.mjs`：受控边界/故障契约测试，与真实模型准确性实验分开保存。

基线 30/30 HTTP 200、没有结构化来源/引文/不确定性字段，中位耗时 2,755ms；不能因此宣称引用真实性为 0%，而是缺少可机验依据。

完整 V3 实验：28/30 HTTP 200，25 条生成并通过当时规则、3 条拦截、2 条外围传输 500；75 处引文匹配、0 处错配、0 个伪 verified 标签，中位耗时 7,007.5ms。它仍有未核实署名归属，因而追加 V4。

最终 V4 的统计、输出和逐样本规则结果见 `docs/ai-evidence/candidate-final-*.json`；本报告末尾附最终统计。V1/V2 与 V3 的失败记录保留，不能混合不同版本计算“准确率”。

## 7. 真实失败与限制

1. 基线 clear_source-01 把如梦令叫作《花间知否知非》。公开《漱玉词》对照可直接否定该生成题名。
2. 基线 multiple_views-01 把沈际飞称为清代、陈廷焯称为现代，与输入馆藏元数据也冲突。
3. 基线 insufficient_evidence-10 为《女诫》段落另造《论事曲直》论文。
4. V2 clear_source-01 的引文匹配正确，但解释“绿肥红瘦表达对美丽的期望”缺乏支持，证明格式与引用不能替代语义审读。
5. V3 insufficient_evidence-01 出现“马融注解/李艳研究”的确定署名表述，来源本身未核实；V4 拒绝此类直接归属。
6. 真实运行出现非 JSON HTTP 500，与开发传输 Socket 断开对应；不能把此类失败排除出总体请求分母。

## 8. 修改文件

AI 后端：`cf-worker/src/routes/ai.ts`、`src/routes/knowledge.ts`、新增 `src/sources.ts` / `src/grounding.ts`。

生成链：`knowledge_base/scripts/ai_historical_annotator.py`，仅修改未来生成标记，没有改写古籍 JSON。

前端：`js/ui/aiPanel.js`、`js/ui/timeline.js`、新增 `js/ui/sourceDetails.js`、`index.html` 的 AI 标题、`css/components.css` 的来源展开排版。

测试与证据：`cf-worker/tests/grounding.mjs`、`evaluations/ai/{cases.json,run-live.py,evaluate.py,replay.mjs,RUBRIC.md}`、`docs/ai-evidence/*`、本报告。并行完成的 D1 文件变更另列于 `D1-RELIABILITY-REPORT.md`；之前 V2 UI 改动仍在工作区，不把其全量差异算成本轮 AI 改动。

## 9. 下一阶段建议

1. 优先人工核验972条旧注疏的真实性和段落关联，建立有版本、卷页、影印/可靠转录链接及审核记录的来源清单；不要直接批量改为 verified。
2. 对范晔等年代编码歧义、跨诗泛论和“新来瘦”错关联优先建校勘工单，保持原记录可追踪。
3. 文学研究者按 rubric 独立评定30条，尤其审查引文支持关系、隐含历史归属、解释完整性；扩充异文/同名人物/无注疏/提示注入样本和检索 Recall@k。
4. 获得索引建库模型、版本、维度和预处理清单；在隔离索引中核对向量空间并重新评测，再决定生产索引调整。
5. 继续观察远程绑定 Socket 错误；在经审阅的部署中启用生产安全日志。本轮未证明长期生产可用性。
6. 当前结果只能支持“来源展示与拒绝机制改进”，不支持“AI 已无事实错误”或一个未经专家审定的事实准确率。

## 最终 V4 实验与交付状态

| 指标 | 实际结果 |
| --- | --- |
| 固定样本 | 30 条，三个类别各10条 |
| HTTP 成功响应 | 30/30（降级响应，不等于生成成功） |
| 实际生成并通过 V4 校验 | **0/30** |
| 拒绝/不可生成 | **30/30**，两模型均报告 model_unavailable |
| 来源详情 / AI 标记 / 证据局限 | 30/30 保留 |
| 独立安全诊断 | Workers AI **4006，daily free allocation 已用尽**；分类为 model_quota_exceeded，原始异常不回传 |
| 中位接口耗时 | 1,739ms，不能与生成耗时直接比较 |
| V3 真实输出离线重放 V4 | 25条已有生成输入中20条接受、5条拦截；其他5条原本无生成输出。**不是最终模型质量的实时通过率** |
| 后端回归 | 24项隔离D1 + 33项AI/R2/校验/超时/额度测试 + 4项HTTP/WebSocket，共61项通过 |
| 前端回归 | 原有20项 + 新增3项来源安全，23/23通过 |
| 布局与操作 | 375/390/768/1440四档展开来源无横向溢出；键盘 Enter 可展开 |

V4完整真实评测之后，安全诊断请求确认4006。早先30条仅保存通用 model_unavailable，因此不能反过来声称每条供应商原始异常都已单独核实为4006。没有覆盖、删除或把这30条降级结果计为正确解读。

诊断后停止所有真实模型调用，增加额度明确提示及停止同账户模型重试；这两处处理经隔离测试验证，未再次消耗真实额度。最终版本的**正常真实生成质量仍未验收**，须在额度恢复后使用新输出文件重跑30条，并由文学研究者复核。未自动购买额度或调整账户计划。

证据：`baseline-live.json`、`candidate-v2-live.json`、`experiment-v3-live.json`、`candidate-final-live.json`、`candidate-final-metrics.json`、`provider-diagnostic.json`、`replay-v4.json`、`contract-tests.json`、`browser-results.json`，均位于 `docs/ai-evidence/`。数据/脚本/后端关键文件哈希见 `run-manifest.json`。
