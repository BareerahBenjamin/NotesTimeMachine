# D1 接口可靠性调查与修复

> 本文为 2026-10-19 的历史调查快照。2026-11-06 的测试、Socket 观测与发布判断见 [AI-RELEASE-READINESS.md](AI-RELEASE-READINESS.md)。

日期：2026-10-19（Asia/Hong_Kong）。本地代码与真实远程绑定联调；**未部署，未提交/推送 main，没有执行生产 SQL 写入或清空数据**。

## 结论与证据边界

已复现并修复非法分页进入 SQL 导致的 500；修复多步骤写入缺少事务、点赞唯一键竞争等可复现可靠性缺陷。还定位到本地代理把 WebSocket 升级交给普通 Undici fetch 的错误，新增正确的握手/消息桥接。

**偶发 500 不能宣布已根治。** 原始日志中的 `D1_ERROR: Failed to parse body as JSON, got: TypeError: fetch failed` 出现在 Miniflare/Undici 远程绑定传输路径；本轮同时在无 D1 调用的 AI/R2 请求上记录到 `UND_ERR_SOCKET` 及非 JSON 500。这说明数据库不是唯一可能来源。尚无生产 Observability 日志证明 Cloudflare D1 服务端自身异常，亦未证明代理、上游连接哪一端导致 Socket 关闭。

## 调查范围

已阅读 `docs/V2-AUDIT.md`；检查 `cf-worker/src/index.ts`、全部 routes、`schema.sql`、Wrangler 配置、本地开发代理和所有 `DB.prepare/bind/first/all/run/batch` 调用。

- D1 只出现在社区模块：账户、分类、帖子、评论、点赞、主页统计、阅读进度。
- 作品、段落、注疏来自 R2；语义检索来自 Workers AI + Vectorize + R2，均不依赖 D1。
- `DB` 绑定名称与代码一致。实际结构与仓库六张表一致：users/categories/posts/comments/likes/reading_progress。没有发现缺表/缺字段证据。
- 仓库仅有幂等初始化 schema，无版本化迁移目录。本轮未改变表结构和索引，无生产迁移/回滚操作。
- 实际结构读取使用过一次 `d1 export --remote --no-data`。Wrangler 提示导出可能暂时占用数据库，操作已结束；只获得结构，没有导入或执行导出文件内 SQL。后续应使用 `sqlite_master`/PRAGMA 元数据读取，避免再次占用。未保存用户行或临时下载凭证到仓库。

## 问题与根因

| 等级 | 实际问题 | 根因 / 状态 |
| --- | --- | --- |
| P0 | `posts?page=bad` 和用户帖子同类请求返回 500 | NaN 进入 LIMIT/OFFSET 参数绑定。真实基线 18 次中复现 2 次；增加严格整数校验后返回 400 |
| P1 | `per_page=0/-1`、错误 category、非法进度、JSON、JWT subject | 参数转换/约束缺失。进度非有限数值可能导致 D1 类型/约束错误；本地故障与边界测试覆盖 |
| P1 | 评论/计数、删帖多步骤部分提交 | 原来多条 SQL 独立执行。改用 D1 batch 事务；触发器让第二步失败，验证第一步回滚 |
| P1 | 并发点赞重复 INSERT、计数漂移 | 先读后写竞争 UNIQUE(post_id,user_id)，计数另行更新。冲突忽略+同批重算实际行数 |
| P1 | 注册把所有 D1 错误归为“用户名已存在” | catch 覆盖过宽。只将 UNIQUE 冲突映射为原有重复用户名响应，其余分类处理 |
| P1 | 缺少结构化日志，响应暴露原始异常 | 只有泛化错误文本，无法辨别绑定/Schema/传输；旧 detail 可能泄漏内部信息 |
| P1 | 开发代理 `invalid upgrade header` | WebSocket 请求进入普通 fetch；本地受控回显已复现旧路径的 UND_ERR_INVALID_ARG，并验证新路径 |
| 未解决 | 间歇性 UND_ERR_SOCKET / 远程绑定非 JSON 500 | 定位到开发传输层，最终真实评测仍出现；具体连接关闭原因未证实 |

## 修复方法

1. `reliability.ts`：请求级 D1 装饰器，不共享跨请求状态；SQL 始终使用绑定参数。400 参数错误、409 唯一键/外键冲突、500 Schema/内部错误、503 数据库连接/超时分别处理。没有增加自动写重试。
2. `community.ts`：校验页码、每页数量、ID、文本、阅读进度和已签名 JWT 的 subject；保留原业务响应的主要字段与成功状态。评论新增/删除、删帖、点赞使用 batch，计数按实际表行数计算。
3. `index.ts`：统一错误响应与 `X-Request-ID`，删除原始异常 detail 和原有 URL logger。修正已有 CORS 返回类型与静态字节 Buffer 类型问题。
4. Wrangler 配置准备启用 Observability（采样 1）、关闭自动 invocation URL 日志、隐藏 query string、开启 source maps。**仅本地配置，线上是否已启用未验证，未部署。** 使用 `wrangler types` 生成绑定声明，加入严格 TypeScript 检查。
5. `scripts/dev-transport.cjs`：普通 HTTP 清理 hop-by-hop headers；WebSocket 使用现有代理 dispatcher，通过 Miniflare WebSocketPair 桥接，并关闭对应连接。不改变 TLS 校验、权限或生产 Worker 网络实现。

D1 batch 的事务语义参见 [Cloudflare D1Database API](https://developers.cloudflare.com/d1/worker-api/d1-database/)。传输错误不代表 SQL 语法错，重试必须判断幂等；参见 [D1 错误诊断](https://developers.cloudflare.com/d1/observability/debug-d1/)。本轮没有叠加数据库重试。

## 日志与隐私

结构化条目包含 `request_id / route / method / status / duration_ms / error_type / database_operation / exception_stack`。route 为路由模板，database_operation 为允许列表中的表名与动词，不含 SQL 和绑定值。stack 仅保留调用帧，不输出可能包含用户值的异常首行；错误 cause 仅供内部分型。

开发传输日志只记录原因类别/代码、允许列表中的 header 错误、时间和调用帧，不记录 URL 查询、请求头、请求体、Token、密码、Cookie 或阅读进度。真实只读探针只保存状态/耗时/请求编号。测试验证日志不含测试凭证或私人段落标识。

## 实际运行的测试

- `cd cf-worker && npm run typecheck`：严格 TypeScript 检查通过。
- `npm test`：24 项隔离 Miniflare D1 测试、33 项 AI/R2 契约测试、4 项本地 HTTP/WebSocket 测试通过。受控故障测试不代表真实网络可靠性。
- D1 测试包含注册/登录、鉴权、非法输入、空数据、发帖/读帖、评论、点赞、进度 upsert、写入用户隔离、20 次串行读取、6 路有限并发、SQL 失败回滚、模拟超时/连接丢失及无写重放。已有用户/评论索引的 EXPLAIN QUERY PLAN 验证通过。
- 真实远程 D1：基线 18 请求为 15×200、1×404、2×500（包含宽松非法参数返回 200）；修复后及代理修复后两轮各 18 请求均为 12×200、1×404、5×400，无非预期 500。原始统计见 `docs/d1-evidence/remote-*.json`。
- 原有前端模块回归在浏览器重新执行：20/20 通过，新增3项来源安全测试后合计23/23。来源信息新展示没有删除书架、导航、选句、注疏或取消请求逻辑。
- 真实 AI/R2 V3的30样本运行仍有2次传输失败；最终V4因模型额度耗尽全部降级，详见 AI 报告。没有通过增大超时或伪造静态返回掩盖失败。

## 修改文件

`cf-worker/src/reliability.ts`、`src/index.ts`、`src/routes/community.ts`、`src/worker-env.d.ts`、`wrangler.jsonc`、`tsconfig.json`、`package.json`；开发代理 `scripts/dev-proxy.cjs` 与新增 `scripts/dev-transport.cjs`；`tests/reliability.mjs`、`tests/dev-transport.mjs`、`tests/remote-read-probe.py`；本报告及 `docs/d1-evidence/*`。AI 内容相关改动另列于 AI 报告。

## 剩余风险与进一步观测

- 代理及远程绑定的 Socket 错误仍需持续收集；按时间对齐请求编号、应用日志、dev_transport_error。若响应缺少应用生成的 X-Request-ID 且不是 JSON，优先调查 Miniflare/远程绑定外围路径，不能归为某条业务 SQL 的错误。
- 生产需在审核后部署日志改动，再通过 Workers Logs 观察相同路由和失败类型；本轮未进行生产部署、tail 或写压测。不能用本地 18 次成功推断长期生产可用率。
- 并发点赞保证唯一行和计数一致，但多次同时点击会合并相同读到的意图；不是严格线性化的 toggle。客户端应防重复点击，未来可增加显式 desired_state/幂等键接口。
- 评论等非幂等写入发生连接中断时，提交结果可能未知。必须先读取核对，禁止自动重放；本轮不引入客户端/服务端盲重试。
- 用户进度的公共读取沿用原个人主页产品契约；已验证不能通过请求体改写另一个用户的数据，未擅自改变公共展示权限。现有演示密码散列与生产 JWT 配置需单独安全审查，不在本轮变更鉴权算法。
