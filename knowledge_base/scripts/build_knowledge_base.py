#!/usr/bin/env python3
"""
构建古籍知识库向量数据库（增量 + 分批）

用法：
    python build_knowledge_base.py           # 增量：只处理 hash 变化的段落
    python build_knowledge_base.py --recreate # 全量重建
"""
import argparse
import hashlib
import json
import os
import sys
from pathlib import Path
from typing import Iterable, List

KB_DIR = Path(__file__).parent.parent

try:
    from dotenv import load_dotenv
    load_dotenv(KB_DIR / ".env")
except ImportError:
    pass

try:
    import chromadb
except ImportError:
    print("请安装 chromadb: pip install chromadb")
    sys.exit(1)

try:
    from openai import OpenAI
except ImportError:
    print("请安装 openai: pip install openai")
    sys.exit(1)

EMBEDDINGS_DIR = KB_DIR / "embeddings"
CHROMA_DIR = EMBEDDINGS_DIR / "chroma"

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "text-embedding-3-small")
OPENAI_BASE_URL = os.getenv("OPENAI_BASE_URL", "https://api.vectorengine.ai/v1")
COLLECTION_PARAGRAPHS = "classical_paragraphs"
COLLECTION_ANNOTATIONS = "annotations"

BATCH_SIZE = 64


def sha1(text: str) -> str:
    return hashlib.sha1(text.encode("utf-8")).hexdigest()


def load_knowledge_base():
    """加载知识库数据。注疏现在用 hash(author+content) 作为稳定 ID，避免 JSON 里手填的 id 重复或缺失。"""
    paragraphs, annotations = [], []

    content_dir = KB_DIR / "content"
    for classic_dir in sorted(content_dir.iterdir()):
        if not classic_dir.is_dir():
            continue
        for chapter_file in sorted(classic_dir.glob("*.json")):
            with open(chapter_file, encoding="utf-8") as f:
                chapter_data = json.load(f)
            classic_id = chapter_data.get("classic_id", classic_dir.name)
            chapter_title = chapter_data.get("title", "")
            for para in chapter_data.get("paragraphs", []):
                para = {**para, "classic_id": classic_id, "chapter_title": chapter_title}
                paragraphs.append(para)
                for ann in para.get("annotations", []):
                    ann_id = ann.get("id") or sha1(f"{para['id']}|{ann.get('author','')}|{ann.get('content','')}")[:16]
                    annotations.append({
                        **ann,
                        "id": ann_id,
                        "paragraph_id": para["id"],
                        "chapter_title": chapter_title,
                        "classic_id": classic_id,
                    })

    # 按 ID 去重注疏（保留最后一条）
    seen = {}
    for a in annotations:
        seen[a["id"]] = a
    annotations = list(seen.values())

    print(f"加载完成: {len(paragraphs)} 段落, {len(annotations)} 注疏")
    return paragraphs, annotations


def get_embeddings_batched(client: OpenAI, texts: List[str]) -> List[List[float]]:
    """分批调用 embedding，避免请求过大。"""
    out: List[List[float]] = []
    for i in range(0, len(texts), BATCH_SIZE):
        batch = texts[i:i + BATCH_SIZE]
        resp = client.embeddings.create(model=EMBEDDING_MODEL, input=batch)
        out.extend(item.embedding for item in resp.data)
        print(f"  embedded {min(i + BATCH_SIZE, len(texts))}/{len(texts)}")
    return out


def existing_hashes(col) -> dict:
    """返回 {id: content_hash} 当前已索引内容。"""
    # ChromaDB get() 不传 ids/where 返回全量；大库时可换成分页
    data = col.get(include=["metadatas"])
    return {
        _id: (md or {}).get("content_hash", "")
        for _id, md in zip(data.get("ids", []), data.get("metadatas", []))
    }


def upsert_paragraphs(col, openai_client: OpenAI, paragraphs: List[dict], recreate: bool) -> None:
    if not paragraphs:
        return
    have = {} if recreate else existing_hashes(col)

    changed, to_delete = [], []
    for p in paragraphs:
        h = sha1(p["content"])
        prev = have.get(p["id"])
        if prev != h:
            changed.append((p, h))
        if p["id"] in have:
            have.pop(p["id"])  # 剩下的是孤儿，要删

    # have 里剩下的 id 已不在源数据中
    to_delete = list(have.keys())

    print(f"段落：变更 {len(changed)}，删除 {len(to_delete)}")

    if to_delete:
        col.delete(ids=to_delete)

    if changed:
        texts = [p["content"] for p, _ in changed]
        embeddings = get_embeddings_batched(openai_client, texts)
        ids = [p["id"] for p, _ in changed]
        metadatas = [
            {
                "classic_id": p["classic_id"],
                "chapter_title": p["chapter_title"],
                "content": p["content"],
                "keywords": ",".join(p.get("keywords", [])),
                "content_hash": h,
            }
            for p, h in changed
        ]
        col.upsert(ids=ids, embeddings=embeddings, documents=texts, metadatas=metadatas)


def upsert_annotations(col, openai_client: OpenAI, annotations: List[dict], recreate: bool) -> None:
    if not annotations:
        return
    have = {} if recreate else existing_hashes(col)

    def ann_text(a: dict) -> str:
        return f"{a.get('author','')}({a.get('era_name','')}): {a.get('content','')}"

    changed = []
    for a in annotations:
        text = ann_text(a)
        h = sha1(text)
        if have.get(a["id"]) != h:
            changed.append((a, text, h))
        if a["id"] in have:
            have.pop(a["id"])

    to_delete = list(have.keys())
    print(f"注疏：变更 {len(changed)}，删除 {len(to_delete)}")

    if to_delete:
        col.delete(ids=to_delete)

    if changed:
        texts = [t for _, t, _ in changed]
        embeddings = get_embeddings_batched(openai_client, texts)
        ids = [a["id"] for a, _, _ in changed]
        metadatas = [
            {
                "paragraph_id": a["paragraph_id"],
                "era": a.get("era", ""),
                "era_name": a.get("era_name", ""),
                "author": a.get("author", ""),
                "chapter_title": a.get("chapter_title", ""),
                "view_angle": a.get("view_angle", ""),
                "source": a.get("source", ""),
                "ai_generated": bool(a.get("ai_generated", False)),
                "content_hash": h,
                "raw_content": a.get("content", ""),
            }
            for (a, _, h) in changed
        ]
        col.upsert(ids=ids, embeddings=embeddings, documents=texts, metadatas=metadatas)


def build(recreate: bool = False) -> None:
    if not OPENAI_API_KEY:
        print("错误: 请在 knowledge_base/.env 配置 OPENAI_API_KEY")
        sys.exit(1)

    paragraphs, annotations = load_knowledge_base()

    client = chromadb.PersistentClient(path=str(CHROMA_DIR))
    if recreate:
        for name in (COLLECTION_PARAGRAPHS, COLLECTION_ANNOTATIONS):
            try:
                client.delete_collection(name)
                print(f"已删除 collection: {name}")
            except Exception:
                pass

    paragraphs_col = client.get_or_create_collection(COLLECTION_PARAGRAPHS)
    annotations_col = client.get_or_create_collection(COLLECTION_ANNOTATIONS)

    openai_client = OpenAI(api_key=OPENAI_API_KEY, base_url=OPENAI_BASE_URL)

    upsert_paragraphs(paragraphs_col, openai_client, paragraphs, recreate)
    upsert_annotations(annotations_col, openai_client, annotations, recreate)
    print(f"完成。数据目录: {CHROMA_DIR}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--recreate", action="store_true", help="全量重建（删除现有 collection）")
    args = parser.parse_args()
    build(recreate=args.recreate)


if __name__ == "__main__":
    main()
