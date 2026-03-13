import type { SessionState } from "@/domain/session-state";
import { createInitialSessionState } from "@/domain/session-state";

const sessionStateStore = new Map<string, SessionState>();

export const getSessionState = (sessionId: string): SessionState => {
  return sessionStateStore.get(sessionId) ?? createInitialSessionState();
};

export const saveSessionState = (
  sessionId: string,
  state: SessionState
): void => {
  sessionStateStore.set(sessionId, state);
};
