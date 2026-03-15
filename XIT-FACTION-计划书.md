# XIT FACTION 功能计划书

> 项目：refined-prun
> 日期：2026-03-15
> 状态：草稿 v2（已优化）

---

## 一、功能概述

在 Prosperous Universe 游戏框架内，通过 `XIT FACTION` 扩展终端命令，为组织提供一套内部管理面板。数据由 Cloudflare Workers 后端集中存储和同步，权限根据三级成员制度分级展示。

> **注意**：refined-prun 是浏览器扩展，运行在页面上下文中。Vue 组件通过 `createFragmentApp()` 动态挂载到游戏 DOM，没有 Vue Router 和 Pinia。所有游戏数据来自 WebSocket 拦截后的 entity stores。

**核心模块：**
- 成员列表与角色管理
- 公共基金追踪
- 物资调配记录
- 任务分配与进度
- 组织公告栏

---

## 二、技术选型

| 层级 | 技术 |
|------|------|
| 前端框架 | TypeScript + Vue 3 组件（通过 `createFragmentApp` 挂载到游戏 DOM） |
| 样式 | CSS Modules（`.module.css`），遵循 PrUn 深色主题 |
| 接入方式 | XIT 命令（`xit.add({...})`，对象参数） |
| 后端 | Cloudflare Workers + D1 SQLite |
| 数据刷新 | 用户手动刷新 / 面板打开时按需加载 |
| 身份验证 | 邀请码注册 + 公司名绑定 + 短期 Token |
| 数据持久化 | Cloudflare D1（全部结构化数据）+ KV（仅 Token 缓存） |

### 免费层资源预算（20 人场景）

| 功能 | 频率 | 每日请求数 |
|------|------|-----------|
| 数据加载（打开面板时） | 按需 | ~200 |
| 日常操作 | 手动点击 | ~200 |
| **合计** | | **~400** |

Cloudflare Workers 免费层：10 万请求/天、D1 读 500 万行/天、D1 写 10 万行/天、KV 读 10 万次/天、KV 写 1,000 次/天。以上方案仅占 **不到 1%** 免费额度，非常充裕。

---

## 三、权限体系（三级制度）

```
执行官 (Executive)   ── 最高权限：管理成员、修改基金、发布任务、查看所有数据
合伙人 (Partner)     ── 中级权限：物资调配申请、任务认领、查看基金明细
成员   (Member)      ── 基础权限：查看任务、上报进度、查看公告
```

角色存储在 Cloudflare D1 中，由执行官管理。前端根据当前用户角色动态渲染对应权限的 UI 区域。**权限 UI 控制从 Phase 1 起就实现**，避免裸奔。

---

## 四、模块设计

### 4.1 成员管理（Members）

- 成员列表，显示：游戏公司名、角色等级、加入时间
- 执行官可升降级成员角色、移除成员
- 支持邀请码机制，新成员通过邀请码注册加入

### 4.2 公共基金（Treasury）

- 显示当前基金余额（手动录入，由执行官更新）
- 收支流水记录：金额、操作人、备注、时间戳
- 正数为收入，负数为支出，自动累计余额
- 权限：执行官录入/编辑，合伙人及以上查看明细，成员仅看余额

### 4.3 物资调配（Logistics）

- 调配申请单：申请人、物资名（绑定游戏物料 Ticker）、数量、目的地、理由
- 审批流程：合伙人提交申请 → 执行官审批
- 状态流转：`待审批 → 已批准 / 已拒绝 → 已完成`
- 物料图标复用项目现有 `MaterialIcon.vue` 组件

### 4.4 任务系统（Tasks）

- 任务卡片：标题、描述、发布人、截止日期、分配对象、当前状态
- 状态流转：`open → in_progress → review → done`
- 合伙人及以上可主动领取开放任务，执行官可强制分配给指定成员
- 支持进度备注（子评论），记录过程信息
- **执行官可删除任务**（任何状态均可删除）
- 任务列表默认全部展开，不折叠

### 4.5 公告栏（Bulletin）

- 执行官发布组织公告，所有成员可读
- 进入面板时高亮显示未读公告数量
- 按发布时间倒序排列
- **公告发布后自动向所有成员推送游戏内通知**（通过 `notificationsStore` 或等效通知机制）

### 4.6 每日产出统计（Daily Production）

- 面板新增「产出统计」Tab，每位成员独立一个区块
- 每个区块显示：**成员董事名称**，后跟该成员当日产出的物品列表（物料 Ticker + 每日产量）
- 数据来源：复用 `XIT BURN` 现有数据（`burnStore` 或等效 store），无需独立采集
- 物料图标复用 `MaterialIcon.vue`
- 每天统计一次，展示当日快照

---

## 五、后端架构（Cloudflare Workers）

### API 端点规划

```
/api/faction/
├── auth/
│   └── verify              POST  验证玩家身份，返回角色 + Token
├── members/
│   ├── list                GET   成员列表
│   ├── :id/role            PATCH [执行官] 变更成员角色
│   └── :id                 DELETE[执行官] 移除成员
├── treasury/
│   ├── balance             GET   当前余额
│   ├── records             GET   收支记录列表（分页：?page=1&limit=20）
│   └── record              POST  [执行官] 录入收支记录
├── logistics/
│   ├── list                GET   调配申请列表（分页）
│   ├── request             POST  [合伙人+] 提交申请
│   └── :id/review          PATCH [执行官] 审批（批准/拒绝）
├── tasks/
│   ├── list                GET   任务列表（分页）
│   ├── create              POST  [执行官] 创建任务
│   ├── :id                 DELETE[执行官] 删除任务
│   ├── :id/assign          PATCH [执行官] 分配任务
│   ├── :id/claim           POST  [合伙人+] 认领任务
│   ├── :id/status          PATCH 更新任务状态
│   └── :id/comment         POST  添加进度备注
└── bulletin/
    ├── list                GET   公告列表（分页）
    └── post                POST  [执行官] 发布公告（发布后触发成员通知）
```

### 统一错误响应格式

```json
{ "ok": false, "error": "INSUFFICIENT_PERMISSION", "message": "只有执行官可以执行此操作" }
```

### 存储方案

| 存储 | 用途 |
|------|------|
| Cloudflare D1（SQLite） | 成员、任务、基金记录、物资申请、公告 |
| Cloudflare KV | 仅 Token 缓存（TTL 24 小时自动过期，写入极低频） |

### 身份验证方案

1. 玩家进入 `XIT FACTION` 时，前端从 `companyStore` 读取当前公司名
2. **首次注册**：提交邀请码 + 公司名 + 用户自设密码（PIN），Workers 验证邀请码有效后绑定
3. **后续登录**：公司名 + PIN 发送至 `/auth/verify`，Workers 验证通过后签发 Token
4. Token 有效期 24 小时，存入 `userData.factionToken`
5. 后续所有请求在 Header 中携带此 Token
6. **敏感操作**（升降级、基金录入）需再次输入 PIN 二次验证

> **安全说明**：`companyStore` 的值理论上可伪造（来自 WebSocket），PIN 机制提供了额外的身份保护层。此方案适用于小型信任团体，不适用于对抗性场景。

---

## 六、前端结构

```
src/features/XIT/FACTION/
├── FACTION.ts                  # xit.add() 注册
├── FactionPanel.vue            # 主容器（Tab 导航 + 所有子视图）
├── FactionPanel.module.css     # 样式（CSS Modules）
├── types.ts                    # 类型定义
└── use-faction-api.ts          # Workers API 封装（含 auth）
```

随模块复杂度增长，再拆分为独立组件文件。MVP 阶段保持精简。

### XIT 命令注册

```typescript
// src/features/XIT/FACTION/FACTION.ts
import FactionPanel from './FactionPanel.vue';

xit.add({
  command: ['FACTION'],
  name: '组织管理面板',
  description: '为组织提供内部管理面板。',
  optionalParameters: 'tab',
  component: () => FactionPanel,
});
// 用法：XIT FACTION         （默认打开成员页）
// 用法：XIT FACTION TASKS   （直接跳转任务页）
```

然后在 `src/features/XIT/index.ts` 中导入此文件。

### UI 规范

- 遵循 PrUn 深色主题，不使用明亮或突兀的颜色
- 复用 `src/components/` 已有组件：`PrunButton`、`PrunLink` 等
- Tab 切换参考 `XIT SET` 的实现方式
- 物料图标使用现有 `MaterialIcon.vue`

---

## 七、数据模型（TypeScript 类型）

```typescript
type MemberRole = 'member' | 'partner' | 'executive';

interface FactionMember {
  id: string;              // UUID，主键
  companyName: string;     // 唯一，可能改名
  role: MemberRole;
  joinedAt: string;        // ISO 8601
}

interface TreasuryRecord {
  id: string;
  amount: number;          // 正数 = 收入，负数 = 支出
  operator: string;        // companyName
  note: string;
  createdAt: string;
}

interface LogisticsRequest {
  id: string;
  requester: string;
  materialTicker: string;
  quantity: number;
  destination: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected' | 'completed';
  reviewer?: string;
  reviewedAt?: string;     // 审批时间
  createdAt: string;
}

interface Task {
  id: string;
  title: string;
  description: string;
  assignee?: string;
  createdBy: string;
  dueDate?: string;
  status: 'open' | 'in_progress' | 'review' | 'done';
  comments: TaskComment[];
  createdAt: string;
}

interface TaskComment {
  id: string;
  author: string;
  content: string;
  createdAt: string;
}

interface Bulletin {
  id: string;
  title: string;
  content: string;
  author: string;
  createdAt: string;
}

// 每日产出数据直接从 XIT BURN（burnStore）读取，无需独立类型
```

---

## 八、D1 数据库表结构

```sql
-- 成员表（使用 UUID 主键，company_name 可变）
CREATE TABLE members (
  id           TEXT PRIMARY KEY,
  faction_id   TEXT NOT NULL,
  company_name TEXT NOT NULL UNIQUE,
  pin_hash     TEXT NOT NULL,
  role         TEXT NOT NULL DEFAULT 'member',
  joined_at    TEXT NOT NULL
);

-- 基金记录表
CREATE TABLE treasury_records (
  id           TEXT PRIMARY KEY,
  faction_id   TEXT NOT NULL,
  amount       REAL NOT NULL,
  operator     TEXT NOT NULL,
  note         TEXT,
  created_at   TEXT NOT NULL
);
CREATE INDEX idx_treasury_created ON treasury_records(faction_id, created_at);

-- 物资调配申请表
CREATE TABLE logistics_requests (
  id               TEXT PRIMARY KEY,
  faction_id       TEXT NOT NULL,
  requester        TEXT NOT NULL,
  material_ticker  TEXT NOT NULL,
  quantity         INTEGER NOT NULL,
  destination      TEXT NOT NULL,
  reason           TEXT,
  status           TEXT NOT NULL DEFAULT 'pending',
  reviewer         TEXT,
  reviewed_at      TEXT,
  created_at       TEXT NOT NULL
);
CREATE INDEX idx_logistics_status ON logistics_requests(faction_id, status);

-- 任务表
CREATE TABLE tasks (
  id          TEXT PRIMARY KEY,
  faction_id  TEXT NOT NULL,
  title       TEXT NOT NULL,
  description TEXT,
  assignee    TEXT,
  created_by  TEXT NOT NULL,
  due_date    TEXT,
  status      TEXT NOT NULL DEFAULT 'open',
  created_at  TEXT NOT NULL
);
CREATE INDEX idx_tasks_status ON tasks(faction_id, status);

-- 任务评论表
CREATE TABLE task_comments (
  id         TEXT PRIMARY KEY,
  task_id    TEXT NOT NULL REFERENCES tasks(id),
  author     TEXT NOT NULL,
  content    TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_task_comments_task ON task_comments(task_id);

-- 公告表
CREATE TABLE bulletins (
  id         TEXT PRIMARY KEY,
  faction_id TEXT NOT NULL,
  title      TEXT NOT NULL,
  content    TEXT NOT NULL,
  author     TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- 邀请码表
CREATE TABLE invite_codes (
  code       TEXT PRIMARY KEY,
  faction_id TEXT NOT NULL,
  created_by TEXT NOT NULL,
  used_by    TEXT,
  used_at    TEXT,
  created_at TEXT NOT NULL
);

-- 组织表（当前仅单组织：琉璃主权资本，faction_id 为固定常量）
CREATE TABLE factions (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);
```

---

## 九、实施阶段

### Phase 1 — 基础框架（MVP）✅ 已完成
- [x] Cloudflare Workers 项目初始化（D1 + KV）
- [x] D1 建表（含 `faction_id`、索引）
- [x] 身份验证端点（邀请码注册 + PIN 设置 + Token 签发）
- [x] `XIT FACTION` 命令注册（对象参数 `xit.add({...})`）
- [x] 主面板 Tab 骨架（参考 `XIT SET`）
- [x] 成员列表展示 + 角色 Badge
- [x] **权限分级 UI 控制**（三种角色差异化渲染，从 MVP 起实现）
- [x] `userData` 新增 `factionToken` 字段 + 编写 migration

### Phase 2 — 核心功能 ✅ 已完成
- [x] 公共基金模块（余额展示 + 收支记录 + 分页）
- [x] 物资调配申请提交 + 审批流
- [x] 任务系统（创建 / 认领 / 状态更新 / 评论）
- [x] 公告栏 + 未读徽标提醒

### Phase 3 — 完善体验 ✅ 已完成
- [x] 本地缓存策略（`userData` 中缓存 Token + 部分数据）
- [x] 错误处理 + 离线降级提示（Workers 不可达时展示缓存数据）

### Phase 4 — 当前迭代
- [ ] 任务执行官删除功能（`DELETE /tasks/:id`）
- [ ] 任务列表默认展开（无折叠交互）
- [ ] 公告发布后推送游戏内通知给所有成员
- [ ] 每日产出统计面板（复用 XIT BURN 数据，每成员独立区块，显示董事名 + 产出物品/产量）

---

## 十、关键技术决策说明

| 问题 | 决策 | 理由 |
|------|------|------|
| 为什么需要后端？ | 多用户数据需集中存储，纯本地无法跨玩家共享 | 浏览器扩展存储是本地隔离的，组织数据需同步给所有成员 |
| D1 vs KV？ | 主数据用 D1，KV 仅缓存 Token | D1 有关联查询能力；KV 免费层写入仅 1,000 次/天，保持低写入场景 |
| 为什么不用 OAuth？ | 游戏无官方 OAuth，公司名 + PIN + 邀请码 | 降低复杂度，PIN 提供基础身份保护 |
| 为什么不用心跳/轮询？ | 手动刷新，按需加载 | 降低免费层消耗，无自动请求的 ToS 顾虑 |
| 为什么不做实时推送？ | 取消 Durable Objects 方案 | 复杂度高、免费层受限，手动刷新满足当前需求 |
| 为什么只有单组织？ | 当前仅服务琉璃主权资本，无多组织 UI | 避免不必要复杂度；`faction_id` 字段仍保留供未来扩展 |
| 为什么一开始就加 faction_id？ | 为未来扩展预留，当前固定为单一常量 | 后加需迁移全部数据，成本远高于初始设计 |
| Workers 在哪部署？ | 独立 Workers 项目，或 `workers/` 子目录 | 与扩展分离，可独立发布和维护 |

---

## 十一、文件变更清单（预估）

| 位置 | 操作 | 说明 |
|------|------|------|
| `src/features/XIT/FACTION/` | 新建 | ~5 个前端文件（MVP） |
| `src/features/XIT/index.ts` | 修改 | 新增 FACTION 模块导入 |
| `src/store/user-data.ts` | 修改 | 新增 `factionToken` 字段 |
| `src/store/user-data-migrations.ts` | 修改 | 新增 migration（顶部） |
| `workers/faction/` | 新建 | Cloudflare Workers 后端项目 |
| `wrangler.toml` | 新建（Workers 项目内） | D1 + KV 绑定配置 |

---

## 十二、风险与注意事项

1. **身份安全**：PIN 机制提供基础保护，但非密码学安全方案。适用于小型信任团体。强对抗场景需升级为 OAuth or passkey
2. **游戏公司名变更**：members 表用 UUID 主键，公司名做 UNIQUE 字段。改名时需手动更新（或后续实现自动检测）
3. **Workers 免费层**：当前方案 20 人仅占 ~5%。若扩展到 100+ 人需评估是否升级付费计划（$5/月）
4. **数据所有权**：所有数据存储在开发者的 Cloudflare 账户下，需向成员说明隐私条款
5. **扩展兼容性**：`createFragmentApp` 挂载的组件在游戏 DOM 更新时会自动卸载，需确保面板生命周期管理正确
