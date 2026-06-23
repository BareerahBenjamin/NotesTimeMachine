import json
import os
from pathlib import Path
from openai import OpenAI
from supabase import create_client

# 配置
SUPABASE_URL = "https://xxx.supabase.co"
SUPABASE_KEY = "你的service_role_key"
OPENAI_API_KEY = "你的API密钥"

# 自动获取脚本所在目录的上级目录（knowledge_base）
SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
CONTENT_DIR = PROJECT_ROOT / "content"

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
client = OpenAI(api_key=OPENAI_API_KEY, base_url="https://api.vectorengine.ai/v1")

def get_embedding(text: str):
    """获取文本向量"""
    response = client.embeddings.create(
        model="text-embedding-3-small",
        input=text
    )
    return response.data[0].embedding

def migrate():
    """迁移所有作品数据"""
    print(f"数据目录: {CONTENT_DIR}")
    print(f"目录是否存在: {CONTENT_DIR.exists()}")

    for author_dir in CONTENT_DIR.iterdir():
        if not author_dir.is_dir():
            continue

        for json_file in author_dir.glob("*.json"):
            print(f"处理: {json_file}")

            with open(json_file, 'r', encoding='utf-8') as f:
                data = json.load(f)

            # 批量插入
            records = []
            for annotation in data.get('annotations', []):
                content = annotation.get('content', '')
                if not content:
                    continue

                embedding = get_embedding(content)
                records.append({
                    'classic_id': data.get('classic_id'),
                    'chapter_id': annotation.get('chapter_id'),
                    'paragraph_index': annotation.get('paragraph_index', 0),
                    'content': content,
                    'author': annotation.get('author'),
                    'dynasty': annotation.get('dynasty'),
                    'year': annotation.get('year'),
                    'embedding': embedding,
                    'metadata': annotation
                })

            if records:
                supabase.table('annotations').insert(records).execute()
                print(f"  插入了 {len(records)} 条记录")

if __name__ == "__main__":
    migrate()