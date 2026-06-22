# 注疏时光机 - 知识库设计

## 一、数据模型

### 1.1 核心实体

```
Classic (古籍)
├── id: string              # 唯一标识，如 "lunyu"
├── title: string            # 书名，如 "论语"
├── author: string           # 作者/注者，如 "孔子"
├── dynasty: string          # 成书时代，如 "春秋"
└── total_chapters: number  # 总章节数

Chapter (篇章)
├── id: string              # 如 "lunyu-01"
├── classic_id: string      # 所属古籍
├── title: string           # 篇名，如 "学而第一"
├── order: number           # 排序
└── paragraph_count: number

Paragraph (段落/句子)
├── id: string              # 如 "lunyu-01-01"
├── chapter_id: string      # 所属篇章
├── content: string         # 原文内容
├── order: number           # 段落序号
├── char_count: number      # 字数
└── keywords: string[]     # 关键词（供检索用）

Annotation (注疏)
├── id: string              # 如 "zhengxuan-lunyu-01-01"
├── paragraph_id: string   # 对应段落
├── era: enum              # 时代：han/song/qing/modern
├── era_name: string       # 时代名：汉代/宋代/清代/现代
├── author: string         # 注者姓名
├── source: string          # 出处，如 "《十三经注疏》"
├── content: string        # 注疏正文
├── view_angle: string      # 解读角度：训诂/义理/考据/思想史
└── char_count: number     # 字数
```

### 1.2 关系图

```
Classic ─┬─> Chapter ─┬─> Paragraph ─┬─> Annotation
         │            │              │
         │            │              └─> era (时代)
         │            │              └─> author (注者)
         │            │
         │            └─> keywords
         │
         └─> 作者、时代、类别
```

---

## 二、向量数据库设计 (ChromaDB)

### 2.1 Collection 结构

```python
# Collection: classical_paragraphs
{
  "id": "lunyu-01-01",           # paragraph_id
  "embedding": [0.123, ...],      # 768维向量
  "document": "子曰："学而时习之，不亦说乎？..."",
  "metadatas": {
    "classic_id": "lunyu",
    "chapter_id": "lunyu-01",
    "classic_title": "论语",
    "chapter_title": "学而第一",
    "content": "子曰："学而时习之，不亦说乎？..."",
    "keywords": ["学", "习", "说", "朋", "乐", "君子"]
  }
}

# Collection: annotations
{
  "id": "zhengxuan-lunyu-01-01",
  "embedding": [0.456, ...],
  "document": "郑玄注：习，修习也。时时温习...",
  "metadatas": {
    "paragraph_id": "lunyu-01-01",
    "era": "han",
    "era_name": "汉代",
    "author": "郑玄",
    "view_angle": "训诂"
  }
}
```

### 2.2 检索策略

| 检索场景 | 向量库 | 查询方式 |
|---------|-------|---------|
| 查找相似句子 | paragraphs | 用户输入 → 向量 → Top-K 相似段落 |
| 查找相关注疏 | annotations | 段落ID → Filter 查询 |
| 多角度解读 | annotations | era/author 过滤 |

---

## 三、JSON 数据存储

### 3.1 古籍元数据 `classics.json`

```json
{
  "classics": [
    {
      "id": "lunyu",
      "title": "论语",
      "author": "孔子及其弟子",
      "dynasty": "春秋",
      "category": "儒家",
      "total_chapters": 20,
      "description": "孔子及其弟子言行录，儒家经典之首"
    },
    {
      "id": "daodejing",
      "title": "道德经",
      "author": "老子",
      "dynasty": "春秋",
      "category": "道家",
      "total_chapters": 81,
      "description": "道家思想之源，论述宇宙人生根本"
    },
    {
      "id": "zhuangzi",
      "title": "庄子",
      "author": "庄周",
      "dynasty": "战国",
      "category": "道家",
      "description": "道家南华真经，想象力与哲思结合"
    }
  ]
}
```

### 3.2 段落+注疏数据 `content/lunyu/01_xueer.json`

```json
{
  "chapter_id": "lunyu-01",
  "title": "学而第一",
  "paragraphs": [
    {
      "id": "lunyu-01-01",
      "order": 1,
      "content": "子曰："学而时习之，不亦说乎？有朋自远方来，不亦乐乎？人不知而不愠，不亦君子乎？"",
      "keywords": ["学", "习", "朋", "乐", "君子"],
      "annotations": [
        {
          "id": "zhengxuan-001",
          "era": "han",
          "era_name": "汉代",
          "author": "郑玄",
          "source": "《十三经注疏》",
          "view_angle": "训诂",
          "content": ""习"指"修习"，即反复练习所学之业。时时温习其所学，则学业日进，故喜悦。"
        },
        {
          "id": "zhuxi-001",
          "era": "song",
          "era_name": "宋代",
          "author": "朱熹",
          "source": "《四书章句集注》",
          "view_angle": "义理",
          "content": ""学"之为言效也。人性皆善，而觉有先后，后觉者必效先觉之所为，乃可以明善而复其初也。习，鸟数飞也。"
        },
        {
          "id": "liuling-001",
          "era": "qing",
          "era_name": "清代",
          "author": "刘宝楠",
          "source": "《论语正义》",
          "view_angle": "考据",
          "content": "此章所云"学"，兼知行言。学者，诵习圣贤之言，而身体行焉，以为轨范，非如今之所谓学也。"
        },
        {
          "id": "liling-001",
          "era": "modern",
          "era_name": "现代",
          "author": "李零",
          "source": "《丧然开》",
          "view_angle": "思想史",
          "content": ""学而时习之"，是说学了要经常复习。"有朋自远方来"，是志同道合者来交流。"人不知而不愠"，是别人不了解你，你不生气。这是孔子自述其学之乐。"
        }
      ]
    }
  ]
}
```

---

## 四、目录结构

```
knowledge_base/
├── metadata/
│   ├── classics.json           # 古籍元数据
│   └── authors.json            # 注家信息
├── content/
│   ├── lunyu/
│   │   ├── 01_xueer.json       # 学而第一
│   │   ├── 02_weizheng.json    # 为政第二
│   │   └── ...
│   ├── daodejing/
│   │   └── ...
│   └── zhuangzi/
│       └── ...
├── embeddings/                 # 向量数据（ChromaDB）
│   └── chroma/
└── scripts/
    ├── build_knowledge_base.py # 构建知识库脚本
    ├── embed_paragraphs.py     # 向量化段落
    └── query.py                # 检索测试
```

---

## 五、数据来源

| 数据 | 来源 | 费用 |
|-----|-----|-----|
| 古籍原文 | [中国哲学书电子化计划](https://ctext.org/) | 免费 |
| 十三经注疏 | 公开古籍整理 | 免费 |
| 诸子集成 | 公开古籍整理 | 免费 |
| 现代注本 | 版权问题需处理 | 需授权 |

---

## 六、扩展方向

- **知识图谱**：用 Neo4j 构建"注家-学派-时代"关系网
- **多语言**：英文、日文注疏，支撑对外汉语场景
- **多媒体**：配古琴曲、书法作品
