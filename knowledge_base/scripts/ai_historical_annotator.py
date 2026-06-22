#!/usr/bin/env python3
"""
为庄子、诗经生成历代注疏（AI 模拟）。

庄子注疏来源：郭象注（魏晋）、成玄英疏（唐）、林希逸口义（宋）
诗经注疏来源：毛传（汉）、郑笺（汉）、朱熹集注（宋）

用法：
    python ai_historical_annotator.py zhuangzi --limit 5
    python ai_historical_annotator.py zhuangzi shijing
    python ai_historical_annotator.py shijing --dry-run
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


# ---------------------------------------------------------------------------
# 庄子注疏定义
# ---------------------------------------------------------------------------

ZHUANGZI_SOURCES = [
    {
        "id_prefix": "guoxiang",
        "era": "wei_jin",
        "era_name": "魏晋",
        "era_code": "wei_jin",
        "author": "郭象",
        "author_id": "guo-xiang",
        "source": "《庄子注》",
        "view_angle": "玄学",
        "sys_prompt": (
            "你是魏晋玄学家郭象。请以郭象的哲学立场注解这段庄子原文。"
            "郭象主张「独化」「自生」「无待」，强调万物自足、各安其性。"
            "用 60-120 字的文言或半文言，给出郭象视角的核心注解。"
            "禁止引用唐代以后的文献。语气古朴简洁。"
        ),
    },
    {
        "id_prefix": "chengxuanying",
        "era": "tang",
        "era_name": "唐代",
        "era_code": "tang",
        "author": "成玄英",
        "author_id": "cheng-xuan-ying",
        "source": "《庄子疏》",
        "view_angle": "义疏",
        "sys_prompt": (
            "你是唐代道士成玄英。请以成玄英的立场疏解这段庄子原文。"
            "成玄英疏侧重字词训诂、句意疏通，兼采郭象注并加以发挥。"
            "用 80-150 字的现代汉语，给出成玄英视角的疏解。"
            "注重文义的层次分析和关键字词的解释。"
        ),
    },
    {
        "id_prefix": "linxiyi",
        "era": "song",
        "era_name": "宋代",
        "era_code": "song",
        "author": "林希逸",
        "author_id": "lin-xi-yi",
        "source": "《庄子口义》",
        "view_angle": "义理",
        "sys_prompt": (
            "你是宋代学者林希逸。请以林希逸的立场解读这段庄子原文。"
            "林希逸《庄子口义》以通俗晓畅著称，注重以儒解庄、融通三家。"
            "用 80-150 字的现代汉语，给出林希逸视角的解读。"
            "语气平易近人，注重义理的贯通。"
        ),
    },
]


# ---------------------------------------------------------------------------
# 诗经注疏定义
# ---------------------------------------------------------------------------

SHIJING_SOURCES = [
    {
        "id_prefix": "maozhuan",
        "era": "han",
        "era_name": "汉代",
        "era_code": "han",
        "author": "毛亨（传）",
        "author_id": "mao-heng",
        "source": "《毛诗故训传》",
        "view_angle": "训诂",
        "sys_prompt": (
            "你是汉代经学家毛亨。请以毛传的风格注解这段诗经原文。"
            "毛传侧重字词训诂、名物考释，逐句解释关键字义。"
            "用 60-120 字的现代汉语，给出毛传视角的训诂。"
            "注重字义、词义的解释，简明扼要。"
        ),
    },
    {
        "id_prefix": "zhengjian",
        "era": "han",
        "era_name": "汉代",
        "era_code": "han",
        "author": "郑玄（笺）",
        "author_id": "zheng-xuan",
        "source": "《毛诗笺》",
        "view_angle": "训诂",
        "sys_prompt": (
            "你是汉代经学家郑玄。请以郑笺的风格笺注这段诗经原文。"
            "郑笺在毛传基础上补充申发，兼采三家诗说，注重礼制和史实。"
            "用 60-120 字的现代汉语，给出郑笺视角的笺注。"
            "补充毛传未及之处，注重诗的政教含义。"
        ),
    },
    {
        "id_prefix": "zhuxi-shijing",
        "era": "song",
        "era_name": "宋代",
        "era_code": "song",
        "author": "朱熹",
        "author_id": "zhu-xi",
        "source": "《诗集传》",
        "view_angle": "义理",
        "sys_prompt": (
            "你是宋代理学家朱熹。请以《诗集传》的风格解读这段诗经原文。"
            "朱熹注重诗的义理阐发，反对汉儒的美刺说，主张涵泳体味。"
            "用 80-150 字的现代汉语，给出朱熹视角的解读。"
            "注重诗的情感表达和义理内涵。"
        ),
    },
]


# ---------------------------------------------------------------------------
# 通用逻辑
# ---------------------------------------------------------------------------

def has_annotation(para: dict, author_id: str) -> bool:
    return any(a.get("author_id") == author_id for a in para.get("annotations", []))


def build_user_prompt(para: dict, classic_title: str, chapter_title: str) -> str:
    return (
        f"古籍：《{classic_title}》· {chapter_title}\n"
        f"原文：{para['content']}\n\n"
        f"请给出注解（不要标题，直接输出注解内容）："
    )


CLASSIC_TITLES = {
    "zhuangzi": "庄子",
    "shijing": "诗经",
}


def generate_one(client: OpenAI, para: dict, classic_title: str,
                 chapter_title: str, source_def: dict) -> str:
    resp = client.chat.completions.create(
        model=OPENAI_MODEL,
        messages=[
            {"role": "system", "content": source_def["sys_prompt"]},
            {"role": "user", "content": build_user_prompt(para, classic_title, chapter_title)},
        ],
        max_tokens=400,
        temperature=0.4,
    )
    return resp.choices[0].message.content.strip()


def process_classic(client: OpenAI, classic_id: str, sources: list[dict],
                    limit: int | None, dry_run: bool) -> int:
    classic_dir = CONTENT_DIR / classic_id
    if not classic_dir.exists():
        print(f"未找到 {classic_dir}")
        return 0

    classic_title = CLASSIC_TITLES.get(classic_id, classic_id)
    processed = 0

    for chapter_file in sorted(classic_dir.glob("*.json")):
        data = json.loads(chapter_file.read_text(encoding="utf-8"))
        chapter_title = data.get("title", "")
        chapter_changed = False

        for para in data.get("paragraphs", []):
            # 检查哪些源还缺失
            missing = [s for s in sources if not has_annotation(para, s["id_prefix"])]
            if not missing:
                continue
            if limit is not None and processed >= limit:
                break

            print(f"  [{para['id']}] {para['content'][:40]}...")

            for src in missing:
                if dry_run:
                    print(f"    -> {src['author']}（dry-run）")
                    continue

                try:
                    text = generate_one(client, para, classic_title, chapter_title, src)
                except Exception as e:
                    print(f"    [warn] {src['author']}: {e}")
                    continue

                ann = {
                    "id": f"{src['id_prefix']}-{para['id']}",
                    "era": src["era"],
                    "era_name": src["era_name"],
                    "era_code": src["era_code"],
                    "author": src["author"],
                    "author_id": src["author_id"],
                    "source": src["source"],
                    "view_angle": src["view_angle"],
                    "content": text,
                }
                para.setdefault("annotations", []).append(ann)
                chapter_changed = True
                time.sleep(0.3)

            if not dry_run:
                processed += 1

        if chapter_changed and not dry_run:
            chapter_file.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
            print(f"  -> 保存 {chapter_file.name}")

        if limit is not None and processed >= limit:
            break

    return processed


def main():
    p = argparse.ArgumentParser()
    p.add_argument("classics", nargs="+", help="zhuangzi / shijing")
    p.add_argument("--limit", type=int, default=None)
    p.add_argument("--dry-run", action="store_true")
    args = p.parse_args()

    if not args.dry_run and not OPENAI_API_KEY:
        print("错误：请在 .env 配 OPENAI_API_KEY")
        sys.exit(1)

    client = None if args.dry_run else OpenAI(api_key=OPENAI_API_KEY, base_url=OPENAI_BASE_URL)

    source_map = {
        "zhuangzi": ZHUANGZI_SOURCES,
        "shijing": SHIJING_SOURCES,
    }

    total = 0
    for c in args.classics:
        if c not in source_map:
            print(f"未知古籍: {c}")
            sys.exit(1)
        print(f"\n=== {c} ===")
        total += process_classic(client, c, source_map[c], args.limit, args.dry_run)

    print(f"\n完成。处理 {total} 段。{'（dry-run）' if args.dry_run else ''}")


if __name__ == "__main__":
    main()
