#!/usr/bin/env python3
"""
ctext.org 古籍批量导入：抓真原文 + 真注疏，对齐到 content/<classic>/<chapter>.json。

用法：
    python ctext_importer.py text lunyu              # 只抓论语原文
    python ctext_importer.py text lunyu daodejing    # 多本
    python ctext_importer.py annot lunyu             # 抓论语注疏并合并
    python ctext_importer.py annot daodejing
    python ctext_importer.py all lunyu daodejing     # 原文 + 注疏

输出落到 ../content/<classic>/<classic>-NN.json，schema 与 design.md 一致。
注疏 merge 时按 ann.id 去重，不会重复追加。
"""
from __future__ import annotations
import argparse
import json
import re
import sys
import time
import urllib.request
import urllib.error
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Iterable

KB_DIR = Path(__file__).parent.parent
CONTENT_DIR = KB_DIR / "content"
CTEXT_BASE = "https://ctext.org"
USER_AGENT = "Mozilla/5.0 (compatible; zhushu-importer/0.1)"
REQUEST_DELAY = 0.6  # 秒；ctext 没限速但留一点礼貌

# 繁→简：ctext 返回繁体，UI 简体。无 opencc 也别炸，退化为恒等。
try:
    from opencc import OpenCC
    _T2S = OpenCC("t2s").convert
except ImportError:
    _T2S = lambda s: s

# 论语 20 篇拼音 slug，按通行本顺序
LUNYU_SLUGS = [
    "xue-er", "wei-zheng", "ba-yi", "li-ren", "gong-ye-chang",
    "yong-ye", "shu-er", "tai-bo", "zi-han", "xiang-dang",
    "xian-jin", "yan-yuan", "zi-lu", "xian-wen", "wei-ling-gong",
    "ji-shi", "yang-huo", "wei-zi", "zi-zhang", "yao-yue",
]
LUNYU_TITLES = [
    "学而第一", "为政第二", "八佾第三", "里仁第四", "公冶长第五",
    "雍也第六", "述而第七", "泰伯第八", "子罕第九", "乡党第十",
    "先进第十一", "颜渊第十二", "子路第十三", "宪问第十四", "卫灵公第十五",
    "季氏第十六", "阳货第十七", "微子第十八", "子张第十九", "尧曰第二十",
]
# 朱熹集注的章号 slug（带"第几"）
LUNYU_ZHUXI_SLUGS = [
    "xue-er-di-yi", "wei-zheng-di-er", "ba-yi-di-san", "li-ren-di-si",
    "gong-ye-chang-di-wu", "yong-ye-di-liu", "shu-er-di-qi", "tai-bo-di-ba",
    "zi-han-di-jiu", "xiang-dang-di-shi", "xian-jin-di-shi-yi", "yan-yuan-di-shi-er",
    "zi-lu-di-shi-san", "xian-wen-di-shi-si", "wei-ling-gong-di-shi-wu",
    "ji-shi-di-shi-liu", "yang-huo-di-shi-qi", "wei-zi-di-shi-ba",
    "zi-zhang-di-shi-jiu", "yao-yue-di-er-shi",
]


# ---------------------------------------------------------------------------
# HTTP
# ---------------------------------------------------------------------------

def fetch(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=20) as r:
        html = r.read().decode("utf-8")
    time.sleep(REQUEST_DELAY)
    return html


# ---------------------------------------------------------------------------
# HTML parsing
# ---------------------------------------------------------------------------

# 每段一行 <tr>，<td class="ctext"> 包正文；前面 div#commN 是空占位。
_PARA_RE = re.compile(
    r'<tr id="n(\d+)"[^>]*>.*?<td class="ctext">\s*'
    r'(?:<div id="comm\d+"></div>)?(.*?)</td>',
    re.S,
)

# “论语注疏”一段内同 td 里穿插：<span class="original">原文</span> 注 <span ...>原文</span> 注 ...
_ORIG_SPAN_RE = re.compile(r'<span class="original">(.*?)</span>', re.S)


def strip_tags(s: str) -> str:
    """去掉 HTML 标签 + entity 反转 + 折叠空白。保留中文标点。"""
    s = re.sub(r"<[^>]+>", "", s)
    s = (s.replace("&nbsp;", " ")
           .replace("&amp;", "&")
           .replace("&lt;", "<")
           .replace("&gt;", ">")
           .replace("&quot;", '"'))
    s = re.sub(r"\s+", "", s)
    # ctext 会在异体字位置插数字角标，例如 “使夫1知者”——去掉这些孤立 ASCII 数字
    s = re.sub(r"(?<=[一-鿿])\d+(?=[一-鿿])", "", s)
    return _T2S(s)


def parse_paragraphs(html: str) -> list[tuple[str, str]]:
    """返回 [(node_id, td_body_html)]，仅含 td.ctext 段；过滤 td.etext。"""
    return _PARA_RE.findall(html)


def split_original_and_commentary(td_html: str) -> tuple[str, str]:
    """
    'lunyu-zhushu' 与 'si-shu-zhang-ju-ji-zhu' 在每段 td 内用
        <span class="original">原文片段</span> 注疏片段 <span ...>原文片段</span> ...
    返回 (原文连读, 注疏连读)。
    """
    spans = _ORIG_SPAN_RE.findall(td_html)
    original = strip_tags("".join(spans))
    commentary_html = _ORIG_SPAN_RE.sub("", td_html)
    commentary = strip_tags(commentary_html)
    return original, commentary


# ---------------------------------------------------------------------------
# 原文抓取
# ---------------------------------------------------------------------------

def fetch_lunyu_chapter_text(slug: str, idx: int, title: str) -> dict:
    url = f"{CTEXT_BASE}/analects/{slug}/zh"
    print(f"  原文 {url}")
    html = fetch(url)
    paras = parse_paragraphs(html)
    out_paragraphs = []
    chapter_id = f"lunyu-{idx:02d}"
    for i, (_node, body) in enumerate(paras, 1):
        text = strip_tags(body)
        if not text or len(text) < 4:
            continue
        out_paragraphs.append({
            "id": f"{chapter_id}-{i:02d}",
            "order": i,
            "content": text,
            "keywords": [],
            "annotations": [],
        })
    return {
        "chapter_id": chapter_id,
        "classic_id": "lunyu",
        "title": title,
        "order": idx,
        "paragraphs": out_paragraphs,
    }


def fetch_daodejing_text() -> list[dict]:
    """道德经一页 81 章；按行序拆成 81 个 chapter，每章 1 段。"""
    url = f"{CTEXT_BASE}/dao-de-jing/zh"
    print(f"  原文 {url}")
    html = fetch(url)
    paras = parse_paragraphs(html)
    chapters = []
    for i, (_node, body) in enumerate(paras, 1):
        text = strip_tags(body)
        if not text:
            continue
        chapter_id = f"daodejing-{i:02d}"
        chapters.append({
            "chapter_id": chapter_id,
            "classic_id": "daodejing",
            "title": f"第{i}章",
            "order": i,
            "paragraphs": [{
                "id": f"{chapter_id}-01",
                "order": 1,
                "content": text,
                "keywords": [],
                "annotations": [],
            }],
        })
        if len(chapters) >= 81:
            break
    return chapters


# ---------------------------------------------------------------------------
# 注疏抓取
# ---------------------------------------------------------------------------

@dataclass
class CommentarySource:
    classic_id: str           # lunyu / daodejing
    url_template: str         # 包含 {slug} 或 {n}
    slug_list: list[str] | None  # lunyu: 章 slug 列表；daodejing: 用 None + 1..81
    author: str
    author_id: str
    era: str
    era_name: str
    source_name: str
    view_angle: str
    ann_id_prefix: str        # 用于生成 annotation id

    def url_for(self, idx: int) -> str:
        if self.slug_list is not None:
            return self.url_template.format(slug=self.slug_list[idx - 1])
        return self.url_template.format(n=idx)


def parse_lunyu_zhushu_chapter(html: str) -> list[dict]:
    """
    每章注疏页：每段对应 2 个 <tr>。
        第 1 个 tr：原文 + 何晏集解（穿插在 <span class="original"> 之外）
        第 2 个 tr：以 '【疏】' 开头的邢昺正义
    返回 [{"original": ..., "jijie": ..., "shu": ...}, ...]
    """
    rows = parse_paragraphs(html)
    # 把首段（章名/总论 - 没有【疏】配对的）也一起留着按下标对齐
    paired = []
    i = 0
    while i < len(rows):
        _node1, body1 = rows[i]
        original, jijie = split_original_and_commentary(body1)
        shu = ""
        if i + 1 < len(rows):
            _node2, body2 = rows[i + 1]
            text2 = strip_tags(body2)
            if text2.startswith("【疏】") or "正義曰" in text2:
                shu = text2
                i += 2
            else:
                i += 1
        else:
            i += 1
        if original:
            paired.append({"original": original, "jijie": jijie, "shu": shu})
    return paired


def parse_zhuxi_jizhu_chapter(html: str) -> list[dict]:
    """朱熹集注页：每段 td 内 <span class="original"> = 原文，其余 = 朱熹注。"""
    rows = parse_paragraphs(html)
    out = []
    for _node, body in rows:
        original, note = split_original_and_commentary(body)
        if original and note:
            out.append({"original": original, "note": note})
    return out


def parse_heshanggong_chapter(html: str) -> list[dict]:
    """河上公一章一页：所有段拼成一条整章注。"""
    rows = parse_paragraphs(html)
    if not rows:
        return []
    parts = []
    for _node, body in rows:
        # 河上公页里原文与注交错（原文是 <span class="original">）
        original, note = split_original_and_commentary(body)
        if note:
            parts.append(note)
    return [{"note": "".join(parts)}] if parts else []


# ---------------------------------------------------------------------------
# 合并到 content/<classic>/<chapter>.json
# ---------------------------------------------------------------------------

def load_chapter(classic_id: str, chapter_id: str) -> dict | None:
    f = CONTENT_DIR / classic_id / f"{chapter_id}.json"
    if not f.exists():
        return None
    return json.loads(f.read_text(encoding="utf-8"))


def save_chapter(chapter: dict) -> None:
    classic_id = chapter["classic_id"]
    out_dir = CONTENT_DIR / classic_id
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"{chapter['chapter_id']}.json"
    out_path.write_text(json.dumps(chapter, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"    -> {out_path.relative_to(KB_DIR)}")


def merge_annotation(para: dict, ann: dict) -> bool:
    """按 ann['id'] 去重；新增返回 True，已存在则覆盖内容返回 False。"""
    existing = {a.get("id"): a for a in para.get("annotations", [])}
    if ann["id"] in existing:
        existing[ann["id"]].update(ann)
        return False
    para.setdefault("annotations", []).append(ann)
    return True


def import_lunyu_text() -> None:
    print("[原文] 论语")
    for i, slug in enumerate(LUNYU_SLUGS, 1):
        print(f" 第{i}篇 {slug}")
        chapter = fetch_lunyu_chapter_text(slug, i, LUNYU_TITLES[i - 1])
        # 若已有 chapter，保留其 annotations
        prev = load_chapter("lunyu", chapter["chapter_id"])
        if prev:
            prev_para_by_id = {p["id"]: p for p in prev.get("paragraphs", [])}
            for p in chapter["paragraphs"]:
                if p["id"] in prev_para_by_id:
                    p["annotations"] = prev_para_by_id[p["id"]].get("annotations", [])
        save_chapter(chapter)


def import_daodejing_text() -> None:
    print("[原文] 道德经")
    chapters = fetch_daodejing_text()
    for ch in chapters:
        prev = load_chapter("daodejing", ch["chapter_id"])
        if prev:
            prev_para_by_id = {p["id"]: p for p in prev.get("paragraphs", [])}
            for p in ch["paragraphs"]:
                if p["id"] in prev_para_by_id:
                    p["annotations"] = prev_para_by_id[p["id"]].get("annotations", [])
        save_chapter(ch)


def import_lunyu_annotations() -> None:
    """汉魏 何晏集解 + 唐 邢昺疏 + 宋 朱熹集注"""
    print("[注疏] 论语")
    for i, slug in enumerate(LUNYU_SLUGS, 1):
        chapter_id = f"lunyu-{i:02d}"
        chapter = load_chapter("lunyu", chapter_id)
        if not chapter:
            print(f"  跳过 {chapter_id}（未抓原文）")
            continue

        # 1) lunyu-zhushu：何晏集解 + 邢昺正义
        url = f"{CTEXT_BASE}/lunyu-zhushu/{slug}/zh"
        print(f"  注疏 {url}")
        try:
            zhushu_paired = parse_lunyu_zhushu_chapter(fetch(url))
        except Exception as e:
            print(f"    [warn] 抓取失败：{e}")
            zhushu_paired = []

        # 2) 朱熹集注
        zhuxi_slug = LUNYU_ZHUXI_SLUGS[i - 1]
        zhuxi_url = f"{CTEXT_BASE}/si-shu-zhang-ju-ji-zhu/{zhuxi_slug}/zh"
        print(f"  注疏 {zhuxi_url}")
        try:
            zhuxi_paired = parse_zhuxi_jizhu_chapter(fetch(zhuxi_url))
        except Exception as e:
            print(f"    [warn] 抓取失败：{e}")
            zhuxi_paired = []

        # 对齐：按 index 把每段注疏配到 chapter.paragraphs[i]
        added = 0
        for idx, para in enumerate(chapter["paragraphs"]):
            if idx < len(zhushu_paired):
                zs = zhushu_paired[idx]
                if zs["jijie"]:
                    added += merge_annotation(para, {
                        "id": f"heyan-{para['id']}",
                        "era": "wei_jin",
                        "era_name": "魏晋",
                        "era_code": "wei_jin",
                        "author": "何晏（集解）",
                        "author_id": "he-yan",
                        "source": "《论语集解》",
                        "view_angle": "训诂",
                        "content": zs["jijie"],
                    })
                if zs["shu"]:
                    added += merge_annotation(para, {
                        "id": f"xingbing-{para['id']}",
                        "era": "tang",
                        "era_name": "唐代",
                        "era_code": "tang",
                        "author": "邢昺（正义）",
                        "author_id": "xing-bing",
                        "source": "《论语注疏》",
                        "view_angle": "义疏",
                        "content": zs["shu"],
                    })
            if idx < len(zhuxi_paired):
                added += merge_annotation(para, {
                    "id": f"zhuxi-{para['id']}",
                    "era": "song",
                    "era_name": "宋代",
                    "era_code": "song",
                    "author": "朱熹",
                    "author_id": "zhu-xi",
                    "source": "《四书章句集注·论语集注》",
                    "view_angle": "义理",
                    "content": zhuxi_paired[idx]["note"],
                })
        print(f"    +{added} 条注疏")
        save_chapter(chapter)


def import_daodejing_annotations() -> None:
    """河上公章句（汉代），按章号 1→81 对齐。"""
    print("[注疏] 道德经")
    for n in range(1, 82):
        chapter_id = f"daodejing-{n:02d}"
        chapter = load_chapter("daodejing", chapter_id)
        if not chapter:
            print(f"  跳过 {chapter_id}（未抓原文）")
            continue
        url = f"{CTEXT_BASE}/heshanggong/{n}/zh"
        print(f"  注疏 {url}")
        try:
            parsed = parse_heshanggong_chapter(fetch(url))
        except urllib.error.HTTPError as e:
            print(f"    [warn] HTTP {e.code}")
            continue
        except Exception as e:
            print(f"    [warn] {e}")
            continue

        if not parsed or not chapter["paragraphs"]:
            continue
        para = chapter["paragraphs"][0]
        added = merge_annotation(para, {
            "id": f"heshanggong-{para['id']}",
            "era": "han",
            "era_name": "汉代",
            "era_code": "han",
            "author": "河上公",
            "author_id": "heshanggong",
            "source": "《老子河上公章句》",
            "view_angle": "训诂",
            "content": parsed[0]["note"],
        })
        print(f"    +{int(added)} 条")
        save_chapter(chapter)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

TEXT_IMPORTERS: dict[str, Callable[[], None]] = {
    "lunyu": import_lunyu_text,
    "daodejing": import_daodejing_text,
}
ANNOT_IMPORTERS: dict[str, Callable[[], None]] = {
    "lunyu": import_lunyu_annotations,
    "daodejing": import_daodejing_annotations,
}


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("mode", choices=["text", "annot", "all"])
    p.add_argument("classics", nargs="+", help="lunyu / daodejing")
    args = p.parse_args()

    for c in args.classics:
        if c not in TEXT_IMPORTERS:
            print(f"未知古籍：{c}")
            sys.exit(1)

    if args.mode in ("text", "all"):
        for c in args.classics:
            TEXT_IMPORTERS[c]()
    if args.mode in ("annot", "all"):
        for c in args.classics:
            ANNOT_IMPORTERS[c]()
    print("完成。下一步：python build_knowledge_base.py")


if __name__ == "__main__":
    main()
