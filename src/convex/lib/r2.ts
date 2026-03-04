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

const getR2Config = () => r2.config;
const getR2Component = () => r2.component;

export const deleteR2ObjectOnly = async (ctx: any, key: string) => {
	const component = getR2Component();
	const config = getR2Config();
	await ctx.runAction(component.lib.deleteR2Object, {
		key,
		...config
	});
};

export const deleteR2MetadataOnly = async (ctx: any, key: string) => {
	const component = getR2Component();
	const config = getR2Config();
	await ctx.runMutation(component.lib.deleteMetadata, {
		bucket: config.bucket,
		key
	});
};
