export class CompositionGate<T> {
  private composing = false;
  private readonly deferred: T[] = [];

  public start(): void {
    this.composing = true;
  }

  public deliverOrDefer(value: T, deliver: (value: T) => void): void {
    if (this.composing) {
      this.deferred.push(value);
      return;
    }
    deliver(value);
  }

  public end(deliver: (value: T) => void): void {
    this.composing = false;
    for (const value of this.deferred.splice(0)) {
      deliver(value);
    }
  }

  public reset(): void {
    this.composing = false;
    this.deferred.length = 0;
  }
}
