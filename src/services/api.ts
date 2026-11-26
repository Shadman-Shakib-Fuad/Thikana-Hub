const API_URL = (
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:5000/api/v1"
).replace(/\/+$/, "");

// =====================================
// API ERROR CLASS
// =====================================

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

// =====================================
// API OPTIONS
// =====================================

export interface ApiOptions {
  method?:
    | "GET"
    | "POST"
    | "PUT"
    | "PATCH"
    | "DELETE";

  body?: unknown;

  headers?: Record<string, string>;
}

// =====================================
// AUTHENTICATED API REQUEST
// =====================================

export async function apiRequest<T>(
  endpoint: string,
  options: ApiOptions = {}
): Promise<T> {
  const headers = new Headers({
    Accept: "application/json",
  });

  if (options.body !== undefined) {
    headers.set(
      "Content-Type",
      "application/json"
    );
  }

  for (const [key, value] of Object.entries(
    options.headers ?? {}
  )) {
    headers.set(key, value);
  }

  let response: Response;

  try {
    response = await fetch(
      `${API_URL}${endpoint}`,
      {
        method: options.method ?? "GET",

        credentials: "include",

        cache: "no-store",

        signal: AbortSignal.timeout(45000),

        redirect: "error",

        headers,

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

  let data: Record<string, unknown>;

  try {
    const parsed: unknown = await response.json();

    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      throw new Error("Invalid response");
    }

    data = parsed as Record<string, unknown>;
  } catch {
    throw new ApiError(
      "The server returned an invalid response.",
      response.status,
      "INVALID_RESPONSE"
    );
  }

  if (
    !response.ok ||
    data.success !== true
  ) {
    throw new ApiError(
      typeof data.message === "string"
        ? data.message
        : "The request could not be completed.",

      response.status,

      typeof data.code === "string"
        ? data.code
        : "API_ERROR"
    );
  }

  return data as T;
}