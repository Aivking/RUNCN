export interface Env {
  DB: D1Database;
  TOKENS: KVNamespace;
}

interface MemberRow {
  id: string;
  faction_id: string;
  company_name: string;
  pin_hash: string;
  role: string;
  joined_at: string;
}

interface InviteCodeRow {
  code: string;
  faction_id: string;
  created_by: string;
  used_by: string | null;
  used_at: string | null;
  created_at: string;
}

// Simple UUID v4 generator.
function uuid(): string {
  return crypto.randomUUID();
}

// SHA-256 hash for PIN.
async function hashPin(pin: string): Promise<string> {
  const data = new TextEncoder().encode(pin);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// Generate a random token.
function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// CORS headers.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

function errorResponse(error: string, message: string, status = 400): Response {
  return jsonResponse({ ok: false, error, message }, status);
}

// Resolve the authenticated member from the token.
async function resolveAuth(request: Request, env: Env): Promise<MemberRow | null> {
  const auth = request.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) {
    return null;
  }
  const token = auth.slice(7);
  const memberId = await env.TOKENS.get(`token:${token}`);
  if (!memberId) {
    return null;
  }
  const member = await env.DB.prepare('SELECT * FROM members WHERE id = ?')
    .bind(memberId)
    .first<MemberRow>();
  return member ?? null;
}

// Route handler type.
type Handler = (request: Request, env: Env, params: Record<string, string>) => Promise<Response>;

// Simple router.
interface Route {
  method: string;
  pattern: RegExp;
  paramNames: string[];
  handler: Handler;
}

const routes: Route[] = [];

function addRoute(method: string, path: string, handler: Handler) {
  const paramNames: string[] = [];
  const patternStr = path.replace(/:(\w+)/g, (_, name) => {
    paramNames.push(name);
    return '([^/]+)';
  });
  routes.push({
    method,
    pattern: new RegExp(`^${patternStr}$`),
    paramNames,
    handler,
  });
}

function matchRoute(
  method: string,
  pathname: string,
): { handler: Handler; params: Record<string, string> } | null {
  for (const route of routes) {
    if (route.method !== method) {
      continue;
    }
    const match = pathname.match(route.pattern);
    if (match) {
      const params: Record<string, string> = {};
      for (let i = 0; i < route.paramNames.length; i++) {
        params[route.paramNames[i]] = match[i + 1];
      }
      return { handler: route.handler, params };
    }
  }
  return null;
}

// --- Auth Routes ---

// POST /api/faction/auth/register
addRoute('POST', '/api/faction/auth/register', async (request, env) => {
  const body = await request.json<{ companyName: string; pin: string; inviteCode: string }>();
  if (!body.companyName || !body.pin || !body.inviteCode) {
    return errorResponse('MISSING_FIELDS', '缺少必要字段：companyName, pin, inviteCode');
  }

  // Check invite code.
  const invite = await env.DB.prepare('SELECT * FROM invite_codes WHERE code = ?')
    .bind(body.inviteCode)
    .first<InviteCodeRow>();
  if (!invite) {
    return errorResponse('INVALID_INVITE', '邀请码无效');
  }
  if (invite.used_by) {
    return errorResponse('INVITE_USED', '邀请码已被使用');
  }

  // Check if company name already registered.
  const existing = await env.DB.prepare('SELECT id FROM members WHERE company_name = ?')
    .bind(body.companyName)
    .first();
  if (existing) {
    return errorResponse('ALREADY_REGISTERED', '该公司名已注册');
  }

  const memberId = uuid();
  const pinHash = await hashPin(body.pin);
  const now = new Date().toISOString();

  // Insert member and mark invite code as used.
  await env.DB.batch([
    env.DB.prepare(
      'INSERT INTO members (id, faction_id, company_name, pin_hash, role, joined_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).bind(memberId, invite.faction_id, body.companyName, pinHash, 'member', now),
    env.DB.prepare('UPDATE invite_codes SET used_by = ?, used_at = ? WHERE code = ?').bind(
      body.companyName,
      now,
      body.inviteCode,
    ),
  ]);

  // Issue token.
  const token = generateToken();
  await env.TOKENS.put(`token:${token}`, memberId, { expirationTtl: 86400 });

  return jsonResponse({
    ok: true,
    token,
    member: {
      id: memberId,
      companyName: body.companyName,
      role: 'member',
      factionId: invite.faction_id,
    },
  });
});

// POST /api/faction/auth/verify
addRoute('POST', '/api/faction/auth/verify', async (request, env) => {
  const body = await request.json<{ companyName: string; pin: string }>();
  if (!body.companyName || !body.pin) {
    return errorResponse('MISSING_FIELDS', '缺少必要字段：companyName, pin');
  }

  const member = await env.DB.prepare('SELECT * FROM members WHERE company_name = ?')
    .bind(body.companyName)
    .first<MemberRow>();
  if (!member) {
    return errorResponse('NOT_FOUND', '未找到该公司名的成员');
  }

  const pinHash = await hashPin(body.pin);
  if (pinHash !== member.pin_hash) {
    return errorResponse('WRONG_PIN', 'PIN 错误');
  }

  // Issue token.
  const token = generateToken();
  await env.TOKENS.put(`token:${token}`, member.id, { expirationTtl: 86400 });

  return jsonResponse({
    ok: true,
    token,
    member: {
      id: member.id,
      companyName: member.company_name,
      role: member.role,
      factionId: member.faction_id,
    },
  });
});

// --- Members Routes ---

// GET /api/faction/members/list
addRoute('GET', '/api/faction/members/list', async (request, env) => {
  const me = await resolveAuth(request, env);
  if (!me) {
    return errorResponse('UNAUTHORIZED', '未授权', 401);
  }

  const result = await env.DB.prepare(
    'SELECT id, faction_id, company_name, role, joined_at FROM members WHERE faction_id = ? ORDER BY joined_at ASC',
  )
    .bind(me.faction_id)
    .all<Omit<MemberRow, 'pin_hash'>>();

  const members = (result.results ?? []).map(row => ({
    id: row.id,
    companyName: row.company_name,
    role: row.role,
    joinedAt: row.joined_at,
  }));

  return jsonResponse({ ok: true, members, myRole: me.role });
});

// PATCH /api/faction/members/:id/role
addRoute('PATCH', '/api/faction/members/:id/role', async (request, env, params) => {
  const me = await resolveAuth(request, env);
  if (!me) {
    return errorResponse('UNAUTHORIZED', '未授权', 401);
  }
  if (me.role !== 'executive') {
    return errorResponse('INSUFFICIENT_PERMISSION', '只有执行官可以变更角色', 403);
  }

  const body = await request.json<{ role: string }>();
  if (!body.role || !['member', 'partner', 'executive'].includes(body.role)) {
    return errorResponse('INVALID_ROLE', '无效角色');
  }

  // Cannot change own role.
  if (params.id === me.id) {
    return errorResponse('SELF_ACTION', '不能修改自己的角色');
  }

  const target = await env.DB.prepare('SELECT * FROM members WHERE id = ? AND faction_id = ?')
    .bind(params.id, me.faction_id)
    .first<MemberRow>();
  if (!target) {
    return errorResponse('NOT_FOUND', '成员不存在');
  }

  await env.DB.prepare('UPDATE members SET role = ? WHERE id = ?').bind(body.role, params.id).run();

  return jsonResponse({ ok: true });
});

// DELETE /api/faction/members/:id
addRoute('DELETE', '/api/faction/members/:id', async (request, env, params) => {
  const me = await resolveAuth(request, env);
  if (!me) {
    return errorResponse('UNAUTHORIZED', '未授权', 401);
  }
  if (me.role !== 'executive') {
    return errorResponse('INSUFFICIENT_PERMISSION', '只有执行官可以移除成员', 403);
  }

  // Cannot remove self.
  if (params.id === me.id) {
    return errorResponse('SELF_ACTION', '不能移除自己');
  }

  const target = await env.DB.prepare('SELECT * FROM members WHERE id = ? AND faction_id = ?')
    .bind(params.id, me.faction_id)
    .first<MemberRow>();
  if (!target) {
    return errorResponse('NOT_FOUND', '成员不存在');
  }

  await env.DB.prepare('DELETE FROM members WHERE id = ?').bind(params.id).run();

  return jsonResponse({ ok: true });
});

// --- Invite Code Routes (Executive only) ---

// POST /api/faction/invite/create
addRoute('POST', '/api/faction/invite/create', async (request, env) => {
  const me = await resolveAuth(request, env);
  if (!me) {
    return errorResponse('UNAUTHORIZED', '未授权', 401);
  }
  if (me.role !== 'executive') {
    return errorResponse('INSUFFICIENT_PERMISSION', '只有执行官可以创建邀请码', 403);
  }

  const code = uuid().slice(0, 8).toUpperCase();
  const now = new Date().toISOString();

  await env.DB.prepare(
    'INSERT INTO invite_codes (code, faction_id, created_by, created_at) VALUES (?, ?, ?, ?)',
  )
    .bind(code, me.faction_id, me.company_name, now)
    .run();

  return jsonResponse({ ok: true, code });
});

// --- Treasury Routes ---

// GET /api/faction/treasury/balance
addRoute('GET', '/api/faction/treasury/balance', async (request, env) => {
  const me = await resolveAuth(request, env);
  if (!me) {
    return errorResponse('UNAUTHORIZED', '未授权', 401);
  }

  const result = await env.DB.prepare(
    'SELECT COALESCE(SUM(amount), 0) as balance FROM treasury_records WHERE faction_id = ?',
  )
    .bind(me.faction_id)
    .first<{ balance: number }>();

  return jsonResponse({ ok: true, balance: result?.balance ?? 0 });
});

// GET /api/faction/treasury/records
addRoute('GET', '/api/faction/treasury/records', async (request, env) => {
  const me = await resolveAuth(request, env);
  if (!me) {
    return errorResponse('UNAUTHORIZED', '未授权', 401);
  }
  // Members can only see balance, not records.
  if (me.role === 'member') {
    return errorResponse('INSUFFICIENT_PERMISSION', '成员仅可查看余额', 403);
  }

  const url = new URL(request.url);
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1'));
  const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit') ?? '20')));
  const offset = (page - 1) * limit;

  const countResult = await env.DB.prepare(
    'SELECT COUNT(*) as total FROM treasury_records WHERE faction_id = ?',
  )
    .bind(me.faction_id)
    .first<{ total: number }>();

  const result = await env.DB.prepare(
    'SELECT * FROM treasury_records WHERE faction_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?',
  )
    .bind(me.faction_id, limit, offset)
    .all();

  const records = (result.results ?? []).map((row: Record<string, unknown>) => ({
    id: row.id,
    amount: row.amount,
    operator: row.operator,
    note: row.note,
    createdAt: row.created_at,
  }));

  return jsonResponse({ ok: true, records, total: countResult?.total ?? 0, page, limit });
});

// POST /api/faction/treasury/record
addRoute('POST', '/api/faction/treasury/record', async (request, env) => {
  const me = await resolveAuth(request, env);
  if (!me) {
    return errorResponse('UNAUTHORIZED', '未授权', 401);
  }
  if (me.role !== 'executive') {
    return errorResponse('INSUFFICIENT_PERMISSION', '只有执行官可以录入收支', 403);
  }

  const body = await request.json<{ amount: number; note: string }>();
  if (body.amount === undefined || body.amount === 0) {
    return errorResponse('INVALID_AMOUNT', '金额不能为零');
  }

  const id = uuid();
  const now = new Date().toISOString();

  await env.DB.prepare(
    'INSERT INTO treasury_records (id, faction_id, amount, operator, note, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  )
    .bind(id, me.faction_id, body.amount, me.company_name, body.note ?? '', now)
    .run();

  return jsonResponse({ ok: true, id });
});

// --- Logistics Routes ---

// GET /api/faction/logistics/list
addRoute('GET', '/api/faction/logistics/list', async (request, env) => {
  const me = await resolveAuth(request, env);
  if (!me) {
    return errorResponse('UNAUTHORIZED', '未授权', 401);
  }

  const url = new URL(request.url);
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1'));
  const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit') ?? '20')));
  const offset = (page - 1) * limit;

  const countResult = await env.DB.prepare(
    'SELECT COUNT(*) as total FROM logistics_requests WHERE faction_id = ?',
  )
    .bind(me.faction_id)
    .first<{ total: number }>();

  const result = await env.DB.prepare(
    'SELECT * FROM logistics_requests WHERE faction_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?',
  )
    .bind(me.faction_id, limit, offset)
    .all();

  const requests = (result.results ?? []).map((row: Record<string, unknown>) => ({
    id: row.id,
    requester: row.requester,
    materialTicker: row.material_ticker,
    quantity: row.quantity,
    destination: row.destination,
    reason: row.reason,
    status: row.status,
    reviewer: row.reviewer,
    reviewedAt: row.reviewed_at,
    createdAt: row.created_at,
  }));

  return jsonResponse({ ok: true, requests, total: countResult?.total ?? 0, page, limit });
});

// POST /api/faction/logistics/request
addRoute('POST', '/api/faction/logistics/request', async (request, env) => {
  const me = await resolveAuth(request, env);
  if (!me) {
    return errorResponse('UNAUTHORIZED', '未授权', 401);
  }
  if (me.role === 'member') {
    return errorResponse('INSUFFICIENT_PERMISSION', '成员无法提交调配申请', 403);
  }

  const body = await request.json<{
    materialTicker: string;
    quantity: number;
    destination: string;
    reason: string;
  }>();
  if (!body.materialTicker || !body.quantity || !body.destination) {
    return errorResponse('MISSING_FIELDS', '缺少必要字段');
  }

  const id = uuid();
  const now = new Date().toISOString();

  await env.DB.prepare(
    'INSERT INTO logistics_requests (id, faction_id, requester, material_ticker, quantity, destination, reason, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
  )
    .bind(
      id,
      me.faction_id,
      me.company_name,
      body.materialTicker,
      body.quantity,
      body.destination,
      body.reason ?? '',
      'pending',
      now,
    )
    .run();

  return jsonResponse({ ok: true, id });
});

// PATCH /api/faction/logistics/:id/review
addRoute('PATCH', '/api/faction/logistics/:id/review', async (request, env, params) => {
  const me = await resolveAuth(request, env);
  if (!me) {
    return errorResponse('UNAUTHORIZED', '未授权', 401);
  }
  if (me.role !== 'executive') {
    return errorResponse('INSUFFICIENT_PERMISSION', '只有执行官可以审批', 403);
  }

  const body = await request.json<{ status: string }>();
  if (!body.status || !['approved', 'rejected', 'completed'].includes(body.status)) {
    return errorResponse('INVALID_STATUS', '无效状态');
  }

  const now = new Date().toISOString();
  await env.DB.prepare(
    'UPDATE logistics_requests SET status = ?, reviewer = ?, reviewed_at = ? WHERE id = ? AND faction_id = ?',
  )
    .bind(body.status, me.company_name, now, params.id, me.faction_id)
    .run();

  return jsonResponse({ ok: true });
});

// --- Tasks Routes ---

// GET /api/faction/tasks/list
addRoute('GET', '/api/faction/tasks/list', async (request, env) => {
  const me = await resolveAuth(request, env);
  if (!me) {
    return errorResponse('UNAUTHORIZED', '未授权', 401);
  }

  const url = new URL(request.url);
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1'));
  const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit') ?? '20')));
  const offset = (page - 1) * limit;

  const countResult = await env.DB.prepare(
    'SELECT COUNT(*) as total FROM tasks WHERE faction_id = ?',
  )
    .bind(me.faction_id)
    .first<{ total: number }>();

  const result = await env.DB.prepare(
    'SELECT * FROM tasks WHERE faction_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?',
  )
    .bind(me.faction_id, limit, offset)
    .all();

  // Fetch comments for these tasks.
  const taskIds = (result.results ?? []).map((r: Record<string, unknown>) => r.id as string);
  let commentsMap: Record<
    string,
    Array<{ id: string; author: string; content: string; createdAt: string }>
  > = {};
  if (taskIds.length > 0) {
    const placeholders = taskIds.map(() => '?').join(',');
    const commentsResult = await env.DB.prepare(
      `SELECT * FROM task_comments WHERE task_id IN (${placeholders}) ORDER BY created_at ASC`,
    )
      .bind(...taskIds)
      .all();
    for (const c of commentsResult.results ?? []) {
      const row = c as Record<string, unknown>;
      const tid = row.task_id as string;
      if (!commentsMap[tid]) {
        commentsMap[tid] = [];
      }
      commentsMap[tid].push({
        id: row.id as string,
        author: row.author as string,
        content: row.content as string,
        createdAt: row.created_at as string,
      });
    }
  }

  const tasks = (result.results ?? []).map((row: Record<string, unknown>) => ({
    id: row.id,
    title: row.title,
    description: row.description,
    assignee: row.assignee,
    createdBy: row.created_by,
    dueDate: row.due_date,
    status: row.status,
    comments: commentsMap[row.id as string] ?? [],
    createdAt: row.created_at,
  }));

  return jsonResponse({ ok: true, tasks, total: countResult?.total ?? 0, page, limit });
});

// POST /api/faction/tasks/create
addRoute('POST', '/api/faction/tasks/create', async (request, env) => {
  const me = await resolveAuth(request, env);
  if (!me) {
    return errorResponse('UNAUTHORIZED', '未授权', 401);
  }
  if (me.role !== 'executive') {
    return errorResponse('INSUFFICIENT_PERMISSION', '只有执行官可以创建任务', 403);
  }

  const body = await request.json<{
    title: string;
    description?: string;
    dueDate?: string;
    assignee?: string;
  }>();
  if (!body.title) {
    return errorResponse('MISSING_FIELDS', '任务标题不能为空');
  }

  const id = uuid();
  const now = new Date().toISOString();

  await env.DB.prepare(
    'INSERT INTO tasks (id, faction_id, title, description, assignee, created_by, due_date, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
  )
    .bind(
      id,
      me.faction_id,
      body.title,
      body.description ?? '',
      body.assignee ?? null,
      me.company_name,
      body.dueDate ?? null,
      'open',
      now,
    )
    .run();

  return jsonResponse({ ok: true, id });
});

// PATCH /api/faction/tasks/:id/assign
addRoute('PATCH', '/api/faction/tasks/:id/assign', async (request, env, params) => {
  const me = await resolveAuth(request, env);
  if (!me) {
    return errorResponse('UNAUTHORIZED', '未授权', 401);
  }
  if (me.role !== 'executive') {
    return errorResponse('INSUFFICIENT_PERMISSION', '只有执行官可以分配任务', 403);
  }

  const body = await request.json<{ assignee: string }>();
  await env.DB.prepare('UPDATE tasks SET assignee = ? WHERE id = ? AND faction_id = ?')
    .bind(body.assignee, params.id, me.faction_id)
    .run();

  return jsonResponse({ ok: true });
});

// POST /api/faction/tasks/:id/claim
addRoute('POST', '/api/faction/tasks/:id/claim', async (request, env, params) => {
  const me = await resolveAuth(request, env);
  if (!me) {
    return errorResponse('UNAUTHORIZED', '未授权', 401);
  }
  if (me.role === 'member') {
    return errorResponse('INSUFFICIENT_PERMISSION', '成员无法认领任务', 403);
  }

  const task = await env.DB.prepare('SELECT * FROM tasks WHERE id = ? AND faction_id = ?')
    .bind(params.id, me.faction_id)
    .first();
  if (!task) {
    return errorResponse('NOT_FOUND', '任务不存在');
  }
  if ((task as Record<string, unknown>).status !== 'open') {
    return errorResponse('INVALID_STATUS', '只能认领开放状态的任务');
  }

  await env.DB.prepare('UPDATE tasks SET assignee = ?, status = ? WHERE id = ?')
    .bind(me.company_name, 'in_progress', params.id)
    .run();

  return jsonResponse({ ok: true });
});

// PATCH /api/faction/tasks/:id/status
addRoute('PATCH', '/api/faction/tasks/:id/status', async (request, env, params) => {
  const me = await resolveAuth(request, env);
  if (!me) {
    return errorResponse('UNAUTHORIZED', '未授权', 401);
  }

  const body = await request.json<{ status: string }>();
  if (!body.status || !['open', 'in_progress', 'review', 'done'].includes(body.status)) {
    return errorResponse('INVALID_STATUS', '无效状态');
  }

  await env.DB.prepare('UPDATE tasks SET status = ? WHERE id = ? AND faction_id = ?')
    .bind(body.status, params.id, me.faction_id)
    .run();

  return jsonResponse({ ok: true });
});

// DELETE /api/faction/tasks/:id
addRoute('DELETE', '/api/faction/tasks/:id', async (request, env, params) => {
  const me = await resolveAuth(request, env);
  if (!me) {
    return errorResponse('UNAUTHORIZED', '未授权', 401);
  }
  if (me.role !== 'executive') {
    return errorResponse('INSUFFICIENT_PERMISSION', '只有执行官可以删除任务', 403);
  }

  const task = await env.DB.prepare('SELECT id FROM tasks WHERE id = ? AND faction_id = ?')
    .bind(params.id, me.faction_id)
    .first();
  if (!task) {
    return errorResponse('NOT_FOUND', '任务不存在');
  }

  await env.DB.batch([
    env.DB.prepare('DELETE FROM task_comments WHERE task_id = ?').bind(params.id),
    env.DB.prepare('DELETE FROM tasks WHERE id = ? AND faction_id = ?').bind(
      params.id,
      me.faction_id,
    ),
  ]);

  return jsonResponse({ ok: true });
});

// POST /api/faction/tasks/:id/comment
addRoute('POST', '/api/faction/tasks/:id/comment', async (request, env, params) => {
  const me = await resolveAuth(request, env);
  if (!me) {
    return errorResponse('UNAUTHORIZED', '未授权', 401);
  }

  const body = await request.json<{ content: string }>();
  if (!body.content) {
    return errorResponse('MISSING_FIELDS', '评论内容不能为空');
  }

  const id = uuid();
  const now = new Date().toISOString();

  await env.DB.prepare(
    'INSERT INTO task_comments (id, task_id, author, content, created_at) VALUES (?, ?, ?, ?, ?)',
  )
    .bind(id, params.id, me.company_name, body.content, now)
    .run();

  return jsonResponse({ ok: true, id });
});

// --- Bulletin Routes ---

// GET /api/faction/bulletin/list
addRoute('GET', '/api/faction/bulletin/list', async (request, env) => {
  const me = await resolveAuth(request, env);
  if (!me) {
    return errorResponse('UNAUTHORIZED', '未授权', 401);
  }

  const url = new URL(request.url);
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1'));
  const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit') ?? '20')));
  const offset = (page - 1) * limit;

  const countResult = await env.DB.prepare(
    'SELECT COUNT(*) as total FROM bulletins WHERE faction_id = ?',
  )
    .bind(me.faction_id)
    .first<{ total: number }>();

  const result = await env.DB.prepare(
    'SELECT * FROM bulletins WHERE faction_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?',
  )
    .bind(me.faction_id, limit, offset)
    .all();

  const posts = (result.results ?? []).map((row: Record<string, unknown>) => ({
    id: row.id,
    title: row.title,
    content: row.content,
    author: row.author,
    createdAt: row.created_at,
  }));

  return jsonResponse({ ok: true, bulletins: posts, total: countResult?.total ?? 0, page, limit });
});

// POST /api/faction/bulletin/post
addRoute('POST', '/api/faction/bulletin/post', async (request, env) => {
  const me = await resolveAuth(request, env);
  if (!me) {
    return errorResponse('UNAUTHORIZED', '未授权', 401);
  }
  if (me.role !== 'executive') {
    return errorResponse('INSUFFICIENT_PERMISSION', '只有执行官可以发布公告', 403);
  }

  const body = await request.json<{ title: string; content: string }>();
  if (!body.title || !body.content) {
    return errorResponse('MISSING_FIELDS', '标题和内容不能为空');
  }

  const id = uuid();
  const now = new Date().toISOString();

  await env.DB.prepare(
    'INSERT INTO bulletins (id, faction_id, title, content, author, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  )
    .bind(id, me.faction_id, body.title, body.content, me.company_name, now)
    .run();

  return jsonResponse({ ok: true, id });
});

// --- Daily Production Routes ---

interface ProductionRow {
  id: string;
  faction_id: string;
  company_name: string;
  material_ticker: string;
  quantity: number;
  report_date: string;
  created_at: string;
}

// POST /api/faction/production/report
// Body: { items: Array<{ ticker: string; quantity: number }> }
addRoute('POST', '/api/faction/production/report', async (request, env) => {
  const me = await resolveAuth(request, env);
  if (!me) {
    return errorResponse('UNAUTHORIZED', '未授权', 401);
  }

  const body = await request.json<{ items: Array<{ ticker: string; quantity: number }> }>();
  if (!Array.isArray(body.items) || body.items.length === 0) {
    return errorResponse('MISSING_FIELDS', '缺少产出数据');
  }

  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const now = new Date().toISOString();

  const stmts = body.items
    .filter(item => item.ticker && item.quantity > 0)
    .map(item =>
      env.DB.prepare(
        `INSERT INTO daily_production (id, faction_id, company_name, material_ticker, quantity, report_date, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(faction_id, company_name, material_ticker, report_date)
         DO UPDATE SET quantity = excluded.quantity, created_at = excluded.created_at`,
      ).bind(
        uuid(),
        me.faction_id,
        me.company_name,
        item.ticker.toUpperCase(),
        item.quantity,
        today,
        now,
      ),
    );

  if (stmts.length > 0) {
    await env.DB.batch(stmts);
  }

  return jsonResponse({ ok: true });
});

// GET /api/faction/production/summary?date=YYYY-MM-DD
addRoute('GET', '/api/faction/production/summary', async (request, env) => {
  const me = await resolveAuth(request, env);
  if (!me) {
    return errorResponse('UNAUTHORIZED', '未授权', 401);
  }

  const url = new URL(request.url);
  const date = url.searchParams.get('date') ?? new Date().toISOString().slice(0, 10);

  const result = await env.DB.prepare(
    'SELECT company_name, material_ticker, quantity FROM daily_production WHERE faction_id = ? AND report_date = ? ORDER BY company_name ASC, material_ticker ASC',
  )
    .bind(me.faction_id, date)
    .all<ProductionRow>();

  // Group by member.
  const byMember: Record<string, Array<{ ticker: string; quantity: number }>> = {};
  for (const row of result.results ?? []) {
    if (!byMember[row.company_name]) {
      byMember[row.company_name] = [];
    }
    byMember[row.company_name].push({ ticker: row.material_ticker, quantity: row.quantity });
  }

  const members = Object.entries(byMember).map(([companyName, items]) => ({ companyName, items }));
  return jsonResponse({ ok: true, date, members });
});

// --- Main Entry ---

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Handle CORS preflight.
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);
    const matched = matchRoute(request.method, url.pathname);

    if (!matched) {
      return errorResponse('NOT_FOUND', '端点不存在', 404);
    }

    try {
      return await matched.handler(request, env, matched.params);
    } catch (e) {
      const message = e instanceof Error ? e.message : '未知错误';
      return errorResponse('INTERNAL_ERROR', message, 500);
    }
  },
};
