"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";

import { authService } from "@/services/auth.service";
import { ApiError } from "@/services/api";

import type {
  User,
  LoginData,
  RegisterData,
} from "@/types/auth";

type AuthStatus =
  | "loading"
  | "authenticated"
  | "anonymous"
  | "error";

interface AuthContextType {
  user: User | null;
  status: AuthStatus;
  error: string;
  isAuthenticated: boolean;

  login: (data: LoginData) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext =
  createContext<AuthContextType | undefined>(undefined);

async function restoreSession() {
  try {
    const response = await authService.getCurrentUser();

    return {
      user: response.user,
      status: "authenticated" as const,
      error: "",
    };

  } catch (error) {

    if (error instanceof ApiError && error.status === 401) {
      return {
        user: null,
        status: "anonymous" as const,
        error: "",
      };
    }

    return {
      user: null,
      status: "error" as const,
      error: "Unable to verify your session. Please try again.",
    };
  }
}

export function AuthProvider({
  children,
}: {
  children: ReactNode;
}) {

  const [user, setUser] = useState<User | null>(null);

  const [status, setStatus] =
    useState<AuthStatus>("loading");

  const [error, setError] = useState("");

  // Restore existing session on application startup
  useEffect(() => {

    let active = true;

    restoreSession().then((result) => {

      if (!active) return;

      setUser(result.user);
      setStatus(result.status);
      setError(result.error);

    });

    return () => {
      active = false;
    };

  }, []);

  const refreshUser = useCallback(async () => {

    setStatus("loading");

    const result = await restoreSession();

    setUser(result.user);
    setStatus(result.status);
    setError(result.error);

  }, []);

  async function register(data: RegisterData) {
    await authService.register(data);
  }

  async function login(data: LoginData) {

    const response = await authService.login(data);

    setUser(response.user);
    setStatus("authenticated");
    setError("");

  }

  async function logout() {

    await authService.logout();

    setUser(null);
    setStatus("anonymous");
    setError("");

  }

  return (
    <AuthContext.Provider
      value={{
        user,
        status,
        error,

        isAuthenticated:
          status === "authenticated",

        login,
        register,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {

  const context = useContext(AuthContext);

  if (!context) {
    throw new Error(
      "useAuth must be used inside AuthProvider"
    );
  }

  return context;
}