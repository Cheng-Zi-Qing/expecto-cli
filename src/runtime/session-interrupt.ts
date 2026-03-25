export type InterruptListener = () => void;

export class SessionInterruptController {
  private readonly listeners = new Set<InterruptListener>();

  subscribe(listener: InterruptListener): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  interruptCurrentTurn(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}
