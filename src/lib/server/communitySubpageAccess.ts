import { PUBLIC_CONVEX_URL } from '$env/static/public';
import { api } from '$convex/_generated/api';
import { ConvexHttpClient } from 'convex/browser';
import { redirect } from '@sveltejs/kit';

export const redirectGuestFromPublicCommunitySubpage = async ({
	accessToken,
	slug
}: {
	accessToken?: string;
	slug: string;
}) => {
	const client = accessToken
		? new ConvexHttpClient(PUBLIC_CONVEX_URL, { auth: accessToken })
		: new ConvexHttpClient(PUBLIC_CONVEX_URL);
	const community = await client.query((api as any).communities.getBySlug, { slug });

	if (!community) {
		return;
	}

	if (!accessToken && community.community.visibility === 'public') {
		throw redirect(302, `/c/${slug}`);
	}
};
