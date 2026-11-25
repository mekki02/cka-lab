/// <reference types="vite/client" />

declare module 'virtual:lessons' {
  export const lessons: Record<
    string,
    { moduleId: string; headings: { depth: 2 | 3; text: string; anchor: string }[] }
  >;
  export const loaders: Record<string, () => Promise<{ default: import('react').ComponentType<{ components?: object }> }>>;
}

declare module 'virtual:lessons-search' {
  export const documents: { id: string; headings: string; text: string }[];
}

declare module '*.mdx' {
  import type { ComponentType } from 'react';
  const Component: ComponentType<{ components?: object }>;
  export default Component;
}

interface Window {
  __APP_CONFIG__?: { APP_NAME?: string; LABS_ENABLED?: string };
}
