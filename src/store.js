import { TaskStatus, TaskPriority, PriorityConfig, TimerMode, DefaultCategories, DefaultTags, DefaultSettings, STORAGE_KEYS } from './models.js';

class StateStore {
  constructor() {
    this.tasks = [];
    this.categories = [];
    this.tags = [];
    this.sessions = [];
    this.settings = { ...DefaultSettings };
    
    // UI & Filter state
    this.activeFilter = {
      view: 'all', // 'all', 'today', 'upcoming', 'backlog', 'completed', 'category:[id]'
      status: 'all', // 'all' or specific TaskStatus
      priority: 'all', // 'all' or specific TaskPriority
      tag: 'all',
      search: '',
      sortBy: 'priority_desc' // 'priority_desc', 'priority_asc', 'due_asc', 'due_desc', 'title_asc', 'created_desc'
    };

    // Focus Timer state
    this.timer = {
      mode: TimerMode.WORK, // work, short_break, long_break
      timeLeft: DefaultSettings.workDuration * 60,
      totalDuration: DefaultSettings.workDuration * 60,
      isRunning: false,
      activeTaskId: null,
      intervalId: null
    };

    this.listeners = new Set();
    this.loadState();
  }

  loadState() {
    try {
      const storedTasks = localStorage.getItem(STORAGE_KEYS.TASKS);
      this.tasks = storedTasks ? JSON.parse(storedTasks) : this.getSeedTasks();

      const storedCategories = localStorage.getItem(STORAGE_KEYS.CATEGORIES);
      this.categories = storedCategories ? JSON.parse(storedCategories) : [...DefaultCategories];

      const storedTags = localStorage.getItem(STORAGE_KEYS.TAGS);
      this.tags = storedTags ? JSON.parse(storedTags) : [...DefaultTags];

      const storedSessions = localStorage.getItem(STORAGE_KEYS.SESSIONS);
      this.sessions = storedSessions ? JSON.parse(storedSessions) : [];

      const storedSettings = localStorage.getItem(STORAGE_KEYS.SETTINGS);
      if (storedSettings) {
        this.settings = { ...DefaultSettings, ...JSON.parse(storedSettings) };
      }
    } catch (err) {
      console.error('Error loading state from localStorage:', err);
      this.tasks = this.getSeedTasks();
      this.categories = [...DefaultCategories];
      this.tags = [...DefaultTags];
      this.sessions = [];
    }
  }

  saveState() {
    try {
      localStorage.setItem(STORAGE_KEYS.TASKS, JSON.stringify(this.tasks));
      localStorage.setItem(STORAGE_KEYS.CATEGORIES, JSON.stringify(this.categories));
      localStorage.setItem(STORAGE_KEYS.TAGS, JSON.stringify(this.tags));
      localStorage.setItem(STORAGE_KEYS.SESSIONS, JSON.stringify(this.sessions));
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(this.settings));
    } catch (err) {
      console.error('Error saving state to localStorage:', err);
    }
    this.notify();
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify() {
    for (const listener of this.listeners) {
      listener(this);
    }
  }

  getSeedTasks() {
    const today = new Date().toISOString().split('T')[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

    return [
      {
        id: 'task-1',
        title: 'Review production deployment pipeline & security groups',
        description: 'Check zero-downtime healthcheck configs and TLS certificate rotations.',
        status: TaskStatus.IN_PROGRESS,
        priority: TaskPriority.URGENT,
        categoryId: 'work',
        tags: ['Backend', 'Review'],
        dueDate: today,
        createdAt: new Date(Date.now() - 3600000 * 4).toISOString(),
        completedAt: null,
        focusMinutes: 50
      },
      {
        id: 'task-2',
        title: 'Design component palette and tokens for Design System',
        description: 'Incorporate Slate, Indigo, and Emerald tokens with accessible contrast.',
        status: TaskStatus.DONE,
        priority: TaskPriority.HIGH,
        categoryId: 'work',
        tags: ['Frontend', 'Design'],
        dueDate: today,
        createdAt: new Date(Date.now() - 3600000 * 24).toISOString(),
        completedAt: new Date(Date.now() - 3600000 * 2).toISOString(),
        focusMinutes: 75
      },
      {
        id: 'task-3',
        title: 'Research LLM evaluation benchmarks (MMLU / GSM8k)',
        description: 'Compile comparison metrics for latency, quantization, and fine-tuning costs.',
        status: TaskStatus.BACKLOG,
        priority: TaskPriority.MEDIUM,
        categoryId: 'learning',
        tags: ['Planning', 'Feature'],
        dueDate: tomorrow,
        createdAt: new Date(Date.now() - 3600000 * 12).toISOString(),
        completedAt: null,
        focusMinutes: 25
      },
      {
        id: 'task-4',
        title: 'Monthly subscription & cloud expenditure audit',
        description: 'Cancel unused staging compute instances and optimize storage tiers.',
        status: TaskStatus.BACKLOG,
        priority: TaskPriority.LOW,
        categoryId: 'admin',
        tags: ['Review'],
        dueDate: '',
        createdAt: new Date(Date.now() - 3600000 * 48).toISOString(),
        completedAt: null,
        focusMinutes: 0
      }
    ];
  }

  // --- Task CRUD ---
  createTask({ title, description = '', priority = TaskPriority.MEDIUM, status = TaskStatus.BACKLOG, categoryId = 'work', tags = [], dueDate = '' }) {
    if (!title || !title.trim()) {
      throw new Error('Task title is required');
    }

    const newTask = {
      id: 'task_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
      title: title.trim(),
      description: (description || '').trim(),
      priority: Object.values(TaskPriority).includes(priority) ? priority : TaskPriority.MEDIUM,
      status: Object.values(TaskStatus).includes(status) ? status : TaskStatus.BACKLOG,
      categoryId: categoryId || 'work',
      tags: Array.isArray(tags) ? tags : [],
      dueDate: dueDate || '',
      createdAt: new Date().toISOString(),
      completedAt: status === TaskStatus.DONE ? new Date().toISOString() : null,
      focusMinutes: 0
    };

    this.tasks.unshift(newTask);
    this.saveState();
    return newTask;
  }

  updateTask(id, updates) {
    const taskIndex = this.tasks.findIndex(t => t.id === id);
    if (taskIndex === -1) return null;

    const currentTask = this.tasks[taskIndex];
    const isNowDone = updates.status === TaskStatus.DONE && currentTask.status !== TaskStatus.DONE;
    const isNowUndone = updates.status && updates.status !== TaskStatus.DONE && currentTask.status === TaskStatus.DONE;

    let completedAt = currentTask.completedAt;
    if (isNowDone) {
      completedAt = new Date().toISOString();
    } else if (isNowUndone) {
      completedAt = null;
    }

    const updatedTask = {
      ...currentTask,
      ...updates,
      completedAt
    };

    this.tasks[taskIndex] = updatedTask;
    this.saveState();
    return updatedTask;
  }

  deleteTask(id) {
    this.tasks = this.tasks.filter(t => t.id !== id);
    if (this.timer.activeTaskId === id) {
      this.timer.activeTaskId = null;
    }
    this.saveState();
  }

  toggleTaskStatus(id) {
    const task = this.tasks.find(t => t.id === id);
    if (!task) return;

    const nextStatus = task.status === TaskStatus.DONE ? TaskStatus.IN_PROGRESS : TaskStatus.DONE;
    this.updateTask(id, { status: nextStatus });
  }

  // --- Categories & Tags ---
  addCategory(name, icon = '📁', color = '#6366f1') {
    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    if (this.categories.some(c => c.id === id)) return;
    this.categories.push({ id, name, icon, color });
    this.saveState();
  }

  addTag(tag) {
    const clean = tag.trim();
    if (clean && !this.tags.includes(clean)) {
      this.tags.push(clean);
      this.saveState();
    }
  }

  // --- Filtering & Sorting ---
  getFilteredTasks() {
    const { view, status, priority, tag, search, sortBy } = this.activeFilter;
    const todayStr = new Date().toISOString().split('T')[0];

    return this.tasks.filter(task => {
      // 1. View Filter
      if (view === 'today') {
        if (task.dueDate !== todayStr) return false;
      } else if (view === 'upcoming') {
        if (!task.dueDate || task.dueDate <= todayStr || task.status === TaskStatus.DONE) return false;
      } else if (view === 'backlog') {
        if (task.status !== TaskStatus.BACKLOG) return false;
      } else if (view === 'completed') {
        if (task.status !== TaskStatus.DONE) return false;
      } else if (view.startsWith('category:')) {
        const catId = view.split('category:')[1];
        if (task.categoryId !== catId) return false;
      }

      // 2. Status Filter
      if (status !== 'all' && task.status !== status) {
        return false;
      }

      // 3. Priority Filter
      if (priority !== 'all' && task.priority !== priority) {
        return false;
      }

      // 4. Tag Filter
      if (tag !== 'all' && (!task.tags || !task.tags.includes(tag))) {
        return false;
      }

      // 5. Search
      if (search && search.trim() !== '') {
        const query = search.toLowerCase().trim();
        const inTitle = task.title.toLowerCase().includes(query);
        const inDesc = (task.description || '').toLowerCase().includes(query);
        const inTags = (task.tags || []).some(t => t.toLowerCase().includes(query));
        if (!inTitle && !inDesc && !inTags) return false;
      }

      return true;
    }).sort((a, b) => {
      // Sorting logic
      if (sortBy === 'priority_desc') {
        const rankA = PriorityConfig[a.priority]?.rank || 0;
        const rankB = PriorityConfig[b.priority]?.rank || 0;
        if (rankB !== rankA) return rankB - rankA;
        return new Date(b.createdAt) - new Date(a.createdAt);
      }
      if (sortBy === 'priority_asc') {
        const rankA = PriorityConfig[a.priority]?.rank || 0;
        const rankB = PriorityConfig[b.priority]?.rank || 0;
        if (rankA !== rankB) return rankA - rankB;
        return new Date(b.createdAt) - new Date(a.createdAt);
      }
      if (sortBy === 'due_asc') {
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return a.dueDate.localeCompare(b.dueDate);
      }
      if (sortBy === 'due_desc') {
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return b.dueDate.localeCompare(a.dueDate);
      }
      if (sortBy === 'title_asc') {
        return a.title.localeCompare(b.title);
      }
      if (sortBy === 'created_desc') {
        return new Date(b.createdAt) - new Date(a.createdAt);
      }
      return 0;
    });
  }

  setFilter(updates) {
    this.activeFilter = { ...this.activeFilter, ...updates };
    this.notify();
  }

  // --- Metrics & Analytics ---
  getMetrics() {
    const total = this.tasks.length;
    const completed = this.tasks.filter(t => t.status === TaskStatus.DONE).length;
    const inProgress = this.tasks.filter(t => t.status === TaskStatus.IN_PROGRESS).length;
    const blocked = this.tasks.filter(t => t.status === TaskStatus.BLOCKED).length;
    const backlog = this.tasks.filter(t => t.status === TaskStatus.BACKLOG).length;

    const todayStr = new Date().toISOString().split('T')[0];
    const completedToday = this.tasks.filter(t => {
      return t.status === TaskStatus.DONE && t.completedAt && t.completedAt.startsWith(todayStr);
    }).length;

    const totalFocusMinutes = this.tasks.reduce((sum, t) => sum + (t.focusMinutes || 0), 0);
    const todaySessions = this.sessions.filter(s => s.completedAt && s.completedAt.startsWith(todayStr));
    const todayFocusMinutes = todaySessions.reduce((sum, s) => sum + (s.durationMinutes || 0), 0);

    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

    return {
      total,
      completed,
      inProgress,
      blocked,
      backlog,
      completedToday,
      totalFocusMinutes,
      todayFocusMinutes,
      completionRate,
      sessionsCount: this.sessions.length
    };
  }

  // --- Focus Timer Operations ---
  setTimerMode(mode) {
    if (!Object.values(TimerMode).includes(mode)) return;
    this.pauseTimer();
    this.timer.mode = mode;
    let mins = this.settings.workDuration;
    if (mode === TimerMode.SHORT_BREAK) mins = this.settings.shortBreakDuration;
    if (mode === TimerMode.LONG_BREAK) mins = this.settings.longBreakDuration;

    this.timer.timeLeft = mins * 60;
    this.timer.totalDuration = mins * 60;
    this.notify();
  }

  setActiveTaskForTimer(taskId) {
    this.timer.activeTaskId = taskId;
    this.notify();
  }

  startTimer() {
    if (this.timer.isRunning) return;
    this.timer.isRunning = true;
    this.timer.intervalId = setInterval(() => {
      if (this.timer.timeLeft > 0) {
        this.timer.timeLeft--;
        this.notify();
      } else {
        this.completeTimerInterval();
      }
    }, 1000);
    this.notify();
  }

  pauseTimer() {
    if (this.timer.intervalId) {
      clearInterval(this.timer.intervalId);
      this.timer.intervalId = null;
    }
    this.timer.isRunning = false;
    this.notify();
  }

  resetTimer() {
    this.pauseTimer();
    this.setTimerMode(this.timer.mode);
  }

  completeTimerInterval() {
    this.pauseTimer();

    const durationMins = Math.round(this.timer.totalDuration / 60);
    const completedSession = {
      id: 'session_' + Date.now(),
      mode: this.timer.mode,
      durationMinutes: durationMins,
      taskId: this.timer.activeTaskId,
      completedAt: new Date().toISOString()
    };

    this.sessions.unshift(completedSession);

    // If work mode and linked to a task, increment task focusMinutes
    if (this.timer.mode === TimerMode.WORK && this.timer.activeTaskId) {
      const task = this.tasks.find(t => t.id === this.timer.activeTaskId);
      if (task) {
        this.updateTask(task.id, {
          focusMinutes: (task.focusMinutes || 0) + durationMins
        });
      }
    }

    // Auto toggle to break or work
    if (this.timer.mode === TimerMode.WORK) {
      this.setTimerMode(TimerMode.SHORT_BREAK);
    } else {
      this.setTimerMode(TimerMode.WORK);
    }

    this.saveState();
  }
}

export const store = new StateStore();
