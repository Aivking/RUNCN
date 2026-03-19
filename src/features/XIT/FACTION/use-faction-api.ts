import { createClient } from '@supabase/supabase-js';
import { userData } from '@src/store/user-data';
import { userDataStore } from '@src/infrastructure/prun-api/data/user-data';
import { sitesStore } from '@src/infrastructure/prun-api/data/sites';
import { getPlanetBurn } from '@src/core/burn';
import { workforcesStore } from '@src/infrastructure/prun-api/data/workforces';
import { productionStore } from '@src/infrastructure/prun-api/data/production';
import { watchUntil } from '@src/utils/watch';
import type {
  AuthResponse,
  MembersResponse,
  ApiError,
  ApiSuccess,
  InviteResponse,
  TreasuryBalanceResponse,
  TreasuryRecordsResponse,
  LogisticsListResponse,
  TasksListResponse,
  BulletinListResponse,
  ProductionSummaryResponse,
  ProductionItem,
  FactionMember,
  Bulletin,
} from './types';

const SUPABASE_URL = 'https://tnfncrvsengkativszlx.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_t2CpsRN_YxkqGDr-I5JJYQ_JWNCLvpB';

function companyToEmail(name: string): string {
  const hex = Array.from(new TextEncoder().encode(name), b => b.toString(16).padStart(2, '0')).join(
    '',
  );
  return `u_${hex}@faction.co`;
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storage: {
      getItem: (key: string) => {
        const store = (userData.supabaseAuth ?? {}) as Record<string, string>;
        return store[key] ?? null;
      },
      setItem: (key: string, value: string) => {
        const store = ((userData.supabaseAuth as Record<string, string>) ?? {}) as Record<
          string,
          string
        >;
        store[key] = value;
        userData.supabaseAuth = store;
      },
      removeItem: (key: string) => {
        const store = ((userData.supabaseAuth as Record<string, string>) ?? {}) as Record<
          string,
          string
        >;
        delete store[key];
        userData.supabaseAuth = store;
      },
    },
  },
});

// --- Error class (same interface as before) ---

export class FactionApiError extends Error {
  public readonly code: string;
  constructor(public readonly response: ApiError) {
    super(response.message);
    this.code = response.error;
  }
}
function throwApi(code: string, message: string): never {
  throw new FactionApiError({ ok: false, error: code, message });
}

// --- Cache helpers (same as before) ---

function getCache() {
  return userData.factionCache as
    | { cachedAt: number; members?: FactionMember[]; balance?: number; bulletins?: Bulletin[] }
    | undefined;
}

function patchCache(patch: {
  members?: FactionMember[];
  balance?: number;
  bulletins?: Bulletin[];
}) {
  const existing = getCache();
  userData.factionCache = {
    ...(existing ?? {}),
    cachedAt: Date.now(),
    ...patch,
  } as typeof userData.factionCache;
}

export function clearCache() {
  userData.factionCache = undefined;
}

export function getCacheInfo(): { cachedAt: number } | undefined {
  const c = getCache();
  return c ? { cachedAt: c.cachedAt } : undefined;
}

// --- Auth ---

export async function register(
  companyName: string,
  pin: string,
  inviteCode: string,
): Promise<AuthResponse> {
  // 1. Validate invite code first
  const { error: invErr } = await supabase.rpc('validate_invite', { invite_code: inviteCode });
  if (invErr) throwApi('INVALID_INVITE', invErr.message);

  // 2. Sign up with Supabase Auth
  const { error: signUpErr } = await supabase.auth.signUp({
    email: companyToEmail(companyName),
    password: pin,
  });
  if (signUpErr) throwApi('SIGNUP_FAILED', signUpErr.message);

  // 3. Complete registration (creates member row, marks invite used)
  const { data, error: regErr } = await supabase.rpc('complete_registration', {
    invite_code: inviteCode,
    p_company_name: companyName,
  });
  if (regErr) throwApi('REGISTRATION_FAILED', regErr.message);

  const member = (data as { member: AuthResponse['member'] }).member;
  return {
    ok: true,
    token: 'supabase-session',
    member: {
      id: member.id,
      companyName: member.companyName,
      role: member.role,
      factionId: member.factionId,
    },
  };
}

export async function login(companyName: string, pin: string): Promise<AuthResponse> {
  const { error } = await supabase.auth.signInWithPassword({
    email: companyToEmail(companyName),
    password: pin,
  });
  if (error) throwApi('LOGIN_FAILED', error.message);

  // Fetch member info
  const { data: member, error: mErr } = await supabase
    .from('members')
    .select('id, company_name, role, faction_id')
    .eq('auth_uid', (await supabase.auth.getUser()).data.user!.id)
    .single();
  if ('message' in (mErr || {}) || !member) throwApi('NOT_FOUND', '未找到成员信息');

  // Sync username from game data
  const gameUsername = userDataStore.username;
  if (gameUsername) {
    await supabase.rpc('update_my_username', { p_username: gameUsername });
  }

  return {
    ok: true,
    token: 'supabase-session',
    member: {
      id: member.id,
      companyName: member.company_name,
      role: member.role,
      factionId: member.faction_id,
    },
  };
}

export async function logout() {
  await supabase.auth.signOut();
  clearCache();
}

export function isAuthenticated(): boolean {
  // Check if supabase has a session stored
  const store = (userData.supabaseAuth ?? {}) as Record<string, string>;
  return Object.keys(store).some(k => k.includes('auth-token'));
}

// --- Members ---

export async function fetchMembers(): Promise<MembersResponse & { fromCache?: boolean }> {
  try {
    const { data, error } = await supabase
      .from('members')
      .select('id, company_name, role, joined_at, username')
      .order('joined_at');
    if (error) throw error;

    const members: FactionMember[] = (data ?? []).map(r => ({
      id: r.id,
      companyName: r.company_name,
      username: r.username ?? undefined,
      role: r.role,
      joinedAt: r.joined_at,
    }));

    // Get my role
    const user = (await supabase.auth.getUser()).data.user;
    const me = members.find(m => {
      return user?.email === companyToEmail(m.companyName);
    });

    patchCache({ members });

    // Sync username from game data (fire-and-forget via RPC to bypass RLS)
    const gameUsername = userDataStore.username;
    if (gameUsername && me && me.username !== gameUsername) {
      supabase.rpc('update_my_username', { p_username: gameUsername }).then();
      me.username = gameUsername;
    }

    return { ok: true, members, myRole: (me?.role as FactionMember['role']) ?? 'member' };
  } catch {
    const cached = getCache();
    if (cached?.members) {
      return { ok: true, members: cached.members, myRole: 'member', fromCache: true };
    }
    throwApi('NETWORK_ERROR', '网络错误');
  }
}

export async function updateMemberRole(memberId: string, role: string): Promise<ApiSuccess> {
  const { error } = await supabase.from('members').update({ role }).eq('id', memberId);
  if (error) throwApi('UPDATE_FAILED', error.message);
  return { ok: true };
}

export async function removeMember(memberId: string): Promise<ApiSuccess> {
  const { error } = await supabase.from('members').delete().eq('id', memberId);
  if (error) throwApi('DELETE_FAILED', error.message);
  return { ok: true };
}

export async function createInviteCode(): Promise<InviteResponse> {
  const { data, error } = await supabase.rpc('create_invite_code');
  if (error) throwApi('CREATE_FAILED', error.message);
  return { ok: true, code: (data as { code: string }).code };
}

// --- Treasury ---

export async function fetchTreasuryBalance(): Promise<
  TreasuryBalanceResponse & { fromCache?: boolean }
> {
  try {
    const { data, error } = await supabase.rpc('get_treasury_balance');
    if (error) throw error;
    const balance = (data as { balance: number }).balance;
    patchCache({ balance });
    return { ok: true, balance };
  } catch {
    const cached = getCache();
    if (cached?.balance !== undefined) {
      return { ok: true, balance: cached.balance, fromCache: true };
    }
    throwApi('NETWORK_ERROR', '网络错误');
  }
}

export async function fetchTreasuryRecords(page = 1, limit = 20): Promise<TreasuryRecordsResponse> {
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const { data, error, count } = await supabase
    .from('treasury_records')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to);
  if (error) throwApi('FETCH_FAILED', error.message);

  const records = (data ?? []).map(r => ({
    id: r.id,
    amount: r.amount,
    operator: r.operator,
    note: r.note,
    createdAt: r.created_at,
  }));
  return { ok: true, records, total: count ?? 0, page, limit };
}

export async function createTreasuryRecord(amount: number, note: string): Promise<ApiSuccess> {
  const myFaction = await supabase.rpc('get_my_faction_id' as never);
  const myName = await supabase.rpc('get_my_company_name' as never);
  const { error } = await supabase.from('treasury_records').insert({
    faction_id: (myFaction.data as string) ?? '',
    amount,
    operator: (myName.data as string) ?? '',
    note: note ?? '',
  });
  if (error) throwApi('CREATE_FAILED', error.message);
  return { ok: true };
}

// --- Logistics ---

export async function fetchLogistics(page = 1, limit = 20): Promise<LogisticsListResponse> {
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const { data, error, count } = await supabase
    .from('logistics_requests')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to);
  if (error) throwApi('FETCH_FAILED', error.message);

  const requests = (data ?? []).map(r => ({
    id: r.id,
    requester: r.requester,
    materialTicker: r.material_ticker,
    quantity: r.quantity,
    destination: r.destination,
    reason: r.reason,
    status: r.status,
    reviewer: r.reviewer,
    reviewedAt: r.reviewed_at,
    createdAt: r.created_at,
  }));
  return { ok: true, requests, total: count ?? 0, page, limit };
}

export async function createLogisticsRequest(
  materialTicker: string,
  quantity: number,
  destination: string,
  reason: string,
): Promise<ApiSuccess> {
  const myFaction = await supabase.rpc('get_my_faction_id' as never);
  const myName = await supabase.rpc('get_my_company_name' as never);
  const { error } = await supabase.from('logistics_requests').insert({
    faction_id: (myFaction.data as string) ?? '',
    requester: (myName.data as string) ?? '',
    material_ticker: materialTicker,
    quantity,
    destination,
    reason: reason ?? '',
  });
  if (error) throwApi('CREATE_FAILED', error.message);
  return { ok: true };
}

export async function reviewLogistics(id: string, status: string): Promise<ApiSuccess> {
  const myName = await supabase.rpc('get_my_company_name' as never);
  const { error } = await supabase
    .from('logistics_requests')
    .update({
      status,
      reviewer: (myName.data as string) ?? '',
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (error) throwApi('UPDATE_FAILED', error.message);
  return { ok: true };
}

// --- Tasks ---

export async function fetchTasks(page = 1, limit = 20): Promise<TasksListResponse> {
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const { data, error, count } = await supabase
    .from('tasks')
    .select('*, task_comments(*)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to);
  if (error) throwApi('FETCH_FAILED', error.message);

  const tasks = (data ?? []).map(r => ({
    id: r.id,
    title: r.title,
    description: r.description,
    assignee: r.assignee,
    createdBy: r.created_by,
    dueDate: r.due_date,
    status: r.status,
    comments: ((r.task_comments as Array<Record<string, unknown>>) ?? []).map(c => ({
      id: c.id as string,
      author: c.author as string,
      content: c.content as string,
      createdAt: c.created_at as string,
    })),
    createdAt: r.created_at,
  }));
  return { ok: true, tasks, total: count ?? 0, page, limit };
}

export async function createTask(
  title: string,
  description?: string,
  dueDate?: string,
  assignee?: string,
): Promise<ApiSuccess> {
  const myFaction = await supabase.rpc('get_my_faction_id' as never);
  const myName = await supabase.rpc('get_my_company_name' as never);
  const { error } = await supabase.from('tasks').insert({
    faction_id: (myFaction.data as string) ?? '',
    title,
    description: description ?? '',
    assignee: assignee ?? null,
    created_by: (myName.data as string) ?? '',
    due_date: dueDate ?? null,
  });
  if (error) throwApi('CREATE_FAILED', error.message);
  return { ok: true };
}

export async function claimTask(id: string): Promise<ApiSuccess> {
  const myName = await supabase.rpc('get_my_company_name' as never);
  const { error } = await supabase
    .from('tasks')
    .update({ assignee: (myName.data as string) ?? '', status: 'in_progress' })
    .eq('id', id);
  if (error) throwApi('UPDATE_FAILED', error.message);
  return { ok: true };
}

export async function updateTaskStatus(id: string, status: string): Promise<ApiSuccess> {
  const { error } = await supabase.from('tasks').update({ status }).eq('id', id);
  if (error) throwApi('UPDATE_FAILED', error.message);
  return { ok: true };
}

export async function addTaskComment(id: string, content: string): Promise<ApiSuccess> {
  const myName = await supabase.rpc('get_my_company_name' as never);
  const { error } = await supabase.from('task_comments').insert({
    task_id: id,
    author: (myName.data as string) ?? '',
    content,
  });
  if (error) throwApi('CREATE_FAILED', error.message);
  return { ok: true };
}

export async function deleteTask(id: string): Promise<ApiSuccess> {
  const { error } = await supabase.from('tasks').delete().eq('id', id);
  if (error) throwApi('DELETE_FAILED', error.message);
  return { ok: true };
}

// --- Production ---

export async function aggregateMyProduction(): Promise<{ ticker: string; quantity: number }[]> {
  const sites = sitesStore.all.value ?? [];

  // 触发所有 site 的 workforce 和 production 数据请求
  for (const site of sites) {
    workforcesStore.getById(site.siteId);
    productionStore.getBySiteId(site.siteId);
  }

  // 等待所有 site 的数据就绪
  await watchUntil(() =>
    sites.every(site => {
      const wf = workforcesStore.getById(site.siteId);
      const prod = productionStore.getBySiteId(site.siteId);
      return wf !== undefined && prod !== undefined;
    }),
  );

  const aggregated: Record<string, number> = {};
  for (const site of sites) {
    const planetBurn = getPlanetBurn(site);
    if (!planetBurn) continue;
    for (const [ticker, mat] of Object.entries(planetBurn.burn)) {
      aggregated[ticker] = (aggregated[ticker] ?? 0) + mat.dailyAmount;
    }
  }
  return Object.entries(aggregated)
    .filter(([, qty]) => qty > 0)
    .map(([ticker, quantity]) => ({
      ticker,
      quantity: Math.round(quantity),
    }));
}

export async function reportProduction(items: ProductionItem[]): Promise<ApiSuccess> {
  const myFaction = await supabase.rpc('get_my_faction_id' as never);
  const myName = await supabase.rpc('get_my_company_name' as never);
  const today = new Date().toISOString().slice(0, 10);

  const rows = items
    .filter(item => !!item.ticker && item.quantity > 0)
    .map(item => ({
      faction_id: (myFaction.data as string) ?? '',
      company_name: (myName.data as string) ?? '',
      material_ticker: item.ticker.toUpperCase(),
      quantity: item.quantity,
      report_date: today,
    }));

  if (rows.length === 0) return { ok: true };

  // 先插入新数据，成功后再删除不在新数据中的旧记录
  const { error } = await supabase.from('daily_production').upsert(rows, {
    onConflict: 'faction_id,company_name,material_ticker,report_date',
  });
  if (error) throwApi('REPORT_FAILED', error.message);

  // 删除当天该用户不在本次上报中的旧材料记录
  const newTickers = rows.map(r => r.material_ticker);
  await supabase
    .from('daily_production')
    .delete()
    .eq('faction_id', rows[0].faction_id)
    .eq('company_name', rows[0].company_name)
    .eq('report_date', today)
    .not('material_ticker', 'in', `(${newTickers.join(',')})`);
  return { ok: true };
}

export async function fetchProductionSummary(date?: string): Promise<ProductionSummaryResponse> {
  const targetDate = date ?? new Date().toISOString().slice(0, 10);

  const [prodResult, membersResult] = await Promise.all([
    supabase
      .from('daily_production')
      .select('id, company_name, material_ticker, quantity')
      .eq('report_date', targetDate)
      .order('company_name')
      .order('material_ticker'),
    supabase.from('members').select('company_name, username'),
  ]);
  if (prodResult.error) throwApi('FETCH_FAILED', prodResult.error.message);

  const usernameMap: Record<string, string> = {};
  for (const m of membersResult.data ?? []) {
    if (m.username) usernameMap[m.company_name] = m.username;
  }

  const byMember: Record<string, Array<{ id: string; ticker: string; quantity: number }>> = {};
  for (const row of prodResult.data ?? []) {
    if (byMember[row.company_name] === undefined) byMember[row.company_name] = [];
    byMember[row.company_name].push({
      id: row.id,
      ticker: row.material_ticker,
      quantity: row.quantity,
    });
  }

  const members = Object.entries(byMember).map(([companyName, items]) => ({
    companyName,
    username: usernameMap[companyName],
    items,
  }));
  return { ok: true, date: targetDate, members };
}

export async function updateProductionQuantity(id: string, quantity: number): Promise<ApiSuccess> {
  const { error } = await supabase.from('daily_production').update({ quantity }).eq('id', id);
  if (error) throwApi('UPDATE_FAILED', error.message);
  return { ok: true };
}

export async function deleteProductionByMember(
  companyName: string,
  date: string,
): Promise<ApiSuccess> {
  const { error } = await supabase
    .from('daily_production')
    .delete()
    .eq('company_name', companyName)
    .eq('report_date', date);
  if (error) throwApi('DELETE_FAILED', error.message);
  return { ok: true };
}

// --- Bulletin ---

export async function fetchBulletins(
  page = 1,
  limit = 20,
): Promise<BulletinListResponse & { fromCache?: boolean }> {
  try {
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const { data, error, count } = await supabase
      .from('bulletins')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);
    if (error) throw error;

    const bulletins: Bulletin[] = (data ?? []).map(r => ({
      id: r.id,
      title: r.title,
      content: r.content,
      author: r.author,
      createdAt: r.created_at,
    }));

    if (page === 1) patchCache({ bulletins });
    return { ok: true, bulletins, total: count ?? 0, page, limit };
  } catch {
    const cached = getCache();
    if (cached?.bulletins) {
      return {
        ok: true,
        bulletins: cached.bulletins,
        total: cached.bulletins.length,
        page: 1,
        limit: 20,
        fromCache: true,
      };
    }
    throwApi('NETWORK_ERROR', '网络错误');
  }
}

export async function postBulletin(title: string, content: string): Promise<ApiSuccess> {
  const myFaction = await supabase.rpc('get_my_faction_id' as never);
  const myName = await supabase.rpc('get_my_company_name' as never);
  const { error } = await supabase.from('bulletins').insert({
    faction_id: (myFaction.data as string) ?? '',
    title,
    content,
    author: (myName.data as string) ?? '',
  });
  if (error) throwApi('CREATE_FAILED', error.message);
  return { ok: true };
}
