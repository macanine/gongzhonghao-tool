'use client';

/**
 * 全局反馈：任务进度浮层 + 底部提示条。
 *
 * 都是「谁都能喊一声」的横切关注点，所以做成极小的外部 store，
 * 而不是一层层往下传 props。
 */

import { useSyncExternalStore } from 'react';

/* ---------------- 提示条 ---------------- */

interface ToastState {
  message: string;
  error: boolean;
  /** 每次弹出都换一个 id，方便触发重播动画。 */
  id: number;
}

let toastState: ToastState | null = null;
let toastTimer: ReturnType<typeof setTimeout> | null = null;
let toastSeed = 0;
const toastListeners = new Set<() => void>();

export function toast(message: string, error = false): void {
  toastSeed += 1;
  toastState = { message, error, id: toastSeed };
  toastListeners.forEach((listener) => listener());
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastState = null;
    toastListeners.forEach((listener) => listener());
  }, 3300);
}

/** 订阅函数恒定不变，免得每次渲染都让 useSyncExternalStore 重新订阅一遍。 */
const subscribeToast = (listener: () => void) => {
  toastListeners.add(listener);
  return () => void toastListeners.delete(listener);
};

export function useToast(): ToastState | null {
  return useSyncExternalStore(subscribeToast, () => toastState, () => null);
}

/* ---------------- 任务浮层 ---------------- */

export interface JobState {
  title: string;
  detail: string;
}

let jobState: JobState | null = null;
let cancelled = false;
const jobListeners = new Set<() => void>();

const emitJob = () => jobListeners.forEach((listener) => listener());

function subscribeJob(listener: () => void) {
  jobListeners.add(listener);
  return () => void jobListeners.delete(listener);
}

export function useJob(): JobState | null {
  return useSyncExternalStore(subscribeJob, () => jobState, () => null);
}

export class CancelledError extends Error {
  constructor() {
    super('任务已取消');
    this.name = 'CancelledError';
  }
}

export const assertNotCancelled = (): void => {
  if (cancelled) throw new CancelledError();
};

export function isCancellation(error: unknown): boolean {
  return (
    error instanceof CancelledError ||
    (error instanceof Error && /cancel/i.test(error.message))
  );
}

/** 取消当前任务：渲染循环会在下一个检查点抛出 CancelledError。 */
export function cancelJob(): void {
  cancelled = true;
  if (jobState) {
    jobState = { ...jobState, title: '正在取消', detail: '等待当前页面停止' };
    emitJob();
  }
}

/**
 * 跑一个带进度浮层的长任务。
 * task 里通过 setDetail 汇报进度，并在合适的位置调用 assertNotCancelled()。
 */
export async function runJob(
  title: string,
  task: (setDetail: (detail: string) => void) => Promise<void>,
): Promise<void> {
  if (jobState) {
    toast('已有任务正在处理', true);
    return;
  }
  cancelled = false;
  jobState = { title, detail: '准备中' };
  emitJob();

  const setDetail = (detail: string) => {
    if (!jobState) return;
    jobState = { ...jobState, detail };
    emitJob();
  };

  try {
    await task(setDetail);
  } catch (error) {
    if (isCancellation(error)) toast('已取消');
    else {
      console.error(title, error);
      toast(error instanceof Error ? error.message : '处理失败', true);
    }
  } finally {
    jobState = null;
    emitJob();
  }
}
