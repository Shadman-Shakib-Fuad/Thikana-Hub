const API_URL = (
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:5000/api/v1"
).replace(/\/+$/, "");

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
  method?:
    | "GET"
    | "POST"
    | "PUT"
    | "PATCH"
    | "DELETE";

  body?: unknown;
}

export async function apiRequest<T>(
  endpoint: string,
  options: ApiOptions = {}
): Promise<T> {
  const method = options.method || "GET";

  let response: Response;

  try {
    response = await fetch(
      `${API_URL}${endpoint}`,
      {
        method,

        credentials: "include",

        cache: "no-store",

        headers: {
          Accept: "application/json",

          ...(options.body !== undefined
            ? { "Content-Type": "application/json" }
            : {}),
        },

        ...(options.body !== undefined
          ? { body: JSON.stringify(options.body) }
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

  let data: {
    success?: boolean;
    code?: string;
    message?: string;
  };

  try {
    data = await response.json();

    if (!data || typeof data !== "object") {
      throw new Error("Invalid response");
    }

  } catch {
    throw new ApiError(
      "The server returned an invalid response.",
      response.status,
      "INVALID_RESPONSE"
    );
  }

  if (!response.ok || data.success !== true) {
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