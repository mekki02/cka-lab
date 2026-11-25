/** Runtime settings injected by /config.js (container env), with defaults. */
export const APP_NAME = window.__APP_CONFIG__?.APP_NAME?.trim() || 'CKA Lab';
/**
 * Browser terminals with a per-student cluster (ms-labs). Off unless the
 * deployment says so; on by default in `npm run dev`.
 */
export const LABS_ENABLED = (window.__APP_CONFIG__?.LABS_ENABLED ?? (import.meta.env.DEV ? 'true' : 'false')) === 'true';
