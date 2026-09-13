'use client';

/**
 * 串行执行器。
 *
 * pdf.js 的渲染很吃内存，几十页同时开工容易直接把标签页拖垮，
 * 所以所有页面渲染都排成一条队，一次只跑一个。
 */

let tail: Promise<unknown> = Promise.resolve();

export function serialize<T>(task: () => Promise<T>): Promise<T> {
  const run = tail.then(task, task);
  // 把失败吞掉再接下一个，避免一次报错卡死整条队列。
  tail = run.catch(() => undefined);
  return run;
}
