export interface ActiveViewLease {
  readonly revision: number;
}

export class ActiveViewTracker<T extends object> {
  private target: T | undefined;
  private revision = 0;
  private readonly ready = new WeakSet<T>();

  /** The active view, but only once its webview is listening; earlier posts are not reliably delivered. */
  public get current(): T | undefined {
    return this.target !== undefined && this.ready.has(this.target) ? this.target : undefined;
  }

  public activate(target: T): void {
    if (this.target === target) return;
    this.target = target;
    this.revision += 1;
  }

  public deactivate(target: T): void {
    if (this.target !== target) return;
    this.target = undefined;
    this.revision += 1;
  }

  public markReady(target: T): void {
    this.ready.add(target);
  }

  public markPending(target: T): void {
    if (!this.ready.delete(target)) return;
    if (this.target === target) this.revision += 1;
  }

  public capture(): ActiveViewLease | undefined {
    return this.current === undefined ? undefined : { revision: this.revision };
  }

  public isCurrent(lease: ActiveViewLease): boolean {
    return this.current !== undefined && lease.revision === this.revision;
  }
}
