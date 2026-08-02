'use client';

import { useEffect, useState } from 'react';
import { useNotifications } from '@/hooks/useNotifications';
import { createClient, type SupabaseTaskRow } from '@/lib/supabase/client';
import type { Task } from '@/types/notifications';

function mapSupabaseTask(row: SupabaseTaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    dueTime: row.due_time,
    dueDate: row.due_date,
    completed: row.completed,
    completedAt: row.completed_at ?? undefined,
  };
}

export default function HomePage() {
  const { startMonitoring, stopMonitoring } = useNotifications();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [permission, setPermission] =
    useState<NotificationPermission>('default');

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setPermission(Notification.permission);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadTasks() {
      try {
        setLoading(true);
        setError(null);

        const supabase = createClient();
        const { data, error: supabaseError } = await supabase
          .from('tasks')
          .select('id, title, due_time, due_date, completed, completed_at')
          .eq('completed', false);

        if (supabaseError) throw supabaseError;
        if (cancelled) return;

        const mapped = (data ?? []).map(mapSupabaseTask);
        setTasks(mapped);
      } catch (err) {
        if (!cancelled) {
          const message =
            err instanceof Error ? err.message : 'Erro ao carregar tarefas';
          setError(message);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadTasks();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (tasks.length === 0 || permission !== 'granted') return;

    startMonitoring(tasks);

    const refreshInterval = setInterval(async () => {
      try {
        const supabase = createClient();
        const { data, error: supabaseError } = await supabase
          .from('tasks')
          .select('id, title, due_time, due_date, completed, completed_at')
          .eq('completed', false);

        if (supabaseError) throw supabaseError;
        startMonitoring((data ?? []).map(mapSupabaseTask));
      } catch (err) {
        console.error('[HomePage] Erro ao atualizar tarefas:', err);
      }
    }, 60_000);

    return () => {
      clearInterval(refreshInterval);
      stopMonitoring();
    };
  }, [tasks, permission, startMonitoring, stopMonitoring]);

  async function requestPermission() {
    if (!('Notification' in window)) return;
    const result = await Notification.requestPermission();
    setPermission(result);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col gap-6 p-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">EC Routine</h1>
        <p className="mt-1 text-sm text-gray-600">
          Notificações push para tarefas próximas e vencidas
        </p>
      </header>

      <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="font-semibold">Permissão de notificações</h2>
        <p className="mt-2 text-sm text-gray-600">
          Status:{' '}
          <span className="font-medium">
            {permission === 'granted'
              ? 'Ativada'
              : permission === 'denied'
                ? 'Bloqueada'
                : 'Pendente'}
          </span>
        </p>
        {permission !== 'granted' && (
          <button
            type="button"
            onClick={requestPermission}
            className="mt-3 rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            Ativar notificações
          </button>
        )}
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="font-semibold">Tarefas pendentes</h2>
        {loading && (
          <p className="mt-2 text-sm text-gray-500">Carregando tarefas…</p>
        )}
        {error && (
          <p className="mt-2 text-sm text-red-600" role="alert">
            {error}
          </p>
        )}
        {!loading && !error && tasks.length === 0 && (
          <p className="mt-2 text-sm text-gray-500">
            Nenhuma tarefa pendente no momento.
          </p>
        )}
        {!loading && tasks.length > 0 && (
          <ul className="mt-3 space-y-2">
            {tasks.map((task) => (
              <li
                key={task.id}
                className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-sm"
              >
                <p className="font-medium">{task.title}</p>
                <p className="text-gray-500">
                  Prazo: {task.dueDate} às {task.dueTime}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {permission === 'granted' && tasks.length > 0 && (
        <p className="text-center text-xs text-gray-500">
          Monitoramento ativo — você será avisado até 15 min antes do prazo e
          quando a tarefa vencer.
        </p>
      )}
    </main>
  );
}
