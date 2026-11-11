/**
 * Последовательная очередь фоновых задач (анализ репозиториев и инструментов).
 * Ничего не знает о сущностях: задача — замыкание, ключ нужен только для того, чтобы не ставить одно и то же дважды.
 */
export class JobQueue {
  private readonly jobs: Array<{ key: string; run: () => Promise<void> }> = [];
  private readonly queued = new Set<string>();
  private running = false;
  private waiters: Array<() => void> = [];

  /** key = 'repo:<id>' | 'tool:<id>'; повтор ключа, пока задача ждёт в очереди, игнорируется. */
  enqueue(key: string, run: () => Promise<void>): void {
    if (this.queued.has(key)) return;
    this.queued.add(key);
    this.jobs.push({ key, run });
    void this.drain();
  }

  /** В очереди + выполняемая. */
  size(): number {
    return this.jobs.length + (this.running ? 1 : 0);
  }

  /** Для тестов: дождаться опустошения. */
  idle(): Promise<void> {
    if (this.size() === 0) return Promise.resolve();
    return new Promise((resolve) => this.waiters.push(resolve));
  }

  private async drain(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      while (this.jobs.length > 0) {
        const job = this.jobs.shift()!;
        this.queued.delete(job.key);
        try {
          await job.run();
        } catch {
          // Отказ одной задачи (например, запись удалили, пока шёл анализ) не должен остановить очередь
          // и не должен стать отказом промиса без обработчика — это уронило бы процесс.
        }
      }
    } finally {
      this.running = false;
      const waiters = this.waiters;
      this.waiters = [];
      for (const w of waiters) w();
    }
  }
}
