import { userData } from '@src/store/user-data';
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

const BASE_URL = 'https://faction-api.541982.workers.dev';

function getToken(): string | undefined {
  return userData.factionToken;
}

function setToken(token: string | undefined) {
  userData.factionToken = token;
}

// --- Cache helpers ---

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

// --- Core fetch ---

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const response = await fetch(`${BASE_URL}${path}`, { ...options, headers });
  const data = await response.json();
  if (!response.ok || !(data as { ok: boolean }).ok) {
    throw new FactionApiError(data as ApiError);
  }
  return data as T;
}

export class FactionApiError extends Error {
  public readonly code: string;
  constructor(public readonly response: ApiError) {
    super(response.message);
    this.code = response.error;
  }
}

/** On network failure, returns cached value. Auth/server errors still throw. */
async function apiFetchWithFallback<T>(
  path: string,
  cached: T | undefined,
): Promise<{ data: T; fromCache: boolean }> {
  try {
    const data = await apiFetch<T>(path);
    return { data, fromCache: false };
  } catch (e) {
    if (e instanceof FactionApiError) {
      throw e;
    }
    if (cached !== undefined) {
      return { data: cached, fromCache: true };
    }
    throw e;
  }
}

// --- Auth ---

export async function register(
  companyName: string,
  pin: string,
  inviteCode: string,
): Promise<AuthResponse> {
  const result = await apiFetch<AuthResponse>('/api/faction/auth/register', {
    method: 'POST',
    body: JSON.stringify({ companyName, pin, inviteCode }),
  });
  setToken(result.token);
  return result;
}

export async function login(companyName: string, pin: string): Promise<AuthResponse> {
  const result = await apiFetch<AuthResponse>('/api/faction/auth/verify', {
    method: 'POST',
    body: JSON.stringify({ companyName, pin }),
  });
  setToken(result.token);
  return result;
}

export function logout() {
  setToken(undefined);
  clearCache();
}

export function isAuthenticated(): boolean {
  return !!getToken();
}

export function getCacheInfo(): { cachedAt: number } | undefined {
  const c = getCache();
  return c ? { cachedAt: c.cachedAt } : undefined;
}

// --- Members (with cache fallback) ---

export async function fetchMembers(): Promise<MembersResponse & { fromCache?: boolean }> {
  const cached = getCache();
  const fallback: MembersResponse | undefined =
    cached?.members !== undefined
      ? { ok: true, members: cached.members, myRole: 'member' }
      : undefined;
  const { data, fromCache } = await apiFetchWithFallback<MembersResponse>(
    '/api/faction/members/list',
    fallback,
  );
  if (!fromCache) {
    patchCache({ members: data.members });
  }
  return { ...data, fromCache };
}

export async function updateMemberRole(memberId: string, role: string): Promise<ApiSuccess> {
  return apiFetch<ApiSuccess>(`/api/faction/members/${memberId}/role`, {
    method: 'PATCH',
    body: JSON.stringify({ role }),
  });
}

export async function removeMember(memberId: string): Promise<ApiSuccess> {
  return apiFetch<ApiSuccess>(`/api/faction/members/${memberId}`, { method: 'DELETE' });
}

export async function createInviteCode(): Promise<InviteResponse> {
  return apiFetch<InviteResponse>('/api/faction/invite/create', { method: 'POST' });
}

// --- Treasury (balance with cache fallback) ---

export async function fetchTreasuryBalance(): Promise<
  TreasuryBalanceResponse & { fromCache?: boolean }
> {
  const cached = getCache();
  const fallback: TreasuryBalanceResponse | undefined =
    cached?.balance !== undefined ? { ok: true, balance: cached.balance } : undefined;
  const { data, fromCache } = await apiFetchWithFallback<TreasuryBalanceResponse>(
    '/api/faction/treasury/balance',
    fallback,
  );
  if (!fromCache) {
    patchCache({ balance: data.balance });
  }
  return { ...data, fromCache };
}

export async function fetchTreasuryRecords(page = 1, limit = 20): Promise<TreasuryRecordsResponse> {
  return apiFetch<TreasuryRecordsResponse>(
    `/api/faction/treasury/records?page=${page}&limit=${limit}`,
  );
}

export async function createTreasuryRecord(amount: number, note: string): Promise<ApiSuccess> {
  return apiFetch<ApiSuccess>('/api/faction/treasury/record', {
    method: 'POST',
    body: JSON.stringify({ amount, note }),
  });
}

// --- Logistics ---

export async function fetchLogistics(page = 1, limit = 20): Promise<LogisticsListResponse> {
  return apiFetch<LogisticsListResponse>(`/api/faction/logistics/list?page=${page}&limit=${limit}`);
}

export async function createLogisticsRequest(
  materialTicker: string,
  quantity: number,
  destination: string,
  reason: string,
): Promise<ApiSuccess> {
  return apiFetch<ApiSuccess>('/api/faction/logistics/request', {
    method: 'POST',
    body: JSON.stringify({ materialTicker, quantity, destination, reason }),
  });
}

export async function reviewLogistics(id: string, status: string): Promise<ApiSuccess> {
  return apiFetch<ApiSuccess>(`/api/faction/logistics/${id}/review`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

// --- Tasks ---

export async function fetchTasks(page = 1, limit = 20): Promise<TasksListResponse> {
  return apiFetch<TasksListResponse>(`/api/faction/tasks/list?page=${page}&limit=${limit}`);
}

export async function createTask(
  title: string,
  description?: string,
  dueDate?: string,
  assignee?: string,
): Promise<ApiSuccess> {
  return apiFetch<ApiSuccess>('/api/faction/tasks/create', {
    method: 'POST',
    body: JSON.stringify({ title, description, dueDate, assignee }),
  });
}

export async function claimTask(id: string): Promise<ApiSuccess> {
  return apiFetch<ApiSuccess>(`/api/faction/tasks/${id}/claim`, { method: 'POST' });
}

export async function updateTaskStatus(id: string, status: string): Promise<ApiSuccess> {
  return apiFetch<ApiSuccess>(`/api/faction/tasks/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export async function addTaskComment(id: string, content: string): Promise<ApiSuccess> {
  return apiFetch<ApiSuccess>(`/api/faction/tasks/${id}/comment`, {
    method: 'POST',
    body: JSON.stringify({ content }),
  });
}

export async function deleteTask(id: string): Promise<ApiSuccess> {
  return apiFetch<ApiSuccess>(`/api/faction/tasks/${id}`, { method: 'DELETE' });
}

// --- Production ---

export async function reportProduction(items: ProductionItem[]): Promise<ApiSuccess> {
  return apiFetch<ApiSuccess>('/api/faction/production/report', {
    method: 'POST',
    body: JSON.stringify({ items }),
  });
}

export async function fetchProductionSummary(date?: string): Promise<ProductionSummaryResponse> {
  const query = date ? `?date=${date}` : '';
  return apiFetch<ProductionSummaryResponse>(`/api/faction/production/summary${query}`);
}

// --- Bulletin (with cache fallback) ---

export async function fetchBulletins(
  page = 1,
  limit = 20,
): Promise<BulletinListResponse & { fromCache?: boolean }> {
  const cached = getCache();
  const fallback: BulletinListResponse | undefined =
    cached?.bulletins !== undefined
      ? {
          ok: true,
          bulletins: cached.bulletins,
          total: cached.bulletins.length,
          page: 1,
          limit: 20,
        }
      : undefined;
  const { data, fromCache } = await apiFetchWithFallback<BulletinListResponse>(
    `/api/faction/bulletin/list?page=${page}&limit=${limit}`,
    fallback,
  );
  if (!fromCache && page === 1) {
    patchCache({ bulletins: data.bulletins });
  }
  return { ...data, fromCache };
}

export async function postBulletin(title: string, content: string): Promise<ApiSuccess> {
  return apiFetch<ApiSuccess>('/api/faction/bulletin/post', {
    method: 'POST',
    body: JSON.stringify({ title, content }),
  });
}
