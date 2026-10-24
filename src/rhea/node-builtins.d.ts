/** Minimal Node standard-library declarations used by the read-only scanner CLI. */
declare module 'node:fs/promises' {
  export function readFile(path: string, encoding: string): Promise<string>;
  export function writeFile(path: string, data: string, options: {encoding: string; mode: number}): Promise<void>;
  export function rename(oldPath: string, newPath: string): Promise<void>;
  export function mkdir(path: string, options: {recursive: boolean}): Promise<string | undefined>;
}
declare module 'node:path' {
  export function resolve(path: string): string;
  export function dirname(path: string): string;
}
