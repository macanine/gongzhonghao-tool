import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** 合并类名：clsx 处理条件，twMerge 让后写的工具类覆盖同族的前一个。 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
