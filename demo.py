#!/usr/bin/env python3
"""
注疏时光机 — 一键启动演示脚本

启动后端 API（端口 5001）和前端静态服务（端口 8000），
打开浏览器并提供交互式功能导览。

用法：python3 demo.py
"""

import atexit
import os
import signal
import socket
import subprocess
import sys
import time
import webbrowser

# ── ANSI 颜色 ──────────────────────────────────────────────

CYAN = "\033[36m"
GREEN = "\033[32m"
YELLOW = "\033[33m"
RED = "\033[31m"
MAGENTA = "\033[35m"
BOLD = "\033[1m"
DIM = "\033[2m"
RESET = "\033[0m"

# ── 常量 ───────────────────────────────────────────────────

PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))
KB_DIR = os.path.join(PROJECT_ROOT, "knowledge_base")
FRONTEND_PORT = 8000
BACKEND_PORT = 5001
FRONTEND_URL = f"http://localhost:{FRONTEND_PORT}"
BACKEND_URL = f"http://localhost:{BACKEND_PORT}"

# ── 进程管理 ────────────────────────────────────────────────

processes = []


def cleanup():
    for p in processes:
        try:
            p.terminate()
            p.wait(timeout=3)
        except Exception:
            try:
                p.kill()
            except Exception:
                pass


atexit.register(cleanup)


def handle_signal(sig, frame):
    print(f"\n{YELLOW}正在停止服务...{RESET}")
    cleanup()
    sys.exit(0)


signal.signal(signal.SIGINT, handle_signal)
signal.signal(signal.SIGTERM, handle_signal)


def port_in_use(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(("127.0.0.1", port)) == 0


def wait_for_server(url, label, timeout=15):
    import urllib.request
    import urllib.error

    start = time.time()
    while time.time() - start < timeout:
        try:
            urllib.request.urlopen(url, timeout=2)
            return True
        except (urllib.error.URLError, ConnectionRefusedError, OSError):
            time.sleep(0.5)
    return False


# ── 启动服务 ────────────────────────────────────────────────


def start_frontend():
    if port_in_use(FRONTEND_PORT):
        print(f"  {YELLOW}端口 {FRONTEND_PORT} 已被占用，跳过前端启动{RESET}")
        return True
    p = subprocess.Popen(
        [sys.executable, "-m", "http.server", str(FRONTEND_PORT)],
        cwd=PROJECT_ROOT,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    processes.append(p)
    return wait_for_server(FRONTEND_URL, "前端")


def start_backend():
    if port_in_use(BACKEND_PORT):
        print(f"  {YELLOW}端口 {BACKEND_PORT} 已被占用，跳过后端启动{RESET}")
        return True
    env = os.environ.copy()
    env["PORT"] = str(BACKEND_PORT)
    p = subprocess.Popen(
        [sys.executable, "scripts/api_server.py"],
        cwd=KB_DIR,
        env=env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    processes.append(p)
    return wait_for_server(f"{BACKEND_URL}/api/health", "后端")


# ── 导览 ────────────────────────────────────────────────────

TOUR_STEPS = [
    {
        "title": "欢迎来到「注疏时光机」",
        "body": (
            "这是一个专注于中国历代女性古典文学的交互式注疏阅读平台。\n"
            "收录从西汉到清代 17 部女性文学作品，点击任意句子即可展开\n"
            "从汉代到现代的注疏时间轴，看千年学术对话如何诠释她们的才华。"
        ),
        "action": "在浏览器中查看首页 — 英雄区展示了 14 位作者的名字动画",
    },
    {
        "title": "首页 — 首页导航与语义搜索",
        "body": (
            "首页包含：\n"
            "  • 浮动作者名动画 — 14 位历史女性文学家的名字在山峦间漂浮\n"
            "  • 语义搜索栏 — 输入关键词（如「相思」「离愁」「妇德」）进行跨书检索\n"
            "  • 「浏览书架」和「认识作者」两个入口按钮"
        ),
        "action": "点击顶部导航的「作者」，或直接在浏览器中切换到作者页面",
    },
    {
        "title": "作者页面 — 17 位女性文学家",
        "body": (
            "展示 17 张作者卡片，按年代排序：\n"
            "  班婕妤(西汉) → 卓文君(西汉) → 班昭(东汉) → 蔡文姬(东汉)\n"
            "  → 谢道韫(东晋) → 上官婉儿/薛涛/李冶/徐惠/刘采春/鱼玄机(唐)\n"
            "  → 花蕊夫人(五代) → 魏玩/李清照/朱淑真(宋) → 黄峨(明) → 顾太清(清)\n\n"
            "每张卡片有头像、姓名、朝代、生卒年和简介。\n"
            "点击卡片的 ℹ 按钮可查看详细生平和历史评价。"
        ),
        "action": "点击某位作者的 ℹ 按钮，弹窗会展示其生平简介和经典评语",
    },
    {
        "title": "书架页面 — 古籍书架",
        "body": (
            "仿木纹书架上陈列着 17 部古典文学作品的书脊。\n"
            "每本书有独特的渐变色书脊，悬停时有抬起动画效果。\n"
            "点击任意书脊即可进入阅读器。"
        ),
        "action": "点击顶部导航的「书架」，然后点击《女诫》的书脊",
    },
    {
        "title": "阅读器 — 原文展示与章节导航",
        "body": (
            "阅读器页面包含：\n"
            "  • 书名与章节标题（如「《女诫》· 卑弱第一」）\n"
            "  • 章节导航（上一章 / 下一章按钮）\n"
            "  • 原文面板 — 每段古文下方有「点击查看注疏」提示\n"
            "  • 作者信息和作品详情按钮\n\n"
            "《女诫》是东汉班昭所著，共七章，是中国首部系统阐述封建女性伦理的论著。"
        ),
        "action": "点击第一段原文（「鄙人愚暗，受性不敏……」）",
    },
    {
        "title": "注疏时间轴 — 历代注疏演变",
        "body": (
            "选中段落后，右侧面板展开注疏时间轴：\n"
            "  • 按朝代顺序排列的注疏条目（汉→魏晋→唐→宋→明→清→现代）\n"
            "  • 每条注疏标注朝代、作者、出处、评论角度\n"
            "  • 不同朝代用不同颜色圆点标识\n"
            "  • 点击注疏条目可展开/收起全文\n"
            "  • 每条注疏有「AI 解读」按钮，获取针对该条的深度阐释"
        ),
        "action": "观察时间轴中的注疏条目，注意朝代颜色标识",
    },
    {
        "title": "朝代筛选 — 按时代聚焦",
        "body": (
            "时间轴底部有朝代筛选图例：\n"
            "  汉代 | 唐代 | 宋代 | 明代 | 清代 | 现代 | 全部\n\n"
            "点击某个朝代，时间轴只显示该朝代的注疏。\n"
            "点击「全部」恢复完整视图。"
        ),
        "action": "试试点击「唐代」或「宋代」筛选按钮",
    },
    {
        "title": "AI 思想史脉络分析",
        "body": (
            "右侧面板下半部分是 AI 思想史脉络分析区域。\n"
            "选中段落后，系统自动调用 AI 生成历代注疏演变的综合解读，\n"
            "以 Markdown 格式渲染，展示不同朝代学者对该句的理解变化。"
        ),
        "action": "观察 AI 分析面板中的内容（需要后端 API 运行）",
    },
    {
        "title": "跨书语义搜索",
        "body": (
            "阅读器顶部有语义搜索栏，基于 ChromaDB 向量检索。\n"
            "输入任意关键词（如「相思」「悲愤」「妇德」），\n"
            "系统在全部 17 部作品中搜索语义相近的内容，\n"
            "结果可直接跳转到对应段落并自动展开注疏时间轴。"
        ),
        "action": "在搜索栏输入「离愁」或「相思」，点击「检索」",
    },
    {
        "title": "深色模式",
        "body": (
            "点击右上角的日月图标（☀/☽）切换明暗主题。\n"
            "主题偏好自动保存到 localStorage，下次访问时恢复。"
        ),
        "action": "点击右上角的主题切换按钮",
    },
    {
        "title": "社区讨论",
        "body": (
            "点击导航栏的「社区」进入论坛页面。\n"
            "支持用户注册登录、发帖、评论、点赞，\n"
            "按分类筛选帖子，分页浏览。\n"
            "社区数据存储在 SQLite 数据库中。"
        ),
        "action": "点击「社区」导航链接查看论坛功能",
    },
    {
        "title": "演示完成！",
        "body": (
            "技术栈概览：\n"
            "  前端 — 纯静态 HTML/CSS/JS（ES Modules），无构建步骤\n"
            "  后端 — Python Flask + ChromaDB 向量数据库 + OpenAI 兼容 API\n"
            "  内容 — 17 部作品、数百个段落、上千条历代注疏\n\n"
            "项目根目录下还有 CLAUDE.md 提供详细的架构文档。\n"
            "感谢体验「注疏时光机」！"
        ),
        "action": None,
    },
]


def print_step(i, step, total):
    header = f"  [{i + 1}/{total}] {step['title']}"
    print(f"\n{BOLD}{CYAN}{header}{RESET}")
    print(f"{CYAN}{'─' * len(header)}{RESET}")
    for line in step["body"].split("\n"):
        print(f"  {line}")
    if step["action"]:
        print(f"\n  {MAGENTA}▸ 操作提示：{step['action']}{RESET}")


def run_tour():
    total = len(TOUR_STEPS)
    print(f"\n{BOLD}{GREEN}━━━ 功能导览（共 {total} 步，按 Enter 继续，q 退出）━━━{RESET}")

    for i, step in enumerate(TOUR_STEPS):
        print_step(i, step, total)
        if i < total - 1:
            try:
                user_input = input(f"\n  {DIM}按 Enter 继续...{RESET}")
                if user_input.strip().lower() == "q":
                    print(f"\n  {YELLOW}导览已结束。浏览器仍然打开，可以自由探索。{RESET}")
                    return
            except EOFError:
                return

    print(f"\n{BOLD}{GREEN}━━━ 导览结束 ━━━{RESET}")
    print(f"  {DIM}服务仍在运行，按 Ctrl+C 停止。{RESET}\n")

    # 保持进程存活直到用户中断
    try:
        while True:
            time.sleep(1)
    except (KeyboardInterrupt, EOFError):
        pass


# ── 主流程 ──────────────────────────────────────────────────


def main():
    print(f"\n{BOLD}{'═' * 50}{RESET}")
    print(f"{BOLD}  注疏时光机 — 一键演示{RESET}")
    print(f"{BOLD}  Women's Classical Literature Through Time{RESET}")
    print(f"{BOLD}{'═' * 50}{RESET}\n")

    # 启动前端
    print(f"{CYAN}[1/2] 启动前端服务（端口 {FRONTEND_PORT}）...{RESET}")
    if start_frontend():
        print(f"  {GREEN}✓ 前端就绪：{FRONTEND_URL}{RESET}")
    else:
        print(f"  {RED}✗ 前端启动失败{RESET}")
        sys.exit(1)

    # 启动后端
    print(f"{CYAN}[2/2] 启动后端 API（端口 {BACKEND_PORT}）...{RESET}")
    backend_ok = start_backend()
    if backend_ok:
        print(f"  {GREEN}✓ 后端就绪：{BACKEND_URL}{RESET}")
    else:
        print(f"  {YELLOW}⚠ 后端启动超时（应用将以离线演示模式运行）{RESET}")

    # 打开浏览器
    print(f"\n{CYAN}正在打开浏览器...{RESET}")
    try:
        webbrowser.open(FRONTEND_URL)
        print(f"  {GREEN}✓ 已打开 {FRONTEND_URL}{RESET}")
    except Exception:
        print(f"  {YELLOW}请手动打开浏览器访问 {FRONTEND_URL}{RESET}")

    # 运行导览
    try:
        run_tour()
    except (KeyboardInterrupt, EOFError):
        pass
    finally:
        print(f"\n{YELLOW}正在停止服务...{RESET}")
        cleanup()
        print(f"{GREEN}✓ 已停止所有服务。再见！{RESET}\n")


if __name__ == "__main__":
    main()
