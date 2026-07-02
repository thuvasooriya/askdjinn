// Profiler interface for tracing tool calls and metrics.
// Implementations: NoopProfiler (default), ConsoleProfiler (debug).

import { env } from "$env/dynamic/private";

export interface Profiler {
  trace<T>(name: string, fn: () => Promise<T>, attrs?: Record<string, unknown>): Promise<T>;
  metric(name: string, value: number, attrs?: Record<string, unknown>): void;
}

const stateKey = "__djinn_profiler__";

class NoopProfiler implements Profiler {
  async trace<T>(name: string, fn: () => Promise<T>): Promise<T> {
    return fn();
  }
  metric(): void {}
}

class ConsoleProfiler implements Profiler {
  async trace<T>(name: string, fn: () => Promise<T>, attrs?: Record<string, unknown>): Promise<T> {
    const start = Date.now();
    try {
      const result = await fn();
      const ms = Date.now() - start;
      if (attrs) {
        console.log(`[trace] ${name} ${ms}ms`, attrs);
      } else {
        console.log(`[trace] ${name} ${ms}ms`);
      }
      return result;
    } catch (error) {
      const ms = Date.now() - start;
      console.error(`[trace] ${name} FAILED ${ms}ms`, error);
      throw error;
    }
  }

  metric(name: string, value: number, attrs?: Record<string, unknown>): void {
    if (attrs) {
      console.log(`[metric] ${name} = ${value}`, attrs);
    } else {
      console.log(`[metric] ${name} = ${value}`);
    }
  }
}

export function pickProfiler(): Profiler {
  const globalState = globalThis as typeof globalThis & { [stateKey]?: Profiler };
  if (globalState[stateKey]) return globalState[stateKey];

  const provider = env.PROFILER_PROVIDER;
  if (provider === "console") {
    globalState[stateKey] = new ConsoleProfiler();
  } else {
    globalState[stateKey] = new NoopProfiler();
  }

  return globalState[stateKey];
}
