import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import type { Role, UserDto, UserStatus } from '@cka/contracts';

@Entity({ name: 'users' })
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Always stored lower-cased; the unique index enforces one account per address. */
  @Column({ type: 'varchar', length: 254, unique: true })
  email: string;

  @Column({ name: 'display_name', type: 'varchar', length: 100 })
  displayName: string;

  /** Null until the invitation is accepted. Argon2id encoded hash. */
  @Column({ name: 'password_hash', type: 'text', nullable: true, select: false })
  passwordHash: string | null;

  @Column({ type: 'varchar', length: 16 })
  role: Role;

  @Column({ type: 'varchar', length: 16 })
  status: UserStatus;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @Column({ name: 'last_login_at', type: 'timestamptz', nullable: true })
  lastLoginAt: Date | null;
}

export const toUserDto = (u: User): UserDto => ({
  id: u.id,
  email: u.email,
  displayName: u.displayName,
  role: u.role,
  status: u.status,
  createdAt: u.createdAt.toISOString(),
  lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
});
