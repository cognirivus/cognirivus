import { R2 } from '@convex-dev/r2';
import { components } from '../_generated/api';

/**
 * R2 Component Client
 * Use this in your actions to store, get URLs, or delete objects.
 */
export const r2 = new R2(components.r2);

/**
 * Client API for frontend uploads.
 * Exports mutations for generating upload URLs and syncing metadata.
 */
export const { generateUploadUrl, syncMetadata } = r2.clientApi();
