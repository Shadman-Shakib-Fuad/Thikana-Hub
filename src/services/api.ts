const API_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:5000/api/v1";

export class ApiError extends Error {
  status: number;
  code: string;

  constructor(
    message: string,
    status: number,
    code = "API_ERROR"
  ) {
    super(message);

    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

interface ApiOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
}

export async function apiRequest<T>(
  endpoint: string,
  options: ApiOptions = {}
): Promise<T> {

  let response: Response;

  try {
    response = await fetch(
      `${API_URL}${endpoint}`,
      {
        method: options.method || "GET",

        headers: {
          Accept: "application/json",

          ...(options.body !== undefined
            ? { "Content-Type": "application/json" }
            : {}),
        },

        credentials: "include",

        cache: "no-store",

        ...(options.body !== undefined
          ? {
              body: JSON.stringify(options.body),
            }
          : {}),
      }
    );
  } catch {
    throw new ApiError(
      "Unable to connect to the server. Please check your connection.",
      0,
      "NETWORK_ERROR"
    );
  }

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiError(
      data?.message || "Something went wrong. Please try again.",
      response.status,
      data?.code || "API_ERROR"
    );
  }

  if (!data || data.success !== true) {
    throw new ApiError(
      "Invalid response received from the server.",
      response.status,
      "INVALID_RESPONSE"
    );
  }

  return data as T;
}