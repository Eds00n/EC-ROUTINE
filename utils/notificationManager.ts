import type {
  NotificationPayload,
  NotificationRule,
  NotificationType,
  Task,
} from '@/types/notifications';

const DEFAULT_ICON = '/logo.png';
const DEFAULT_BADGE = '/badge.png';

export class NotificationManager {
  private intervals = new Map<NotificationType, ReturnType<typeof setInterval>>();
  private tasks: Task[] = [];

  startMonitoring(tasks: Task[], rules: NotificationRule[]): void {
    this.stopMonitoring();
    this.tasks = tasks;

    for (const rule of rules) {
      const intervalId = setInterval(() => {
        this.checkTasks(this.tasks, rule);
      }, rule.checkInterval * 1000);

      this.intervals.set(rule.type, intervalId);
      this.checkTasks(this.tasks, rule);
    }
  }

  updateTasks(tasks: Task[]): void {
    this.tasks = tasks;
  }

  stopMonitoring(): void {
    for (const intervalId of this.intervals.values()) {
      clearInterval(intervalId);
    }
    this.intervals.clear();
  }

  private checkTasks(tasks: Task[], rule: NotificationRule): void {
    const now = new Date();

    for (const task of tasks) {
      if (task.completed) continue;

      const dueAt = this.parseDateTime(task.dueDate, task.dueTime);
      const diffMs = dueAt.getTime() - now.getTime();
      const diffMinutes = diffMs / (1000 * 60);

      switch (rule.type) {
        case 'task_due_soon': {
          const minutesBefore = rule.minutesBefore ?? 15;
          if (diffMinutes <= minutesBefore && diffMinutes > 0) {
            const hora = task.dueTime;
            this.showNotification({
              type: 'task_due_soon',
              title: 'EC ROUTINE',
              body: `Tarefa para concluir às ${hora}\nNão se esqueça de concluir no horário!`,
              icon: DEFAULT_ICON,
              badge: DEFAULT_BADGE,
              tag: `task-due-${task.id}`,
              data: {
                taskId: task.id,
                timestamp: Date.now(),
                actionUrl: '/dashboard',
              },
            });
          }
          break;
        }

        case 'task_overdue': {
          if (diffMinutes <= 0) {
            this.showNotification({
              type: 'task_overdue',
              title: 'EC ROUTINE',
              body: `A tarefa "${task.title}" venceu e foi perdida. Conclua o quanto antes!`,
              icon: DEFAULT_ICON,
              badge: DEFAULT_BADGE,
              tag: `task-overdue-${task.id}`,
              data: {
                taskId: task.id,
                timestamp: Date.now(),
                actionUrl: '/dashboard',
              },
            });
          }
          break;
        }

        default:
          break;
      }
    }
  }

  private async showNotification(payload: NotificationPayload): Promise<void> {
    if (typeof window === 'undefined') return;
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    if (!('serviceWorker' in navigator)) return;

    try {
      const registration = await navigator.serviceWorker.ready;
      await registration.showNotification(payload.title, {
        body: payload.body,
        icon: payload.icon ?? DEFAULT_ICON,
        badge: payload.badge ?? DEFAULT_BADGE,
        tag: payload.tag,
        requireInteraction: true,
        data: {
          ...payload.data,
          type: payload.type,
        },
      });
    } catch (error) {
      console.error('[NotificationManager] Erro ao exibir notificação:', error);
    }
  }

  private parseDateTime(date: string, time: string): Date {
    const [year, month, day] = date.split('-').map(Number);
    const [hours, minutes] = time.split(':').map(Number);
    return new Date(year, month - 1, day, hours, minutes, 0, 0);
  }
}
