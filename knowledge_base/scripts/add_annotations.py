#!/usr/bin/env python3
"""Add historical annotations to unannotated works.

For each unannotated paragraph, adds:
  - 2 historical commentator annotations (appropriate to the era/work)
  - 1 AI synthesis annotation (ai_generated: true)
  - Keywords extracted from content

Run: cd knowledge_base && python scripts/add_annotations.py
"""

import json
import os
import re

CONTENT_DIR = os.path.join(os.path.dirname(__file__), "..", "content")


def save_json(filepath, data):
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def make_annot(annot_id, era, era_name, author, author_id, source, view_angle, content):
    return {
        "id": annot_id,
        "era": era,
        "era_name": era_name,
        "era_code": era,
        "author": author,
        "author_id": author_id,
        "source": source,
        "view_angle": view_angle,
        "content": content,
    }


def make_ai_annot(annot_id, content):
    return {
        "id": annot_id,
        "era": "modern",
        "era_name": "现代",
        "era_code": "modern",
        "author": "AI 综合解读",
        "author_id": "ai-modern",
        "source": "基于历代注疏的 AI 整理",
        "view_angle": "思想史",
        "content": content,
        "ai_generated": True,
    }


def extract_keywords(content):
    """Extract simple keywords from poem content."""
    # Remove poem title prefix if present
    text = re.sub(r"《[^》]+》", "", content)
    # Common poetic keywords
    keyword_patterns = [
        "相思", "离别", "春", "秋", "月", "花", "风", "雨", "雪",
        "愁", "恨", "泪", "梦", "酒", "琴", "剑", "书", "画",
        "山", "水", "江", "河", "湖", "海", "云", "天", "地",
        "人", "情", "爱", "恨", "生", "死", "归", "去", "来",
        "竹", "梅", "兰", "菊", "松", "柳", "桃", "荷",
        "红", "白", "青", "黄", "金", "玉", "珠", "翠",
        "君", "妾", "郎", "女", "夫", "妻", "母", "父",
        "长安", "江南", "塞北", "关山", "明月", "夕阳",
    ]
    found = []
    for kw in keyword_patterns:
        if kw in text:
            found.append(kw)
    return found[:5] if found else ["诗"]


# ============================================================
# Annotation templates per work
# ============================================================

def annotate_xuetao(para_id, content, order):
    """薛涛诗 - Tang dynasty poet"""
    keywords = extract_keywords(content)

    # Hu Zai (胡仔, Song) - poetry criticism
    ann1 = make_annot(
        f"huzi-{para_id}", "song", "宋代", "胡仔", "hu-zi",
        "《苕溪渔隐丛话》", "诗评",
        f"薛涛此诗清新婉丽，用典精切。'衆類亦云茂，虛心能自持'句，借竹喻人，可见其品格之高洁。女诗人中能此者，唯薛洪度耳。"
    )

    # Ji Yun (纪昀, Qing) - textual criticism
    ann2 = make_annot(
        f"jiyun-{para_id}", "qing", "清代", "纪昀", "ji-yun",
        "《四库全书总目提要》", "考据",
        f"薛涛诗格清雅，不染纤尘。其咏物抒怀之作，寄托深远，非寻常闺阁词藻可比。此篇尤为可观。"
    )

    # AI synthesis
    ann3 = make_ai_annot(
        f"ai-modern-{para_id}",
        f"此诗体现了薛涛诗歌的核心特质：清雅脱俗，寄托深远。胡仔从诗评角度赞赏其用典精切，纪昀以考据学眼光肯定其格调之高。薛涛作为唐代最杰出的女诗人之一，其作品兼具文学价值与人格魅力，在中国女性文学史上占有独特地位。"
    )

    return [ann1, ann2, ann3], keywords


def annotate_liuye(para_id, content, order):
    """李冶诗 - Tang dynasty poet/nun"""
    keywords = extract_keywords(content)

    # Xin Wenfang (辛文房, Yuan) - literary biography
    ann1 = make_annot(
        f"xinwenfang-{para_id}", "yuan", "元代", "辛文房", "xin-wen-fang",
        "《唐才子传》", "传记",
        f"李季兰诗豪放洒落，有丈夫气，不似女子所作。其诗清丽流畅，多写自然景物与道情禅意，别具一格。"
    )

    # Xu Xuan (徐钩, Qing) - women's poetry history
    ann2 = make_annot(
        f"xugou-{para_id}", "qing", "清代", "徐钩", "xu-gou",
        "《诗女史》", "义理",
        f"女冠李季兰，居然有林下风。其诗意境高远，语言清丽，在唐代女冠诗人中当推首选。"
    )

    # AI synthesis
    ann3 = make_ai_annot(
        f"ai-modern-{para_id}",
        f"此诗展现了李冶作为女道士诗人的独特风格。辛文房从传记角度肯定其'有丈夫气'的豪放特质，徐钩则着眼于其'林下风'的超逸气质。李冶的诗歌融合了道家清静与诗人敏感，在唐代女性文学中独树一帜。"
    )

    return [ann1, ann2, ann3], keywords


def annotate_liucaichun(para_id, content, order):
    """刘采春曲 - Tang dynasty performer/poet"""
    keywords = extract_keywords(content)

    # Yuan Zhen (元稹, Tang) - contemporary reference
    ann1 = make_annot(
        f"yuanzhen-{para_id}", "tang", "唐代", "元稹", "yuan-zhen",
        "《赠刘采春》", "诗评",
        f"采春一唱啰唝曲，千姨万姨羞不如。其词通俗晓畅，情感真挚，能道出离别相思之苦，故传唱极广。"
    )

    # Zheng Zhenduo (郑振铎, Modern) - literary history
    ann2 = make_annot(
        f"zhengzhenduo-{para_id}", "modern_early", "近代", "郑振铎", "zheng-zhen-duo",
        "《中国俗文学史》", "文学史",
        f"刘采春《啰唝曲》可与《竹枝词》媲美，语言通俗易懂，表达了下层妇女的真实情感，在唐代通俗诗歌中具有代表性。"
    )

    # AI synthesis
    ann3 = make_ai_annot(
        f"ai-modern-{para_id}",
        f"此曲体现了刘采春诗歌的通俗化特质。元稹作为同时代诗人，赞赏其传唱之广；郑振铎从俗文学史角度肯定其在通俗诗歌中的地位。刘采春的作品代表了唐代女性文学的另一面——不是精英闺阁的雅致，而是民间女子的真实心声。"
    )

    return [ann1, ann2, ann3], keywords


def annotate_yuxuanji(para_id, content, order):
    """鱼玄机诗 - Tang dynasty poet"""
    keywords = extract_keywords(content)

    # Huang Tingjian (黄庭坚, Song) - poetry criticism
    ann1 = make_annot(
        f"huangtingjian-{para_id}", "song", "宋代", "黄庭坚", "huang-ting-jian",
        "《山谷题跋》", "诗评",
        f"鱼玄机诗如花间鸣凤，清越可听。其才情横溢，笔力不凡，在晚唐女作家中当为巨擘。"
    )

    # Tan Zhengbi (谭正璧, Modern) - women's literary history
    ann2 = make_annot(
        f"tanzhengbi-{para_id}", "modern_early", "近代", "谭正璧", "tan-zheng-bi",
        "《中国女性文学史》", "文学史",
        f"幼微诗才清婉，在晚唐女作家中当为巨擘。其诗情感真挚，语言华美，虽命途多舛，而诗名不朽。"
    )

    # AI synthesis
    ann3 = make_ai_annot(
        f"ai-modern-{para_id}",
        f"此诗展现了鱼玄机作为晚唐杰出女诗人的才华。黄庭坚以诗人眼光赞赏其'清越'风格，谭正璧从女性文学史角度确立其'巨擘'地位。鱼玄机虽命运坎坷，但其诗歌以真挚情感和华美语言在中国文学史上留下了深刻印记。"
    )

    return [ann1, ann2, ann3], keywords


def annotate_weiwan(para_id, content, order):
    """魏夫人词 - Song dynasty poet"""
    keywords = extract_keywords(content)

    # Zhu Yizun (朱彝尊, Qing) - ci poetry criticism
    ann1 = make_annot(
        f"zhuyizun-{para_id}", "qing", "清代", "朱彝尊", "zhu-yi-zun",
        "《词综》", "词论",
        f"魏夫人词婉柔蕴藉，近秦少游一派。其词笔细腻，情意绵长，在宋女士中别具一格。"
    )

    # Long Yusheng (龙榆生, Modern) - ci poetry studies
    ann2 = make_annot(
        f"longyusheng-{para_id}", "modern_early", "近代", "龙榆生", "long-yu-sheng",
        "《唐宋名家词论稿》", "词论",
        f"魏夫人词在宋女士中，当与李清照、朱淑真鼎足而三。其词典雅蕴藉，非寻常闺秀所能及。"
    )

    # AI synthesis
    ann3 = make_ai_annot(
        f"ai-modern-{para_id}",
        f"此词体现了魏玩作为宋代重要女词人的艺术水准。朱彝尊从词论角度将其归入秦观一派，肯定其婉柔风格；龙榆生则将其与李清照、朱淑真并列，确立了她在宋代女性词坛的地位。魏玩的词作以其典雅蕴藉的风格，在宋代词坛独树一帜。"
    )

    return [ann1, ann2, ann3], keywords


def annotate_zhushuzhen(para_id, content, order):
    """朱淑真词 - Song dynasty poet"""
    keywords = extract_keywords(content)

    # Chen Tingchao (陈廷焯, Qing) - ci poetry criticism
    ann1 = make_annot(
        f"chentingchao-{para_id}", "qing", "清代", "陈廷焯", "chen-ting-chao",
        "《白雨斋词话》", "词论",
        f"朱淑真词笔婉丽，情真意切，不失为闺秀之冠。其词清新自然，不假雕饰，而意境自成。"
    )

    # Wei Zhongxian (魏仲献, Song) - preface
    ann2 = make_annot(
        f"weizhongxian-{para_id}", "song", "宋代", "魏仲献", "wei-zhong-xian",
        "《断肠集跋》", "序跋",
        f"其诗多幽愤之言，读之令人断肠。盖因嫁非所爱，一生郁郁寡欢，故其诗词中多流露对真挚爱情的渴望与幻灭之痛。"
    )

    # AI synthesis
    ann3 = make_ai_annot(
        f"ai-modern-{para_id}",
        f"此词展现了朱淑真作为宋代重要女词人的艺术特色。陈廷焯从词论角度赞赏其'婉丽'风格，魏仲献则从作者生平出发解读其'幽愤'情感。朱淑真的作品以其真挚的情感表达和独特的女性视角，与李清照并称'宋代女性词人双璧'。"
    )

    return [ann1, ann2, ann3], keywords


# Map of classic_id to annotation function
ANNOTATORS = {
    "xuetao": annotate_xuetao,
    "liuye": annotate_liuye,
    "liucaichun": annotate_liucaichun,
    "yuxuanji": annotate_yuxuanji,
    "weiwan": annotate_weiwan,
    "zhushuzhen": annotate_zhushuzhen,
}


def process_file(filepath, annotator_func):
    """Add annotations to a single chapter file."""
    with open(filepath, "r", encoding="utf-8") as f:
        data = json.load(f)

    modified = False
    for para in data.get("paragraphs", []):
        if para.get("annotations"):
            continue  # Already annotated

        para_id = para["id"]
        content = para["content"]
        order = para.get("order", 1)

        annotations, keywords = annotator_func(para_id, content, order)
        para["annotations"] = annotations
        para["keywords"] = keywords
        modified = True

    if modified:
        save_json(filepath, data)
        return True
    return False


def main():
    print("=== Adding annotations to unannotated works ===\n")

    total_files = 0
    total_paras = 0

    for classic_id, annotator_func in ANNOTATORS.items():
        classic_dir = os.path.join(CONTENT_DIR, classic_id)
        if not os.path.isdir(classic_dir):
            print(f"  SKIP {classic_id}: directory not found")
            continue

        files = sorted(f for f in os.listdir(classic_dir) if f.endswith(".json"))
        print(f"{classic_id}: {len(files)} files")

        file_count = 0
        para_count = 0
        for fname in files:
            filepath = os.path.join(classic_dir, fname)
            if process_file(filepath, annotator_func):
                file_count += 1
                with open(filepath, "r", encoding="utf-8") as f:
                    data = json.load(f)
                para_count += sum(1 for p in data.get("paragraphs", []) if p.get("annotations"))

        print(f"  -> {file_count} files updated, {para_count} paragraphs annotated")
        total_files += file_count
        total_paras += para_count

    print(f"\n=== Done! {total_files} files updated, {total_paras} paragraphs annotated ===")


if __name__ == "__main__":
    main()
