# 注疏时光机部署指南

## 架构

```
用户 → Cloudflare Pages (前端) → 阿里云函数计算 (后端API)
```

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

## 第二步：部署后端到阿里云函数计算

### 1. 开通阿里云函数计算
- 访问 https://www.aliyun.com/product/fc
- 开通函数计算 FC（免费额度：每月100万次调用，40万GB秒计算）

### 2. 安装 Serverless Devs 工具
```bash
npm install -g @serverless-devs/s
s config add  # 配置阿里云 AccessKey
```

### 3. 部署后端

#### 方案A：使用 Serverless Devs（推荐）

```bash
cd knowledge_base

# 创建 s.yaml 部署配置（见下方）
# 然后执行部署
s deploy
```

#### 方案B：手动部署到函数计算

1. 登录阿里云控制台 → 函数计算 FC
2. 创建服务：`notes-time-machine`
3. 创建函数：
   - **运行时**: Python 3.10
   - **处理程序**: `handler.handler`
   - **代码上传**: 打包 `knowledge_base/` 目录（排除 `venv/`）
4. 配置 HTTP 触发器：
   - **请求方法**: ANY
   - **认证方式**: 无需认证
5. 环境变量配置：
   ```
   OPENAI_API_KEY=你的API密钥
   OPENAI_BASE_URL=https://api.vectorengine.ai/v1
   OPENAI_MODEL=deepseek-chat
   EMBEDDING_MODEL=text-embedding-3-small
   ```

### 4. 获取函数 URL
部署完成后，函数计算会分配一个 HTTP 触发器 URL，格式类似：
```
https://xxx.cn-shanghai.fc.aliyuncs.com
```

---

## 第三步：连接前后端

### 1. 更新前端 API 地址

修改 `js/config.js` 中的 `API_BASE`：

```javascript
// 开发环境
// export const API_BASE = 'http://localhost:5001';

// 生产环境 - 替换为你的函数计算 URL
export const API_BASE = 'https://xxx.cn-shanghai.fc.aliyuncs.com';
```

### 2. 重新部署前端
```bash
git add -A
git commit -m "feat: update API_BASE for production"
git push origin main
```

Cloudflare Pages 会自动重新部署。

---

## 第四步：测试验证

1. 访问 Cloudflare Pages 分配的域名
2. 测试功能：
   - 点击作者卡片切换作品
   - 点击段落查看注疏时间轴
   - 测试语义搜索
   - 测试 AI 分析

---

## 常见问题

### Q: Cloudflare Pages 在国内访问慢？
- Cloudflare 免费版有国内节点，通常访问速度不错
- 如需更快，可配置自定义域名 + 国内 CDN

### Q: 函数计算冷启动慢？
- 首次访问可能需要几秒冷启动
- 可配置预留实例（付费）避免冷启动
- 或使用按量付费 + 预留模式

### Q: ChromaDB 在函数计算中如何工作？
- 函数计算是无状态的，每次冷启动后需要重新加载
- 建议将 ChromaDB 数据打包到部署包中
- 或改用云数据库（如阿里云 AnalyticDB PostgreSQL 向量版）

### Q: OpenAI API 国内访问不了？
- 当前使用 api.vectorengine.ai（第三方代理）
- 或替换为国内大模型 API（通义千问、DeepSeek 等）
