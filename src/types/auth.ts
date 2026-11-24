export type UserRole =
  | "merchant"
  | "reviewer"
  | "data_manager"
  | "admin";

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: string;
  createdAt: string;
}

export interface LoginData {
  email: string;
  password: string;
}

export interface RegisterData {
  name: string;
  email: string;
  password: string;
}

export interface AuthResponse {
  success: boolean;
  message?: string;
  user: User;
}

export const ROLE_LABELS: Record<UserRole, string> = {
  merchant: "Merchant",
  reviewer: "Address Reviewer",
  data_manager: "Data Manager",
  admin: "System Administrator",
};