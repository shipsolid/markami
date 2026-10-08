export interface ActiveViewLease {
  readonly revision: number;
}

export class ActiveViewTracker<T> {
  private target: T | undefined;
  private revision = 0;

  public get current(): T | undefined {
    return this.target;
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

  public capture(): ActiveViewLease | undefined {
    return this.target === undefined ? undefined : { revision: this.revision };
  }

  public isCurrent(lease: ActiveViewLease): boolean {
    return this.target !== undefined && lease.revision === this.revision;
  }
}
