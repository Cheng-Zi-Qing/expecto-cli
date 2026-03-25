export class QueuedInteractiveInput {
  private readonly queue: string[] = [];
  private closed = false;
  private pendingResolver: ((value: string | null) => void) | undefined;

  async readLine(): Promise<string | null> {
    if (this.queue.length > 0) {
      return this.queue.shift() ?? null;
    }

    if (this.closed) {
      return null;
    }

    return new Promise((resolve) => {
      this.pendingResolver = resolve;
    });
  }

  submit(line: string): void {
    if (this.closed) {
      return;
    }

    const resolve = this.pendingResolver;

    if (resolve) {
      this.pendingResolver = undefined;
      resolve(line);
      return;
    }

    this.queue.push(line);
  }

  close(): void {
    if (this.closed) {
      return;
    }

    this.closed = true;
    this.queue.length = 0;

    const resolve = this.pendingResolver;

    if (resolve) {
      this.pendingResolver = undefined;
      resolve(null);
    }
  }
}
