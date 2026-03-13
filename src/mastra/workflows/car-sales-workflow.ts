import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";
import { env } from "@/config/env";
import { imageSourceSchema } from "@/domain/car";
import { sessionStateSchema } from "@/domain/session-state";
import { JsonCarRepository } from "@/infrastructure/repositories/json-car-repository";
import { researcherAgent } from "@/mastra/agents/researcher-agent";
import { closerAgent } from "@/mastra/agents/closer-agent";
import { searchCarsTool } from "@/mastra/tools/search-cars-tool";
import {
  evolveSearchIntentState,
  inferContextualCriteriaFromState,
  intentParsingSchema,
  missingFieldSchema,
  normalizeIntentParsing,
  resolveCriteriaWithState,
  shouldRunInventorySearch
} from "@/application/services/search-intent-evolution";
import { parseCriteriaFromMessage } from "@/application/services/criteria-parser";
import { searchIntentStateSchema } from "@/domain/search-intent";
import { buildFallbackReply } from "@/application/services/sales-reply";

const searchCriteriaSchema = z.object({
  query: z.string().optional(),
  brand: z.string().optional(),
  model: z.string().optional(),
  minPrice: z.number().positive().optional(),
  maxPrice: z.number().positive().optional(),
  location: z.string().optional(),
  limit: z.number().int().min(1).max(8).optional()
});

const workflowInputSchema = z.object({
  sessionId: z.string().min(1),
  message: z.string().min(1),
  overrides: searchCriteriaSchema.optional()
});

const strategySchema = z.object({
  scenario: z.enum([
    "exact_match",
    "price_mismatch",
    "location_mismatch",
    "no_filtered_match"
  ]),
  approach: z.enum([
    "rapport_and_discovery",
    "close_now",
    "value_reframing",
    "logistics_assurance",
    "discovery_recovery"
  ])
});

const workflowSearchResultSchema = z.object({
  scenario: z.enum([
    "exact_match",
    "price_mismatch",
    "location_mismatch",
    "no_filtered_match"
  ]),
  interpretedCriteria: z.object({
    brand: z.string().optional(),
    model: z.string().optional(),
    minPrice: z.number().optional(),
    maxPrice: z.number().optional(),
    location: z.string().optional()
  }),
  suggestions: z.array(
    z.object({
      car: z.object({
        name: z.string(),
        model: z.string(),
        image: imageSourceSchema,
        price: z.number(),
        location: z.string()
      }),
      matchType: z.enum([
        "exact_match",
        "price_mismatch",
        "location_mismatch",
        "partial_match"
      ]),
      sellingPoints: z.array(z.string())
    })
  )
});

const workflowOutputSchema = z.object({
  reply: z.string().min(1),
  result: workflowSearchResultSchema,
  effectiveCriteria: searchCriteriaSchema,
  strategy: strategySchema,
  intentState: searchIntentStateSchema,
  parsedIntent: intentParsingSchema
});

const intentParsingOutputSchema = z.object({
  sessionId: z.string(),
  message: z.string(),
  overrides: searchCriteriaSchema.optional(),
  parsedIntent: intentParsingSchema
});

const dataRetrievalOutputSchema = z.object({
  sessionId: z.string(),
  message: z.string(),
  parsedIntent: intentParsingSchema,
  effectiveCriteria: searchCriteriaSchema,
  result: workflowSearchResultSchema
});

const strategySelectionOutputSchema = z.object({
  sessionId: z.string(),
  message: z.string(),
  parsedIntent: intentParsingSchema,
  effectiveCriteria: searchCriteriaSchema,
  result: workflowSearchResultSchema,
  strategy: strategySchema,
  intentState: searchIntentStateSchema
});

const buildDiscoveryReply = (
  missingFields: Array<z.infer<typeof missingFieldSchema>>
): string => {
  const questionByField: Record<z.infer<typeof missingFieldSchema>, string> = {
    brand: "Tem alguma marca de preferencia?",
    model: "Ja tem algum modelo em mente?",
    maxPrice: "Qual faixa de preco voce quer considerar?",
    location: "Em qual cidade voce prefere encontrar o carro?"
  };

  const selected = (missingFields.length > 0
    ? missingFields
    : (["brand", "maxPrice", "location"] as const)
  ).slice(0, 2);

  const questions = selected.map((field) => questionByField[field]).join(" ");

  return `Oi! Que bom falar com voce. Posso te ajudar a encontrar a melhor opcao sem pressa. ${questions}`.trim();
};

const intentParsingStep = createStep({
  id: "intent-parsing",
  inputSchema: workflowInputSchema,
  outputSchema: intentParsingOutputSchema,
  execute: async ({ inputData, state }) => {
    const currentState = sessionStateSchema.parse(state ?? {});
    const prompt = `
Interprete a mensagem do usuario para busca de carros.
Retorne somente os campos do schema estruturado solicitado.
Classifique:
- intentType: greeting, search ou refinement
- needsMoreInfo: true quando faltarem informacoes para seguir com recomendacao segura
- missingFields: lista com brand, model, maxPrice e location ausentes
- Se o usuario disser "mais caro que esse", "mais barato que esse", "acima desse" ou equivalente,
  use o Current State para preencher criteria.minPrice ou criteria.maxPrice com base no lastViewedCar.price.
- Preserve os filtros atuais quando o usuario estiver refinando a busca, a menos que ele troque marca,
  modelo, cidade ou faixa de preco explicitamente.

Mensagem do usuario:
${inputData.message}

Current State:
${JSON.stringify(currentState, null, 2)}
`;

    try {
      const generation = await researcherAgent.generate(prompt, {
        structuredOutput: {
          schema: intentParsingSchema
        }
      });

      const parsedIntent = normalizeIntentParsing({
        message: inputData.message,
        parsedIntent: intentParsingSchema.parse(generation.object),
        hasHistory: currentState.intentState.turns > 0
      });

      return {
        sessionId: inputData.sessionId,
        message: inputData.message,
        overrides: inputData.overrides,
        parsedIntent
      };
    } catch {
      return {
        sessionId: inputData.sessionId,
        message: inputData.message,
        overrides: inputData.overrides,
        parsedIntent: normalizeIntentParsing({
          message: inputData.message,
          hasHistory: currentState.intentState.turns > 0,
          parsedIntent: intentParsingSchema.parse({
            normalizedMessage: inputData.message,
            criteria: {
              ...inferContextualCriteriaFromState(inputData.message, currentState),
              ...inputData.overrides
            },
            behaviorSignals: {
              locationPreference: "unchanged",
              budgetPreference: "unchanged"
            }
          })
        })
      };
    }
  }
});

const dataRetrievalStep = createStep({
  id: "data-retrieval",
  inputSchema: intentParsingOutputSchema,
  outputSchema: dataRetrievalOutputSchema,
  execute: async ({ inputData, state }) => {
    const currentState = sessionStateSchema.parse(state ?? {});
    const repository = new JsonCarRepository(env.CARS_DATA_PATH);
    const allCars = await repository.getAllCars();
    const inferredCriteria = parseCriteriaFromMessage(allCars, inputData.message);
    const normalizedParsedCriteria = {
      query: inputData.message,
      ...inferredCriteria,
      ...inferContextualCriteriaFromState(inputData.message, currentState),
      ...inputData.parsedIntent.criteria
    };

    const effectiveCriteria = resolveCriteriaWithState(
      {
        query: inputData.message,
        ...(inputData.overrides ?? {})
      },
      normalizedParsedCriteria,
      currentState
    );
    const shouldSkipRetrieval = !shouldRunInventorySearch({
      message: inputData.message,
      parsedIntent: inputData.parsedIntent,
      effectiveCriteria,
      state: currentState
    });

    if (shouldSkipRetrieval) {
      return {
        sessionId: inputData.sessionId,
        message: inputData.message,
        parsedIntent: inputData.parsedIntent,
        effectiveCriteria,
        result: workflowSearchResultSchema.parse({
          scenario: "no_filtered_match",
          interpretedCriteria: {
            brand: effectiveCriteria.brand,
            model: effectiveCriteria.model,
            minPrice: effectiveCriteria.minPrice,
            maxPrice: effectiveCriteria.maxPrice,
            location: effectiveCriteria.location
          },
          suggestions: []
        })
      };
    }

    // Para intents de busca ou comparacao, a recuperacao passa sempre pela tool.
    const executeSearchCars = searchCarsTool.execute;
    if (!executeSearchCars) {
      throw new Error("A tool searchCars nao possui executor configurado.");
    }

    const result = await executeSearchCars({
      query: inputData.message,
      brand: effectiveCriteria.brand ?? null,
      model: effectiveCriteria.model ?? null,
      minPrice: effectiveCriteria.minPrice ?? null,
      maxPrice: effectiveCriteria.maxPrice ?? null,
      location: effectiveCriteria.location ?? null,
      limit: effectiveCriteria.limit ?? null
    }, {});

    return {
      sessionId: inputData.sessionId,
      message: inputData.message,
      parsedIntent: inputData.parsedIntent,
      effectiveCriteria,
      result: workflowSearchResultSchema.parse(result)
    };
  }
});

const strategySelectionStep = createStep({
  id: "strategy-selection",
  inputSchema: dataRetrievalOutputSchema,
  outputSchema: strategySelectionOutputSchema,
  execute: async ({ inputData, state, setState }) => {
    const currentState = sessionStateSchema.parse(state ?? {});

    const approachByScenario: Record<
      z.infer<typeof strategySchema>["scenario"],
      z.infer<typeof strategySchema>["approach"]
    > = {
      exact_match: "close_now",
      price_mismatch: "value_reframing",
      location_mismatch: "logistics_assurance",
      no_filtered_match: "discovery_recovery"
    };

    const shouldUseDiscoveryApproach =
      inputData.parsedIntent.intentType === "greeting" ||
      (inputData.parsedIntent.needsMoreInfo &&
        inputData.result.suggestions.length === 0);

    const strategy = {
      scenario: inputData.result.scenario,
      approach: shouldUseDiscoveryApproach
        ? "rapport_and_discovery"
        : approachByScenario[inputData.result.scenario]
    } as const;

    const nextIntentState = evolveSearchIntentState({
      previousState: currentState.intentState,
      userMessage: inputData.message,
      parsedIntent: inputData.parsedIntent,
      result: inputData.result
    });

    await setState({
      ...currentState,
      intentState: nextIntentState,
      currentFilters: {
        ...currentState.currentFilters,
        ...inputData.effectiveCriteria
      },
      lastViewedCar: inputData.result.suggestions[0]?.car ?? currentState.lastViewedCar
    });

    return {
      ...inputData,
      strategy,
      intentState: nextIntentState
    };
  }
});

const persuasiveResponseStep = createStep({
  id: "persuasive-response",
  inputSchema: strategySelectionOutputSchema,
  outputSchema: workflowOutputSchema,
  execute: async ({ inputData }) => {
    if (inputData.strategy.approach === "rapport_and_discovery") {
      return {
        reply: buildDiscoveryReply(inputData.parsedIntent.missingFields),
        result: inputData.result,
        effectiveCriteria: inputData.effectiveCriteria,
        strategy: inputData.strategy,
        intentState: inputData.intentState,
        parsedIntent: inputData.parsedIntent
      };
    }

    const prompt = `
Voce vai fechar uma conversa de venda com base no contexto abaixo.
Responda em portugues brasileiro, com clareza, empatia e foco em conversao.

Pedido do usuario:
${inputData.message}

Estrategia:
${JSON.stringify(inputData.strategy, null, 2)}

Estado evolutivo da intencao:
${JSON.stringify(inputData.intentState, null, 2)}

Resultado de busca:
${JSON.stringify(inputData.result, null, 2)}

Importante:
- Se a estrategia for rapport_and_discovery, acolha e faca perguntas curtas.
- Nesse modo, nao tente fechar venda e nao pressione com CTA.
`;

    try {
      const generation = await closerAgent.generate(prompt);
      const reply = generation.text?.trim();

      if (reply && reply.length > 0) {
        return {
          reply,
          result: inputData.result,
          effectiveCriteria: inputData.effectiveCriteria,
          strategy: inputData.strategy,
          intentState: inputData.intentState,
          parsedIntent: inputData.parsedIntent
        };
      }
    } catch {
      // Sem acao: fallback abaixo cobre indisponibilidade do LLM.
    }

    return {
      reply: buildFallbackReply(inputData.result),
      result: inputData.result,
      effectiveCriteria: inputData.effectiveCriteria,
      strategy: inputData.strategy,
      intentState: inputData.intentState,
      parsedIntent: inputData.parsedIntent
    };
  }
});

export const carSalesWorkflow = createWorkflow({
  id: "car-sales-workflow",
  inputSchema: workflowInputSchema,
  outputSchema: workflowOutputSchema,
  stateSchema: sessionStateSchema
})
  .then(intentParsingStep)
  .then(dataRetrievalStep)
  .then(strategySelectionStep)
  .then(persuasiveResponseStep)
  .commit();
