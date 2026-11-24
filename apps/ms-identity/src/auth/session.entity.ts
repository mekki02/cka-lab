import { Column, CreateDateColumn, Entity, Index, ManyToOne, JoinColumn, PrimaryGeneratedColumn } from 'typeorm';
import { User } from '../users/user.entity';

/**
 * One row per login. The refresh token the browser holds is
 * `<session id>.<random secret>`; only a SHA-256 of the secret is stored, so a
 * database leak does not hand out live sessions.
 *
 * Rotation: every refresh replaces the secret. The previous hash is kept for a
 * short grace period so two tabs refreshing at the same moment do not log the
 * user out; presenting an older secret after that is treated as token theft
 * and revokes the session.
 */
@Entity({ name: 'sessions' })
export class Session {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  @Column({ name: 'refresh_hash', type: 'char', length: 64 })
  refreshHash: string;

  @Column({ name: 'previous_refresh_hash', type: 'char', length: 64, nullable: true })
  previousRefreshHash: string | null;

  @Column({ name: 'rotated_at', type: 'timestamptz', nullable: true })
  rotatedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'last_used_at', type: 'timestamptz' })
  lastUsedAt: Date;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  @Column({ name: 'user_agent', type: 'varchar', length: 255, nullable: true })
  userAgent: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  ip: string | null;
}
