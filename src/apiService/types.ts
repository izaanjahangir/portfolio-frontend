/** Options every apiService function accepts. */
export interface RequestOptions {
  /** Passed through to axios so React Query can cancel in-flight calls. */
  signal?: AbortSignal;
}
