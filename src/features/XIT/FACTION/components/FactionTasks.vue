<script setup lang="ts">
import PrunButton from '@src/components/PrunButton.vue';
import {
  fetchTasks,
  createTask,
  claimTask,
  updateTaskStatus,
  addTaskComment,
  deleteTask,
  FactionApiError,
} from '../use-faction-api';
import { TASK_STATUS_LABELS, type Task, type TaskStatus, type MemberRole } from '../types';
import $style from '../FactionPanel.module.css';

const props = defineProps<{ myRole: MemberRole }>();

const tasks = ref<Task[]>([]);
const loading = ref(false);
const error = ref('');
// All tasks expanded by default; collapsedTasks tracks manually collapsed ones.
const collapsedTasks = ref<Set<string>>(new Set());
const commentText = ref('');

// Create task form.
const showForm = ref(false);
const formTitle = ref('');
const formDescription = ref('');
const formDueDate = ref('');

const isExecutive = computed(() => props.myRole === 'executive');
const canClaim = computed(() => props.myRole !== 'member');

async function loadData() {
  loading.value = true;
  error.value = '';
  try {
    const result = await fetchTasks();
    tasks.value = result.tasks;
  } catch (e) {
    if (e instanceof FactionApiError) {
      error.value = e.response.message;
    }
  } finally {
    loading.value = false;
  }
}

async function handleCreate() {
  if (!formTitle.value) {
    return;
  }
  try {
    await createTask(
      formTitle.value,
      formDescription.value || undefined,
      formDueDate.value || undefined,
    );
    showForm.value = false;
    formTitle.value = '';
    formDescription.value = '';
    formDueDate.value = '';
    await loadData();
  } catch (e) {
    if (e instanceof FactionApiError) {
      error.value = e.response.message;
    }
  }
}

async function handleClaim(taskId: string) {
  try {
    await claimTask(taskId);
    await loadData();
  } catch (e) {
    if (e instanceof FactionApiError) {
      error.value = e.response.message;
    }
  }
}

async function handleStatusChange(taskId: string, status: TaskStatus) {
  try {
    await updateTaskStatus(taskId, status);
    await loadData();
  } catch (e) {
    if (e instanceof FactionApiError) {
      error.value = e.response.message;
    }
  }
}

async function handleComment(taskId: string) {
  if (!commentText.value) {
    return;
  }
  try {
    await addTaskComment(taskId, commentText.value);
    commentText.value = '';
    await loadData();
  } catch (e) {
    if (e instanceof FactionApiError) {
      error.value = e.response.message;
    }
  }
}

function isExpanded(taskId: string): boolean {
  return !collapsedTasks.value.has(taskId);
}

function toggleExpand(taskId: string) {
  const next = new Set(collapsedTasks.value);
  if (next.has(taskId)) {
    next.delete(taskId);
  } else {
    next.add(taskId);
    commentText.value = '';
  }
  collapsedTasks.value = next;
}

async function handleDelete(taskId: string) {
  try {
    await deleteTask(taskId);
    await loadData();
  } catch (e) {
    if (e instanceof FactionApiError) {
      error.value = e.response.message;
    }
  }
}

function statusColor(status: string): string {
  switch (status) {
    case 'done':
      return 'rgb(146, 196, 125)';
    case 'review':
      return 'rgb(79, 163, 217)';
    case 'in_progress':
      return 'rgb(217, 163, 79)';
    default:
      return 'rgba(255, 255, 255, 0.5)';
  }
}

const nextStatuses: Record<string, TaskStatus[]> = {
  open: ['in_progress'],
  in_progress: ['review', 'done'],
  review: ['done', 'in_progress'],
  done: ['open'],
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

onMounted(loadData);
</script>

<template>
  <div>
    <div :class="$style.membersToolbar">
      <PrunButton dark @click="loadData">刷新</PrunButton>
      <PrunButton v-if="isExecutive" dark @click="showForm = !showForm">
        {{ showForm ? '取消' : '创建任务' }}
      </PrunButton>
    </div>

    <!-- Create form -->
    <div v-if="showForm" :class="$style.loginContainer">
      <div :class="$style.field">
        <div :class="$style.fieldLabel">标题</div>
        <input v-model="formTitle" :class="$style.fieldInput" type="text" />
      </div>
      <div :class="$style.field">
        <div :class="$style.fieldLabel">描述</div>
        <input v-model="formDescription" :class="$style.fieldInput" type="text" />
      </div>
      <div :class="$style.field">
        <div :class="$style.fieldLabel">截止日期（可选）</div>
        <input v-model="formDueDate" :class="$style.fieldInput" type="date" />
      </div>
      <div :class="$style.buttonRow">
        <PrunButton primary :disabled="!formTitle" @click="handleCreate">创建</PrunButton>
      </div>
    </div>

    <div v-if="error" :class="$style.errorMessage">{{ error }}</div>

    <div v-if="loading" :class="$style.loadingMessage">加载中...</div>

    <template v-else>
      <div v-if="tasks.length === 0" :class="$style.emptyMessage">暂无任务</div>
      <div
        v-for="task in tasks"
        :key="task.id"
        :class="$style.memberRow"
        style="flex-direction: column; align-items: stretch; cursor: pointer"
        @click="toggleExpand(task.id)">
        <!-- Task header -->
        <div style="display: flex; justify-content: space-between; align-items: center">
          <div :class="$style.memberInfo">
            <span style="font-size: 13px; color: rgb(230, 200, 80); font-weight: bold">{{
              task.title
            }}</span>
            <span
              :class="[$style.roleBadge]"
              :style="{
                color: statusColor(task.status),
                backgroundColor: statusColor(task.status)
                  .replace('rgb', 'rgba')
                  .replace(')', ', 0.15)'),
              }">
              {{ TASK_STATUS_LABELS[task.status] }}
            </span>
          </div>
          <div style="display: flex; align-items: center; gap: 4px">
            <span v-if="task.dueDate" style="opacity: 0.5; font-size: 11px"
              >截止 {{ task.dueDate }}</span
            >
            <span :class="$style.memberJoined">{{ formatDate(task.createdAt) }}</span>
            <PrunButton v-if="isExecutive" danger @click.stop="handleDelete(task.id)"
              >删除</PrunButton
            >
          </div>
        </div>

        <!-- Expanded details (default expanded, click header to collapse) -->
        <div v-if="isExpanded(task.id)" style="cursor: default" @click.stop>
          <div
            v-if="task.description"
            style="color: rgb(220, 220, 220); font-size: 12px; margin: 4px 0"
            >{{ task.description }}</div
          >
          <div style="font-size: 11px; opacity: 0.5; margin-bottom: 2px"
            >发布人：{{ task.createdBy }}</div
          >
          <div v-if="task.assignee" style="font-size: 11px; margin-bottom: 2px">
            <span style="opacity: 0.5">认领人：</span>
            <span style="color: rgb(100, 180, 230)">{{ task.assignee }}</span>
          </div>
          <div
            v-if="task.status === 'done' && task.assignee"
            style="font-size: 11px; margin-bottom: 4px">
            <span style="opacity: 0.5">完成人：</span>
            <span style="color: rgb(146, 196, 125)">{{ task.assignee }}</span>
          </div>

          <!-- Action buttons -->
          <div style="display: flex; gap: 4px; flex-wrap: wrap; margin: 4px 0">
            <PrunButton
              v-if="canClaim && task.status === 'open' && !task.assignee"
              dark
              @click.stop="handleClaim(task.id)">
              认领
            </PrunButton>
            <PrunButton
              v-for="s in nextStatuses[task.status] ?? []"
              :key="s"
              dark
              @click.stop="handleStatusChange(task.id, s)">
              → {{ TASK_STATUS_LABELS[s] }}
            </PrunButton>
          </div>

          <!-- Comments -->
          <div
            v-if="task.comments.length > 0"
            style="
              margin-top: 4px;
              border-top: 1px solid rgba(255, 255, 255, 0.06);
              padding-top: 4px;
            ">
            <div
              v-for="comment in task.comments"
              :key="comment.id"
              style="font-size: 11px; margin-bottom: 2px">
              <span style="opacity: 0.7">{{ comment.author }}:</span>
              <span style="margin-left: 4px">{{ comment.content }}</span>
              <span style="opacity: 0.3; margin-left: 4px">{{
                formatDate(comment.createdAt)
              }}</span>
            </div>
          </div>

          <!-- Add comment -->
          <div style="display: flex; gap: 4px; margin-top: 4px">
            <input
              v-model="commentText"
              :class="$style.fieldInput"
              type="text"
              placeholder="添加备注..."
              style="flex: 1; font-size: 11px"
              @click.stop
              @keyup.enter="handleComment(task.id)" />
            <PrunButton dark :disabled="!commentText" @click.stop="handleComment(task.id)"
              >发送</PrunButton
            >
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
