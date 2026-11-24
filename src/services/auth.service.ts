import { apiRequest } from "./api";

import type {
  AuthResponse,
  LoginData,
  RegisterData,
} from "@/types/auth";

export const authService = {

  register(data: RegisterData) {
    return apiRequest<AuthResponse>(
      "/auth/register",
      {
        method: "POST",
        body: data,
      }
    );
  },

  login(data: LoginData) {
    return apiRequest<AuthResponse>(
      "/auth/login",
      {
        method: "POST",
        body: data,
      }
    );
  },

  getCurrentUser() {
    return apiRequest<AuthResponse>(
      "/auth/me"
    );
  },

  logout() {
    return apiRequest<{
      success: boolean;
      message: string;
    }>("/auth/logout", {
      method: "POST",
    });
  },

};