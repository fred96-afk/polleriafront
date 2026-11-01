export interface LoginRequest {
  email?: string | null;
  password?: string | null;
}

export interface UserRequest {
  name?: string | null;
  email?: string | null;
  password?: string | null;
  roleId: number;
}

export interface User {
  id: number;
  name: string;
  email: string;
  passwordHash: string;
  roleId: number;
  isVerified: boolean;
  verificationToken?: string | null;
  passwordResetToken?: string | null;
  passwordResetTokenExpiresAt?: string | null;
}

export interface AuthUser {
  id?: number | string | null;
  name?: string | null;
  email?: string | null;
  role?: string | null;
  roleId?: number | null;
  clientId?: number | null;
  permissions?: string[];
  [key: string]: any;
}

export interface AuthResponse {
  token?: string;
  user?: AuthUser;
  role?: string;
  permissions?: string[];
}

export interface ForgotPasswordRequest {
  email?: string | null;
}

export interface ResetPasswordRequest {
  token?: string | null;
  newPassword?: string | null;
}
