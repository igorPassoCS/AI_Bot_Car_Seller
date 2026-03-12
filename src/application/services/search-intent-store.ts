import type { SearchIntentState } from "@/domain/search-intent";
import { createInitialSearchIntentState } from "@/domain/search-intent";

const sessionIntentStore = new Map<string, SearchIntentState>();

export const getSearchIntentState = (sessionId: string): SearchIntentState => {
  return sessionIntentStore.get(sessionId) ?? createInitialSearchIntentState();
};

export const saveSearchIntentState = (
  sessionId: string,
  state: SearchIntentState
): void => {
  sessionIntentStore.set(sessionId, state);
};
