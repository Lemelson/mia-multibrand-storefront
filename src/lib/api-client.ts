/**
 * Centralized API client for frontend fetch calls.
 *
 * Provides consistent error handling, JSON parsing, and type helpers.
 */

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly issues?: string[]
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface ApiResponse<T> {
  data: T;
  status: number;
}

async function parseErrorResponse(response: Response): Promise<ApiError> {
  try {
    const payload = (await response.json()) as { message?: string; issues?: string[] };
    const message = payload?.issues?.length
      ? `${payload.message ?? "Ошибка"}: ${payload.issues.join("; ")}`
      : payload?.message ?? `Ошибка ${response.status}`;
    return new ApiError(response.status, message, payload?.issues);
  } catch {
    return new ApiError(response.status, `Ошибка ${response.status}`);
  }
}

async function request<T>(
  url: string,
  options?: RequestInit
): Promise<ApiResponse<T>> {
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers
    }
  });

  if (!response.ok) {
    throw await parseErrorResponse(response);
  }

  const data = (await response.json()) as T;
  return { data, status: response.status };
}

export const api = {
  get<T>(url: string): Promise<ApiResponse<T>> {
    return request<T>(url);
  },

  post<T>(url: string, body: unknown, headers?: Record<string, string>): Promise<ApiResponse<T>> {
    return request<T>(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body)
    });
  },

  patch<T>(url: string, body: unknown): Promise<ApiResponse<T>> {
    return request<T>(url, {
      method: "PATCH",
      body: JSON.stringify(body)
    });
  },

  delete<T = { success: boolean }>(url: string): Promise<ApiResponse<T>> {
    return request<T>(url, { method: "DELETE" });
  }
};
