import { colors } from './tokens.ts';

export const TaskStatus = {
  BACKLOG: 'backlog',
  IN_PROGRESS: 'in_progress',
  BLOCKED: 'blocked',
  DONE: 'done'
};

export const TaskPriority = {
  URGENT: 'urgent',
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low'
};

export const PriorityConfig = {
  [TaskPriority.URGENT]: { label: 'Urgent', rank: 4, color: colors.danger[500], bg: 'rgba(239, 68, 68, 0.12)' },
  [TaskPriority.HIGH]: { label: 'High', rank: 3, color: colors.warning[500], bg: 'rgba(245, 158, 11, 0.12)' },
  [TaskPriority.MEDIUM]: { label: 'Medium', rank: 2, color: colors.primary[500], bg: 'rgba(99, 102, 241, 0.12)' },
  [TaskPriority.LOW]: { label: 'Low', rank: 1, color: colors.slate[500], bg: 'rgba(100, 116, 139, 0.12)' }
};

export const StatusConfig = {
  [TaskStatus.BACKLOG]: { label: 'Backlog', icon: '📥', color: colors.slate[400] },
  [TaskStatus.IN_PROGRESS]: { label: 'In Progress', icon: '⚡', color: colors.info[400] },
  [TaskStatus.BLOCKED]: { label: 'Blocked', icon: '⛔', color: colors.danger[400] },
  [TaskStatus.DONE]: { label: 'Done', icon: '✅', color: colors.success[400] }
};

export const TimerMode = {
  WORK: 'work',
  SHORT_BREAK: 'short_break',
  LONG_BREAK: 'long_break'
};

export const TimerConfig = {
  [TimerMode.WORK]: { label: 'Focus Work', durationMinutes: 25 },
  [TimerMode.SHORT_BREAK]: { label: 'Short Break', durationMinutes: 5 },
  [TimerMode.LONG_BREAK]: { label: 'Long Break', durationMinutes: 15 }
};

export const DefaultCategories = [
  { id: 'work', name: 'Work & Projects', icon: '💼', color: colors.primary[500] },
  { id: 'personal', name: 'Personal', icon: '🌱', color: colors.success[500] },
  { id: 'learning', name: 'Learning & Research', icon: '📚', color: colors.warning[500] },
  { id: 'admin', name: 'Admin & Ops', icon: '📋', color: '#8b5cf6' }
];

export const DefaultTags = [
  'Frontend', 'Backend', 'Design', 'Review', 'Urgent', 'Bug', 'Planning', 'Feature'
];

export const STORAGE_KEYS = {
  TASKS: 'sf_productivity_tasks',
  CATEGORIES: 'sf_productivity_categories',
  TAGS: 'sf_productivity_tags',
  SESSIONS: 'sf_productivity_sessions',
  SETTINGS: 'sf_productivity_settings'
};

export const DefaultSettings = {
  theme: 'dark', // 'dark' | 'light'
  workDuration: 25,
  shortBreakDuration: 5,
  longBreakDuration: 15,
  autoStartBreaks: false,
  soundEnabled: true
};
