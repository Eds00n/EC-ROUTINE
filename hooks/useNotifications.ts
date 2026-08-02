'use client';

import { useCallback, useEffect, useRef } from 'react';
import type { Task } from '@/types/notifications';
import { NotificationManager } from '@/utils/notificationManager';

const NOTIFICATION_RULES = [
  {
    type: 'task_due_soon' as const,
    minutesBefore: 15,
    checkInterval: 60,
  },
  {
    type: 'task_overdue' as const,
    checkInterval: 300,
  },
];

export function useNotifications() {
  const managerRef = useRef<NotificationManager | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/service-worker.js', { scope: '/' })
        .catch((error) => {
          console.error('[useNotifications] Erro ao registrar service worker:', error);
        });
    }

    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch((error) => {
        console.error('[useNotifications] Erro ao solicitar permissão:', error);
      });
    }

    managerRef.current = new NotificationManager();

    return () => {
      managerRef.current?.stopMonitoring();
      managerRef.current = null;
    };
  }, []);

  const startMonitoring = useCallback((tasks: Task[]) => {
    if (!managerRef.current) {
      managerRef.current = new NotificationManager();
    }
    managerRef.current.startMonitoring(tasks, NOTIFICATION_RULES);
  }, []);

  const stopMonitoring = useCallback(() => {
    managerRef.current?.stopMonitoring();
  }, []);

  return { startMonitoring, stopMonitoring };
}
