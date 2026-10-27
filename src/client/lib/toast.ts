import { useSyncExternalStore } from 'react';

export interface Toast {
  id: number;
  kind: 'info' | 'success' | 'error';
  text: string;
  action?: { label: string; href: string };
}

let toasts: Toast[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

export function toast(kind: Toast['kind'], text: string, action?: Toast['action'], ttl = kind === 'error' ? 7000 : 4000): void {
  const id = nextId++;
  toasts = [...toasts, { id, kind, text, action }];
  emit();
  setTimeout(() => dismissToast(id), ttl);
}

export function dismissToast(id: number): void {
  if (!toasts.some((t) => t.id === id)) return;
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

export function useToasts(): Toast[] {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => toasts,
  );
}

export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}
