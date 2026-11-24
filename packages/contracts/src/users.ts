import type { Role } from './auth';

export type UserStatus = 'INVITED' | 'ACTIVE' | 'DISABLED';

export interface UserDto {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  status: UserStatus;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface InviteUserRequest {
  email: string;
  displayName: string;
  role: Role;
}

/**
 * A one-time link the admin copies and sends through whatever channel they
 * like. The raw token exists only in this response — the database stores a
 * hash — so it cannot be shown again; issue a new one instead.
 */
export interface OneTimeLinkResponse {
  user: UserDto;
  link: string;
  expiresAt: string;
}

export interface UpdateUserRequest {
  displayName?: string;
  role?: Role;
  status?: Exclude<UserStatus, 'INVITED'>;
}
