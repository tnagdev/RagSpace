export const COLLECTION_COLORS = ['red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink'] as const;
export type CollectionColorToken = (typeof COLLECTION_COLORS)[number];
export const DEFAULT_COLLECTION_COLOR: CollectionColorToken = 'purple';

// Collections created before the palette stored raw CSS colors, which still render as-is.
export function collectionColor(token: string | null | undefined): string {
    if (!token) return 'var(--color-accent-primary)';
    return /^[a-z][a-z0-9-]*$/.test(token) ? `var(--color-collection-${token})` : token;
}
