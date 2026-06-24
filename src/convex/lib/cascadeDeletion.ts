import type { Doc, Id } from '../_generated/dataModel';
import { deletePostCascadeByDoc, type DeletePostCascadeResult } from './postDeletion';
import {
	deleteCommunityCascadeByDoc,
	type DeleteCommunityCascadeResult
} from './communityDeletion';

const deleteAllByIndex = async (
	ctx: any,
	tableName: string,
	indexName: string,
	getQuery: (q: any) => any
): Promise<number> => {
	let deleted = 0;
	while (true) {
		const batch = await ctx.db.query(tableName).withIndex(indexName, getQuery).take(200);
		if (batch.length === 0) return deleted;
		for (const row of batch) {
			await ctx.db.delete(row._id);
			deleted += 1;
		}
	}
};

const deleteAllByFilter = async (
	ctx: any,
	tableName: string,
	filterFn: (q: any) => any
): Promise<number> => {
	let deleted = 0;
	while (true) {
		const batch = await ctx.db.query(tableName).filter(filterFn).take(200);
		if (batch.length === 0) return deleted;
		for (const row of batch) {
			await ctx.db.delete(row._id);
			deleted += 1;
		}
	}
};

export type DeleteUserCascadeResult = {
	deleted: boolean;
	authId: string;
	profileDeleted: boolean;
	postCount: number;
	commentCount: number;
	voteCount: number;
	followCount: number;
	membershipCount: number;
	subscriptionCount: number;
	knowledgeCellCount: number;
	noteCount: number;
	goalCount: number;
	pathCount: number;
	dmCount: number;
	r2Keys: Array<string>;
};

export const deleteUserCascadeByAuthId = async (
	ctx: any,
	authId: string
): Promise<DeleteUserCascadeResult> => {
	let postCount = 0;
	let commentCount = 0;
	let voteCount = 0;
	let followCount = 0;
	let membershipCount = 0;
	let subscriptionCount = 0;
	let knowledgeCellCount = 0;
	let noteCount = 0;
	let goalCount = 0;
	let pathCount = 0;
	let dmCount = 0;
	const r2Keys: Array<string> = [];

	const profile = await ctx.db
		.query('users_profile')
		.withIndex('by_authId', (q: any) => q.eq('authId', authId))
		.unique();

	const votes = await ctx.db
		.query('post_votes')
		.withIndex('by_userAuthId_and_createdAt', (q: any) => q.eq('userAuthId', authId))
		.collect();
	for (const vote of votes) {
		await ctx.db.delete(vote._id);
		voteCount += 1;
	}

	const commentVotes = await ctx.db
		.query('post_comment_votes')
		.withIndex('by_userAuthId_and_createdAt', (q: any) => q.eq('userAuthId', authId))
		.collect();
	for (const cv of commentVotes) {
		await ctx.db.delete(cv._id);
		voteCount += 1;
	}

	const comments = await ctx.db
		.query('post_comments')
		.withIndex('by_authorAuthId_and_createdAt', (q: any) => q.eq('authorAuthId', authId))
		.collect();
	for (const comment of comments) {
		await ctx.db.delete(comment._id);
		commentCount += 1;
	}

	while (true) {
		const postsBatch = await ctx.db
			.query('posts')
			.withIndex('by_authorAuthId_and_createdAt', (q: any) => q.eq('authorAuthId', authId))
			.take(50);
		if (postsBatch.length === 0) break;
		for (const post of postsBatch) {
			const result: DeletePostCascadeResult = await deletePostCascadeByDoc(ctx, post);
			postCount += 1;
			if (result.r2Key) r2Keys.push(result.r2Key);
		}
	}

	while (true) {
		const followersBatch = await ctx.db
			.query('follows_users')
			.withIndex('by_followerAuthId_and_createdAt', (q: any) => q.eq('followerAuthId', authId))
			.take(200);
		if (followersBatch.length === 0) break;
		for (const f of followersBatch) {
			await ctx.db.delete(f._id);
			followCount += 1;
		}
	}
	while (true) {
		const targetsBatch = await ctx.db
			.query('follows_users')
			.withIndex('by_targetAuthId_and_createdAt', (q: any) => q.eq('targetAuthId', authId))
			.take(200);
		if (targetsBatch.length === 0) break;
		for (const f of targetsBatch) {
			await ctx.db.delete(f._id);
			followCount += 1;
		}
	}

	while (true) {
		const membershipsBatch = await ctx.db
			.query('community_memberships')
			.withIndex('by_userAuthId_and_status', (q: any) => q.eq('userAuthId', authId))
			.take(200);
		if (membershipsBatch.length === 0) break;
		for (const m of membershipsBatch) {
			await ctx.db.delete(m._id);
			membershipCount += 1;
		}
	}

	while (true) {
		const subsBatch = await ctx.db
			.query('source_subscriptions')
			.withIndex('by_userAuthId_and_sourceId_and_updatedAt', (q: any) => q.eq('userAuthId', authId))
			.take(200);
		if (subsBatch.length === 0) break;
		for (const s of subsBatch) {
			await ctx.db.delete(s._id);
			subscriptionCount += 1;
		}
	}

	while (true) {
		const cellsBatch = await ctx.db
			.query('user_knowledge_cells')
			.withIndex('by_userId', (q: any) => q.eq('userId', authId))
			.take(200);
		if (cellsBatch.length === 0) break;
		for (const c of cellsBatch) {
			await ctx.db.delete(c._id);
			knowledgeCellCount += 1;
		}
	}

	while (true) {
		const masteryBatch = await ctx.db
			.query('user_cell_mastery')
			.withIndex('by_userId', (q: any) => q.eq('userId', authId))
			.take(200);
		if (masteryBatch.length === 0) break;
		for (const m of masteryBatch) {
			await ctx.db.delete(m._id);
		}
	}

	while (true) {
		const eventsBatch = await ctx.db
			.query('knowledge_cell_events')
			.withIndex('by_userId', (q: any) => q.eq('userId', authId))
			.take(200);
		if (eventsBatch.length === 0) break;
		for (const e of eventsBatch) {
			await ctx.db.delete(e._id);
		}
	}

	while (true) {
		const remindersBatch = await ctx.db
			.query('knowledge_cell_reminders')
			.withIndex('by_userId_and_nextReviewAt', (q: any) => q.eq('userId', authId))
			.take(200);
		if (remindersBatch.length === 0) break;
		for (const r of remindersBatch) {
			await ctx.db.delete(r._id);
		}
	}

	while (true) {
		const notesBatch = await ctx.db
			.query('knowledge_notes')
			.withIndex('by_userId', (q: any) => q.eq('userId', authId))
			.take(50);
		if (notesBatch.length === 0) break;
		for (const note of notesBatch) {
			if (note.r2Key) r2Keys.push(note.r2Key);
			const contributions = await ctx.db
				.query('knowledge_note_contributions')
				.withIndex('by_noteId', (q: any) => q.eq('noteId', note._id))
				.collect();
			for (const c of contributions) {
				await ctx.db.delete(c._id);
			}
			const blocks = await ctx.db
				.query('knowledge_note_blocks')
				.withIndex('by_noteId', (q: any) => q.eq('noteId', note._id))
				.collect();
			for (const b of blocks) {
				await ctx.db.delete(b._id);
			}
			await ctx.db.delete(note._id);
			noteCount += 1;
		}
	}

	while (true) {
		const goalsBatch = await ctx.db
			.query('learning_goals')
			.withIndex('by_userId', (q: any) => q.eq('userId', authId))
			.take(50);
		if (goalsBatch.length === 0) break;
		for (const goal of goalsBatch) {
			const topics = await ctx.db
				.query('learning_goal_topics')
				.withIndex('by_goalId', (q: any) => q.eq('goalId', goal._id))
				.collect();
			for (const t of topics) {
				await ctx.db.delete(t._id);
			}
			const cells = await ctx.db
				.query('learning_goal_cells')
				.withIndex('by_goalId', (q: any) => q.eq('goalId', goal._id))
				.collect();
			for (const c of cells) {
				await ctx.db.delete(c._id);
			}
			await ctx.db.delete(goal._id);
			goalCount += 1;
		}
	}

	while (true) {
		const pathsBatch = await ctx.db
			.query('knowledge_paths')
			.withIndex('by_userId', (q: any) => q.eq('userId', authId))
			.take(50);
		if (pathsBatch.length === 0) break;
		for (const path of pathsBatch) {
			const steps = await ctx.db
				.query('path_steps')
				.withIndex('by_pathId', (q: any) => q.eq('pathId', path._id))
				.collect();
			for (const s of steps) {
				await ctx.db.delete(s._id);
			}
			await ctx.db.delete(path._id);
			pathCount += 1;
		}
	}

	while (true) {
		const recsBatch = await ctx.db
			.query('knowledge_recommendations')
			.withIndex('by_userId', (q: any) => q.eq('userId', authId))
			.take(200);
		if (recsBatch.length === 0) break;
		for (const r of recsBatch) {
			await ctx.db.delete(r._id);
		}
	}

	while (true) {
		const convos = await ctx.db
			.query('dm_participants')
			.withIndex('by_userAuthId_and_lastMessageAt', (q: any) => q.eq('userAuthId', authId))
			.take(200);
		if (convos.length === 0) break;
		for (const p of convos) {
			await ctx.db.delete(p._id);
			dmCount += 1;
		}
	}

	while (true) {
		const chatMsgs = await ctx.db
			.query('community_chat_messages')
			.withIndex('by_userAuthId_and_createdAt', (q: any) => q.eq('userAuthId', authId))
			.take(200);
		if (chatMsgs.length === 0) break;
		for (const m of chatMsgs) {
			await ctx.db.delete(m._id);
		}
	}

	while (true) {
		const chatReactions = await ctx.db
			.query('community_chat_reactions')
			.withIndex('by_userAuthId_and_createdAt', (q: any) => q.eq('userAuthId', authId))
			.take(200);
		if (chatReactions.length === 0) break;
		for (const r of chatReactions) {
			await ctx.db.delete(r._id);
		}
	}

	while (true) {
		const dmReactions = await ctx.db
			.query('dm_reactions')
			.withIndex('by_userAuthId_and_createdAt', (q: any) => q.eq('userAuthId', authId))
			.take(200);
		if (dmReactions.length === 0) break;
		for (const r of dmReactions) {
			await ctx.db.delete(r._id);
		}
	}

	while (true) {
		const cursors = await ctx.db
			.query('dm_read_cursors')
			.withIndex('by_conversationId_and_userAuthId', (q: any) => q.eq('userAuthId', authId))
			.take(200);
		if (cursors.length === 0) break;
		for (const c of cursors) {
			await ctx.db.delete(c._id);
		}
	}

	while (true) {
		const agentRuns = await ctx.db
			.query('agent_runs')
			.withIndex('by_userId', (q: any) => q.eq('userId', authId))
			.take(200);
		if (agentRuns.length === 0) break;
		for (const r of agentRuns) {
			if (r.outputR2Key) r2Keys.push(r.outputR2Key);
			await ctx.db.delete(r._id);
		}
	}

	const exclusions = await ctx.db
		.query('similar_links_domain_exclusions')
		.withIndex('by_userAuthId_and_updatedAt', (q: any) => q.eq('userAuthId', authId))
		.collect();
	for (const e of exclusions) {
		await ctx.db.delete(e._id);
	}

	const collectionFollows = await ctx.db
		.query('source_collection_follows')
		.withIndex('by_userAuthId_and_createdAt', (q: any) => q.eq('userAuthId', authId))
		.collect();
	for (const f of collectionFollows) {
		await ctx.db.delete(f._id);
	}

	while (true) {
		const extractions = await ctx.db
			.query('knowledge_extraction_jobs')
			.withIndex('by_userId_and_startedAt', (q: any) => q.eq('userId', authId))
			.take(200);
		if (extractions.length === 0) break;
		for (const j of extractions) {
			await ctx.db.delete(j._id);
		}
	}

	while (true) {
		const candidates = await ctx.db
			.query('knowledge_extracted_candidates')
			.withIndex('by_userId_and_createdAt', (q: any) => q.eq('userId', authId))
			.take(200);
		if (candidates.length === 0) break;
		for (const c of candidates) {
			await ctx.db.delete(c._id);
		}
	}

	if (profile) {
		await ctx.db.delete(profile._id);
	}

	return {
		deleted: true,
		authId,
		profileDeleted: !!profile,
		postCount,
		commentCount,
		voteCount,
		followCount,
		membershipCount,
		subscriptionCount,
		knowledgeCellCount,
		noteCount,
		goalCount,
		pathCount,
		dmCount,
		r2Keys
	};
};

export type DeleteKnowledgeCellCascadeResult = {
	deleted: boolean;
	cellId: Id<'knowledge_cells'>;
	versionCount: number;
	claimCount: number;
	citationCount: number;
	relationshipCount: number;
	r2Key?: string;
};

export const deleteKnowledgeCellCascadeByCellId = async (
	ctx: any,
	cellId: Id<'knowledge_cells'>
): Promise<DeleteKnowledgeCellCascadeResult> => {
	const cell = await ctx.db.get(cellId);
	if (!cell) {
		return {
			deleted: false,
			cellId,
			versionCount: 0,
			claimCount: 0,
			citationCount: 0,
			relationshipCount: 0
		};
	}

	let versionCount = 0;
	while (true) {
		const batch = await ctx.db
			.query('knowledge_cell_versions')
			.withIndex('by_cellId', (q: any) => q.eq('cellId', cellId))
			.take(200);
		if (batch.length === 0) break;
		for (const r of batch) {
			await ctx.db.delete(r._id);
			versionCount += 1;
		}
	}

	let claimCount = 0;
	while (true) {
		const claimsBatch = await ctx.db
			.query('knowledge_claims')
			.withIndex('by_cellId', (q: any) => q.eq('cellId', cellId))
			.take(200);
		if (claimsBatch.length === 0) break;
		for (const claim of claimsBatch) {
			while (true) {
				const evidence = await ctx.db
					.query('claim_evidence')
					.withIndex('by_claimId', (q: any) => q.eq('claimId', claim._id))
					.take(200);
				if (evidence.length === 0) break;
				for (const e of evidence) {
					await ctx.db.delete(e._id);
				}
			}
			while (true) {
				const assessments = await ctx.db
					.query('claim_assessments')
					.withIndex('by_claimId', (q: any) => q.eq('claimId', claim._id))
					.take(200);
				if (assessments.length === 0) break;
				for (const a of assessments) {
					await ctx.db.delete(a._id);
				}
			}
			await ctx.db.delete(claim._id);
			claimCount += 1;
		}
	}

	let citationCount = 0;
	while (true) {
		const batch = await ctx.db
			.query('knowledge_cell_citations')
			.withIndex('by_cellId', (q: any) => q.eq('cellId', cellId))
			.take(200);
		if (batch.length === 0) break;
		for (const r of batch) {
			await ctx.db.delete(r._id);
			citationCount += 1;
		}
	}

	let relationshipCount = 0;
	while (true) {
		const batch = await ctx.db
			.query('knowledge_cell_relationships')
			.withIndex('by_sourceCellId', (q: any) => q.eq('sourceCellId', cellId))
			.take(200);
		if (batch.length === 0) break;
		for (const r of batch) {
			await ctx.db.delete(r._id);
			relationshipCount += 1;
		}
	}
	while (true) {
		const batch = await ctx.db
			.query('knowledge_cell_relationships')
			.withIndex('by_targetCellId', (q: any) => q.eq('targetCellId', cellId))
			.take(200);
		if (batch.length === 0) break;
		for (const r of batch) {
			await ctx.db.delete(r._id);
			relationshipCount += 1;
		}
	}

	while (true) {
		const batch = await ctx.db
			.query('knowledge_cell_origins')
			.withIndex('by_cellId', (q: any) => q.eq('cellId', cellId))
			.take(200);
		if (batch.length === 0) break;
		for (const r of batch) {
			await ctx.db.delete(r._id);
		}
	}

	while (true) {
		const batch = await ctx.db
			.query('knowledge_cell_quality')
			.withIndex('by_cellId', (q: any) => q.eq('cellId', cellId))
			.take(100);
		if (batch.length === 0) break;
		for (const r of batch) {
			await ctx.db.delete(r._id);
		}
	}

	while (true) {
		const batch = await ctx.db
			.query('knowledge_cell_metrics')
			.withIndex('by_cellId', (q: any) => q.eq('cellId', cellId))
			.take(100);
		if (batch.length === 0) break;
		for (const r of batch) {
			await ctx.db.delete(r._id);
		}
	}

	while (true) {
		const batch = await ctx.db
			.query('knowledge_views')
			.withIndex('by_cellId', (q: any) => q.eq('cellId', cellId))
			.take(100);
		if (batch.length === 0) break;
		for (const r of batch) {
			await ctx.db.delete(r._id);
		}
	}

	while (true) {
		const batch = await ctx.db
			.query('knowledge_cell_embeddings')
			.withIndex('by_cellId', (q: any) => q.eq('cellId', cellId))
			.take(100);
		if (batch.length === 0) break;
		for (const r of batch) {
			await ctx.db.delete(r._id);
		}
	}

	while (true) {
		const batch = await ctx.db
			.query('knowledge_cell_events')
			.withIndex('by_cellId', (q: any) => q.eq('cellId', cellId))
			.take(200);
		if (batch.length === 0) break;
		for (const r of batch) {
			await ctx.db.delete(r._id);
		}
	}

	while (true) {
		const batch = await ctx.db
			.query('knowledge_cell_reminders')
			.withIndex('by_cellId', (q: any) => q.eq('cellId', cellId))
			.take(200);
		if (batch.length === 0) break;
		for (const r of batch) {
			await ctx.db.delete(r._id);
		}
	}

	while (true) {
		const batch = await ctx.db
			.query('knowledge_cell_entity_links')
			.withIndex('by_cellId', (q: any) => q.eq('cellId', cellId))
			.take(200);
		if (batch.length === 0) break;
		for (const r of batch) {
			await ctx.db.delete(r._id);
		}
	}

	while (true) {
		const batch = await ctx.db
			.query('knowledge_cell_perspective_embeddings')
			.withIndex('by_cellId', (q: any) => q.eq('cellId', cellId))
			.take(100);
		if (batch.length === 0) break;
		for (const r of batch) {
			await ctx.db.delete(r._id);
		}
	}

	while (true) {
		const batch = await ctx.db
			.query('knowledge_cell_confidence')
			.withIndex('by_cellId', (q: any) => q.eq('cellId', cellId))
			.take(100);
		if (batch.length === 0) break;
		for (const r of batch) {
			await ctx.db.delete(r._id);
		}
	}

	while (true) {
		const batch = await ctx.db
			.query('knowledge_cell_assessments')
			.withIndex('by_cellId', (q: any) => q.eq('cellId', cellId))
			.take(200);
		if (batch.length === 0) break;
		for (const r of batch) {
			await ctx.db.delete(r._id);
		}
	}

	while (true) {
		const batch = await ctx.db
			.query('user_knowledge_cells')
			.withIndex('by_userId_and_cellId', (q: any) => q.eq('cellId', cellId))
			.take(200);
		if (batch.length === 0) break;
		for (const r of batch) {
			await ctx.db.delete(r._id);
		}
	}

	while (true) {
		const batch = await ctx.db
			.query('user_cell_mastery')
			.withIndex('by_userId_and_cellId', (q: any) => q.eq('cellId', cellId))
			.take(200);
		if (batch.length === 0) break;
		for (const r of batch) {
			await ctx.db.delete(r._id);
		}
	}

	while (true) {
		const batch = await ctx.db
			.query('knowledge_note_contributions')
			.withIndex('by_cellId', (q: any) => q.eq('cellId', cellId))
			.take(200);
		if (batch.length === 0) break;
		for (const r of batch) {
			await ctx.db.delete(r._id);
		}
	}

	while (true) {
		const batch = await ctx.db
			.query('learning_goal_cells')
			.withIndex('by_cellId', (q: any) => q.eq('cellId', cellId))
			.take(200);
		if (batch.length === 0) break;
		for (const r of batch) {
			await ctx.db.delete(r._id);
		}
	}

	while (true) {
		const batch = await ctx.db
			.query('path_steps')
			.withIndex('by_cellId', (q: any) => q.eq('cellId', cellId))
			.take(200);
		if (batch.length === 0) break;
		for (const r of batch) {
			await ctx.db.delete(r._id);
		}
	}

	while (true) {
		const batch = await ctx.db
			.query('knowledge_recommendations')
			.withIndex('by_recommendedCellId', (q: any) => q.eq('recommendedCellId', cellId))
			.take(200);
		if (batch.length === 0) break;
		for (const r of batch) {
			await ctx.db.delete(r._id);
		}
	}

	while (true) {
		const batch = await ctx.db
			.query('conflict_cases')
			.withIndex('by_cellAId', (q: any) => q.eq('cellAId', cellId))
			.take(200);
		if (batch.length === 0) break;
		for (const r of batch) {
			await ctx.db.delete(r._id);
		}
	}
	while (true) {
		const batch = await ctx.db
			.query('conflict_cases')
			.withIndex('by_cellBId', (q: any) => q.eq('cellBId', cellId))
			.take(200);
		if (batch.length === 0) break;
		for (const r of batch) {
			await ctx.db.delete(r._id);
		}
	}

	await ctx.db.delete(cellId);

	return {
		deleted: true,
		cellId,
		versionCount,
		claimCount,
		citationCount,
		relationshipCount,
		r2Key: cell.r2Key
	};
};

export type DeleteInformationSourceCascadeResult = {
	deleted: boolean;
	sourceId: Id<'information_sources'>;
	versionCount: number;
	jobCount: number;
	candidateCount: number;
	noteCount: number;
};

export const deleteInformationSourceCascade = async (
	ctx: any,
	sourceId: Id<'information_sources'>
): Promise<DeleteInformationSourceCascadeResult> => {
	const source = await ctx.db.get(sourceId);
	if (!source) {
		return {
			deleted: false,
			sourceId,
			versionCount: 0,
			jobCount: 0,
			candidateCount: 0,
			noteCount: 0
		};
	}

	let versionCount = 0;
	while (true) {
		const batch = await ctx.db
			.query('source_versions')
			.withIndex('by_sourceId', (q: any) => q.eq('sourceId', sourceId))
			.take(200);
		if (batch.length === 0) break;
		for (const r of batch) {
			await ctx.db.delete(r._id);
			versionCount += 1;
		}
	}

	let jobCount = 0;
	while (true) {
		const batch = await ctx.db
			.query('knowledge_extraction_jobs')
			.withIndex('by_sourceId', (q: any) => q.eq('sourceId', sourceId))
			.take(200);
		if (batch.length === 0) break;
		for (const r of batch) {
			await ctx.db.delete(r._id);
			jobCount += 1;
		}
	}

	let candidateCount = 0;
	while (true) {
		const batch = await ctx.db
			.query('knowledge_extracted_candidates')
			.withIndex('by_sourceId', (q: any) => q.eq('sourceId', sourceId))
			.take(200);
		if (batch.length === 0) break;
		for (const candidate of batch) {
			while (true) {
				const citations = await ctx.db
					.query('knowledge_candidate_citations')
					.withIndex('by_candidateId', (q: any) => q.eq('candidateId', candidate._id))
					.take(200);
				if (citations.length === 0) break;
				for (const c of citations) {
					await ctx.db.delete(c._id);
				}
			}
			while (true) {
				const rels = await ctx.db
					.query('knowledge_candidate_relationships')
					.withIndex('by_sourceCandidateId', (q: any) => q.eq('sourceCandidateId', candidate._id))
					.take(200);
				if (rels.length === 0) break;
				for (const r of rels) {
					await ctx.db.delete(r._id);
				}
			}
			while (true) {
				const vers = await ctx.db
					.query('knowledge_candidate_versions')
					.withIndex('by_candidateId', (q: any) => q.eq('candidateId', candidate._id))
					.take(200);
				if (vers.length === 0) break;
				for (const v of vers) {
					await ctx.db.delete(v._id);
				}
			}
			while (true) {
				const votes = await ctx.db
					.query('knowledge_candidate_votes')
					.withIndex('by_candidateId', (q: any) => q.eq('candidateId', candidate._id))
					.take(200);
				if (votes.length === 0) break;
				for (const v of votes) {
					await ctx.db.delete(v._id);
				}
			}
			await ctx.db.delete(candidate._id);
			candidateCount += 1;
		}
	}

	while (true) {
		const batch = await ctx.db
			.query('source_quality_assessments')
			.withIndex('by_sourceId', (q: any) => q.eq('sourceId', sourceId))
			.take(200);
		if (batch.length === 0) break;
		for (const r of batch) {
			await ctx.db.delete(r._id);
		}
	}

	let noteCount = 0;
	while (true) {
		const batch = await ctx.db
			.query('knowledge_notes')
			.withIndex('by_sourceId', (q: any) => q.eq('sourceId', sourceId))
			.take(50);
		if (batch.length === 0) break;
		for (const note of batch) {
			if (note.r2Key) {
			}
			const contribs = await ctx.db
				.query('knowledge_note_contributions')
				.withIndex('by_noteId', (q: any) => q.eq('noteId', note._id))
				.collect();
			for (const c of contribs) {
				await ctx.db.delete(c._id);
			}
			const blocks = await ctx.db
				.query('knowledge_note_blocks')
				.withIndex('by_noteId', (q: any) => q.eq('noteId', note._id))
				.collect();
			for (const b of blocks) {
				await ctx.db.delete(b._id);
			}
			await ctx.db.delete(note._id);
			noteCount += 1;
		}
	}

	await ctx.db.delete(sourceId);

	return {
		deleted: true,
		sourceId,
		versionCount,
		jobCount,
		candidateCount,
		noteCount
	};
};

export type DeleteKnowledgeNoteCascadeResult = {
	deleted: boolean;
	noteId: Id<'knowledge_notes'>;
	contributionCount: number;
	blockCount: number;
	r2Key?: string;
};

export const deleteKnowledgeNoteCascade = async (
	ctx: any,
	noteId: Id<'knowledge_notes'>
): Promise<DeleteKnowledgeNoteCascadeResult> => {
	const note = await ctx.db.get(noteId);
	if (!note) {
		return {
			deleted: false,
			noteId,
			contributionCount: 0,
			blockCount: 0
		};
	}

	let contributionCount = 0;
	while (true) {
		const batch = await ctx.db
			.query('knowledge_note_contributions')
			.withIndex('by_noteId', (q: any) => q.eq('noteId', noteId))
			.take(200);
		if (batch.length === 0) break;
		for (const r of batch) {
			await ctx.db.delete(r._id);
			contributionCount += 1;
		}
	}

	let blockCount = 0;
	while (true) {
		const batch = await ctx.db
			.query('knowledge_note_blocks')
			.withIndex('by_noteId', (q: any) => q.eq('noteId', noteId))
			.take(200);
		if (batch.length === 0) break;
		for (const r of batch) {
			await ctx.db.delete(r._id);
			blockCount += 1;
		}
	}

	await ctx.db.delete(noteId);

	return {
		deleted: true,
		noteId,
		contributionCount,
		blockCount,
		r2Key: note.r2Key
	};
};

export type DeleteDomainCascadeResult = {
	deleted: boolean;
	domainId: Id<'knowledge_domains'>;
	topicLinkCount: number;
};

export const deleteDomainCascade = async (
	ctx: any,
	domainId: Id<'knowledge_domains'>
): Promise<DeleteDomainCascadeResult> => {
	const domain = await ctx.db.get(domainId);
	if (!domain) {
		return {
			deleted: false,
			domainId,
			topicLinkCount: 0
		};
	}

	let topicLinkCount = 0;
	while (true) {
		const batch = await ctx.db
			.query('domain_topics')
			.withIndex('by_domainId', (q: any) => q.eq('domainId', domainId))
			.take(200);
		if (batch.length === 0) break;
		for (const r of batch) {
			await ctx.db.delete(r._id);
			topicLinkCount += 1;
		}
	}

	await ctx.db.delete(domainId);

	return {
		deleted: true,
		domainId,
		topicLinkCount
	};
};

export type DeleteEntityCascadeResult = {
	deleted: boolean;
	entityId: Id<'knowledge_entities'>;
	relationshipCount: number;
	cellLinkCount: number;
};

export const deleteEntityCascade = async (
	ctx: any,
	entityId: Id<'knowledge_entities'>
): Promise<DeleteEntityCascadeResult> => {
	const entity = await ctx.db.get(entityId);
	if (!entity) {
		return {
			deleted: false,
			entityId,
			relationshipCount: 0,
			cellLinkCount: 0
		};
	}

	let relationshipCount = 0;
	while (true) {
		const batch = await ctx.db
			.query('knowledge_entity_relationships')
			.withIndex('by_sourceEntityId', (q: any) => q.eq('sourceEntityId', entityId))
			.take(200);
		if (batch.length === 0) break;
		for (const r of batch) {
			await ctx.db.delete(r._id);
			relationshipCount += 1;
		}
	}
	while (true) {
		const batch = await ctx.db
			.query('knowledge_entity_relationships')
			.withIndex('by_targetEntityId', (q: any) => q.eq('targetEntityId', entityId))
			.take(200);
		if (batch.length === 0) break;
		for (const r of batch) {
			await ctx.db.delete(r._id);
			relationshipCount += 1;
		}
	}

	let cellLinkCount = 0;
	while (true) {
		const batch = await ctx.db
			.query('knowledge_cell_entity_links')
			.withIndex('by_entityId', (q: any) => q.eq('entityId', entityId))
			.take(200);
		if (batch.length === 0) break;
		for (const r of batch) {
			await ctx.db.delete(r._id);
			cellLinkCount += 1;
		}
	}

	await ctx.db.delete(entityId);

	return {
		deleted: true,
		entityId,
		relationshipCount,
		cellLinkCount
	};
};

export type DeleteGoalCascadeResult = {
	deleted: boolean;
	goalId: Id<'learning_goals'>;
	topicCount: number;
	cellCount: number;
};

export const deleteGoalCascade = async (
	ctx: any,
	goalId: Id<'learning_goals'>
): Promise<DeleteGoalCascadeResult> => {
	const goal = await ctx.db.get(goalId);
	if (!goal) {
		return {
			deleted: false,
			goalId,
			topicCount: 0,
			cellCount: 0
		};
	}

	let topicCount = 0;
	while (true) {
		const batch = await ctx.db
			.query('learning_goal_topics')
			.withIndex('by_goalId', (q: any) => q.eq('goalId', goalId))
			.take(200);
		if (batch.length === 0) break;
		for (const r of batch) {
			await ctx.db.delete(r._id);
			topicCount += 1;
		}
	}

	let cellCount = 0;
	while (true) {
		const batch = await ctx.db
			.query('learning_goal_cells')
			.withIndex('by_goalId', (q: any) => q.eq('goalId', goalId))
			.take(200);
		if (batch.length === 0) break;
		for (const r of batch) {
			await ctx.db.delete(r._id);
			cellCount += 1;
		}
	}

	while (true) {
		const batch = await ctx.db
			.query('knowledge_recommendations')
			.withIndex('by_goalId', (q: any) => q.eq('goalId', goalId))
			.take(200);
		if (batch.length === 0) break;
		for (const r of batch) {
			await ctx.db.delete(r._id);
		}
	}

	await ctx.db.delete(goalId);

	return {
		deleted: true,
		goalId,
		topicCount,
		cellCount
	};
};

export type DeletePathCascadeResult = {
	deleted: boolean;
	pathId: Id<'knowledge_paths'>;
	stepCount: number;
};

export const deletePathCascade = async (
	ctx: any,
	pathId: Id<'knowledge_paths'>
): Promise<DeletePathCascadeResult> => {
	const path = await ctx.db.get(pathId);
	if (!path) {
		return {
			deleted: false,
			pathId,
			stepCount: 0
		};
	}

	let stepCount = 0;
	while (true) {
		const batch = await ctx.db
			.query('path_steps')
			.withIndex('by_pathId', (q: any) => q.eq('pathId', pathId))
			.take(200);
		if (batch.length === 0) break;
		for (const r of batch) {
			await ctx.db.delete(r._id);
			stepCount += 1;
		}
	}

	while (true) {
		const batch = await ctx.db
			.query('knowledge_recommendations')
			.withIndex('by_pathId', (q: any) => q.eq('pathId', pathId))
			.take(200);
		if (batch.length === 0) break;
		for (const r of batch) {
			await ctx.db.delete(r._id);
		}
	}

	await ctx.db.delete(pathId);

	return {
		deleted: true,
		pathId,
		stepCount
	};
};

export { deleteCommunityCascadeByDoc, type DeleteCommunityCascadeResult };
