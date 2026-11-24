/**
 * Heading -> URL fragment. Used both by the build-time lesson index
 * (vite-plugins/lessons-content.ts) and by the rendered headings, so the
 * table of contents always links to real anchors.
 */
export const anchorOf = (text: string): string =>
  text
    .toLowerCase()
    .replace(/`/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
