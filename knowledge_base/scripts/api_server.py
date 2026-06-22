#!/usr/bin/env python3
"""
注疏时光机 API 服务
"""
import os

try:
    from flask import Flask, request, jsonify
    from flask_cors import CORS
except ImportError:
    print("请安装 flask flask-cors: pip install flask flask-cors")
    exit(1)

from scripts.service import KnowledgeService

app = Flask(__name__)
CORS(app)

# 注册社区蓝图
from scripts.community_routes import community_bp
app.register_blueprint(community_bp)

knowledge_service = KnowledgeService()


@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({
        "status": "ok",
        "rag_available": knowledge_service.get_rag_service() is not None,
    })


@app.route("/api/paragraph/<paragraph_id>", methods=["GET"])
def get_paragraph(paragraph_id):
    result = knowledge_service.get_paragraph_with_annotations(paragraph_id)
    if "error" in result:
        return jsonify(result), 404
    return jsonify(result)


@app.route("/api/query", methods=["POST"])
def query():
    try:
        data = request.get_json()
        query_text = data.get("query", "")
        top_k = data.get("top_k", 3)

        if not query_text:
            return jsonify({"error": "query 不能为空"}), 400

        rag_service = knowledge_service.get_rag_service()
        if rag_service is None:
            return jsonify({"error": "RAG 服务不可用，请先运行 build_knowledge_base.py"}), 503

        results = rag_service.query_by_text(query_text, top_k)
        return jsonify({
            "results": [
                {
                    "paragraph": knowledge_service._paragraph_to_dict(r.paragraph),
                    "annotations": [knowledge_service._annotation_to_dict(a) for a in r.annotations]
                }
                for r in results
            ]
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/analyze", methods=["POST"])
def analyze():
    try:
        data = request.get_json()
        paragraph_id = data.get("paragraph_id", "")

        if not paragraph_id:
            return jsonify({"error": "paragraph_id 不能为空"}), 400

        result = knowledge_service.analyze(paragraph_id)
        if "error" in result:
            status = 404 if result["error"] == "段落不存在" else 503
            return jsonify(result), status
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/search", methods=["POST"])
def search():
    """多维度检索接口"""
    try:
        data = request.get_json()
        filters = data.get("filters", {})
        top_k = data.get("top_k", 10)

        if not filters:
            return jsonify({"error": "filters 不能为空"}), 400

        result = knowledge_service.search(filters)
        if "error" in result:
            return jsonify(result), 503
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/annotation/interpret", methods=["POST"])
def interpret_annotation():
    """为单条注疏生成 AI 解读"""
    try:
        data = request.get_json()
        annotation = data.get("annotation", {})

        if not annotation:
            return jsonify({"error": "annotation 不能为空"}), 400

        rag_service = knowledge_service.get_rag_service()
        if rag_service is None:
            return jsonify({"error": "RAG 服务不可用，请先运行 build_knowledge_base.py"}), 503

        from scripts.models import Annotation
        ann_obj = Annotation(
            id=annotation.get("id", ""),
            paragraph_id=annotation.get("paragraph_id", ""),
            era=annotation.get("era", ""),
            era_name=annotation.get("era_name", ""),
            author=annotation.get("author", ""),
            author_id=annotation.get("author_id", ""),
            source=annotation.get("source", ""),
            view_angle=annotation.get("view_angle", ""),
            content=annotation.get("content", ""),
            chapter_title=annotation.get("chapter_title", "")
        )

        interpretation = rag_service.generate_annotation_interpretation(ann_obj)
        return jsonify({
            "annotation_id": annotation.get("id", ""),
            "interpretation": interpretation
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/classics", methods=["GET"])
def get_classics():
    try:
        return jsonify(knowledge_service.get_classics())
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/chapters/<classic_id>", methods=["GET"])
def get_chapters(classic_id):
    try:
        chapters = knowledge_service.get_chapters(classic_id)
        if not chapters:
            return jsonify({"error": "古籍不存在"}), 404
        return jsonify({"chapters": chapters})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/paragraphs/<chapter_id>", methods=["GET"])
def get_paragraphs(chapter_id):
    try:
        result = knowledge_service.get_paragraphs(chapter_id)
        if result is None:
            return jsonify({"error": "篇章不存在"}), 404
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


def main():
    port = int(os.getenv("PORT", 5001))
    debug = os.getenv("FLASK_DEBUG", "false").lower() == "true"

    knowledge_service.get_rag_service()

    print(f"启动 API 服务: http://localhost:{port}")
    app.run(host="0.0.0.0", port=port, debug=debug)


if __name__ == "__main__":
    main()