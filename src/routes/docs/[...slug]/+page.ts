import { error } from '@sveltejs/kit';
import { getDocBySlug } from '../../../docs/registry';
import type { PageLoad } from './$types';

export const load: PageLoad = ({ params }) => {
	const slug = params.slug;
	const doc = getDocBySlug(slug);

	if (!doc) {
		error(404, 'Documentation page not found');
	}

	return {
		doc,
		headings: doc.headings
	};
};
