/**
 * A running count of upstream calls (spec §13.6), fed by `CallOptions.onCall`:
 * every event that carries `callsMade` reads it from one of these.
 */
export class CallCount {
  private value = 0;

  /** Bound, so it can be handed over as `onCall` as it stands. */
  readonly add = (): void => {
    this.value += 1;
  };

  get count(): number {
    return this.value;
  }

  clear(): void {
    this.value = 0;
  }
}
