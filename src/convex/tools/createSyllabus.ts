// Tool: createSyllabus - Create syllabus entries
import type { ToolDefinition } from './types';
import { api } from '../_generated/api';

export const createSyllabusTool: ToolDefinition = {
	name: 'createSyllabus',
	description:
		'Create a new syllabus entry for a subject and topic. Stores syllabus metadata and content in R2.',
	parameters: {
		type: 'object',
		properties: {
			title: {
				type: 'string',
				description: 'Title of the syllabus entry'
			},
			subjectId: {
				type: 'string',
				description: 'ID of the subject this syllabus belongs to'
			},
			topic: {
				type: 'string',
				description: 'Topic/category of the syllabus'
			},
			body: {
				type: 'string',
				description: 'Full syllabus content (will be stored in R2)'
			},
			exams: {
				type: 'array',
				items: { type: 'string' },
				description: 'List of exam types this syllabus is relevant for (e.g., ["UPSC", "SSC"])',
				default: []
			}
		},
		required: ['title', 'subjectId', 'topic', 'body']
	},
	handler: async (ctx, args, session) => {
		// Use the syllabus insert action which handles admin check internally
		const syllabusId = await ctx.runAction(api.syllabus.insert, {
			title: args.title,
			subjectId: args.subjectId,
			topic: args.topic,
			body: args.body,
			exams: args.exams || []
		});

		return {
			success: true,
			data: {
				id: syllabusId,
				title: args.title,
				topic: args.topic,
				createdBy: session.userId,
				message: 'Syllabus entry created successfully'
			}
		};
	},
	isAdminOnly: true
};
