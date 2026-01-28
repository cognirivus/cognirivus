import { v } from 'convex/values';
import { action, mutation, query } from './_generated/server';
import { api } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { authComponent } from './auth';
import { r2 } from './lib/r2';

const checkAdmin = async (ctx: any) => {
	const user = await authComponent.getAuthUser(ctx);
	const isAdmin =
		user?.role && (Array.isArray(user.role) ? user.role.includes('admin') : user.role === 'admin');
	if (!isAdmin) throw new Error('Unauthorized: Admin access required');
	return user;
};

export const insertMetadata = mutation({
	args: {
		title: v.string(),
		snippet: v.string(),
		r2Key: v.optional(v.string()),
		subjectId: v.id('subjects'),
		topic: v.string(),
		exams: v.array(v.string())
	},
	handler: async (ctx, args) => {
		await checkAdmin(ctx);
		return await ctx.db.insert('syllabus', {
			...args,
			createdAt: Date.now()
		});
	}
});

export const insert = action({
	args: {
		title: v.string(),
		body: v.string(),
		subjectId: v.id('subjects'),
		topic: v.string(),
		exams: v.array(v.string())
	},
	handler: async (ctx, args): Promise<Id<'syllabus'>> => {
		const r2Key = `syllabus/${Date.now()}-${Math.random().toString(36).substring(2, 9)}.txt`;

		await r2.store(ctx, new Blob([args.body], { type: 'text/plain' }), {
			key: r2Key,
			type: 'text/plain'
		});

		const { body, ...rest } = args;
		return await ctx.runMutation(api.syllabus.insertMetadata, {
			...rest,
			snippet: body.substring(0, 500),
			r2Key
		});
	}
});

export const updateMetadata = mutation({
	args: {
		id: v.id('syllabus'),
		title: v.string(),
		snippet: v.string(),
		r2Key: v.optional(v.string()),
		subjectId: v.id('subjects'),
		topic: v.string(),
		exams: v.array(v.string())
	},
	handler: async (ctx, args) => {
		await checkAdmin(ctx);
		const { id, ...updates } = args;
		await ctx.db.patch(id, updates);
		return id;
	}
});

export const update = action({
	args: {
		id: v.id('syllabus'),
		title: v.string(),
		body: v.string(),
		subjectId: v.id('subjects'),
		topic: v.string(),
		exams: v.array(v.string())
	},
	handler: async (ctx, args): Promise<Id<'syllabus'>> => {
		const item = await ctx.runQuery(api.syllabus.getById, { id: args.id });
		if (!item) throw new Error('Syllabus item not found');

		let r2Key = item.r2Key;
		if (!r2Key) {
			r2Key = `syllabus/${args.id}-${Date.now()}.txt`;
		}

		await r2.store(ctx, new Blob([args.body], { type: 'text/plain' }), {
			key: r2Key,
			type: 'text/plain'
		});

		const { id, body, ...updates } = args;
		return await ctx.runMutation(api.syllabus.updateMetadata, {
			id,
			...updates,
			snippet: body.substring(0, 500),
			r2Key
		});
	}
});

export const remove = mutation({
	args: { id: v.id('syllabus') },
	handler: async (ctx, args) => {
		await checkAdmin(ctx);

		const item = await ctx.db.get(args.id);
		if (item?.r2Key) {
			await r2.deleteObject(ctx, item.r2Key);
		}

		await ctx.db.delete(args.id);
		return args.id;
	}
});

export const removeBulk = mutation({
	args: { ids: v.array(v.id('syllabus')) },
	handler: async (ctx, args) => {
		await checkAdmin(ctx);

		for (const id of args.ids) {
			const item = await ctx.db.get(id);
			if (item?.r2Key) {
				await r2.deleteObject(ctx, item.r2Key);
			}
			await ctx.db.delete(id);
		}

		return args.ids;
	}
});

export const list = query({
	args: {
		limit: v.optional(v.number())
	},
	handler: async (ctx, args) => {
		const items = await ctx.db
			.query('syllabus')
			.order('desc')
			.take(args.limit ?? 100);

		return await Promise.all(
			items.map(async (item) => {
				const subject = await ctx.db.get(item.subjectId);

				let bodyUrl = null;
				if (item.r2Key) {
					bodyUrl = await r2.getUrl(item.r2Key);
				}

				return {
					...item,
					body: item.snippet,
					bodyUrl,
					subject
				};
			})
		);
	}
});

export const getById = query({
	args: { id: v.id('syllabus') },
	handler: async (ctx, args) => {
		const item = await ctx.db.get(args.id);
		if (!item) return null;

		let bodyUrl = null;
		if (item.r2Key) {
			bodyUrl = await r2.getUrl(item.r2Key);
		}

		const subject = await ctx.db.get(item.subjectId);
		return {
			...item,
			bodyUrl,
			body: item.snippet,
			subject
		};
	}
});
