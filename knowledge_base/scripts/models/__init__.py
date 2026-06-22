from dataclasses import dataclass
from typing import List, Optional


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


@dataclass
class Chapter:
    chapter_id: str
    title: str
    classic_id: str
    paragraphs: List[Paragraph]


@dataclass
class Classic:
    id: str
    name: str
    author: str
    dynasty: str
    chapters: List[Chapter]