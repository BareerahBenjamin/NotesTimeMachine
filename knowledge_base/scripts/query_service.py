#!/usr/bin/env python3
"""
RAG 查询服务
"""
import json
import os
from pathlib import Path
from dataclasses import dataclass
from typing import List, Optional

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
    exit(1)

try:
    from openai import OpenAI
except ImportError:
    print("请安装 openai: pip install openai")
    exit(1)

# 配置
EMBEDDINGS_DIR = KB_DIR / "embeddings"
CHROMA_DIR = EMBEDDINGS_DIR / "chroma"

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "sk-MK8bFnSUZKrgTwTWLdTSWR1KKRxAjRq66oSEw417ZNN5ckeZKl")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "deepseek-chat")
OPENAI_BASE_URL = os.getenv("OPENAI_BASE_URL", "https://api.vectorengine.ai/v1")
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "text-embedding-3-small")

COLLECTION_PARAGRAPHS = "classical_paragraphs"
COLLECTION_ANNOTATIONS = "annotations"


@dataclass
class Paragraph:
    id: str
    content: str
    classic_id: str
    chapter_title: str
    keywords: List[str]


@dataclass
class Annotation:
    id: str
    paragraph_id: str
    era: str
    era_name: str
    author: str
    author_id: str
    source: str
    view_angle: str
    content: str
    chapter_title: str


@dataclass
class QueryResult:
    paragraph: Paragraph
    annotations: List[Annotation]
    ai_analysis: str


class RAGQueryService:
    def __init__(self):
        self.chroma_client = chromadb.PersistentClient(path=str(CHROMA_DIR))
        # 用 get_or_create_collection 避免首次启动崩溃
        self.paragraphs_col = self.chroma_client.get_or_create_collection(COLLECTION_PARAGRAPHS)
        self.annotations_col = self.chroma_client.get_or_create_collection(COLLECTION_ANNOTATIONS)
        self.openai_client = OpenAI(
            api_key=OPENAI_API_KEY,
            base_url=OPENAI_BASE_URL
        )

    def get_embedding(self, text: str) -> List[float]:
        """获取文本向量"""
        response = self.openai_client.embeddings.create(
            model=EMBEDDING_MODEL,
            input=text
        )
        return response.data[0].embedding

    def query_by_paragraph_id(self, paragraph_id: str) -> Optional[QueryResult]:
        """根据段落ID查询注疏"""
        para_data = self.paragraphs_col.get(ids=[paragraph_id])
        if not para_data or not para_data["ids"]:
            return None

        metadata = para_data["metadatas"][0]
        paragraph = Paragraph(
            id=paragraph_id,
            content=metadata["content"],
            classic_id=metadata["classic_id"],
            chapter_title=metadata["chapter_title"],
            keywords=metadata.get("keywords", "").split(",") if metadata.get("keywords") else []
        )

        # 查询该段落的注疏
        ann_results = self.annotations_col.get(
            where={"paragraph_id": paragraph_id}
        )

        annotations = []
        for i, ann_id in enumerate(ann_results["ids"]):
            md = ann_results["metadatas"][i]
            content = md.get("raw_content") or ann_results["documents"][i]
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

        return QueryResult(
            paragraph=paragraph,
            annotations=annotations,
            ai_analysis=""
        )

    def query_by_text(self, query_text: str, top_k: int = 3) -> List[QueryResult]:
        """根据文本查询相似段落及其注疏"""
        # 向量化查询文本
        query_embedding = self.get_embedding(query_text)

        # 查询相似段落
        para_results = self.paragraphs_col.query(
            query_embeddings=[query_embedding],
            n_results=top_k
        )

        results = []
        for i, para_id in enumerate(para_results["ids"][0]):
            para_metadata = para_results["metadatas"][0][i]

            paragraph = Paragraph(
                id=para_id,
                content=para_metadata["content"],
                classic_id=para_metadata["classic_id"],
                chapter_title=para_metadata["chapter_title"],
                keywords=para_metadata.get("keywords", "").split(",") if para_metadata.get("keywords") else []
            )

            # 查询该段落的注疏
            ann_results = self.annotations_col.get(
                where={"paragraph_id": para_id}
            )

            annotations = []
            for j, ann_id in enumerate(ann_results["ids"]):
                md = ann_results["metadatas"][j]
                content = md.get("raw_content") or ann_results["documents"][j]
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

            results.append(QueryResult(
                paragraph=paragraph,
                annotations=annotations,
                ai_analysis=""
            ))

        return results

    def generate_ai_analysis(self, query_result: QueryResult) -> str:
        """生成 AI 脉络分析"""
        if not query_result.annotations:
            return "暂无注疏数据"

        # 构建提示词
        eras = list(set([a.era_name for a in query_result.annotations]))
        authors = [a.author for a in query_result.annotations]
        view_angles = list(set([a.view_angle for a in query_result.annotations if a.view_angle]))

        prompt = f"""分析以下古籍段落的历代注疏演变脉络：

原文：{query_result.paragraph.content}

注疏概况：
- 注疏数量：{len(query_result.annotations)} 条
- 涉及时代：{', '.join(eras)}
- 代表注家：{', '.join(authors)}
- 解读角度：{', '.join(view_angles) if view_angles else '多元'}

请分析：
1. 各时代注疏的侧重点有何不同？
2. 注疏视角经历了怎样的演变？
3. 核心分歧在哪里？
"""

        response = self.openai_client.chat.completions.create(
            model=OPENAI_MODEL,
            messages=[
                {"role": "system", "content": "你是一位研究中国古典文献的专家，擅长分析历代注疏的演变脉络。"},
                {"role": "user", "content": prompt}
            ],
            max_tokens=500
        )

        return response.choices[0].message.content


def main():
    print("=" * 50)
    print("RAG 查询服务测试")
    print("=" * 50)

    if not OPENAI_API_KEY or OPENAI_API_KEY == "your-api-key":
        print("错误: 请设置 OPENAI_API_KEY 环境变量")
        return

    service = RAGQueryService()

    # 测试查询
    print("\n测试查询 'shuyuci-01-01'...")
    result = service.query_by_paragraph_id("shuyuci-01-01")

    if result:
        print(f"\n段落: {result.paragraph.content}")
        print(f"\n注疏数量: {len(result.annotations)}")
        for ann in result.annotations:
            print(f"\n--- {ann.era_name} {ann.author} ---")
            print(ann.content)

        print("\n\n正在生成 AI 分析...")
        analysis = service.generate_ai_analysis(result)
        print(f"\nAI 脉络分析:\n{analysis}")
    else:
        print("未找到结果，请先运行 build_knowledge_base.py 构建知识库")


if __name__ == "__main__":
    main()
