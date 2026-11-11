# V2 正式发布前性能、响应式与回归验收

日期：2026-11-06。候选对象为当前工作区，未提交、推送 main，未部署生产、修改生产数据库或调用真实 AI 推理。

**发布建议：NO-GO，暂不正式发布。** 前端性能和本轮交互修复已通过实验室验证；新增鉴权安全探针 FAIL，既有 AI 质量 FAIL、文献证据链和真实 Socket 根因仍 BLOCKED。不能把 Lighthouse 98/100 或既有后端测试通过解释为整站发布通过。

## 1. 已有测试审计与复用

本轮复用了前端审计证据、当前测试入口及 AI 和反馈验收资料。早期审计的界面测量、故障与恢复记录保存在本地 `docs/audit-evidence/`。 [AI 验收](AI-RELEASE-READINESS.md) · [用户反馈](USER-FEEDBACK.md)

| 已有结论 | 本轮处理 |
| --- | --- |
| 旧 V2 报告 20 个模块测试、iframe 布局和真实接口记录 | 保留历史结论，不将旧 188ms LCP、偏移总和或最大事件时长当成本轮标准 CWV |
| 最近前端模块 35/35、反馈浏览器 15 组、分析浏览器 17 组 | 不全量重跑未改的反馈/埋点测试；本轮有全局字体、动效和移动热区变化，因此重跑 35 个模块和现有 17 组阅读回归，另以实际隔离 Worker 验证反馈与账号路径 |
| 最近后端 129/129 和 typecheck | 核对 14 个后端源码/配置/Schema/package 文件哈希均未变化后复用，没有为本轮前端修改再重复完整后端测试 |
| AI 质量 FAIL、来源可信度与 Socket BLOCKED | 没有改变其状态，未重新花费模型调用预算，也没有以受控 AI 绑定输出替代真实质量验收 |
| 旧报告的“错误密码 401” | 仅证明普通错误密码用例；新探针发现可碰撞的不同密码被接受，不能外推为密码存储安全 |

复用依据见 [reused-tests.json](v2-release-evidence/2026-11-06/reused-tests.json)。历史报告和旧证据没有覆盖或删除。

## 2. 问题清单与优先级

问题清单先于修复向用户输出，随后根据实际测试更新：

| 编号 | 级别 | 已确认问题 | 状态与处理 |
| --- | --- | --- | --- |
| Q01 | P0 | 社区密码使用简单 32 位整数哈希；本地实际注册一种密码后，用另一种碰撞密码登录返回 200 并获得令牌 | **FAIL，未修复。** 属候选鉴权代码的真实安全问题，不是生产账号攻击；不能正式开放账号/社区功能 |
| Q02 | P0 发布门槛 | wrangler vars 保留示例 JWT_SECRET；生产实际是否由 Secret 覆盖未验证 | **BLOCKED。** 示例值不具备安全性；不能根据测试环境独立密钥推断生产已正确配置 |
| Q03 | P1 | 外部 Google 字体阻塞首屏且产生大量 CJK 字体请求；基线移动 Lighthouse LCP 9.05s、传输 3.35MB | **已修复，LAB PASS。** 改用系统中文衬线字体栈，移除外部字体和预连接；保留原版式、字号、墨色与布局 |
| Q04 | P1 | 同步外部 Markdown 脚本可延迟 DOMContentLoaded 与核心交互初始化 | **已修复，LAB PASS。** 改为 async；既有安全纯文本回退保持可用，未增加依赖或改写 AI 内容渲染流程 |
| Q05 | P1 | 脚本迟到时，已经显示的首页标题会被入场动画再次隐藏 | **已修复。** 首次内容已绘制时不再重播首页初始渐入；延迟模块探针验证已显示标题不再降至透明 |
| Q06 | P1 | 移动菜单实际宽约 37.1px；关闭、解读、图例等部分移动控件也缺少统一 44px 最小热区 | **已修复。** 菜单实测 44×49px；相关移动控件增加 44px 最小热区，缩小登录按钮横向留白以保持 375px 布局 |
| Q07 | P1 既有 | AI 真实生成质量未通过 | **FAIL，继承既有真实评测。** 本轮只验主动请求和服务降级行为 |
| Q08 | P1 既有 | 首页一键体验缺少完整人工核验原文和两条历史注疏证据链 | **BLOCKED。** 本轮实际 Worker 返回 unavailable，测试诚实提示和普通馆藏入口，未伪造 approved 示例 |
| Q09 | P1 既有 | 真实远端 Socket 异常根因及拟部署版本差异未完成验证 | **BLOCKED。** 本地断网恢复不等于远端根因修复 |
| Q10 | P2 观测 | Trace 有一次约 154ms 的渲染主线程任务，主要为 118.9ms Layout；短时堆有净增 | 保留证据，未为单次冷渲染重写页面；需低端真机与长时内存复测，不能宣称绝无掉帧或泄漏 |
| Q11 | P2 | CSS 仍分层导入，Markdown 仍使用现有未固定版本的 CDN 地址 | 不做整页重写；首屏已达本轮实验室预算。资源打包/依赖固定可另行做最小改动并回归 |

Q01 证据：[security-gate.json](v2-release-evidence/2026-11-06/security-gate.json)。只对新建的隔离测试账号验证，没有读取或修改生产用户。该探针预期错误密码 401，实际 200，明确保存为 FAIL。

**Q01/Q02 没有被前端补丁消除。** 需要后端安全迁移：采用带随机盐的密码 KDF、制定存量弱哈希账号的安全重置/迁移方案、验证独立高强度 JWT Secret 并轮换不安全凭据，之后重新验证错误密码拒绝和会话权限。现有哈希无法恢复原密码，不能在没有账号迁移方案时通过静默改算法或自动改生产数据冒充修复。本轮没有修改鉴权规则或生产账号。

## 3. 测试环境与边界

| 项目 | 实际环境 |
| --- | --- |
| 主机 | macOS / darwin arm64，Apple M5，10 个逻辑 CPU，16GiB 内存 |
| 浏览器 | Google Chrome 156.0.8078.80，真实 headless Chrome；未禁用 GPU，但没有完成 GPU 硬件、图层内存或电耗验收 |
| 工具 | Lighthouse 13.6.0 CLI；Chrome 原生 CDP 的 Network / Performance / Tracing / HeapProfiler / DOMDebugger / Emulation；PerformanceObserver |
| DevTools MCP | 当前不可用，采用用户允许的其他可用性能工具；原始 Trace 与报告可导入/查看 |
| 业务环境 | 当前真实前端文件与当前 Worker 路由；Miniflare 临时 D1/R2，复制现有馆藏 JSON，仅创建 TEST ONLY 账号/帖子/评论/反馈/进度 |
| AI / 搜索绑定 | 受控 AI 不可用响应及搜索绑定，用于验传输、来源回读、跳转和降级，不用于评测模型/搜索相关性 |
| 响应式 | 原生 viewport 375×844、390×844、768×844、1440×844，触屏输入事件；原有回归另含桌面 1440×1000 |
| 软键盘代理 | 仅缩短为 390×460 的视口，不能等同系统软键盘 |
| Lighthouse mobile | 默认 412×823、DPR 1.75、4× CPU、模拟 RTT 150ms / 吞吐约 1.6Mbps；具体网络参数在原始 configSettings 中 |
| Lighthouse desktop | 默认 1350×940、DPR 1、CPU 1×、模拟 RTT 40ms / 约 10Mbps |
| CDP mobile | 390×844、DPR 1、实际 CDP 4× CPU、150ms 延迟、204800 bytes/s 下载；与 Lighthouse 的模拟计算方式不同，不能混算均值 |
| 缓存 | CDP 清除浏览器缓存且禁用缓存；Lighthouse 独立运行并重置存储。OS/DNS/TLS、公开 CDN 上游缓存不受完全控制 |
| 服务与主题 | 本机 HTTP 静态服务，no-store、未模拟生产 Brotli/CDN 缓存；性能截图跟随主机暗色偏好，现有阅读回归采用浅色配置 |

没有真实手机、Safari/Firefox、用户 RUM/CrUX 或与候选代码一致的生产部署数据。本机 API 延迟不能代表跨地域 R2/D1/AI 延迟。所有结果均区分实验室、继承证据和未获得数据。

## 4. 实际性能指标

### Lighthouse：首屏实验室

最终 mobile 连续三次执行；desktop 一次。下面为工具报告值，不是用户样本分位数：

| 指标 | 修改前 mobile（1次） | 最终 mobile（3次，中位数） | 最终 desktop（1次） |
| --- | ---: | ---: | ---: |
| Performance | 68 | 98（3次均98） | 100 |
| LCP | 9.051s | 1.808s（1.806–1.810s） | 0.444s |
| FCP | 2.679s | 1.808s | 0.444s |
| CLS | 0.01825 | 0.01822（3次相同） | 0.00109 |
| TBT | 0ms | 0ms | 0ms |
| Speed Index | 4.706s | 1.808s | 0.448s |
| 页面传输量 | 3,354,748 bytes | 378,776 bytes | 390,931 bytes |
| 首屏 Accessibility | 100 | 100 | 100 |

传输量按 Lighthouse total-byte-weight，mobile 相比单次基线减少约 88.7%。分数和数值仅表示本次本机实验条件；不是全站可访问性认证，也不是移动真机结论。[Lighthouse scoring 与波动说明](https://developer.chrome.com/docs/lighthouse/performance/performance-scoring)

最终原始 [移动报告](v2-release-evidence/2026-11-06/after/lighthouse-mobile-1.report.html)、[桌面报告](v2-release-evidence/2026-11-06/after/lighthouse-desktop-1.report.html)、[三次摘要](v2-release-evidence/2026-11-06/after/lighthouse-summary.json)。

### 原生 CDP：最终代码独立观测

| 条件 | LCP | 标准会话窗 CLS | 应用就绪墙钟时间 | 应用 JS 异常 |
| --- | ---: | ---: | ---: | ---: |
| 390px、4× CPU、150ms / 1.6Mbps、冷缓存 | 2.476s | 0.06890 | 2.474s | 0 |
| 1440px、本机 CPU/无额外网络降速、冷缓存 | 0.052s | 0.00107 | 0.107s | 0 |
| 390px、第三方静态资源全部阻断 | 0.040s | 0 | 0.099s | 0 |

移动基线 CDP LCP 为 6.580s；修复后最终值 2.476s，已接近 2.5s 的边界，仍需真实设备与线上数据确认。CDP 观察到一次 65ms 的加载长任务；不能用 Lighthouse TBT=0 推断整个生命周期无长任务。第三方阻断场景有一条预期的 Markdown 网络失败，不算作正常网络零错误。

CLS 按排除 hadRecentInput 后的最大会话窗计算：相邻偏移间隔小于 1 秒、窗口最长 5 秒，采用最大窗口和，不再使用旧报告的全程累加。[标准 CLS 定义](https://web.dev/articles/cls)

LCP≤2.5s、CLS≤0.1、INP≤200ms 是参考目标；真实站点需按用户数据的第 75 百分位分设备判断。本轮没有这些用户数据，不能声明线上 CWV 通过。[Web Vitals](https://web.dev/articles/vitals)

**INP：真实用户数据未获得。** 没有把实验室点击、Trace 单任务时长、TBT 或最大 Event Timing 当作真实用户 INP。本轮也未新增不经同意的性能追踪。

### 资源、字体与故障

最终 CDP 正常冷加载传输约 390,633 bytes，0 个字体请求，document.fonts.status=loaded 表示本机字体集合完成，不代表下载了远程字体。原 Google 字体方案在 Lighthouse 中约有 66 个字体请求。

当前图标 14,161 bytes；原 1,947,932 bytes 图标保留，最终网络记录没有加载它。没有为 Lighthouse 的少量图标压缩建议删除原资源或重写页面。

受控地将第三方字体/Markdown 请求延迟 5 秒：基线在约 1.21s 应用尚未初始化，到约 6.96s 才初始化；最终约 1.22s 时已初始化并可绑定交互。该探针是等待期间的采样，不能把 1.22s 当作精确初始化时间。见 [最终延迟探针](v2-release-evidence/2026-11-06/after/third-party-delay.json)。

中间尝试只改为可选/异步字体时，Lighthouse mobile LCP 为 4.14s、12.64s、4.14s，仍不合格。因此进一步移除远程字体，不把中间结果掩盖为成功。[中间方案记录](v2-release-evidence/2026-11-06/async-font-attempt/lighthouse-summary.json)

本机 no-store / 无压缩会引发 Lighthouse 缓存、BFCache 和压缩建议，不能直接判为生产 Pages 配置错误。CSS 多层依赖仍存在，但没有为 P2 体积建议全量合并页面。

## 5. 动效、Trace 与内存

| 表面 | 实测/检查 |
| --- | --- |
| 首页水墨 | 保留 SVG 和有限 CSS ScrollTimeline 位移；不支持时静态回退；没有应用级永不停止的 RAF 循环 |
| 首页初始渐入 | 迟到模块 2200ms 探针：修复前已显示标题再次降至 opacity=0；修复后应用就绪后的最小 opacity=1，不再重隐藏 |
| Scroll Reveal | IntersectionObserver 首次呈现后 unobserve；初始化幂等。文档监听在循环测试中保持11个，没有按次数新增 |
| 页面/书架 | 保持 transform/opacity 的短过渡；触屏不依赖 hover 才能阅读/打开档案；四宽度实际操作通过 |
| 原文与时间轴 | 原文选择、时代切换、来源展开、返回原文通过；测试点击先检查控件可见、位置稳定且中心未被遮挡 |
| AI 面板 | 用户主动请求后展示受控不可用降级与实际馆藏来源；未自动发起生成，也不阻断继续阅读 |
| reduced-motion | 运行时切换 reduce 后核心阅读仍可用，无 running/pending 动画；原有回归同样通过 |

[标题闪烁探针](v2-release-evidence/2026-11-06/after-motion-fix/hero-opacity.json)。没有用整页强制等待解决动效问题。

四宽度核心链路 Trace 包含 192,599 个事件、1,125 个 BeginFrame、1,000 个 DrawFrame；这些计数不能直接计算“全程60fps”。有一次渲染主线程 RunTask 154.355ms，以 Layout 118.855ms 为主，附近有导航提交事件。保留为启动/布局尖峰观测，未宣称动画每帧无掉帧。见 [任务分析](v2-release-evidence/2026-11-06/interactions/long-task-analysis.json) 与 [压缩 Trace](v2-release-evidence/2026-11-06/interactions/interaction-trace.json.gz)。

正常动效偏好下，强制 GC 后的短期循环观察：

| 页面/时间轴循环次数 | JS Heap bytes | DOM 节点 | DOM 总监听 | document 监听 |
| --- | ---: | ---: | ---: | ---: |
| 0 | 1,276,564 | 2,949 | 121 | 11 |
| 10 | 1,316,796 | 2,951 | 122 | 11 |
| 20 | 1,381,500 | 2,951 | 122 | 11 |
| 30 | 1,403,256 | 2,951 | 122 | 11 |

堆净增 126,692 bytes（约9.9%）；节点/监听在首段循环后稳定，不能据此证明没有长期泄漏，也不能仅凭净增断言泄漏。5 秒静置期间主线程 TaskDuration 增加 5.687ms（约0.114% 时间），无 running/pending 的定时动画；这不是整个浏览器进程或 GPU 的 CPU/电耗指标。证据见 [functional.json](v2-release-evidence/2026-11-06/interactions/functional.json)。

## 6. 响应式与核心回归

四种指定宽度均使用真实浏览器 viewport，原始 DOM 和实际隔离 Worker/R2 读取，不使用 iframe 缩略图替代操作：

| 流程 | 375 | 390 | 768 | 1440 |
| --- | --- | --- | --- | --- |
| 首页、导航、作品书架/详情 | PASS | PASS | PASS | PASS |
| 未核验示例提示→普通馆藏原文 | PASS | PASS | PASS | PASS |
| 定位原文、展开时间轴、切换时代 | PASS | PASS | PASS | PASS |
| 历史来源、AI 降级来源详情 | PASS | PASS | PASS | PASS |
| 来源纠错表单、成功提示、继续阅读 | PASS | PASS | PASS | PASS |
| 搜索提交与点击目标段落 | PASS | PASS | PASS | PASS |
| 横向溢出 | 无 | 无 | 无 | 无 |

这不表示“一键已核验示例”通过。真实本地 Worker 没有完整获批清单，实际路径为：

```mermaid
flowchart LR
  A[首页一键体验] --> B[核验示例 unavailable]
  B --> C[明确数据缺口]
  C --> D[先读馆藏原文]
  D --> E[选句与时间轴]
  E --> F[来源待核验说明]
  F --> G[主动 AI 请求与降级]
  G --> H[反馈或继续阅读]
```

另外通过实际隔离账号/API 完成：普通错误密码提示、正常登录及刷新保持、社区发帖和评论、个人页帖子、通过真实返回按钮回社区、原文选择后阅读进度写入及 API 读回、网络断开后空白错误态及恢复重试。普通功能 PASS 与 Q01 的安全 FAIL 同时成立，不能互相替代。

模拟高度缩至390×460时，登录密码框位置 top=245.8 / bottom=293.8，处于视口内；仅证明该缩短视口场景，不证明 iOS/Android 输入法、安全区、visualViewport 或键盘弹起后所有按钮可见。

自动化点击增加了稳定性和命中检查，避免直接点击尚隐藏的“发布话题”按钮或对移动控件强制派发。首轮四个失败记录保留在 functional-initial.json；等待可操作后完整重跑17组通过。没有把这些测试准备问题宣称为产品 bug 已修复，也没有将无法复现的远端 Socket 改判通过。

## 7. 自动化结果与修改记录

| 检查 | 状态 | 依据 |
| --- | --- | --- |
| 现有前端模块 | PASS：35/35，新执行 | regression/module-tests.json |
| 现有阅读/错误/减少动效回归 | PASS：17/17组，新执行 | regression/browser-flows.json |
| 实际隔离 Worker 前端联调 | PASS：17/17组，新执行 | interactions/functional.json，无未捕获JS异常 |
| 登录、个人页真实返回按钮与进度补测 | PASS：2/2组，新执行 | community-return/functional.json |
| Lighthouse | 实验室首屏性能 PASS | 三次mobile98、desktop100；不当作真实用户通过 |
| 标题迟到动效与第三方等待 | PASS | 专项原始采样保留 |
| 后端功能/typecheck | PASS：129/129，复用 | 14个源码/配置/Schema/package哈希一致；本轮未重跑 |
| 新增安全门槛 | **FAIL** | 错误碰撞密码实际获得令牌；security-gate.json |
| 真实用户 INP/CWV、真实手机 | NOT_TESTED / 未获得 | 无 RUM/CrUX 或手机硬件数据 |
| 拟部署版远端稳定性/文献/真实AI | BLOCKED / FAIL，继承报告 | 本轮未调用真实模型或部署 |

生产文件只修改四处：

- index.html：移除外部字体资源/预连接，Markdown 改 async。
- css/variables.css：中文系统衬线字体回退栈。
- css/components.css：移动热区与登录按钮横向留白。
- js/motion/index.js：跳过对已经绘制首页内容的重新隐藏渐入。

新增 tests/release-qa/ 下的本机服务、CDP、测量、Lighthouse、联调、故障和安全探针脚本，以及本报告和证据。没有修改 Worker 业务、鉴权、模型 Prompt、馆藏数据、生产库或其他页面结构。中间 fonts.js 试验已移除，失败测量单独保存。

## 8. 必须完成的人工真机步骤

状态均为 NOT_TESTED，不用 Chrome 触屏模拟代替：

1. iPhone Safari 与 Android Chrome 各至少一台，记录机型、OS、浏览器版本、网络和系统字体；按375/390附近的实际CSS宽度测试，另测平板与横屏。
2. 首次冷开及回访，检查本机中文字体、标题折行、CTA、菜单44px热区、安全区和地址栏收缩；浅/深色各一次。
3. 首页→缺口提示/获批后的正式示例→原文→切换至少两条时代注疏→展开长来源→反馈→继续阅读，检查滚动位置、双击、惯性滚动与点击不被页头遮挡。
4. 搜索框、登录密码和500字反馈说明分别调起中文/英文输入法；检查键盘遮挡、输入法候选栏、表单提交、取消、旋转、收起键盘和页面返回。不能只改 viewport 高度。
5. 动态弹窗 Tab/Shift+Tab（外接键盘）、Escape/关闭与焦点恢复；iOS VoiceOver / Android TalkBack 的控件名、状态播报、来源 details 与错误提示。
6. 系统开启减少动态效果再进入，运行期间切换一次；确认水墨、Scroll Reveal、时间轴和AI面板均可用且无反复闪烁。
7. Wi-Fi/蜂窝、弱网、断网/恢复、第三方 CDN 不通、后台30秒再回来、浏览器后退/前进和刷新，确认不重放提交、不替换为伪造原文。
8. 修复P0后用专门预发账号验证真实登录/进度；30–60分钟反复阅读、切书、来源、弹窗和AI请求/取消，观察崩溃、内存、发热、电耗和帧率，保存真机证据。

## 9. 发布建议与复现

**正式发布：不通过。** 优先处理已证实的鉴权 P0 和生产密钥证据；随后完成 AI 质量、核验示例、Socket 观测及同版本预发/真机验收。当前仅适合受控内部只读审阅和继续验收；不能凭本轮首屏性能通过开放完整外部账号、社区与 AI 服务。

复现脚本在 tests/release-qa/。临时工具安装于 `/tmp/ntm-release-qa-tools`，未修改项目依赖。先从项目根目录运行本机隔离服务，再按序测量，避免多轮性能浏览器互相竞争 CPU：

```sh
npm install --prefix /tmp/ntm-release-qa-tools --no-audit --no-fund lighthouse@13.6.0
node tests/release-qa/serve.cjs
# 另一个终端，使用新的阶段名称防止覆盖已有证据：
node tests/release-qa/measure.cjs NEW-PHASE
node tests/release-qa/lighthouse.cjs NEW-PHASE
node tests/release-qa/dependencies.cjs NEW-PHASE
node tests/release-qa/motion-probe.cjs NEW-PHASE
# 以下只对上面创建的临时数据库验证，安全探针目前应失败：
node tests/release-qa/security-gate.cjs
```

本机服务占用 localhost:8787，仅监听回环地址；结束本轮已启动进程，不停止生产或用户其他服务。完整实验室指标见 [performance-summary.json](v2-release-evidence/2026-11-06/performance-summary.json)，版本/哈希和证据索引见 manifest.json。Trace 以无损 gzip 归档；需要时解压导入 Chrome Performance。没有把安装工具时的一次网络重置或受控断网当作产品运行时异常。

未提交的候选版本以交付清单的文件 SHA-256 标识，不用 HEAD 代替工作区版本。安全探针先核对本轮隔离服务进程及 test 环境，拒绝向其他 localhost 服务写入。其他系统需设置 CHROME_BIN 为本机 Chrome 可执行文件。
