import type { SearchCarsInput, SearchCarsResult } from "@/domain/car";
import { env } from "@/config/env";
import { mastra } from "@/mastra";
import { JsonCarRepository } from "@/infrastructure/repositories/json-car-repository";
import { SearchCarsUseCase } from "@/application/use-cases/search-cars";
import type { SearchIntentState } from "@/domain/search-intent";
import { searchIntentStateSchema } from "@/domain/search-intent";
import {
  getSearchIntentState,
  saveSearchIntentState
} from "@/application/services/search-intent-store";
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
    overrides.brand || overrides.model || overrides.maxPrice || overrides.location
  );
  return greetingPattern.test(message) && !hasExplicitCriteria;
};

const executeDeterministicSearch = async (
  message: string,
  overrides: Partial<SearchCarsInput>
): Promise<SearchCarsResult> => {
  const repository = new JsonCarRepository(env.CARS_DATA_PATH);
  const useCase = new SearchCarsUseCase(repository);
  return useCase.execute({
    query: message,
    ...overrides
  });
};

export const runSalesConsultant = async (
  message: string,
  overrides: Partial<SearchCarsInput> = {},
  sessionId = "default"
): Promise<ChatResponse> => {
  const workflow = mastra.getWorkflow("carSalesWorkflow");
  const currentState = getSearchIntentState(sessionId);

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
      saveSearchIntentState(sessionId, output.intentState);
      return {
        reply: output.reply,
        result: output.result,
        strategy: output.strategy,
        intentState: output.intentState
      };
    }

    const fallbackState = searchIntentStateSchema.parse(
      execution.state ?? currentState
    );
    saveSearchIntentState(sessionId, fallbackState);

    if (isGreetingOnly(message, overrides)) {
      return {
        reply: buildDiscoveryFallbackReply(),
        result: {
          scenario: "no_filtered_match",
          interpretedCriteria: {},
          suggestions: []
        },
        intentState: fallbackState
      };
    }

    const fallbackResult = await executeDeterministicSearch(message, overrides);

    return {
      reply: buildFallbackReply(fallbackResult),
      result: fallbackResult,
      intentState: fallbackState
    };
  } catch {
    const fallbackState = currentState;
    saveSearchIntentState(sessionId, fallbackState);

    if (isGreetingOnly(message, overrides)) {
      return {
        reply: buildDiscoveryFallbackReply(),
        result: {
          scenario: "no_filtered_match",
          interpretedCriteria: {},
          suggestions: []
        },
        intentState: fallbackState
      };
    }

    const fallbackResult = await executeDeterministicSearch(message, overrides);

    return {
      reply: buildFallbackReply(fallbackResult),
      result: fallbackResult,
      intentState: fallbackState
    };
  }
};
