export type NotificationType =
  | 'task_due_soon'
  | 'task_overdue'
  | 'task_completed_late'
  | 'reminder'
  | 'warning';

export interface Task {
  id: string;
  title: string;
  dueTime: string; // HH:MM
  dueDate: string; // YYYY-MM-DD
  completed: boolean;
  completedAt?: string;
}

export interface NotificationPayload {
  type: NotificationType;
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag: string;
  data: {
    taskId?: string;
    timestamp: number;
    actionUrl?: string;
  };
}

export interface NotificationRule {
  type: NotificationType;
  minutesBefore?: number;
  checkInterval: number; // segundos
}
