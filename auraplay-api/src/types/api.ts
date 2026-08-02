export interface ApiSuccess<T, M extends object = Record<string, never>> {
  success: true;
  data: T;
  meta: M;
}

export interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
    requestId: string;
  };
}

export type ApiResponse<T, M extends object = Record<string, never>> = ApiSuccess<T, M> | ApiError;
