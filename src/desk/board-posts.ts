import {
  deskBoardPostsSchema,
  interestAnswerSchema,
  type DeskBoardPost,
  type DeskInterest,
} from "../../shared/bulk.ts";
import type { Api } from "../api/api.ts";

export type BoardPosts = {
  load(signal: AbortSignal): Promise<void>;
  answer(postId: string, note: string | null): void;
  posts(): readonly DeskBoardPost[];
  city(): string | null;
  loaded(): boolean;
  sending(postId: string): boolean;
  failure(postId: string): unknown;
  subscribe(listener: () => void): () => void;
};

type Sending = { interest: DeskInterest; count: number };

// The request board of her city, with her answers. **I can do this** shows
// at once; when the server cannot take it, her earlier answer comes back
// and the failure says why. A refresh does not undo an answer on its way.
export function createBoardPosts({
  api,
  now = Date.now,
  sounds,
}: {
  api: Pick<Api, "get" | "send">;
  now?: () => number;
  sounds?: { commit(): void; error(): void };
}): BoardPosts {
  const listeners = new Set<() => void>();
  const sending = new Map<string, Sending>();
  const failures = new Map<string, unknown>();
  let posts: DeskBoardPost[] = [];
  let city: string | null = null;
  let loaded = false;

  const emit = () => {
    for (const listener of listeners) listener();
  };
  const settle = (postId: string, interest: DeskInterest | undefined) => {
    const entry = sending.get(postId);
    if (entry === undefined) return;
    entry.count -= 1;
    if (entry.count === 0) sending.delete(postId);
    if (interest !== undefined) {
      posts = posts.map((post) =>
        post.id === postId ? { ...post, interest } : post,
      );
    }
  };

  return {
    async load(signal) {
      const answer = await api.get(
        "/api/desk/board-posts",
        deskBoardPostsSchema,
        {
          signal,
        },
      );
      posts = answer.posts;
      city = answer.city;
      loaded = true;
      emit();
    },
    answer(postId, note) {
      const interest: DeskInterest = {
        note,
        note_language: null,
        created_at: now(),
      };
      const entry = sending.get(postId);
      if (entry === undefined) sending.set(postId, { interest, count: 1 });
      else {
        entry.interest = interest;
        entry.count += 1;
      }
      failures.delete(postId);
      emit();
      api
        .send(
          "POST",
          `/api/desk/board-posts/${encodeURIComponent(postId)}/interest`,
          { note },
          interestAnswerSchema,
        )
        .then(
          (answer) => {
            failures.delete(postId);
            settle(postId, answer.interest);
            sounds?.commit();
          },
          (error: unknown) => {
            failures.set(postId, error);
            settle(postId, undefined);
            sounds?.error();
          },
        )
        .finally(emit);
    },
    posts: () =>
      posts.map((post) => {
        const entry = sending.get(post.id);
        return entry === undefined
          ? post
          : { ...post, interest: entry.interest };
      }),
    city: () => city,
    loaded: () => loaded,
    sending: (postId) => sending.has(postId),
    failure: (postId) => failures.get(postId),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
