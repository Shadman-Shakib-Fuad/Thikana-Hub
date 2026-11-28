import {
  apiRequest,
  ApiError,
  isAndroidApp,
  setMobileSessionToken,
  clearMobileSessionToken,
  hasMobileSession,
} from "./api";

import type { AuthResponse, LoginData, RegisterData } from "@/types/auth";

type LoginResponse = AuthResponse & { sessionToken?: unknown };

export const authService = {
  register(data: RegisterData) {
    return apiRequest<AuthResponse>("/auth/register", {
      method: "POST",
      body: data,
    });
  },

  async login(data: LoginData): Promise<AuthResponse> {
    const response = await apiRequest<LoginResponse>("/auth/login", {
      method: "POST",
      body: data,
    });
    if (isAndroidApp()) setMobileSessionToken(response.sessionToken);

    // Never expose the session token through the React context.
    return {
      success: response.success,
      message: response.message,
      user: response.user,
    };
  },

  async getCurrentUser(): Promise<AuthResponse> {
    if (isAndroidApp() && !hasMobileSession()) {
      throw new ApiError("Please sign in to continue.", 401, "AUTH_REQUIRED");
    }
    return apiRequest<AuthResponse>("/auth/me");
  },

  async logout() {
    const response = await apiRequest<{ success: boolean; message: string }>("/auth/logout", {
      method: "POST",
    });
    if (isAndroidApp()) clearMobileSessionToken();
    return response;
  },
};
