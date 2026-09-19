/** Shapes shared by every endpoint. */

/** Every backend endpoint wraps its payload in this envelope. */
export interface SuccessResponse<T> {
  success: boolean;
  data: T;
}

export interface HealthData {
  status: string;
  database: string;
}
