import { Hono } from 'hono';
import { SignJWT, jwtVerify } from 'jose';
import { hashPassword, verifyPassword } from '../passwords';
import { recoveryCodeExpiry, RECOVERY_CODE } from '../accountRecovery';
import { ApiError, database, integer, jsonObject, text } from '../reliability';
import type { AppEnv } from '../reliability';

export const communityRoutes = new Hono<AppEnv>();
const SESSION_ISSUER = 'zhushu-notes-community';

function signingKey(secret: string | undefined): Uint8Array | undefined {
  if (!secret || !/^[0-9a-f]{64}$/i.test(secret)) return undefined;
  return new TextEncoder().encode(secret);
}

communityRoutes.use('*', async (c, next) => {
  const authHeader = c.req.header('Authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
  const key = signingKey(c.env.JWT_SIGNING_KEY);
  if (token && key) {
    try {
      const { payload } = await jwtVerify(token, key, {
        algorithms: ['HS256'], issuer: SESSION_ISSUER, requiredClaims: ['sub', 'exp', 'iat'],
      });
      if (payload && typeof payload.sub === 'string' && /^[1-9]\d*$/.test(payload.sub) && Number.isSafeInteger(Number(payload.sub))) {
        c.set('userId', Number(payload.sub));
      }
    } catch {
      // token invalid or expired, continue as anonymous
    }
  }
  await next();
});

// ==================== 认证相关 ====================

communityRoutes.post('/register', async (c) => {
  if (!signingKey(c.env.JWT_SIGNING_KEY)) {
    throw new ApiError(503, 'auth_configuration', '账号服务暂不可用，请稍后重试。');
  }
  const body = await jsonObject(c);
  const username = text(body.username, '用户名', 100);
  const password = text(body.password, '密码', 1024);
  const nickname = body.nickname == null ? username : text(body.nickname, '昵称', 100, false);
  if (!username || !password) return c.json({ error: '用户名和密码不能为空' }, 400);
  if (password.length < 6) return c.json({ error: '密码长度至少6位' }, 400);

  const db = database(c);
  try {
    const info = await db
      .prepare('INSERT INTO users (username, password_hash, nickname) VALUES (?, ?, ?)')
      .bind(username, await hashPassword(password, c.env.PASSWORD_DERIVATION), nickname || username)
      .run();

    if (!info.success) return c.json({ error: '注册失败' }, 400);

    const userId = info.meta.last_row_id as number;
    return c.json({
      message: '注册成功',
      user: { id: userId, username, nickname: nickname || username },
    }, 201);
  } catch (e: any) {
    if (e instanceof ApiError && e.errorType === 'conflict') {
      return c.json({ error: '用户名已存在' }, 400);
    }
    throw e;
  }
});

communityRoutes.post('/login', async (c) => {
  c.header('Cache-Control', 'no-store');
  const key = signingKey(c.env.JWT_SIGNING_KEY);
  if (!key) throw new ApiError(503, 'auth_configuration', '账号服务暂不可用，请稍后重试。');
  const body = await jsonObject(c);
  const username = text(body.username, '用户名', 100);
  const password = text(body.password, '密码', 1024);
  if (!username || !password) return c.json({ error: '用户名和密码不能为空' }, 400);

  const db = database(c);
  const user = await db
    .prepare('SELECT id, username, nickname, password_hash FROM users WHERE username = ?')
    .bind(username)
    .first();

  if (!user || !await verifyPassword(password, user.password_hash, c.env.PASSWORD_DERIVATION)) {
    return c.json({ error: '用户名或密码错误' }, 401);
  }

  const token = await new SignJWT({ sub: String(user.id) })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(SESSION_ISSUER)
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(key);

  return c.json({
    message: '登录成功',
    user: {
      id: user.id,
      username: user.username,
      nickname: user.nickname,
    },
    token,
  });
});

communityRoutes.post('/reset-password', async (c) => {
  c.header('Cache-Control', 'no-store');
  if (!signingKey(c.env.JWT_SIGNING_KEY)) {
    throw new ApiError(503, 'auth_configuration', '账号服务暂不可用，请稍后重试。');
  }
  const body = await jsonObject(c);
  const username = text(body.username, '用户名', 100);
  const code = text(body.code, '恢复码', 64);
  const password = text(body.password, '新密码', 1024);
  if (password.length < 15) return c.json({ error: '新密码至少需要 15 个字符' }, 400);

  const invalidCode = () => c.json({ error: '恢复码无效、已过期或已使用' }, 401);
  if (!RECOVERY_CODE.test(code)) return invalidCode();

  const db = database(c);
  const account = await db.prepare('SELECT id, password_hash FROM users WHERE username = ?')
    .bind(username).first<{ id: number; password_hash: string }>();
  if (!account) return invalidCode();
  const expiresAt = await recoveryCodeExpiry(code, account.password_hash);
  if (expiresAt === null) return invalidCode();

  // The conditional update consumes the grant once, including concurrent requests.
  // Checking expiry in D1 also covers expiry while deriving the new password hash.
  const result = await db.prepare(`
    UPDATE users SET password_hash = ?
    WHERE id = ? AND password_hash = ? AND ? > unixepoch('now')
  `).bind(await hashPassword(password, c.env.PASSWORD_DERIVATION), account.id, account.password_hash, expiresAt).run();
  if (result.meta.changes !== 1) return invalidCode();
  return c.json({ message: '密码已重置，请使用新密码登录。' });
});

communityRoutes.get('/user', async (c) => {
  const userId = c.get('userId');
  if (!userId) return c.json({ error: '需要登录' }, 401);

  const user = await database(c)
    .prepare('SELECT id, username, nickname, avatar, bio, created_at FROM users WHERE id = ?')
    .bind(userId)
    .first();

  if (!user) return c.json({ error: '用户不存在' }, 404);
  return c.json(user);
});

// ==================== 分类 ====================

communityRoutes.get('/categories', async (c) => {
  const { results } = await database(c)
    .prepare('SELECT * FROM categories ORDER BY id')
    .all();
  return c.json(results);
});

// ==================== 帖子 ====================

communityRoutes.get('/posts', async (c) => {
  const categoryParam = c.req.query('category_id');
  const categoryId = categoryParam ? integer(categoryParam, 'category_id') : null;
  const page = integer(c.req.query('page') ?? '1', 'page', 1, 1000000);
  const perPage = integer(c.req.query('per_page') ?? '20', 'per_page', 1, 50);
  const offset = (page - 1) * perPage;

  let sql = `
    SELECT p.*, u.username, u.nickname as user_nickname, c.name as category_name, c.color as category_color
    FROM posts p
    LEFT JOIN users u ON p.user_id = u.id
    LEFT JOIN categories c ON p.category_id = c.id
  `;
  const params: any[] = [];
  if (categoryId) {
    sql += ' WHERE p.category_id = ?';
    params.push(Number(categoryId));
  }
  sql += ' ORDER BY p.created_at DESC LIMIT ? OFFSET ?';
  params.push(perPage, offset);

  const { results } = await database(c).prepare(sql).bind(...params).all();

  let countSql = 'SELECT COUNT(*) as count FROM posts';
  const countParams: any[] = [];
  if (categoryId) {
    countSql += ' WHERE category_id = ?';
    countParams.push(Number(categoryId));
  }
  const countRes = await database(c).prepare(countSql).bind(...countParams).first<{ count: number }>();
  const total = countRes?.count || 0;

  const posts = results.map((p: any) => ({
    id: p.id,
    title: p.title,
    content: p.content,
    category_id: p.category_id,
    category_name: p.category_name || '综合交流',
    category_color: p.category_color || '#8B3A2A',
    user_id: p.user_id,
    username: p.username || '用户',
    nickname: p.nickname || p.user_nickname || p.username,
    view_count: p.view_count || 0,
    like_count: p.like_count || 0,
    comment_count: p.comment_count || 0,
    created_at: p.created_at,
  }));

  return c.json({
    posts,
    total,
    page,
    per_page: perPage,
    total_pages: Math.ceil(total / perPage),
  });
});

communityRoutes.get('/posts/:id', async (c) => {
  const postId = integer(c.req.param('id'), 'id');
  const userId = c.get('userId');

  const post = await database(c)
    .prepare(`
      SELECT p.*, u.username, u.nickname as user_nickname, c.name as category_name, c.color as category_color
      FROM posts p
      LEFT JOIN users u ON p.user_id = u.id
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE p.id = ?
    `)
    .bind(postId)
    .first();

  if (!post) return c.json({ error: '帖子不存在' }, 404);

  await database(c)
    .prepare('UPDATE posts SET view_count = view_count + 1 WHERE id = ?')
    .bind(postId)
    .run();

  let userLiked = false;
  if (userId) {
    const like = await database(c)
      .prepare('SELECT id FROM likes WHERE post_id = ? AND user_id = ?')
      .bind(postId, userId)
      .first();
    userLiked = !!like;
  }

  return c.json({
    id: post.id,
    title: post.title,
    content: post.content,
    category_id: post.category_id,
    category_name: post.category_name || '综合交流',
    category_color: post.category_color || '#8B3A2A',
    user_id: post.user_id,
    username: post.username || '用户',
    nickname: post.nickname || post.user_nickname || post.username,
    view_count: Number(post.view_count || 0) + 1,
    like_count: post.like_count || 0,
    comment_count: post.comment_count || 0,
    created_at: post.created_at,
    user_liked: userLiked,
  });
});

communityRoutes.post('/posts', async (c) => {
  const userId = c.get('userId');
  if (!userId) return c.json({ error: '需要登录' }, 401);

  const body = await jsonObject(c);
  const title = text(body.title, '标题', 100);
  const content = text(body.content, '内容', 10000);
  const category_id = body.category_id == null || body.category_id === '' ? null : integer(body.category_id, 'category_id');
  if (!title || !content) return c.json({ error: '标题和内容不能为空' }, 400);
  if (title.length > 100) return c.json({ error: '标题长度不能超过100字' }, 400);
  if (content.length > 10000) return c.json({ error: '内容长度不能超过10000字' }, 400);

  const info = await database(c)
    .prepare(`
      INSERT INTO posts (user_id, title, content, category_id, view_count, like_count, comment_count)
      VALUES (?, ?, ?, ?, 0, 0, 0)
    `)
    .bind(userId, title, content, category_id || null)
    .run();

  return c.json({
    message: '发布成功',
    post: { id: info.meta.last_row_id, title, content },
  }, 201);
});

communityRoutes.delete('/posts/:id', async (c) => {
  const userId = c.get('userId');
  if (!userId) return c.json({ error: '需要登录' }, 401);

  const postId = integer(c.req.param('id'), 'id');
  const post = await database(c)
    .prepare('SELECT user_id FROM posts WHERE id = ?')
    .bind(postId)
    .first();

  if (!post) return c.json({ error: '帖子不存在' }, 404);
  if (post.user_id !== userId) return c.json({ error: '无权限删除' }, 400);

  await database(c).batch([
    database(c).prepare('DELETE FROM comments WHERE post_id = ?').bind(postId),
    database(c).prepare('DELETE FROM likes WHERE post_id = ?').bind(postId),
    database(c).prepare('DELETE FROM posts WHERE id = ?').bind(postId),
  ]);

  return c.json({ message: '删除成功' });
});

// ==================== 评论 ====================

communityRoutes.get('/posts/:id/comments', async (c) => {
  const postId = integer(c.req.param('id'), 'id');
  const { results } = await database(c)
    .prepare(`
      SELECT c.*, u.username, u.nickname as user_nickname
      FROM comments c
      LEFT JOIN users u ON c.user_id = u.id
      WHERE c.post_id = ?
      ORDER BY c.created_at ASC
    `)
    .bind(postId)
    .all();

  return c.json(results.map((c: any) => ({
    id: c.id,
    post_id: c.post_id,
    user_id: c.user_id,
    username: c.username || '用户',
    nickname: c.nickname || c.user_nickname || c.username,
    content: c.content,
    created_at: c.created_at,
  })));
});

communityRoutes.post('/posts/:id/comments', async (c) => {
  const userId = c.get('userId');
  if (!userId) return c.json({ error: '需要登录' }, 401);

  const postId = integer(c.req.param('id'), 'id');
  const body = await jsonObject(c);
  const content = text(body.content, '评论内容', 1000);
  if (!content) return c.json({ error: '评论内容不能为空' }, 400);
  if (content.length > 1000) return c.json({ error: '评论长度不能超过1000字' }, 400);

  const user = await database(c)
    .prepare('SELECT nickname, username FROM users WHERE id = ?')
    .bind(userId)
    .first();

  const parent = await database(c).prepare('SELECT id FROM posts WHERE id = ?').bind(postId).first();
  if (!parent) return c.json({ error: '帖子不存在' }, 404);
  const [info] = await database(c).batch([
    database(c).prepare('INSERT INTO comments (post_id, user_id, nickname, content) VALUES (?, ?, ?, ?)')
      .bind(postId, userId, user?.nickname || user?.username || '用户', content),
    database(c).prepare('UPDATE posts SET comment_count = (SELECT COUNT(*) FROM comments WHERE post_id = ?) WHERE id = ?')
      .bind(postId, postId),
  ]);

  return c.json({ message: '评论成功', comment: { id: info.meta.last_row_id } }, 201);
});

communityRoutes.delete('/comments/:id', async (c) => {
  const userId = c.get('userId');
  if (!userId) return c.json({ error: '需要登录' }, 401);

  const commentId = integer(c.req.param('id'), 'id');
  const comment = await database(c)
    .prepare('SELECT user_id, post_id FROM comments WHERE id = ?')
    .bind(commentId)
    .first();

  if (!comment) return c.json({ error: '评论不存在' }, 404);
  if (comment.user_id !== userId) return c.json({ error: '无权限删除' }, 400);

  await database(c).batch([
    database(c).prepare('DELETE FROM comments WHERE id = ?').bind(commentId),
    database(c).prepare('UPDATE posts SET comment_count = (SELECT COUNT(*) FROM comments WHERE post_id = ?) WHERE id = ?')
      .bind(comment.post_id, comment.post_id),
  ]);

  return c.json({ message: '删除成功' });
});

// ==================== 点赞 ====================

communityRoutes.post('/posts/:id/like', async (c) => {
  const userId = c.get('userId');
  if (!userId) return c.json({ error: '需要登录' }, 401);

  const postId = integer(c.req.param('id'), 'id');
  const existing = await database(c)
    .prepare('SELECT id FROM likes WHERE post_id = ? AND user_id = ?')
    .bind(postId, userId)
    .first();

  const parent = await database(c).prepare('SELECT id FROM posts WHERE id = ?').bind(postId).first();
  if (!parent) return c.json({ error: '帖子不存在' }, 404);
  const change = existing
    ? database(c).prepare('DELETE FROM likes WHERE post_id = ? AND user_id = ?').bind(postId, userId)
    : database(c).prepare('INSERT INTO likes (post_id, user_id) VALUES (?, ?) ON CONFLICT(post_id, user_id) DO NOTHING').bind(postId, userId);
  const results = await database(c).batch([
    change,
    database(c).prepare('UPDATE posts SET like_count = (SELECT COUNT(*) FROM likes WHERE post_id = ?) WHERE id = ?').bind(postId, postId),
    database(c).prepare('SELECT id FROM likes WHERE post_id = ? AND user_id = ?').bind(postId, userId),
  ]);
  return c.json({ liked: results[2].results.length > 0 });

});

// ==================== 用户个人主页 ====================

communityRoutes.get('/users/:id', async (c) => {
  c.header('Cache-Control', 'private, no-store');
  try {
    const userId = integer(c.req.param('id'), 'id');

    const user = await database(c)
      .prepare(`
        SELECT id, username, nickname, avatar, bio, created_at
        FROM users WHERE id = ?
      `)
      .bind(userId)
      .first();

    if (!user) return c.json({ error: '用户不存在' }, 404);

    const postStats = await database(c)
      .prepare(`
        SELECT
          COUNT(*) AS post_count,
          COALESCE(SUM(view_count),0) AS total_views,
          COALESCE(SUM(like_count),0) AS total_likes,
          COALESCE(SUM(comment_count),0) AS total_comments
        FROM posts WHERE user_id = ?
      `)
      .bind(userId)
      .first();

    const booksCount = userId === c.get('userId') ? await database(c)
      .prepare('SELECT COUNT(*) AS c FROM reading_progress WHERE user_id = ?')
      .bind(userId)
      .first() : null;

    const commentsCount = await database(c)
      .prepare('SELECT COUNT(*) AS c FROM comments WHERE user_id = ?')
      .bind(userId)
      .first();

    return c.json({
      user: {
        id: user.id,
        username: user.username,
        nickname: user.nickname,
        avatar: user.avatar,
        bio: user.bio,
        created_at: user.created_at,
      },
      stats: {
        post_count: Number(postStats?.post_count || 0),
        total_views: Number(postStats?.total_views || 0),
        total_likes: Number(postStats?.total_likes || 0),
        total_comments: Number(postStats?.total_comments || 0) + Number(commentsCount?.c || 0),
        ...(booksCount ? { books_count: Number(booksCount.c || 0) } : {}),
      },
    });
  } catch (e: any) {
    throw e;
  }
});

communityRoutes.get('/users/:id/posts', async (c) => {
  try {
    const userId = integer(c.req.param('id'), 'id');
    const page = integer(c.req.query('page') ?? '1', 'page', 1, 1000000);
    const perPage = integer(c.req.query('per_page') ?? '10', 'per_page', 1, 50);
    const offset = (page - 1) * perPage;

    const [countRow, posts] = await Promise.all([
      database(c).prepare('SELECT COUNT(*) AS c FROM posts WHERE user_id = ?').bind(userId).first(),
      database(c).prepare(`
        SELECT p.*, c.name AS category_name, c.color AS category_color,
               u.username, u.nickname, u.avatar
        FROM posts p
        LEFT JOIN categories c ON p.category_id = c.id
        LEFT JOIN users u ON p.user_id = u.id
        WHERE p.user_id = ?
        ORDER BY p.created_at DESC
        LIMIT ? OFFSET ?
      `).bind(userId, perPage, offset).all(),
    ]);

    return c.json({
      posts: (posts.results || []).map((p: any) => ({
        id: p.id,
        title: p.title,
        content: p.content,
        category_id: p.category_id,
        category_name: p.category_name || '综合交流',
        category_color: p.category_color || '#8B3A2A',
        user_id: p.user_id,
        username: p.username,
        nickname: p.nickname || p.username,
        avatar: p.avatar,
        view_count: p.view_count || 0,
        like_count: p.like_count || 0,
        comment_count: p.comment_count || 0,
        created_at: p.created_at,
        updated_at: p.updated_at,
      })),
      total: Number(countRow?.c || 0),
      page,
      per_page: perPage,
    });
  } catch (e: any) {
    throw e;
  }
});

communityRoutes.get('/users/:id/reading-progress', async (c) => {
  c.header('Cache-Control', 'private, no-store');
  const viewerId = c.get('userId');
  if (!viewerId) return c.json({ error: '需要登录' }, 401);
  const userId = integer(c.req.param('id'), 'id');
  if (viewerId !== userId) return c.json({ error: '仅本人可查看读书进度' }, 403);
  try {
    const rows = await database(c).prepare(`
      SELECT id, user_id, classic_id, chapter_index, paragraph_id, progress_pct, last_read_at
      FROM reading_progress
      WHERE user_id = ?
      ORDER BY last_read_at DESC
      LIMIT 100
    `).bind(userId).all();

    return c.json({
      progress: (rows.results || []).map((r: any) => ({
        id: r.id,
        classic_id: r.classic_id,
        chapter_index: r.chapter_index,
        paragraph_id: r.paragraph_id || '',
        progress_pct: Number(r.progress_pct || 0),
        last_read_at: r.last_read_at,
      })),
    });
  } catch (e: any) {
    throw e;
  }
});

// ==================== 当前用户：更新读书进度 ====================

communityRoutes.post('/me/reading-progress', async (c) => {
  const userId = c.get('userId');
  if (!userId) return c.json({ error: '需要登录' }, 401);

  try {
    const body = await jsonObject(c);
    const classicId = text(body.classic_id, 'classic_id', 100).trim();
    const chapterIndex = integer(body.chapter_index ?? 0, 'chapter_index', 0);
    const paragraphId = body.paragraph_id == null ? null : text(body.paragraph_id, 'paragraph_id', 200, false);
    const progressPct = body.progress_pct == null ? 0 : body.progress_pct;
    if (typeof progressPct !== 'number' || !Number.isFinite(progressPct) || progressPct < 0 || progressPct > 1) throw new ApiError(400, 'invalid_parameter', 'progress_pct 必须是 0 到 1 之间的有限数值。');

    if (!classicId) return c.json({ error: 'classic_id 不能为空' }, 400);
    if (isNaN(chapterIndex)) return c.json({ error: 'chapter_index 无效' }, 400);

    const info = await database(c).prepare(`
      INSERT INTO reading_progress (user_id, classic_id, chapter_index, paragraph_id, progress_pct, last_read_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id, classic_id) DO UPDATE SET
        chapter_index = excluded.chapter_index,
        paragraph_id   = COALESCE(excluded.paragraph_id, reading_progress.paragraph_id),
        progress_pct   = excluded.progress_pct,
        last_read_at   = CURRENT_TIMESTAMP
    `).bind(userId, classicId, chapterIndex, paragraphId, progressPct).run();

    return c.json({
      message: '进度已保存',
      ok: !!info.success,
    });
  } catch (e: any) {
    throw e;
  }
});
