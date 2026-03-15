export type MemberRole = 'member' | 'partner' | 'executive';

export interface FactionMember {
  id: string;
  companyName: string;
  role: MemberRole;
  joinedAt: string;
}

export interface AuthResponse {
  ok: boolean;
  token: string;
  member: {
    id: string;
    companyName: string;
    role: MemberRole;
    factionId: string;
  };
}

export interface MembersResponse {
  ok: boolean;
  members: FactionMember[];
  myRole: MemberRole;
}

export interface ApiError {
  ok: false;
  error: string;
  message: string;
}

export interface ApiSuccess {
  ok: true;
  [key: string]: unknown;
}

export interface InviteResponse {
  ok: true;
  code: string;
}

export const ROLE_LABELS: Record<MemberRole, string> = {
  executive: '执行官',
  partner: '合伙人',
  member: '成员',
};

export const ROLE_ORDER: MemberRole[] = ['executive', 'partner', 'member'];

// --- Phase 2 Types ---

export interface TreasuryRecord {
  id: string;
  amount: number;
  operator: string;
  note: string;
  createdAt: string;
}

export interface TreasuryBalanceResponse {
  ok: true;
  balance: number;
}

export interface TreasuryRecordsResponse {
  ok: true;
  records: TreasuryRecord[];
  total: number;
  page: number;
  limit: number;
}

export type LogisticsStatus = 'pending' | 'approved' | 'rejected' | 'completed';

export interface LogisticsRequest {
  id: string;
  requester: string;
  materialTicker: string;
  quantity: number;
  destination: string;
  reason: string;
  status: LogisticsStatus;
  reviewer?: string;
  reviewedAt?: string;
  createdAt: string;
}

export interface LogisticsListResponse {
  ok: true;
  requests: LogisticsRequest[];
  total: number;
  page: number;
  limit: number;
}

export type TaskStatus = 'open' | 'in_progress' | 'review' | 'done';

export interface TaskComment {
  id: string;
  author: string;
  content: string;
  createdAt: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  assignee?: string;
  createdBy: string;
  dueDate?: string;
  status: TaskStatus;
  comments: TaskComment[];
  createdAt: string;
}

export interface TasksListResponse {
  ok: true;
  tasks: Task[];
  total: number;
  page: number;
  limit: number;
}

export const LOGISTICS_STATUS_LABELS: Record<LogisticsStatus, string> = {
  pending: '待审批',
  approved: '已批准',
  rejected: '已拒绝',
  completed: '已完成',
};

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  open: '开放',
  in_progress: '进行中',
  review: '审核中',
  done: '已完成',
};

// --- Phase 3 Types ---

export interface Bulletin {
  id: string;
  title: string;
  content: string;
  author: string;
  createdAt: string;
}

export interface BulletinListResponse {
  ok: true;
  bulletins: Bulletin[];
  total: number;
  page: number;
  limit: number;
}

/** Cached faction data stored in userData for offline fallback. */
export interface FactionCache {
  /** Unix timestamp (ms) of last successful fetch. */
  cachedAt: number;
  members?: import('./types').FactionMember[];
  balance?: number;
  bulletins?: Bulletin[];
}

// --- Phase 4 Types ---

export interface ProductionItem {
  ticker: string;
  quantity: number;
}

export interface ProductionMemberSummary {
  companyName: string;
  items: ProductionItem[];
}

export interface ProductionSummaryResponse {
  ok: true;
  date: string;
  members: ProductionMemberSummary[];
}
