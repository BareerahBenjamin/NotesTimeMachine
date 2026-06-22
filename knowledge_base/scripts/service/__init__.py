import os
from pathlib import Path
from typing import List, Optional, Dict

try:
    from openai import OpenAI
except ImportError:
    raise ImportError("请安装 openai: pip install openai")

from scripts.models import Paragraph, Annotation, QueryResult
from scripts.repository import ChromaRepository, JsonRepository

KB_DIR = Path(__file__).resolve().parents[2]

try:
    from dotenv import load_dotenv
    load_dotenv(KB_DIR / ".env")
except ImportError:
    pass

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "sk-MK8bFnSUZKrgTwTWLdTSWR1KKRxAjRq66oSEw417ZNN5ckeZKl")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "deepseek-chat")
OPENAI_BASE_URL = os.getenv("OPENAI_BASE_URL", "https://api.vectorengine.ai/v1")
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "text-embedding-3-small")


class RAGService:
    def __init__(self):
        self.chroma_repo = ChromaRepository()
        self.openai_client = OpenAI(api_key=OPENAI_API_KEY, base_url=OPENAI_BASE_URL)

    def get_embedding(self, text: str) -> List[float]:
        response = self.openai_client.embeddings.create(model=EMBEDDING_MODEL, input=text)
        return response.data[0].embedding

    def query_by_paragraph_id(self, paragraph_id: str) -> Optional[QueryResult]:
        paragraph = self.chroma_repo.get_paragraph_by_id(paragraph_id)
        if not paragraph:
            return None
        annotations = self.chroma_repo.get_annotations_by_paragraph_id(paragraph_id)
        return QueryResult(paragraph=paragraph, annotations=annotations, ai_analysis="")

    def query_by_text(self, query_text: str, top_k: int = 3) -> List[QueryResult]:
        embedding = self.get_embedding(query_text)
        paragraphs = self.chroma_repo.query_paragraphs_by_embedding(embedding, top_k)
        results = []
        for para in paragraphs:
            annotations = self.chroma_repo.get_annotations_by_paragraph_id(para.id)
            results.append(QueryResult(paragraph=para, annotations=annotations, ai_analysis=""))
        return results

    def query_by_filters(self, filters: Dict, top_k: int = 10) -> List[QueryResult]:
        """多维度检索：支持按时代、作者、作品类别、关键词等检索"""
        results = []
        
        # 按时代检索注疏
        if "era" in filters:
            annotations = self.chroma_repo.get_annotations_by_era(filters["era"], top_k)
            for ann in annotations:
                para = self.chroma_repo.get_paragraph_by_id(ann.paragraph_id)
                if para:
                    results.append(QueryResult(
                        paragraph=para,
                        annotations=[ann],
                        ai_analysis=""
                    ))
        
        # 按作者检索注疏
        if "author" in filters:
            annotations = self.chroma_repo.get_annotations_by_author(filters["author"], top_k)
            for ann in annotations:
                para = self.chroma_repo.get_paragraph_by_id(ann.paragraph_id)
                if para:
                    results.append(QueryResult(
                        paragraph=para,
                        annotations=[ann],
                        ai_analysis=""
                    ))
        
        # 按作品类别检索段落
        if "category" in filters:
            classics = JsonRepository.get_classics()
            classic_ids = [c["id"] for c in classics if c.get("category") == filters["category"]]
            for classic_id in classic_ids[:top_k]:
                chapters = JsonRepository.get_chapters_by_classic(classic_id)
                for chapter in chapters[:3]:
                    paras_data = JsonRepository.get_paragraphs_by_chapter(chapter["chapter_id"])
                    if paras_data:
                        for p_data in paras_data["paragraphs"][:2]:
                            para = Paragraph(
                                id=p_data["id"],
                                content=p_data["content"],
                                classic_id=classic_id,
                                chapter_title=paras_data["title"],
                                keywords=p_data.get("keywords", [])
                            )
                            annotations = self.chroma_repo.get_annotations_by_paragraph_id(para.id)
                            results.append(QueryResult(
                                paragraph=para,
                                annotations=annotations,
                                ai_analysis=""
                            ))
        
        # 按关键词检索段落
        if "keywords" in filters:
            keywords_list = filters["keywords"]
            paragraphs = self.chroma_repo.query_paragraphs_by_keywords(keywords_list, top_k)
            for para in paragraphs:
                annotations = self.chroma_repo.get_annotations_by_paragraph_id(para.id)
                results.append(QueryResult(
                    paragraph=para,
                    annotations=annotations,
                    ai_analysis=""
                ))
        
        # 按作品ID检索
        if "classic_id" in filters:
            chapters = JsonRepository.get_chapters_by_classic(filters["classic_id"])
            for chapter in chapters[:top_k]:
                paras_data = JsonRepository.get_paragraphs_by_chapter(chapter["chapter_id"])
                if paras_data:
                    for p_data in paras_data["paragraphs"][:2]:
                        para = Paragraph(
                            id=p_data["id"],
                            content=p_data["content"],
                            classic_id=filters["classic_id"],
                            chapter_title=paras_data["title"],
                            keywords=p_data.get("keywords", [])
                        )
                        annotations = self.chroma_repo.get_annotations_by_paragraph_id(para.id)
                        results.append(QueryResult(
                            paragraph=para,
                            annotations=annotations,
                            ai_analysis=""
                        ))
        
        # 去重
        seen = {}
        for r in results:
            key = r.paragraph.id
            if key not in seen:
                seen[key] = r
            else:
                # 合并注疏
                seen[key].annotations.extend(r.annotations)
        
        return list(seen.values())[:top_k]

    def generate_ai_analysis(self, query_result: QueryResult) -> str:
        if not query_result.annotations:
            return "暂无注疏数据"
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

    def generate_annotation_interpretation(self, annotation: Annotation) -> str:
        """为单条注疏生成 AI 解读，结合注疏人时代背景"""
        era_backgrounds = {
            "汉": "汉代经学注重名物训诂，讲究字字落实，奠定了后世注疏的基本范式。汉代学者在经学传承中形成了严谨的释义传统。",
            "魏晋": "魏晋时期玄学兴盛，清谈成风，注疏风格趋于简远玄淡，注重义理发挥而不再拘泥于名物考证。",
            "南北朝": "南北朝时期经学南北分立，南方偏重义理，北方注重训诂，形成不同的学术风格。",
            "隋": "隋代统一后，南北学风开始融合，为唐代义疏之学奠定基础。",
            "唐": "唐代义疏之学鼎盛，官方注疏规范化，形成《五经正义》等标准文本，强调注疏的权威性和统一性。",
            "宋": "宋代理学兴起，注疏转向义理发挥，以理学思想诠释经典，注重经典背后的义理和心性之学。",
            "元": "元代程朱理学继续保持统治地位，注疏多沿袭宋代理学传统，缺乏创新。",
            "明": "明代王阳明心学兴起，与程朱理学分庭抗礼，注疏风格出现心学与理学的对立。",
            "清": "清代考据学复兴，乾嘉学派注重名物训诂、考证辨伪，反对空谈义理，恢复汉唐注疏传统。",
            "近代": "近代以来，西方学术思想传入，学者开始用新的方法研究古籍，注疏呈现多元化特点。",
            "现代": "现代学术注重文本分析、历史考证与跨学科研究，注疏方法更加科学和规范。"
        }
        
        era = annotation.era_name if annotation.era_name else annotation.era
        background = era_backgrounds.get(era, "该时代注疏风格独特，具有其历史背景下的学术特点。")
        
        prompt = f"""为以下古代注疏生成通俗易懂的现代解读：

注疏原文：{annotation.content}

注疏信息：
- 时代：{annotation.era_name}（{annotation.era}）
- 注家：{annotation.author}
- 出处：{annotation.source}
- 视角：{annotation.view_angle if annotation.view_angle else '综合解读'}

时代背景说明：
{background}

请生成一段简洁的现代解读（100-150字），要求：
1. 解释这注疏说了什么
2. 结合作者所处的时代背景
3. 帮助现代读者理解古人如何理解这段原文
4. 语言通俗易懂，避免过于专业的术语
"""
        response = self.openai_client.chat.completions.create(
            model=OPENAI_MODEL,
            messages=[
                {"role": "system", "content": "你是一位研究中国古典文献的专家，擅长用通俗易懂的语言解读古代注疏。"},
                {"role": "user", "content": prompt}
            ],
            max_tokens=300
        )
        return response.choices[0].message.content


class KnowledgeService:
    def __init__(self):
        self.rag_service: Optional[RAGService] = None
        self.rag_init_error: Optional[str] = None

    def get_rag_service(self) -> Optional[RAGService]:
        if self.rag_service is not None:
            return self.rag_service
        if self.rag_init_error is not None:
            return None
        try:
            self.rag_service = RAGService()
            return self.rag_service
        except Exception as e:
            self.rag_init_error = str(e)
            return None

    def get_paragraph_with_annotations(self, paragraph_id: str) -> dict:
        rag_service = self.get_rag_service()
        if rag_service is not None:
            try:
                result = rag_service.query_by_paragraph_id(paragraph_id)
                if result and result.annotations:
                    return {
                        "paragraph": self._paragraph_to_dict(result.paragraph),
                        "annotations": [self._annotation_to_dict(a) for a in result.annotations],
                        "source": "rag"
                    }
            except Exception:
                pass

        # Fallback: read from JSON files directly
        chapter_id = paragraph_id.rsplit("-", 1)[0]
        chapter = JsonRepository.get_chapter(chapter_id)
        if chapter is None:
            return {"error": "段落不存在"}
        para = next((p for p in chapter.paragraphs if p.id == paragraph_id), None)
        if para is None:
            return {"error": "段落不存在"}

        # Read raw JSON to get annotations (Chapter model doesn't include them)
        annotations = []
        import json
        from pathlib import Path
        for classic_dir in (KB_DIR / "content").iterdir():
            if classic_dir.is_dir():
                chapter_file = classic_dir / f"{chapter_id}.json"
                if chapter_file.exists():
                    with open(chapter_file, encoding="utf-8") as f:
                        data = json.load(f)
                    for p_data in data.get("paragraphs", []):
                        if p_data["id"] == paragraph_id:
                            annotations = [
                                {
                                    "id": ann.get("id", ""),
                                    "paragraph_id": paragraph_id,
                                    "era": ann.get("era", ""),
                                    "era_name": ann.get("era_name", ""),
                                    "author": ann.get("author", ""),
                                    "author_id": ann.get("author_id", ""),
                                    "source": ann.get("source", ""),
                                    "view_angle": ann.get("view_angle", ""),
                                    "content": ann.get("content", ""),
                                    "chapter_title": data.get("title", "")
                                }
                                for ann in p_data.get("annotations", [])
                            ]
                            break
                    break

        return {
            "paragraph": self._paragraph_to_dict(para),
            "annotations": annotations,
            "source": "json"
        }

    def get_classics(self) -> List[dict]:
        return JsonRepository.get_classics()

    def get_chapters(self, classic_id: str) -> List[dict]:
        return JsonRepository.get_chapters_by_classic(classic_id)

    def get_paragraphs(self, chapter_id: str) -> Optional[dict]:
        return JsonRepository.get_paragraphs_by_chapter(chapter_id)

    def analyze(self, paragraph_id: str) -> dict:
        rag_service = self.get_rag_service()
        if rag_service is None:
            return {"error": "RAG 服务不可用"}

        result = rag_service.query_by_paragraph_id(paragraph_id)
        if not result:
            chapter = JsonRepository.get_chapter(paragraph_id.rsplit("-", 1)[0])
            para = next((p for p in chapter.paragraphs if p.id == paragraph_id), None) if chapter else None
            if not para:
                return {"error": "段落不存在"}
            result = QueryResult(paragraph=para, annotations=[], ai_analysis="")

        analysis = rag_service.generate_ai_analysis(result)
        return {"paragraph_id": paragraph_id, "analysis": analysis}

    def search(self, filters: Dict) -> dict:
        """多维度检索接口"""
        rag_service = self.get_rag_service()
        if rag_service is None:
            return {"error": "RAG 服务不可用"}
        
        try:
            results = rag_service.query_by_filters(filters)
            return {
                "results": [
                    {
                        "paragraph": self._paragraph_to_dict(r.paragraph),
                        "annotations": [self._annotation_to_dict(a) for a in r.annotations]
                    }
                    for r in results
                ],
                "source": "rag"
            }
        except Exception as e:
            return {"error": str(e)}

    @staticmethod
    def _paragraph_to_dict(paragraph: Paragraph) -> dict:
        return {
            "id": paragraph.id,
            "content": paragraph.content,
            "classic_id": paragraph.classic_id,
            "chapter_title": paragraph.chapter_title,
            "keywords": paragraph.keywords
        }

    @staticmethod
    def _annotation_to_dict(annotation: Annotation) -> dict:
        return {
            "id": annotation.id,
            "paragraph_id": annotation.paragraph_id,
            "era": annotation.era,
            "era_name": annotation.era_name,
            "author": annotation.author,
            "author_id": annotation.author_id,
            "source": annotation.source,
            "view_angle": annotation.view_angle,
            "content": annotation.content,
            "chapter_title": annotation.chapter_title
        }