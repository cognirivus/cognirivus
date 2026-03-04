import { v } from 'convex/values';
import { internalMutation, query } from './_generated/server';
import { requireAdminUser } from './lib/adminAuth';

const securitySeverityValidator = v.union(
	v.literal('info'),
	v.literal('warn'),
	v.literal('error'),
	v.literal('critical')
);

const adminAuditStatusValidator = v.union(
	v.literal('started'),
	v.literal('succeeded'),
	v.literal('failed')
);

export const logEvent = internalMutation({
	args: {
		eventType: v.string(),
		severity: securitySeverityValidator,
		surface: v.string(),
		message: v.string(),
		actorAuthId: v.optional(v.string()),
		entityType: v.optional(v.string()),
		entityId: v.optional(v.string()),
		metadata: v.optional(v.string())
	},
	returns: v.id('security_events'),
	handler: async (ctx, args) => {
		return await ctx.db.insert('security_events', {
			eventType: args.eventType.slice(0, 120),
			severity: args.severity,
			surface: args.surface.slice(0, 200),
			message: args.message.slice(0, 1000),
			actorAuthId: args.actorAuthId,
			entityType: args.entityType?.slice(0, 80),
			entityId: args.entityId?.slice(0, 200),
			metadata: args.metadata?.slice(0, 4000),
			createdAt: Date.now()
		});
	}
});

export const logAdminAuditEvent = internalMutation({
	args: {
		actorAuthId: v.string(),
		action: v.string(),
		targetType: v.string(),
		targetId: v.string(),
		status: adminAuditStatusValidator,
		details: v.optional(v.string())
	},
	returns: v.id('admin_audit_logs'),
	handler: async (ctx, args) => {
		return await ctx.db.insert('admin_audit_logs', {
			actorAuthId: args.actorAuthId,
			action: args.action.slice(0, 120),
			targetType: args.targetType.slice(0, 80),
			targetId: args.targetId.slice(0, 200),
			status: args.status,
			details: args.details?.slice(0, 4000),
			createdAt: Date.now()
		});
	}
});

const securityEventRowValidator = v.object({
	_id: v.id('security_events'),
	eventType: v.string(),
	severity: securitySeverityValidator,
	surface: v.string(),
	message: v.string(),
	actorAuthId: v.optional(v.string()),
	entityType: v.optional(v.string()),
	entityId: v.optional(v.string()),
	metadata: v.optional(v.string()),
	createdAt: v.number()
});

export const listRecentEvents = query({
	args: {
		limit: v.optional(v.number())
	},
	returns: v.array(securityEventRowValidator),
	handler: async (ctx, args) => {
		await requireAdminUser(ctx);
		const limit = Math.min(200, Math.max(1, Math.floor(args.limit ?? 50)));
		const rows = await ctx.db
			.query('security_events')
			.withIndex('by_createdAt')
			.order('desc')
			.take(limit);
		return rows.map((row) => ({
			_id: row._id,
			eventType: row.eventType,
			severity: row.severity,
			surface: row.surface,
			message: row.message,
			actorAuthId: row.actorAuthId,
			entityType: row.entityType,
			entityId: row.entityId,
			metadata: row.metadata,
			createdAt: row.createdAt
		}));
	}
});
