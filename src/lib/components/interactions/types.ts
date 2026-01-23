export interface Comment {
	_id: string;
	userId: string;
	userName?: string;
	body: string;
	parentId?: string;
	createdAt: number;
	likes: number;
	dislikes: number;
	userReaction: 'like' | 'dislike' | null;
	children?: Comment[];
}

export interface FlatComment {
	_id: string;
	userId: string;
	userName?: string;
	body: string;
	parentId?: string;
	createdAt: number;
	likes: number;
	dislikes: number;
	userReaction: 'like' | 'dislike' | null;
}
