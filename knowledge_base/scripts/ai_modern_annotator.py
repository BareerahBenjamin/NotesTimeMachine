#!/usr/bin/env python3
"""
基于已抓的真注疏，用 LLM 生成"现代解读"注疏并写入 content/。

设计：
- 只对**尚无现代条目**的段落生成（按 era=modern 判断），可重复运行
- 标记 ai_generated=true、source=「AI 综合解读（基于历代注疏）」
- 上下文喂入：原文 + 已有所有古注

用法：
    python ai_modern_annotator.py lunyu --limit 5    # 试跑 5 段
    python ai_modern_annotator.py lunyu daodejing     # 跑全量
    python ai_modern_annotator.py lunyu --dry-run    # 不调 API，只列哪些段会处理
"""
from __future__ import annotations
import argparse
import json
import os
import sys
import time
from pathlib import Path

KB_DIR = Path(__file__).parent.parent

try:
    from dotenv import load_dotenv
    load_dotenv(KB_DIR / ".env")
except ImportError:
    pass

try:
    from openai import OpenAI
except ImportError:
    print("请安装 openai: pip install openai")
    sys.exit(1)

CONTENT_DIR = KB_DIR / "content"
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
OPENAI_BASE_URL = os.getenv("OPENAI_BASE_URL", "https://api.vectorengine.ai/v1")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "deepseek-chat")

SYS_PROMPT_NO_ANN = (
    "你是当代古典文献学者。请给出**当代视角**的简明解读：用 80-160 字的现代汉语，"
    "概括这段经文的核心含义、思想价值。"
    "禁止引用未提供的史料；语气克制，避免华丽辞藻。"
)

SYS_PROMPT = (
    "你是当代古典文献学者。读者已看过历代古注（汉魏唐宋），"
    "你要给出**当代视角**的简明解读：用 80-160 字的现代汉语，"
    "概括这段经文的核心含义，并指出古注的核心分歧或共识。"
    "禁止重复列出每位古注的内容；禁止引用未提供的史料；语气克制，避免华丽辞藻。"
)


def has_modern(para: dict) -> bool:
    return any(a.get("era") == "modern" for a in para.get("annotations", []))


def build_user_prompt(para: dict, classic_title: str, chapter_title: str) -> str:
    lines = [
        f"古籍：《{classic_title}》· {chapter_title}",
        f"原文：{para['content']}",
    ]
    ancient = [a for a in para.get("annotations", []) if a.get("era") != "modern"]
    if ancient:
        lines.append("")
        lines.append("已有历代注疏：")
        for a in ancient:
            lines.append(f"- [{a.get('era_name','')}|{a.get('author','')}] {a.get('content','')}")
    lines.append("\n请输出现代解读（80-160 字，不要标题）：")
    return "\n".join(lines)


def generate_one(client: OpenAI, para: dict, classic_title: str, chapter_title: str) -> str:
    has_ancient = any(a.get("era") != "modern" for a in para.get("annotations", []))
    sys_prompt = SYS_PROMPT if has_ancient else SYS_PROMPT_NO_ANN
    resp = client.chat.completions.create(
        model=OPENAI_MODEL,
        messages=[
            {"role": "system", "content": sys_prompt},
            {"role": "user", "content": build_user_prompt(para, classic_title, chapter_title)},
        ],
        max_tokens=400,
        temperature=0.4,
    )
    return resp.choices[0].message.content.strip()


CLASSIC_TITLES = {"lunyu": "论语", "daodejing": "道德经", "shijing": "诗经", "zhuangzi": "庄子"}


def process_classic(client: OpenAI, classic_id: str, limit: int | None, dry_run: bool) -> int:
    classic_dir = CONTENT_DIR / classic_id
    if not classic_dir.exists():
        print(f"未找到 {classic_dir}")
        return 0

    processed = 0
    for chapter_file in sorted(classic_dir.glob("*.json")):
        data = json.loads(chapter_file.read_text(encoding="utf-8"))
        chapter_title = data.get("title", "")
        chapter_changed = False

        for para in data.get("paragraphs", []):
            if has_modern(para):
                continue
            if limit is not None and processed >= limit:
                break

            print(f"  [{para['id']}] {para['content'][:40]}...")
            if dry_run:
                processed += 1
                continue

            try:
                modern_text = generate_one(client, para, CLASSIC_TITLES.get(classic_id, classic_id), chapter_title)
            except Exception as e:
                print(f"    [warn] {e}")
                continue

            ann = {
                "id": f"ai-modern-{para['id']}",
                "era": "modern",
                "era_name": "现代",
                "era_code": "modern",
                "author": "AI 综合解读",
                "author_id": "ai-modern",
                "source": "基于历代注疏的 AI 整理",
                "view_angle": "思想史",
                "ai_generated": True,
                "content": modern_text,
            }
            para.setdefault("annotations", []).append(ann)
            chapter_changed = True
            processed += 1
            time.sleep(0.3)  # 留点喘息

        if chapter_changed:
            chapter_file.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
            print(f"  -> 保存 {chapter_file.name}")

        if limit is not None and processed >= limit:
            break

    return processed


def main():
    p = argparse.ArgumentParser()
    p.add_argument("classics", nargs="+", help="lunyu / daodejing / ...")
    p.add_argument("--limit", type=int, default=None, help="最多处理多少段（试跑用）")
    p.add_argument("--dry-run", action="store_true")
    args = p.parse_args()

    if not args.dry_run and not OPENAI_API_KEY:
        print("错误：请在 .env 配 OPENAI_API_KEY")
        sys.exit(1)

    client = None if args.dry_run else OpenAI(api_key=OPENAI_API_KEY, base_url=OPENAI_BASE_URL)

    total = 0
    for c in args.classics:
        print(f"\n=== {c} ===")
        total += process_classic(client, c, args.limit, args.dry_run)
    print(f"\n完成。处理 {total} 段。{'（dry-run）' if args.dry_run else ''}")


if __name__ == "__main__":
    main()
