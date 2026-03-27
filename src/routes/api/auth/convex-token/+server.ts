import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.auth?.accessToken) {
		return json({ token: null }, { status: 401 });
	}

	return json({ token: locals.auth.accessToken });
};
