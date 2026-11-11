# 注疏时光机 V2.0：设计与集成方案

## 阶段一 · 现状

原生 HTML / CSS / ES Modules 单页站点；六个视图：首页、作者、书架、阅读器、社区、个人主页。main.js 处理导航与事件委托，reader / timeline / aiPanel 各自管理内容，state.js 存储阅读状态，api.js 连接既有 Worker。

现有问题：首屏只有宣传文字；书架书脊信息密度低；原文 hover 改 padding 导致文字跳动；注疏面板用 max-height 动画且可能裁切；时间轴没有可操作节点；持续的装饰动画干扰阅读；键盘无法选段、筛选朝代；详情弹窗缺少焦点管理。离线示例未同步 currentParagraphs；快速选句缺少旧请求保护。

## 阶段二 · 视觉规范

- 定位：新中式数字文学博物馆。以文学展签、长卷留白、现代编辑式排版建立层级。
- 宣纸 #F7F5EF，纸面 #FDFCF8，墨色 #252E2B，淡墨 #626D67，朱砂 #A44132，墨绿 #365B4D；另设完整夜读配色。
- 正文与古籍使用现有 Noto Serif SC / Songti SC；导航、标签使用系统 sans-serif。不新增网络字体。
- 8px 间距节奏；内容宽 1200px；阅读行距 2.2–2.4；交互区域至少 44px；键盘焦点清晰可见。
- 首页：展览式双栏首屏、静态 SVG 淡墨山水、一首词入口、精选馆藏、阅读流程。
- 书架：藏品目录卡片，书名 / 作者 / 朝代 / 章节，保留直接阅读入口，增加独立详情按钮。
- 阅读器：桌面原文与注疏并置，AI 位于注疏下方；移动端顺序阅读，注疏展开后定位，保留所选原文引句。

## 阶段三 · 独立原型

`prototypes/motion.html`：三个无 API 原型，直接复用生产 motion 模块：① 标题分层进入与卷轴 reveal；② 原文选择与面板展开；③ 时间线生长、节点切换。先验证交互，再逐模块接入。

## 阶段四 · 集成边界

新增 `css/v2.css` / `css/motion.css` 与 `js/motion/`。业务模块只调用动画接口；动效模块不请求 API、不修改阅读数据。原接口、认证、社区、进度写入及 Cloudflare 文件保持原结构。保留全部现有 data-action 入口。内容默认可见，动效失败不阻塞阅读。

## 动效清单

参考 https://github.com/nexu-io/motion-anything/blob/main/MOTION-SPEC.md 。仅采用 transform / opacity 的原生实现；不引入 GSAP / React / 动画运行时。

| 模块 | 用途 | 时长 | 降级 |
| --- | --- | --- | --- |
| 标题分层 | 建立阅读次序 | 320ms，60ms stagger，每组最多3项，其余直接显示 | 直接显示 |
| 文学 reveal | 内容进入视野 | 220ms，60ms stagger，每组最多3项，其余直接显示 | 直接显示 |
| 山水视差 | 展开数字长卷的空间关系 | 滚动时最多 24px，RAF 合并 | 移动端 / reduce 关闭 |
| 原文聚焦 | 标记当前注疏来源 | 180ms opacity | 保留静态底色与边线 |
| 注疏展开 / 收起 | 建立原文与注解关系 | 280 / 180ms | 即时切换 |
| 时间轴线 | 表达时代连续性 | 400ms scaleY | 完整线条 |
| 节点 / 注疏切换 | 表达当前时代选择 | 220ms | 即时切换，aria-pressed |
| 书籍悬停 / 按下 | 表明可读 / 可操作 | 180 / 100ms | 静态边框 |
| 页面 / 详情 | 保持空间连续性 | 320 / 280ms | 即时切换 |

曲线：ease-out cubic-bezier(0.16,1,0.3,1)，退出 ease-in cubic-bezier(0.4,0,1,1)。无持续装饰循环；动画结束清理；偏好运行时变化立即取消动画。原型与实际页面共用相同接口。

## 阶段五 · 验证范围

按首页 → 书架 → 阅读器/时间轴顺序检查原导航与数据入口。浏览器验证桌面、窄屏、键盘、夜读、详情焦点、无后端降级。独立浏览器回归页验证选句竞态、示例注疏、朝代筛选与节点选择。真实 AI / 社区写入 / 登录进度保存需要可用 Worker 与测试账户，不以静态测试代替线上验证。

## 参考配方与适配

已读取官方 fade-in-up、scroll-reveal、card-lift-hover 的 manifest 及原生实现。沿用其淡入上移、IntersectionObserver 一次触发并 unobserve、轻微卡片抬升与 reduce 降级模式。为阅读场景改为统一 WAAPI 模块，使用 MOTION-SPEC 的 fast/base/slow token，移除持续 will-change 与 shadow 动画。未复制完整配方代码或引入依赖。

官方来源：
- https://github.com/nexu-io/motion-anything/tree/main/recipes/web/fade-in-up
- https://github.com/nexu-io/motion-anything/tree/main/recipes/web/scroll-reveal
- https://github.com/nexu-io/motion-anything/tree/main/recipes/web/card-lift-hover
