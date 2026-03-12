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
      | "close_now"
      | "value_reframing"
      | "logistics_assurance"
      | "discovery_recovery";
  };
  intentState: SearchIntentState;
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

    const fallbackResult = await executeDeterministicSearch(message, overrides);
    const fallbackState = searchIntentStateSchema.parse(
      execution.state ?? currentState
    );
    saveSearchIntentState(sessionId, fallbackState);

    return {
      reply: buildFallbackReply(fallbackResult),
      result: fallbackResult,
      intentState: fallbackState
    };
  } catch {
    const fallbackResult = await executeDeterministicSearch(message, overrides);
    const fallbackState = currentState;
    saveSearchIntentState(sessionId, fallbackState);

    return {
      reply: buildFallbackReply(fallbackResult),
      result: fallbackResult,
      intentState: fallbackState
    };
  }
};
