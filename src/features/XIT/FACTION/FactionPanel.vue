<script setup lang="ts">
import { companyStore } from '@src/infrastructure/prun-api/data/company';
import { useXitParameters } from '@src/hooks/use-xit-parameters';
import Tabs, { type Tab } from '@src/components/Tabs.vue';
import PrunButton from '@src/components/PrunButton.vue';
import SectionHeader from '@src/components/SectionHeader.vue';
import FactionTreasury from './components/FactionTreasury.vue';
import FactionLogistics from './components/FactionLogistics.vue';
import FactionTasks from './components/FactionTasks.vue';
import FactionBulletin from './components/FactionBulletin.vue';
import FactionDailyProduction from './components/FactionDailyProduction.vue';
import {
  isAuthenticated,
  login,
  register,
  logout,
  fetchMembers,
  updateMemberRole,
  removeMember,
  createInviteCode,
  FactionApiError,
} from './use-faction-api';
import { ROLE_LABELS, ROLE_ORDER, type FactionMember, type MemberRole } from './types';
import $style from './FactionPanel.module.css';

// Auth state.
const authenticated = ref(isAuthenticated());
const authMode = ref<'login' | 'register'>('login');
const authCompanyName = ref('');
const authPin = ref('');
const authInviteCode = ref('');
const authError = ref('');
const authLoading = ref(false);

// Members state.
const members = ref<FactionMember[]>([]);
const myRole = ref<MemberRole>('member');
const membersLoading = ref(false);
const membersError = ref('');

// Invite code state.
const generatedInviteCode = ref('');

// Fill company name from game store.
watchEffect(() => {
  const company = companyStore.value;
  if (company && !authCompanyName.value) {
    authCompanyName.value = company.name;
  }
});

// Auth handlers.
async function handleLogin() {
  authError.value = '';
  authLoading.value = true;
  try {
    await login(authCompanyName.value, authPin.value);
    authenticated.value = true;
    authPin.value = '';
    await loadMembers();
  } catch (e) {
    if (e instanceof FactionApiError) {
      authError.value = e.response.message;
    } else {
      authError.value = '网络错误，请稍后重试';
    }
  } finally {
    authLoading.value = false;
  }
}

async function handleRegister() {
  authError.value = '';
  authLoading.value = true;
  try {
    await register(authCompanyName.value, authPin.value, authInviteCode.value);
    authenticated.value = true;
    authPin.value = '';
    authInviteCode.value = '';
    await loadMembers();
  } catch (e) {
    if (e instanceof FactionApiError) {
      authError.value = e.response.message;
    } else {
      authError.value = '网络错误，请稍后重试';
    }
  } finally {
    authLoading.value = false;
  }
}

function handleLogout() {
  logout();
  authenticated.value = false;
  members.value = [];
  myRole.value = 'member';
}

// Members handlers.
async function loadMembers() {
  membersLoading.value = true;
  membersError.value = '';
  try {
    const result = await fetchMembers();
    members.value = result.members;
    myRole.value = result.myRole;
  } catch (e) {
    if (e instanceof FactionApiError) {
      if (e.code === 'UNAUTHORIZED') {
        // Token expired.
        handleLogout();
        authError.value = 'Token 已过期，请重新登录';
        return;
      }
      membersError.value = e.response.message;
    } else {
      membersError.value = '无法加载成员列表';
    }
  } finally {
    membersLoading.value = false;
  }
}

async function handleRoleChange(member: FactionMember, newRole: MemberRole) {
  try {
    await updateMemberRole(member.id, newRole);
    await loadMembers();
  } catch (e) {
    if (e instanceof FactionApiError) {
      membersError.value = e.response.message;
    }
  }
}

async function handleRemoveMember(member: FactionMember) {
  try {
    await removeMember(member.id);
    await loadMembers();
  } catch (e) {
    if (e instanceof FactionApiError) {
      membersError.value = e.response.message;
    }
  }
}

async function handleCreateInvite() {
  try {
    const result = await createInviteCode();
    generatedInviteCode.value = result.code;
  } catch (e) {
    if (e instanceof FactionApiError) {
      membersError.value = e.response.message;
    }
  }
}

// Role badge class.
function roleBadgeClass(role: MemberRole): string {
  switch (role) {
    case 'executive':
      return $style.roleExecutive;
    case 'partner':
      return $style.rolePartner;
    default:
      return $style.roleMember;
  }
}

// Available role options for changing (exclude current role).
function availableRoles(currentRole: MemberRole): MemberRole[] {
  return ROLE_ORDER.filter(r => r !== currentRole);
}

// Format date.
function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Tab setup: all use Placeholder because content is rendered manually via v-if below.
// Tabs.vue auto-renders model.component — using real components would cause double-render.
const Placeholder = defineComponent({ setup: () => () => null });

const tabs: Tab[] = [
  { id: 'MEMBERS', label: '成员', component: Placeholder },
  { id: 'TREASURY', label: '基金', component: Placeholder },
  { id: 'LOGISTICS', label: '物资', component: Placeholder },
  { id: 'TASKS', label: '任务', component: Placeholder },
  { id: 'BULLETIN', label: '公告', component: Placeholder },
  { id: 'PRODUCTION', label: '产出', component: Placeholder },
];

const parameters = useXitParameters();
const parameter = parameters[0];
const activeTab = shallowRef(tabs.find(x => x.id === parameter?.toUpperCase()) ?? tabs[0]);

const isExecutive = computed(() => myRole.value === 'executive');

// Load members on mount if authenticated.
onMounted(() => {
  if (authenticated.value) {
    loadMembers();
  }
});
</script>

<template>
  <!-- Login / Register view -->
  <div v-if="!authenticated" :class="$style.loginContainer">
    <SectionHeader>
      {{ authMode === 'login' ? '登录组织面板' : '注册新成员' }}
    </SectionHeader>

    <div :class="$style.field">
      <div :class="$style.fieldLabel">公司名</div>
      <input v-model="authCompanyName" :class="$style.fieldInput" type="text" autocomplete="off" />
    </div>

    <div :class="$style.field">
      <div :class="$style.fieldLabel">PIN</div>
      <input
        v-model="authPin"
        :class="$style.fieldInput"
        type="password"
        autocomplete="off"
        @keyup.enter="authMode === 'login' ? handleLogin() : handleRegister()" />
    </div>

    <div v-if="authMode === 'register'" :class="$style.field">
      <div :class="$style.fieldLabel">邀请码</div>
      <input
        v-model="authInviteCode"
        :class="$style.fieldInput"
        type="text"
        autocomplete="off"
        @keyup.enter="handleRegister()" />
    </div>

    <div v-if="authError" :class="$style.errorMessage">{{ authError }}</div>

    <div :class="$style.buttonRow">
      <PrunButton
        v-if="authMode === 'login'"
        primary
        :disabled="authLoading || !authCompanyName || !authPin"
        @click="handleLogin">
        登录
      </PrunButton>
      <PrunButton
        v-else
        primary
        :disabled="authLoading || !authCompanyName || !authPin || !authInviteCode"
        @click="handleRegister">
        注册
      </PrunButton>
    </div>

    <div :class="$style.modeSwitch" @click="authMode = authMode === 'login' ? 'register' : 'login'">
      {{ authMode === 'login' ? '没有账号？点击注册' : '已有账号？点击登录' }}
    </div>
  </div>

  <!-- Authenticated view -->
  <div v-else>
    <!-- Top bar: user info + logout -->
    <div :class="$style.logoutBar">
      <span :class="$style.userInfo"> {{ authCompanyName }} · {{ ROLE_LABELS[myRole] }} </span>
      <PrunButton dark @click="handleLogout">登出</PrunButton>
    </div>

    <!-- Tab navigation -->
    <Tabs v-model="activeTab" :tabs="tabs" />

    <!-- Members tab content (inline, not via Tabs component rendering) -->
    <div v-if="activeTab.id === 'MEMBERS'">
      <!-- Toolbar -->
      <div :class="$style.membersToolbar">
        <PrunButton dark @click="loadMembers">刷新</PrunButton>
        <div v-if="isExecutive" style="display: flex; gap: 4px">
          <PrunButton dark @click="handleCreateInvite">生成邀请码</PrunButton>
        </div>
      </div>

      <!-- Generated invite code -->
      <div v-if="generatedInviteCode" :class="$style.inviteCodeDisplay">
        邀请码：{{ generatedInviteCode }}
      </div>

      <!-- Error -->
      <div v-if="membersError" :class="$style.errorMessage">{{ membersError }}</div>

      <!-- Loading -->
      <div v-if="membersLoading" :class="$style.loadingMessage">加载中...</div>

      <!-- Members list -->
      <template v-else>
        <div v-if="members.length === 0" :class="$style.emptyMessage">暂无成员</div>
        <div v-for="member in members" :key="member.id" :class="$style.memberRow">
          <div :class="$style.memberInfo">
            <span :class="$style.memberName">{{ member.companyName }}</span>
            <span :class="[$style.roleBadge, roleBadgeClass(member.role)]">
              {{ ROLE_LABELS[member.role] }}
            </span>
            <span :class="$style.memberJoined">{{ formatDate(member.joinedAt) }}</span>
          </div>

          <!-- Executive actions -->
          <div v-if="isExecutive" :class="$style.memberActions">
            <PrunButton
              v-for="role in availableRoles(member.role)"
              :key="role"
              dark
              @click="handleRoleChange(member, role)">
              → {{ ROLE_LABELS[role] }}
            </PrunButton>
            <PrunButton danger @click="handleRemoveMember(member)">移除</PrunButton>
          </div>
        </div>
      </template>
    </div>

    <!-- Treasury tab -->
    <FactionTreasury v-else-if="activeTab.id === 'TREASURY'" :my-role="myRole" />

    <!-- Logistics tab -->
    <FactionLogistics v-else-if="activeTab.id === 'LOGISTICS'" :my-role="myRole" />

    <!-- Tasks tab -->
    <FactionTasks v-else-if="activeTab.id === 'TASKS'" :my-role="myRole" />

    <!-- Bulletin tab -->
    <FactionBulletin v-else-if="activeTab.id === 'BULLETIN'" :my-role="myRole" />

    <!-- Production tab -->
    <FactionDailyProduction v-else-if="activeTab.id === 'PRODUCTION'" :my-role="myRole" />
  </div>
</template>
