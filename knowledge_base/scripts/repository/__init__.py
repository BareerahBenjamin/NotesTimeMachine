import json
import os
from pathlib import Path
from typing import List, Optional

try:
    import chromadb
except ImportError:
    raise ImportError("请安装 chromadb: pip install chromadb")

from scripts.models import Paragraph, Annotation, Chapter

KB_DIR = Path(__file__).resolve().parents[2]
CONTENT_DIR = KB_DIR / "content"
EMBEDDINGS_DIR = KB_DIR / "embeddings"
CHROMA_DIR = EMBEDDINGS_DIR / "chroma"

COLLECTION_PARAGRAPHS = "classical_paragraphs"
COLLECTION_ANNOTATIONS = "annotations"


class ChromaRepository:
    def __init__(self):
        self.client = chromadb.PersistentClient(path=str(CHROMA_DIR))
        self.paragraphs_col = self.client.get_or_create_collection(COLLECTION_PARAGRAPHS)
        self.annotations_col = self.client.get_or_create_collection(COLLECTION_ANNOTATIONS)

    def get_paragraph_by_id(self, paragraph_id: str) -> Optional[Paragraph]:
        result = self.paragraphs_col.get(ids=[paragraph_id])
        if not result or not result["ids"]:
            return None
        metadata = result["metadatas"][0]
        return Paragraph(
            id=paragraph_id,
            content=metadata["content"],
            classic_id=metadata["classic_id"],
            chapter_title=metadata["chapter_title"],
            keywords=metadata.get("keywords", "").split(",") if metadata.get("keywords") else []
        )

    def get_annotations_by_paragraph_id(self, paragraph_id: str) -> List[Annotation]:
        results = self.annotations_col.get(where={"paragraph_id": paragraph_id})
        annotations = []
        for i, ann_id in enumerate(results["ids"]):
            md = results["metadatas"][i]
            content = md.get("raw_content") or results["documents"][i]
            annotations.append(Annotation(
                id=ann_id,
                paragraph_id=md["paragraph_id"],
                era=md["era"],
                era_name=md["era_name"],
                author=md["author"],
                author_id="",
                source=md.get("source", ""),
                view_angle=md.get("view_angle", ""),
                content=content,
                chapter_title=md.get("chapter_title", "")
            ))
        return annotations

    def get_annotations_by_era(self, era: str, limit: int = 10) -> List[Annotation]:
        """按时代检索注疏"""
        results = self.annotations_col.get(
            where={"era": era},
            limit=limit
        )
        annotations = []
        for i, ann_id in enumerate(results["ids"]):
            md = results["metadatas"][i]
            content = md.get("raw_content") or results["documents"][i]
            annotations.append(Annotation(
                id=ann_id,
                paragraph_id=md["paragraph_id"],
                era=md["era"],
                era_name=md["era_name"],
                author=md["author"],
                author_id="",
                source=md.get("source", ""),
                view_angle=md.get("view_angle", ""),
                content=content,
                chapter_title=md.get("chapter_title", "")
            ))
        return annotations

    def get_annotations_by_author(self, author: str, limit: int = 10) -> List[Annotation]:
        """按作者检索注疏"""
        results = self.annotations_col.get(
            where={"author": author},
            limit=limit
        )
        annotations = []
        for i, ann_id in enumerate(results["ids"]):
            md = results["metadatas"][i]
            content = md.get("raw_content") or results["documents"][i]
            annotations.append(Annotation(
                id=ann_id,
                paragraph_id=md["paragraph_id"],
                era=md["era"],
                era_name=md["era_name"],
                author=md["author"],
                author_id="",
                source=md.get("source", ""),
                view_angle=md.get("view_angle", ""),
                content=content,
                chapter_title=md.get("chapter_title", "")
            ))
        return annotations

    def query_paragraphs_by_embedding(self, embedding: List[float], top_k: int = 3) -> List[Paragraph]:
        results = self.paragraphs_col.query(query_embeddings=[embedding], n_results=top_k)
        paragraphs = []
        for i, para_id in enumerate(results["ids"][0]):
            md = results["metadatas"][0][i]
            paragraphs.append(Paragraph(
                id=para_id,
                content=md["content"],
                classic_id=md["classic_id"],
                chapter_title=md["chapter_title"],
                keywords=md.get("keywords", "").split(",") if md.get("keywords") else []
            ))
        return paragraphs

    def query_paragraphs_by_keywords(self, keywords: List[str], limit: int = 10) -> List[Paragraph]:
        """按关键词检索段落（通过metadata过滤）"""
        # ChromaDB不支持数组类型的where过滤，所以我们需要获取所有段落然后手动过滤
        # 这里使用一个简化的方法：检查keywords字段是否包含任意一个关键词
        all_paragraphs = self.paragraphs_col.get(limit=100)
        paragraphs = []
        for i, para_id in enumerate(all_paragraphs["ids"]):
            md = all_paragraphs["metadatas"][i]
            para_keywords = md.get("keywords", "").split(",") if md.get("keywords") else []
            # 检查是否有匹配的关键词
            if any(kw in para_keywords for kw in keywords):
                paragraphs.append(Paragraph(
                    id=para_id,
                    content=md["content"],
                    classic_id=md["classic_id"],
                    chapter_title=md["chapter_title"],
                    keywords=para_keywords
                ))
                if len(paragraphs) >= limit:
                    break
        return paragraphs


class JsonRepository:
    @staticmethod
    def get_chapter(chapter_id: str) -> Optional[Chapter]:
        parts = chapter_id.rsplit("-", 1)
        if len(parts) != 2:
            return None
        classic_id = parts[0]
        chapter_file = CONTENT_DIR / classic_id / f"{chapter_id}.json"
        if not chapter_file.exists():
            return None
        with open(chapter_file, encoding="utf-8") as f:
            data = json.load(f)
        paragraphs = []
        for p in data.get("paragraphs", []):
            paragraphs.append(Paragraph(
                id=p["id"],
                content=p["content"],
                classic_id=data.get("classic_id", ""),
                chapter_title=data.get("title", ""),
                keywords=p.get("keywords", [])
            ))
        return Chapter(
            chapter_id=data["chapter_id"],
            title=data["title"],
            classic_id=data.get("classic_id", ""),
            paragraphs=paragraphs
        )

    @staticmethod
    def find_paragraph(paragraph_id: str) -> Optional[Paragraph]:
        chapter_id = paragraph_id.rsplit("-", 1)[0]
        chapter = JsonRepository.get_chapter(chapter_id)
        if not chapter:
            return None
        for p in chapter.paragraphs:
            if p.id == paragraph_id:
                return p
        return None

    @staticmethod
    def get_classics() -> List[dict]:
        classics_file = KB_DIR / "metadata" / "classics.json"
        with open(classics_file, encoding="utf-8") as f:
            return json.load(f)

    @staticmethod
    def get_chapters_by_classic(classic_id: str) -> List[dict]:
        content_dir = CONTENT_DIR / classic_id
        if not content_dir.exists():
            return []
        chapters = []
        for chapter_file in content_dir.glob("*.json"):
            with open(chapter_file, encoding="utf-8") as f:
                data = json.load(f)
                chapters.append({
                    "chapter_id": data["chapter_id"],
                    "title": data["title"],
                    "paragraph_count": len(data["paragraphs"])
                })
        return chapters

    @staticmethod
    def get_paragraphs_by_chapter(chapter_id: str) -> Optional[dict]:
        for classic_dir in CONTENT_DIR.iterdir():
            if classic_dir.is_dir():
                chapter_file = classic_dir / f"{chapter_id}.json"
                if chapter_file.exists():
                    with open(chapter_file, encoding="utf-8") as f:
                        data = json.load(f)
                    return {
                        "chapter_id": data["chapter_id"],
                        "title": data["title"],
                        "paragraphs": [
                            {
                                "id": p["id"],
                                "content": p["content"],
                                "keywords": p.get("keywords", []),
                                "annotations": [
                                    {
                                        "id": ann.get("id", ""),
                                        "era": ann.get("era", ""),
                                        "era_name": ann.get("era_name", ""),
                                        "author": ann.get("author", ""),
                                        "author_id": ann.get("author_id", ""),
                                        "source": ann.get("source", ""),
                                        "view_angle": ann.get("view_angle", ""),
                                        "content": ann.get("content", ""),
                                        "ai_generated": ann.get("ai_generated", False)
                                    }
                                    for ann in p.get("annotations", [])
                                ]
                            }
                            for p in data["paragraphs"]
                        ]
                    }
        return None