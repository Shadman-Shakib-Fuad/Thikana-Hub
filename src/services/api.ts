import { Capacitor } from "@capacitor/core";

const WEB_API_URL = (
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api/v1"
).replace(/\/+$/, "");
const MOBILE_API_URL = "https://thikanahub-api.onrender.com/api/v1";

export class ApiError extends Error {
  status: number;
  code: string;

  constructor(message: string, status: number, code = "API_ERROR") {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export function isAndroidApp(): boolean {
  return typeof window !== "undefined" && Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

// Mobile session tokens remain in memory, never localStorage.
let mobileSessionToken: string | null = null;

export function setMobileSessionToken(token: unknown): void {
  if (!isAndroidApp()) return;
  if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token)) {
    mobileSessionToken = null;
    throw new ApiError("The server returned an invalid mobile session.", 500, "INVALID_MOBILE_SESSION");
  }
  mobileSessionToken = token;
}

export function clearMobileSessionToken(): void {
  mobileSessionToken = null;
}

export function hasMobileSession(): boolean {
  return mobileSessionToken !== null;
}

export interface ApiOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  headers?: Record<string, string>;
}

export async function apiRequest<T>(endpoint: string, options: ApiOptions = {}): Promise<T> {
  const mobile = isAndroidApp();
  const apiUrl = mobile ? MOBILE_API_URL : WEB_API_URL;
  const headers = new Headers({ Accept: "application/json" });
  if (options.body !== undefined) headers.set("Content-Type", "application/json");
  for (const [key, value] of Object.entries(options.headers ?? {})) {
    headers.set(key, value);
  }

  const requestToken = mobile ? mobileSessionToken : null;
  if (mobile) {
    headers.delete("Authorization");
    if (requestToken) headers.set("Authorization", `Bearer ${requestToken}`);
  }

  // Preserve the existing Vercel same-origin proxy behavior.
  const suffixIndex = endpoint.search(/[?#]/);
  const path = suffixIndex === -1 ? endpoint : endpoint.slice(0, suffixIndex);
  const suffix = suffixIndex === -1 ? "" : endpoint.slice(suffixIndex);
  const requestUrl = apiUrl === "/api/v1"
    ? `${apiUrl}${path.replace(/\/+$/, "")}/${suffix}`
    : `${apiUrl}${endpoint}`;

  let response: Response;
  try {
    response = await fetch(requestUrl, {
      method: options.method ?? "GET",
      credentials: mobile ? "omit" : "include",
      cache: "no-store",
      signal: AbortSignal.timeout(45000),
      redirect: "error",
      headers,
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    });
  } catch {
    throw new ApiError("Unable to connect to the server. Please check your connection.", 0, "NETWORK_ERROR");
  }

  // Do not clear a newer session in response to an older request.
  if (mobile && response.status === 401 && requestToken && mobileSessionToken === requestToken) {
    clearMobileSessionToken();
  }

  let data: Record<string, unknown>;
  try {
    const parsed: unknown = await response.json();
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error("Invalid response");
    }
    data = parsed as Record<string, unknown>;
  } catch {
    throw new ApiError("The server returned an invalid response.", response.status, "INVALID_RESPONSE");
  }

  if (!response.ok || data.success !== true) {
    throw new ApiError(
      typeof data.message === "string" ? data.message : "The request could not be completed.",
      response.status,
      typeof data.code === "string" ? data.code : "API_ERROR"
    );
  }
  return data as T;
}
