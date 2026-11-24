/** Only allow redirects to paths on this site after login (no open redirect via ?next=). */
export const safeNext = (next: string | null): string =>
  next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
