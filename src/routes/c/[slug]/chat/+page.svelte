<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { useConvexClient, useQuery } from 'convex-svelte';
	import type { Id } from '$convex/_generated/dataModel';
	import { api } from '$convex/_generated/api';
	import ChatInterface from '$lib/components/chat/ChatInterface.svelte';
	import { Button } from '$lib/components/ui/button';
	import { LoaderCircle } from '@lucide/svelte';
	import { toast } from 'svelte-sonner';

	type ChatStatus = 'loading' | 'ready' | 'error';

	type CommunityChatMessage = {
		_id: Id<'community_chat_messages'>;
		userId: string;
		userName: string;
		userImage?: string;
		body: string;
		replyTo?: {
			messageId: Id<'community_chat_messages'>;
			userName: string;
			body: string;
			isDeleted: boolean;
		};
		editedAt?: number;
		isDeleted?: boolean;
		createdAt: number;
		reactions: Array<{
			emoji: string;
			count: number;
			reactedByMe: boolean;
			reactors: Array<{ userId: string; userName: string; userImage?: string }>;
		}>;
	};

	const slug = $derived(page.params.slug as string);
	const client = useConvexClient();
	const meQuery = useQuery(api.auth.getCurrentUser, {});
	const redirectTo = $derived(encodeURIComponent(page.url.pathname + page.url.search));
	const currentUserId = $derived(meQuery.data?.id ?? null);
	const isAuthenticated = $derived(!!currentUserId);

	const communityQuery = useQuery((api as any).communities.getBySlug, () => ({ slug }));
	const communityResult = $derived(communityQuery.data);
	const communityId = $derived(
		(communityResult?.community._id as Id<'communities'> | undefined) ?? undefined
	);
	const isMember = $derived(communityResult?.membershipStatus === 'active');
	const canRead = $derived(communityResult?.canRead ?? false);

	const messagesQuery = useQuery((api as any).community_chat.getMessages, () =>
		communityId && isMember
			? {
					communityId,
					limit: 100
				}
			: 'skip'
	);
	const messages = $derived((messagesQuery.data ?? []) as unknown as Array<CommunityChatMessage>);

	let status = $state<ChatStatus>('loading');

	$effect(() => {
		if (!meQuery.isLoading && !meQuery.data) {
			goto(`/signin?redirectTo=${redirectTo}`);
		}
	});

	$effect(() => {
		if (communityQuery.isLoading) {
			status = 'loading';
		} else if (!communityResult || !canRead) {
			status = 'error';
		} else {
			status = 'ready';
		}
	});

	async function requestJoin() {
		if (!communityId) return;
		if (!isAuthenticated) {
			toast.error('Sign in to join this community');
			return;
		}
		try {
			const result = await client.mutation((api as any).communities.requestJoin, {
				communityId
			});
			toast.success(
				result.status === 'active' ? 'Joined community' : 'Join request submitted for review'
			);
		} catch (error: any) {
			toast.error(error?.message ?? 'Failed to request to join');
		}
	}
</script>

<main class="mx-auto flex h-[calc(100vh-3rem)] w-full max-w-3xl flex-col">
	{#if status === 'loading'}
		<div class="flex flex-1 items-center justify-center">
			<LoaderCircle class="h-6 w-6 animate-spin text-muted-foreground" />
		</div>
	{:else if status === 'error'}
		<div class="mx-auto flex max-w-md flex-1 flex-col items-center justify-center text-center">
			<p class="text-sm font-medium text-destructive">
				Community not found or you do not have access.
			</p>
		</div>
	{:else if !communityResult}
		<div class="mx-auto flex max-w-md flex-1 flex-col items-center justify-center text-center">
			<p class="text-sm font-medium text-destructive">Community not found.</p>
		</div>
	{:else}
		<ChatInterface
			messages={messages.map((m) => ({
				_id: m._id,
				senderId: m.userId,
				senderName: m.userName,
				senderImage: m.userImage,
				body: m.body,
				createdAt: m.createdAt,
				replyTo: m.replyTo
					? {
							messageId: m.replyTo.messageId,
							userName: m.replyTo.userName,
							body: m.replyTo.body,
							isDeleted: m.replyTo.isDeleted
						}
					: undefined,
				editedAt: m.editedAt,
				isDeleted: m.isDeleted,
				reactions: m.reactions.map((r) => ({
					emoji: r.emoji,
					count: r.count,
					reactedByMe: r.reactedByMe,
					reactors: r.reactors
				}))
			}))}
			currentUserId={currentUserId ?? ''}
			isLoading={messagesQuery.isLoading}
			onSendMessage={async (body: string, replyToId?: string) => {
				const commId = communityId;
				if (!commId) return;
				try {
					await client.mutation(
						(api as any).community_chat.sendMessage,
						{
							communityId: commId,
							body,
							replyTo: replyToId as Id<'community_chat_messages'> | undefined
						},
						{
							optimisticUpdate: (localStore, args) => {
								const me = localStore.getQuery(api.auth.getCurrentUser, {});
								if (!me) return;

								const queryArgs = { communityId: commId, limit: 100 };
								const existingMessages = localStore.getQuery(
									(api as any).community_chat.getMessages,
									queryArgs
								);
								if (!existingMessages) return;

								let replyToContext = undefined;
								if (args.replyTo) {
									const parent = existingMessages.find((m: any) => m._id === args.replyTo);
									if (parent) {
										replyToContext = {
											messageId: args.replyTo,
											userName: parent.userName,
											body: parent.isDeleted ? 'message deleted' : parent.body,
											isDeleted: !!parent.isDeleted
										};
									}
								}

								const newMessage: any = {
									_id: `temp-${Math.random()}` as any,
									_creationTime: Date.now(),
									communityId: commId,
									userId: me.id,
									userName: me.name,
									userImage: me.image ?? undefined,
									body: args.body,
									replyTo: replyToContext,
									createdAt: Date.now(),
									reactions: [],
									isDeleted: false
								};

								localStore.setQuery((api as any).community_chat.getMessages, queryArgs, [
									...existingMessages,
									newMessage
								]);
							}
						}
					);
				} catch (error) {
					console.error('Failed to send message:', error);
					toast.error('Failed to send message');
					throw error;
				}
			}}
			onEditMessage={async (messageId: string, body: string) => {
				if (!communityId) return;
				try {
					await client.mutation((api as any).community_chat.editMessage, {
						communityId,
						messageId: messageId as Id<'community_chat_messages'>,
						body
					});
				} catch (error) {
					console.error('Failed to edit message:', error);
					toast.error('Failed to edit message');
					throw error;
				}
			}}
			onDeleteMessage={async (messageId: string) => {
				if (!communityId) return;
				try {
					await client.mutation((api as any).community_chat.deleteMessage, {
						communityId,
						messageId: messageId as Id<'community_chat_messages'>
					});
				} catch (error) {
					console.error('Failed to delete message:', error);
					toast.error('Failed to delete message');
					throw error;
				}
			}}
			onToggleReaction={async (messageId: string, emoji: string) => {
				const commId = communityId;
				if (!commId) return;
				try {
					await client.mutation(
						(api as any).community_chat.toggleReaction,
						{
							communityId: commId,
							messageId: messageId as Id<'community_chat_messages'>,
							emoji: emoji as any
						},
						{
							optimisticUpdate: (localStore, args) => {
								const me = localStore.getQuery(api.auth.getCurrentUser, {});
								if (!me) return;

								const queryArgs = { communityId: commId, limit: 100 };
								const existingMessages = localStore.getQuery(
									(api as any).community_chat.getMessages,
									queryArgs
								);
								if (!existingMessages) return;

								const messageIndex = existingMessages.findIndex(
									(m: any) => m._id === args.messageId
								);
								if (messageIndex === -1) return;

								const message = existingMessages[messageIndex];
								const newReactions = JSON.parse(
									JSON.stringify(message.reactions || [])
								) as CommunityChatMessage['reactions'];

								// Check if I already had this specific reaction
								const alreadyHadThisEmoji = newReactions.some(
									(r) => r.emoji === args.emoji && r.reactedByMe
								);

								// 1. Remove me from all reactions
								for (let i = 0; i < newReactions.length; i++) {
									if (newReactions[i].reactedByMe) {
										const updatedReactors = newReactions[i].reactors.filter(
											(r: any) => r.userId !== me.id
										);
										newReactions[i] = {
											...newReactions[i],
											count: newReactions[i].count - 1,
											reactedByMe: false,
											reactors: updatedReactors
										};
									}
								}

								// 2. Add me to the new reaction if I didn't already have it
								if (!alreadyHadThisEmoji) {
									const reactionIndex = newReactions.findIndex((r) => r.emoji === args.emoji);
									if (reactionIndex !== -1) {
										newReactions[reactionIndex] = {
											...newReactions[reactionIndex],
											count: newReactions[reactionIndex].count + 1,
											reactedByMe: true,
											reactors: [
												...newReactions[reactionIndex].reactors,
												{
													userId: me.id as string,
													userName: me.name,
													userImage: me.image ?? undefined
												}
											]
										};
									} else {
										newReactions.push({
											emoji: args.emoji,
											count: 1,
											reactedByMe: true,
											reactors: [
												{
													userId: me.id as string,
													userName: me.name,
													userImage: me.image ?? undefined
												}
											]
										});
									}
								}

								// 3. Filter out empty reactions and update store
								const filteredReactions = newReactions.filter((r) => r.count > 0);
								const newMessages = [...existingMessages];
								newMessages[messageIndex] = {
									...message,
									reactions: filteredReactions
								} as any;

								localStore.setQuery(
									(api as any).community_chat.getMessages,
									queryArgs,
									newMessages as any
								);
							}
						}
					);
				} catch (error) {
					console.error('Failed to update reaction:', error);
					toast.error('Failed to update reaction');
				}
			}}
		>
			{#snippet header()}
				<section
					class="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-3 sm:px-6"
				>
					<div class="min-w-0">
						<h1
							class="truncate text-sm font-semibold tracking-[0.25em] text-muted-foreground/80 uppercase"
						>
							Community Chat
						</h1>
						<p class="mt-0.5 truncate text-sm text-muted-foreground">
							c/{communityResult.community.slug} · {communityResult.community.memberCount} members
						</p>
					</div>
					{#if !isMember}
						<Button size="sm" variant="outline" onclick={requestJoin} disabled={!isAuthenticated}>
							{communityResult.membershipStatus === 'pending' ? 'Request pending' : 'Join to chat'}
						</Button>
					{/if}
				</section>
			{/snippet}
		</ChatInterface>
	{/if}
</main>
