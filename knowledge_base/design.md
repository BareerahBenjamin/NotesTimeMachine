# 知识库结构

馆藏以 JSON 保存，并以相同的相对路径写入 R2 的 `KNOWLEDGE_BUCKET`。作品、章节、段落和注疏通过稳定的标识关联。阅读链接、进度和搜索结果引用这些标识。

| R2 对象键 | 内容 |
| --- | --- |
| `metadata/classics.json` | `classics` 数组，包含作品 ID、题名、作者、朝代、分类、章节数和说明 |
| `metadata/authors.json` | 作者元数据。作者页面使用前端 `js/config.js` 中的资料 |
| `content/<classic_id>/<chapter_id>.json` | 章节及其段落。示例见 [《漱玉词》首章](content/shuyuci/shuyuci-01.json) |
| `metadata/activation-example.json` | 完整首次体验使用的可选人工核验清单。 [清单规范](../docs/USER-ACTIVATION-V2.md) |

章节 ID 采用 `<classic_id>-NN`，段落 ID 采用 `<chapter_id>-NN`。例如 `shuyuci-01-01` 从 `content/shuyuci/shuyuci-01.json` 读取。导入脚本生成新对象时须保持命名一致。

- 章节对象包含 `chapter_id`、`classic_id`、`title`、`order` 和 `paragraphs`。
- 段落包含 `id`、`content`、`order`、`keywords` 和 `annotations`。
- 注疏包含 `id`、`era`、`era_name`、`author`、`source`、`view_angle` 和 `content`。可附 `edition` 和 `reference`。由 AI 整理的资料应标记 `ai_generated: true`。

Worker 在读取时生成来源 ID 和类型，并区分待核验资料与 AI 生成资料。完整体验的清单还需匹配原文与注疏的内容 SHA-256、署名、版本和出处。评测中的来源账本用于人工核验工作。 [来源处理代码](../cf-worker/src/sources.ts) · [评测账本](../evaluations/ai/source-review-registry.json)

## 检索与离线工具

网站使用 `@cf/qwen/qwen3-embedding-0.6b` 和 1024 维 Vectorize 索引进行语义检索，命中段落的原文和注疏由 R2 提供。 [搜索实现](../cf-worker/src/routes/ai.ts)

`scripts/build_knowledge_base.py` 仍可用于旧版离线 ChromaDB 构建，使用 `classical_paragraphs` 和 `annotations` 两个集合。该工具及 `scripts/ctext_importer.py` 使用本目录的 Python 依赖和数据格式。导入工具含《论语》《道德经》的早期采集流程，当前网站馆藏以 `metadata/classics.json` 为准。 [离线构建](scripts/build_knowledge_base.py) · [导入脚本](scripts/ctext_importer.py) · [依赖清单](requirements.txt)
