# 注疏时光机部署指南

## 架构

```
用户 → Cloudflare Pages (前端) → Supabase (后端：PostgreSQL + Edge Functions)
```

**为什么选择这套方案？**

- **Cloudflare Pages**：全球CDN加速，免费额度充足，国内访问友好
- **Supabase**：开源的Firebase替代品
  - PostgreSQL 数据库（500MB免费）
  - Edge Functions（500万次免费调用/月）
  - pgvector 向量数据库（内置支持语义搜索）
  - 完全免费层足够支撑中小型项目长期运行

---

## 第一步：部署前端到 Cloudflare Pages

### 1. 注册 Cloudflare
- 访问 https://dash.cloudflare.com/sign-up
- 免费注册

### 2. 连接 GitHub 仓库
1. 登录 Cloudflare Dashboard
2. 左侧菜单 → Workers & Pages
3. 点击 "Create Application" → "Pages" → "Connect to Git"
4. 选择 GitHub 仓库 `BareerahBenjamin/NotesTimeMachine`
5. 配置构建设置：
   - **Production branch**: `main`
   - **Build command**: 留空（静态站点无需构建）
   - **Build output directory**: `/`（根目录）
6. 点击 "Save and Deploy"

### 3. 配置自定义域名（可选）
- 在 Pages 项目设置 → Custom domains
- 添加你的域名，按提示配置 DNS

---

## 第二步：部署后端到 Supabase

### 1. 注册 Supabase
- 访问 https://supabase.com
- 使用 GitHub 账号免费注册
- 免费层包含：
  - 500MB 数据库存储
  - 1GB 文件存储
  - 500万次 Edge Functions 调用/月
  - 50万次实时消息/月

### 2. 创建新项目
1. 登录 Supabase Dashboard
2. 点击 "New Project"
3. 填写：
   - **Name**: `notes-time-machine`
   - **Database Password**: 设置强密码（务必保存）
   - **Region**: 选择 `Northeast Asia (Tokyo)` 或 `Singapore`（国内访问更快）
4. 等待项目创建完成（约1-2分钟）

### 3. 启用 pgvector 扩展

在 Supabase Dashboard 中：
1. 左侧菜单 → **SQL Editor**
2. 点击 "New query"
3. 执行以下 SQL：

```sql
-- 启用向量扩展
CREATE EXTENSION IF NOT EXISTS vector;

-- 创建注疏表
CREATE TABLE annotations (
  id BIGSERIAL PRIMARY KEY,
  classic_id TEXT NOT NULL,
  chapter_id TEXT NOT NULL,
  paragraph_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  author TEXT,
  dynasty TEXT,
  year INTEGER,
  embedding vector(1536),
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 创建向量索引
CREATE INDEX annotations_embedding_idx ON annotations
USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- 创建社区表（用户分享）
CREATE TABLE community_posts (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users,
  classic_id TEXT NOT NULL,
  paragraph_index INTEGER,
  content TEXT NOT NULL,
  likes INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 启用行级安全
ALTER TABLE annotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_posts ENABLE ROW LEVEL SECURITY;

-- 允许所有人读取注疏
CREATE POLICY "Allow public read" ON annotations
  FOR SELECT USING (true);

-- 允许认证用户创建社区帖子
CREATE POLICY "Allow authenticated insert" ON community_posts
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');
```

4. 点击 "Run" 执行

### 4. 部署 Edge Function

#### 安装 Supabase CLI

```bash
# macOS
brew install supabase/tap/supabase

# 其他系统
npm install -g supabase
```

#### 初始化项目

```bash
# 在项目根目录
supabase init

# 登录
supabase login

# 链接项目
supabase link --project-ref <your-project-ref>
```

`<your-project-ref>` 在 Supabase Dashboard → Project Settings → General 中找到。

#### 创建 Edge Functions

```bash
# 搜索 API
supabase functions new search

# AI 分析 API
supabase functions new ai-analysis

# 社区 API
supabase functions new community
```

#### 编写函数代码

**functions/search/index.ts**:
```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  const { query, embedding } = await req.json()

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  // 向量相似度搜索
  const { data, error } = await supabase.rpc('match_annotations', {
    query_embedding: embedding,
    match_threshold: 0.7,
    match_count: 10
  })

  return new Response(JSON.stringify({ data }), {
    headers: { 'Content-Type': 'application/json' }
  })
})
```

#### 创建向量搜索函数

在 SQL Editor 中执行：

```sql
CREATE OR REPLACE FUNCTION match_annotations(
  query_embedding vector(1536),
  match_threshold float,
  match_count int
)
RETURNS TABLE (
  id bigint,
  classic_id text,
  chapter_id text,
  paragraph_index int,
  content text,
  author text,
  dynasty text,
  year int,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    annotations.id,
    annotations.classic_id,
    annotations.chapter_id,
    annotations.paragraph_index,
    annotations.content,
    annotations.author,
    annotations.dynasty,
    annotations.year,
    1 - (annotations.embedding <=> query_embedding) AS similarity
  FROM annotations
  WHERE 1 - (annotations.embedding <=> query_embedding) > match_threshold
  ORDER BY annotations.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
```

#### 部署函数

```bash
# 部署所有函数
supabase functions deploy search
supabase functions deploy ai-analysis
supabase functions deploy community

# 设置环境变量
supabase secrets set OPENAI_API_KEY=你的API密钥
supabase secrets set OPENAI_BASE_URL=https://api.vectorengine.ai/v1
supabase secrets set OPENAI_MODEL=deepseek-chat
```

### 5. 数据迁移

将原有的 JSON 数据导入到 Supabase：

创建 `scripts/migrate_to_supabase.py`：

```python
import json
import os
from pathlib import Path
from openai import OpenAI
from supabase import create_client

# 配置
SUPABASE_URL = "https://xxx.supabase.co"
SUPABASE_KEY = "你的service_role_key"
OPENAI_API_KEY = "你的API密钥"

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
    content_dir = Path("knowledge_base/content")

    for author_dir in content_dir.iterdir():
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
```

运行迁移：
```bash
pip install supabase openai
python scripts/migrate_to_supabase.py
```

### 6. 获取 API 配置

在 Supabase Dashboard 中获取：
1. **Project URL**: Settings → API → Project URL
2. **anon public key**: Settings → API → Project API keys → anon
3. **service_role key**: Settings → API → Project API keys → service_role（保密！）

---

## 第三步：连接前后端

### 1. 更新前端配置

修改 `js/config.js`：

```javascript
// Supabase 配置
export const SUPABASE_URL = 'https://xxx.supabase.co';
export const SUPABASE_ANON_KEY = '你的anon_key';

// API 基础地址
export const API_BASE = `${SUPABASE_URL}/functions/v1`;

// 开发环境（可选）
// export const API_BASE = 'http://localhost:54321/functions/v1';
```

### 2. 安装 Supabase JS 客户端

在 `index.html` 中添加：

```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
```

或在 `js/main.js` 中通过 ES Module 引入：

```javascript
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
```

### 3. 重新部署前端

```bash
git add -A
git commit -m "feat: integrate Supabase backend"
git push origin main
```

Cloudflare Pages 会自动重新部署。

---

## 第四步：测试验证

1. 访问 Cloudflare Pages 分配的域名
2. 测试功能：
   - 点击作者卡片切换作品
   - 点击段落查看注疏时间轴
   - 测试语义搜索（向量检索）
   - 测试 AI 分析
   - 测试社区功能（注册/登录/发帖）

---

## 本地开发

### 启动前端

```bash
python -m http.server 8000
```

### 启动本地 Supabase

```bash
# 需要安装 Docker
supabase start
```

这会启动本地 Supabase 服务，包括：
- PostgreSQL（54322端口）
- Edge Functions（54321端口）
- Studio UI（54323端口）

---

## 常见问题

### Q: Supabase 在国内访问慢？
- Supabase 海外节点，国内访问可能较慢
- 建议：
  1. 使用 Cloudflare Pages 加速前端
  2. 启用 Supabase 的连接池（pgBouncer）
  3. 考虑部署到 Cloudflare Workers + D1 数据库（更接近国内用户）

### Q: pgvector 的性能如何？
- 单表百万级数据下查询毫秒级返回
- 数据量更大可使用分区表或外部向量数据库
- 建议生产环境使用 `lists = 100` 的 ivfflat 索引

### Q: Supabase 免费额度够用吗？
- 500MB 数据库 ≈ 50万条短文本
- 500万次函数调用/月 ≈ 每天 16万次（足够中小型项目）
- 超出后按量计费，价格相对便宜

### Q: OpenAI API 国内访问不了？
- 当前使用 api.vectorengine.ai（第三方代理）
- 可替换为：
  - OpenAI 官方 API（需科学上网）
  - 国内大模型 API（通义千问、DeepSeek、智谱等）
  - Cloudflare Workers AI（内置多种模型）

### Q: 如何从阿里云函数计算迁移到 Supabase？
- 详见上文「数据迁移」章节
- 运行 `migrate_to_supabase.py` 脚本
- 完成后即可切换 API 地址

### Q: Cloudflare Workers + D1 是不是更便宜？
- 是的，且延迟更低
- 但 D1 原生不支持向量检索
- 方案：使用 Cloudflare Vectorize（向量数据库）+ D1（元数据）
- 这是 Cloudflare 全家桶，国内外访问速度都不错

---

## 架构对比

| 方案 | 成本 | 国内访问 | 维护难度 | 推荐场景 |
|---|---|---|---|---|
| **Cloudflare Pages + Supabase** | 免费 | 中等 | 低 | 中小型项目，长期运行 |
| **阿里云函数计算** | 3个月免费后按量付费 | 快 | 中 | 短期项目，企业级应用 |
| **Cloudflare Workers + D1** | 免费 | 快 | 中 | 追求性能，需要低延迟 |
| **Vercel + Supabase** | 免费 | 中等 | 低 | Next.js 项目，Vercel 生态 |

---

## 进阶方案：Cloudflare Workers + Vectorize

如果追求极致性能和完全免费，可以考虑：

```
用户 → Cloudflare Pages (前端) → Cloudflare Workers (API) → Vectorize (向量) + D1 (元数据)
```

- **Workers**：100,000次/天 免费
- **Vectorize**：3000万次向量查询/月 免费
- **D1**：500MB数据库 + 500万次读取/天 免费
- **完全免费，国内访问极快**

后续可逐步迁移到该架构。

---

## 相关链接

- [Cloudflare Pages 文档](https://developers.cloudflare.com/pages/)
- [Supabase 文档](https://supabase.com/docs)
- [pgvector 文档](https://github.com/pgvector/pgvector)
- [Supabase Edge Functions 文档](https://supabase.com/docs/guides/functions)
