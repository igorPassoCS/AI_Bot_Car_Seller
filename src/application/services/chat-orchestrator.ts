import type { SearchCarsInput, SearchCarsResult } from "@/domain/car";
import { env } from "@/config/env";
import { mastra } from "@/mastra";
import type { SessionState } from "@/domain/session-state";
import { sessionStateSchema } from "@/domain/session-state";
import { JsonCarRepository } from "@/infrastructure/repositories/json-car-repository";
import { SearchCarsUseCase } from "@/application/use-cases/search-cars";
import type { SearchIntentState } from "@/domain/search-intent";
import {
  inferContextualCriteriaFromState,
  resolveCriteriaWithState
} from "@/application/services/search-intent-evolution";
import { parseCriteriaFromMessage } from "@/application/services/criteria-parser";
import {
  getSessionState,
  saveSessionState
} from "@/application/services/session-state-store";
import { updateSessionStateMemory } from "@/application/services/conversation-memory";
import { buildFallbackReply } from "@/application/services/sales-reply";

const greetingPattern =
  /^\s*(oi|ola|olá|opa|aoba|e ai|e aí|bom dia|boa tarde|boa noite|hello|hi|hey)\W*$/i;

export type ChatResponse = {
  reply: string;
  result: SearchCarsResult;
  strategy?: {
    scenario:
      | "exact_match"
      | "price_mismatch"
      | "location_mismatch"
      | "no_filtered_match";
    approach:
      | "rapport_and_discovery"
      | "close_now"
      | "value_reframing"
      | "logistics_assurance"
      | "discovery_recovery";
  };
  intentState: SearchIntentState;
};

const buildDiscoveryFallbackReply = (): string => {
  return "Oi! Que bom falar com voce. Para eu te recomendar com precisao, me diga marca/modelo, faixa de preco e cidade de preferencia.";
};

const isGreetingOnly = (
  message: string,
  overrides: Partial<SearchCarsInput>
): boolean => {
  const hasExplicitCriteria = Boolean(
    overrides.brand ||
      overrides.model ||
      overrides.minPrice ||
      overrides.maxPrice ||
      overrides.location
  );
  return greetingPattern.test(message) && !hasExplicitCriteria;
};

const buildEffectiveCriteriaFromSession = async (
  message: string,
  overrides: Partial<SearchCarsInput>,
  sessionState: SessionState
): Promise<Partial<SearchCarsInput>> => {
  const repository = new JsonCarRepository(env.CARS_DATA_PATH);
  const allCars = await repository.getAllCars();

  return resolveCriteriaWithState(
    {
      query: message,
      ...overrides
    },
    {
      query: message,
      ...parseCriteriaFromMessage(allCars, message),
      ...inferContextualCriteriaFromState(message, sessionState)
    },
    sessionState
  );
};

const executeDeterministicSearch = async (
  message: string,
  overrides: Partial<SearchCarsInput>,
  sessionState: SessionState
): Promise<SearchCarsResult> => {
  const effectiveCriteria = await buildEffectiveCriteriaFromSession(
    message,
    overrides,
    sessionState
  );
  const repository = new JsonCarRepository(env.CARS_DATA_PATH);
  const useCase = new SearchCarsUseCase(repository);
  return useCase.execute({
    query: message,
    ...effectiveCriteria
  });
};

export const runSalesConsultant = async (
  message: string,
  overrides: Partial<SearchCarsInput> = {},
  sessionId = "default"
): Promise<ChatResponse> => {
  const workflow = mastra.getWorkflow("carSalesWorkflow");
  const currentState = getSessionState(sessionId);

  try {
    const run = await workflow.createRun({
      resourceId: sessionId
    });
    const execution = await run.start({
      inputData: {
        sessionId,
        message,
        overrides
      },
      initialState: currentState
    });

    if (execution.status === "success") {
      const output = execution.result;
      const nextSessionState = updateSessionStateMemory({
        previousState: currentState,
        userMessage: message,
        assistantReply: output.reply,
        filters: output.effectiveCriteria,
        result: output.result
      });
      saveSessionState(sessionId, nextSessionState);
      return {
        reply: output.reply,
        result: output.result,
        strategy: output.strategy,
        intentState: output.intentState
      };
    }

    const fallbackState = sessionStateSchema.parse(
      execution.state ?? currentState
    );
    saveSessionState(sessionId, fallbackState);

    if (isGreetingOnly(message, overrides)) {
      return {
        reply: buildDiscoveryFallbackReply(),
        result: {
          scenario: "no_filtered_match",
          interpretedCriteria: {},
          suggestions: []
        },
        intentState: fallbackState.intentState
      };
    }

    const fallbackResult = await executeDeterministicSearch(
      message,
      overrides,
      fallbackState
    );
    const fallbackReply = buildFallbackReply(fallbackResult);
    const nextSessionState = updateSessionStateMemory({
      previousState: fallbackState,
      userMessage: message,
      assistantReply: fallbackReply,
      filters: {
        query: message,
        ...fallbackResult.interpretedCriteria
      },
      result: fallbackResult
    });
    saveSessionState(sessionId, nextSessionState);

    return {
      reply: fallbackReply,
      result: fallbackResult,
      intentState: nextSessionState.intentState
    };
  } catch {
    const fallbackState = currentState;
    saveSessionState(sessionId, fallbackState);

    if (isGreetingOnly(message, overrides)) {
      return {
        reply: buildDiscoveryFallbackReply(),
        result: {
          scenario: "no_filtered_match",
          interpretedCriteria: {},
          suggestions: []
        },
        intentState: fallbackState.intentState
      };
    }

    const fallbackResult = await executeDeterministicSearch(
      message,
      overrides,
      fallbackState
    );
    const fallbackReply = buildFallbackReply(fallbackResult);
    const nextSessionState = updateSessionStateMemory({
      previousState: fallbackState,
      userMessage: message,
      assistantReply: fallbackReply,
      filters: {
        query: message,
        ...fallbackResult.interpretedCriteria
      },
      result: fallbackResult
    });
    saveSessionState(sessionId, nextSessionState);

    return {
      reply: fallbackReply,
      result: fallbackResult,
      intentState: nextSessionState.intentState
    };
  }
};
