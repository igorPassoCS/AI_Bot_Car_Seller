// Este arquivo coordena o workflow principal e o fallback deterministicos da API.
import type { SearchCarsInput, SearchCarsResult } from "@/domain/car";
import { env } from "@/config/env";
import { mastra } from "@/mastra";
import type { SessionState } from "@/domain/session-state";
import { sessionStateSchema } from "@/domain/session-state";
import { JsonCarRepository } from "@/infrastructure/repositories/json-car-repository";
import { SearchCarsUseCase } from "@/application/use-cases/search-cars";
import type { SearchIntentState } from "@/domain/search-intent";
import {
  intentParsingSchema,
  normalizeIntentParsing,
} from "@/application/services/search-intent-evolution";
import {
  getSessionState,
  saveSessionState
} from "@/application/services/session-state-store";
import { updateSessionStateMemory } from "@/application/services/conversation-memory";
import { buildFallbackReply } from "@/application/services/sales-reply";
import { resolveSearchRequestFromState } from "@/application/services/search-request-resolution";

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

// Resposta curta usada quando so existe saudacao e ainda faltam criterios.
const buildDiscoveryFallbackReply = (): string => {
  return "Oi! Que bom falar com voce. Para eu te recomendar com precisao, me diga marca/modelo, faixa de preco e cidade de preferencia.";
};

// Detecta quando a mensagem e apenas uma saudacao sem pedido de busca.
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

// Resolve criterios finais sem depender do sucesso do workflow principal.
const buildEffectiveCriteriaFromSession = async (
  message: string,
  overrides: Partial<SearchCarsInput>,
  sessionState: SessionState
): Promise<ReturnType<typeof resolveSearchRequestFromState>> => {
  const repository = new JsonCarRepository(env.CARS_DATA_PATH);
  const allCars = await repository.getAllCars();
  const parsedIntent = normalizeIntentParsing({
    message,
    hasHistory: sessionState.intentState.turns > 0,
    state: sessionState,
    parsedIntent: intentParsingSchema.parse({
      normalizedMessage: message,
      criteria: {
        ...overrides
      },
      behaviorSignals: {
        locationPreference: "unchanged",
        budgetPreference: "unchanged"
      }
    })
  });

  return resolveSearchRequestFromState({
    cars: allCars,
    message,
    overrides,
    parsedIntent,
    state: sessionState
  });
};

// Executa uma busca local consistente para os cenarios de fallback operacional.
const executeDeterministicSearch = async (
  message: string,
  overrides: Partial<SearchCarsInput>,
  sessionState: SessionState
): Promise<{
  resolution: ReturnType<typeof resolveSearchRequestFromState>;
  result: SearchCarsResult;
}> => {
  const resolution = await buildEffectiveCriteriaFromSession(
    message,
    overrides,
    sessionState
  );
  if (resolution.missingRelativeAnchor) {
    return {
      resolution,
      result: {
        scenario: "no_filtered_match",
        interpretedCriteria: {
          brand: resolution.effectiveCriteria.brand,
          model: resolution.effectiveCriteria.model,
          minPrice: resolution.effectiveCriteria.minPrice,
          maxPrice: resolution.effectiveCriteria.maxPrice,
          location: resolution.effectiveCriteria.location
        },
        suggestions: []
      }
    };
  }
  const repository = new JsonCarRepository(env.CARS_DATA_PATH);
  const useCase = new SearchCarsUseCase(repository);
  const result = await useCase.execute({
    query: message,
    ...resolution.effectiveCriteria
  });
  return {
    resolution,
    result
  };
};

// Orquestra a conversa completa entre workflow, memoria e fallback deterministico.
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
      const workflowState = sessionStateSchema.parse(
        execution.state ?? currentState
      );
      const nextSessionState = updateSessionStateMemory({
        previousState: workflowState,
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

    const fallbackExecution = await executeDeterministicSearch(
      message,
      overrides,
      fallbackState
    );
    const fallbackReply = buildFallbackReply(fallbackExecution.result);
    const nextSessionState = updateSessionStateMemory({
      previousState: sessionStateSchema.parse({
        ...fallbackState,
        currentFilters: {
          query: fallbackExecution.resolution.effectiveCriteria.query,
          brand: fallbackExecution.resolution.effectiveCriteria.brand,
          model: fallbackExecution.resolution.effectiveCriteria.model,
          location: fallbackExecution.resolution.effectiveCriteria.location,
          minPrice: fallbackExecution.resolution.effectiveCriteria.minPrice,
          maxPrice: fallbackExecution.resolution.effectiveCriteria.maxPrice,
          limit: fallbackExecution.resolution.effectiveCriteria.limit
        },
        filterMeta: fallbackExecution.resolution.filterMeta
      }),
      userMessage: message,
      assistantReply: fallbackReply,
      filters: fallbackExecution.resolution.effectiveCriteria,
      result: fallbackExecution.result
    });
    saveSessionState(sessionId, nextSessionState);

    return {
      reply: fallbackReply,
      result: fallbackExecution.result,
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

    const fallbackExecution = await executeDeterministicSearch(
      message,
      overrides,
      fallbackState
    );
    const fallbackReply = buildFallbackReply(fallbackExecution.result);
    const nextSessionState = updateSessionStateMemory({
      previousState: sessionStateSchema.parse({
        ...fallbackState,
        currentFilters: {
          query: fallbackExecution.resolution.effectiveCriteria.query,
          brand: fallbackExecution.resolution.effectiveCriteria.brand,
          model: fallbackExecution.resolution.effectiveCriteria.model,
          location: fallbackExecution.resolution.effectiveCriteria.location,
          minPrice: fallbackExecution.resolution.effectiveCriteria.minPrice,
          maxPrice: fallbackExecution.resolution.effectiveCriteria.maxPrice,
          limit: fallbackExecution.resolution.effectiveCriteria.limit
        },
        filterMeta: fallbackExecution.resolution.filterMeta
      }),
      userMessage: message,
      assistantReply: fallbackReply,
      filters: fallbackExecution.resolution.effectiveCriteria,
      result: fallbackExecution.result
    });
    saveSessionState(sessionId, nextSessionState);

    return {
      reply: fallbackReply,
      result: fallbackExecution.result,
      intentState: nextSessionState.intentState
    };
  }
};
