// Este arquivo orquestra o fluxo completo entre interpretacao, busca e resposta.
import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";
import { env } from "@/config/env";
import { imageSourceSchema } from "@/domain/car";
import {
  fallbackPolicySchema,
  sessionFilterMetaSchema,
  sessionStateSchema
} from "@/domain/session-state";
import { JsonCarRepository } from "@/infrastructure/repositories/json-car-repository";
import { researcherAgent } from "@/mastra/agents/researcher-agent";
import { closerAgent } from "@/mastra/agents/closer-agent";
import { searchCarsTool } from "@/mastra/tools/search-cars-tool";
import {
  evolveSearchIntentState,
  getRelativePricePreference,
  intentParsingSchema,
  missingFieldSchema,
  normalizeIntentParsing,
  shouldRunInventorySearch
} from "@/application/services/search-intent-evolution";
import { searchIntentStateSchema } from "@/domain/search-intent";
import { buildFallbackReply } from "@/application/services/sales-reply";
import { resolveSearchRequestFromState } from "@/application/services/search-request-resolution";
import {
  buildCarReferenceKey,
  deriveCarContextAfterSearch
} from "@/application/services/search-session-state";

// Normaliza texto para comparacoes internas do workflow.
const normalize = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

// Remove duplicatas de listas como itens rejeitados.
const uniqueItems = (items: string[]): string[] => {
  return items.filter(
    (item, index) =>
      items.findIndex((candidate) => normalize(candidate) === normalize(item)) ===
      index
  );
};

const searchCriteriaSchema = z.object({
  query: z.string().optional(),
  brand: z.string().optional(),
  model: z.string().optional(),
  minPrice: z.number().positive().optional(),
  maxPrice: z.number().positive().optional(),
  location: z.string().optional(),
  limit: z.number().int().min(1).max(8).optional(),
  excludedItems: z.array(z.string()).optional()
});

const resolvedSearchCriteriaSchema = searchCriteriaSchema.extend({
  strictLocation: z.boolean().optional(),
  fallbackPolicy: fallbackPolicySchema.optional()
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
  effectiveCriteria: resolvedSearchCriteriaSchema,
  filterMeta: sessionFilterMetaSchema,
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
  effectiveCriteria: resolvedSearchCriteriaSchema,
  filterMeta: sessionFilterMetaSchema,
  shouldClearAnchors: z.boolean(),
  result: workflowSearchResultSchema
});

const strategySelectionOutputSchema = z.object({
  sessionId: z.string(),
  message: z.string(),
  parsedIntent: intentParsingSchema,
  effectiveCriteria: resolvedSearchCriteriaSchema,
  filterMeta: sessionFilterMetaSchema,
  shouldClearAnchors: z.boolean(),
  result: workflowSearchResultSchema,
  strategy: strategySchema,
  intentState: searchIntentStateSchema
});

// Monta a resposta de descoberta quando ainda faltam filtros importantes.
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

  return `Oi! Que bom falar com voce. Posso te ajudar a encontrar o carro que mais combina com você ${questions}`.trim();
};

const intentParsingStep = createStep({
  id: "intent-parsing",
  inputSchema: workflowInputSchema,
  outputSchema: intentParsingOutputSchema,
  // Interpreta a mensagem do usuario e produz uma estrutura de intencao confiavel.
  execute: async ({ inputData, state }) => {
    const currentState = sessionStateSchema.parse(state ?? {});
    const prompt = `
Interprete a mensagem do usuario para busca de carros.
Retorne somente os campos do schema estruturado solicitado.
Classifique:
- intentType: greeting, search ou refinement
- needsMoreInfo: true quando faltarem informacoes para seguir com recomendacao segura
- missingFields: lista com brand, model, maxPrice e location ausentes
- Se houver rejeicao explicita, preencha rejectedItems com marca, modelo ou a combinacao do carro rejeitado.
- Se o usuario disser "esquece isso" ou "quero outra coisa", marque resetMode como search.
	- Se o usuario rejeitar a oferta atual com "nao quero esse", "chega desse" ou equivalente,
	  marque resetMode como model e use o carro do Current State como item rejeitado.
	- Se o usuario disser "mais caro que esse", "mais barato que esse", "acima desse" ou equivalente,
	  use o Current State.referenceCar para preencher criteria.minPrice ou criteria.maxPrice.
	- Use Current State.recentSuggestedCars como fallback estruturado para referencias como
	  "esse", "o segundo", "aquele outro" e "dessa empresa".
	- Se Current State.referenceCar for null em uma referencia relativa de preco, nao invente valores.
	- Use Current State.filterMeta para decidir se uma cidade anterior pode ser herdada.
	- Se houver troca explicita de cidade ou localizacao ambigua, nao preserve a cidade anterior.
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
        hasHistory: currentState.intentState.turns > 0,
        state: currentState
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
          state: currentState,
          parsedIntent: intentParsingSchema.parse({
            normalizedMessage: inputData.message,
            criteria: {
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
  // Resolve os filtros finais e consulta o inventario local com regras deterministicas.
  execute: async ({ inputData, state }) => {
    const currentState = sessionStateSchema.parse(state ?? {});
    const repository = new JsonCarRepository(env.CARS_DATA_PATH);
    const allCars = await repository.getAllCars();
    const resolution = resolveSearchRequestFromState({
      cars: allCars,
      message: inputData.message,
      overrides: inputData.overrides ?? {},
      parsedIntent: inputData.parsedIntent,
      state: currentState
    });
    const effectiveCriteria = resolution.effectiveCriteria;
    const shouldSkipRetrieval = !shouldRunInventorySearch({
      message: inputData.message,
      parsedIntent: inputData.parsedIntent,
      effectiveCriteria,
      state: currentState
    }) || resolution.missingRelativeAnchor;

    if (shouldSkipRetrieval) {
      return {
        sessionId: inputData.sessionId,
        message: inputData.message,
        parsedIntent: inputData.parsedIntent,
        effectiveCriteria,
        filterMeta: resolution.filterMeta,
        shouldClearAnchors: resolution.shouldClearAnchors,
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
      limit: effectiveCriteria.limit ?? null,
      excludedItems: effectiveCriteria.excludedItems ?? null,
      strictLocation: effectiveCriteria.strictLocation ?? null,
      fallbackPolicy: effectiveCriteria.fallbackPolicy ?? null
    }, {});

    return {
      sessionId: inputData.sessionId,
      message: inputData.message,
      parsedIntent: inputData.parsedIntent,
      effectiveCriteria,
      filterMeta: resolution.filterMeta,
      shouldClearAnchors: resolution.shouldClearAnchors,
      result: workflowSearchResultSchema.parse(result)
    };
  }
});

const strategySelectionStep = createStep({
  id: "strategy-selection",
  inputSchema: dataRetrievalOutputSchema,
  outputSchema: strategySelectionOutputSchema,
  // Escolhe a estrategia comercial e persiste o novo estado da sessao.
  execute: async ({ inputData, state, setState }) => {
    const currentState = sessionStateSchema.parse(state ?? {});
    const currentSuggestion = inputData.result.suggestions[0]?.car;
    const currentSuggestionKey = currentSuggestion
      ? buildCarReferenceKey(currentSuggestion)
      : undefined;
    const currentSuggestionPersuasionCount = currentSuggestionKey
      ? currentState.mismatchPersuasionByCar[currentSuggestionKey] ?? 0
      : 0;

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
    const shouldRespectPitchLimit =
      (inputData.result.scenario === "price_mismatch" ||
        inputData.result.scenario === "location_mismatch") &&
      currentSuggestionPersuasionCount > 0;

    const strategy = {
      scenario: inputData.result.scenario,
      approach: shouldUseDiscoveryApproach
        ? "rapport_and_discovery"
        : shouldRespectPitchLimit
          ? "discovery_recovery"
          : approachByScenario[inputData.result.scenario]
    } as const;

    const nextIntentState = evolveSearchIntentState({
      previousState: currentState.intentState,
      userMessage: inputData.message,
      parsedIntent: inputData.parsedIntent,
      result: inputData.result
    });

    const nextRejectedItems = uniqueItems([
      ...currentState.rejectedItems,
      ...inputData.parsedIntent.rejectedItems
    ]);
    const nextCarContext = deriveCarContextAfterSearch({
      previousState: currentState,
      result: inputData.result,
      query: inputData.message,
      rejectedItems: nextRejectedItems,
      shouldClearAnchors: inputData.shouldClearAnchors
    });

    await setState({
      ...currentState,
      intentState: nextIntentState,
      currentFilters: {
        query: inputData.effectiveCriteria.query,
        brand: inputData.effectiveCriteria.brand,
        model: inputData.effectiveCriteria.model,
        location: inputData.effectiveCriteria.location,
        minPrice: inputData.effectiveCriteria.minPrice,
        maxPrice: inputData.effectiveCriteria.maxPrice,
        limit: inputData.effectiveCriteria.limit
      },
      filterMeta: inputData.filterMeta,
      rejectedItems: nextRejectedItems,
      lastViewedCar: nextCarContext.lastViewedCar,
      referenceCar: nextCarContext.referenceCar,
      recentSuggestedCars: nextCarContext.recentSuggestedCars,
      recentSuggestedQuery: nextCarContext.recentSuggestedQuery,
      recentSuggestedScenario: nextCarContext.recentSuggestedScenario
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
  // Gera a fala final do vendedor respeitando rejeicoes e limites de persuasao.
  execute: async ({ inputData, state }) => {
	    const currentState = sessionStateSchema.parse(state ?? {});
	    const needsReferenceSelection =
	      getRelativePricePreference(inputData.message) !== undefined &&
	      !currentState.referenceCar &&
	      currentState.recentSuggestedCars.length === 0;

    if (needsReferenceSelection) {
      return {
        reply:
          "Para comparar preco com precisao, me diga primeiro qual carro voce quer usar como referencia.",
        result: inputData.result,
        effectiveCriteria: inputData.effectiveCriteria,
        filterMeta: inputData.filterMeta,
        strategy: inputData.strategy,
        intentState: inputData.intentState,
        parsedIntent: inputData.parsedIntent
      };
    }

    if (inputData.strategy.approach === "rapport_and_discovery") {
      return {
        reply: buildDiscoveryReply(inputData.parsedIntent.missingFields),
        result: inputData.result,
        effectiveCriteria: inputData.effectiveCriteria,
        filterMeta: inputData.filterMeta,
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

	Estado comercial atual:
	${JSON.stringify(
	      {
	        currentFilters: currentState.currentFilters,
	        filterMeta: currentState.filterMeta,
	        rejectedItems: currentState.rejectedItems,
	        referenceCar: currentState.referenceCar,
	        lastViewedCar: currentState.lastViewedCar,
	        recentSuggestedCars: currentState.recentSuggestedCars,
	        recentSuggestedQuery: currentState.recentSuggestedQuery,
	        recentSuggestedScenario: currentState.recentSuggestedScenario,
	        historySummary: currentState.historySummary,
	        mismatchPersuasionByCar: currentState.mismatchPersuasionByCar,
	        currentSuggestionPersuasionCount: inputData.result.suggestions[0]
	          ? currentState.mismatchPersuasionByCar[
	              buildCarReferenceKey(inputData.result.suggestions[0].car)
            ] ?? 0
          : 0
      },
      null,
      2
    )}

Resultado de busca:
${JSON.stringify(inputData.result, null, 2)}

	Importante:
	- Se a estrategia for rapport_and_discovery, acolha e faca perguntas curtas.
	- Nesse modo, nao tente fechar venda e nao pressione com CTA.
		- Treat historySummary as supporting context only. Current filters, filterMeta, referenceCar,
		  lastViewedCar, recentSuggestedCars and rejectedItems are the source of truth.
	- Se o usuario rejeitou a oferta atual ou se currentSuggestionPersuasionCount for maior que zero em um mismatch,
	  reconheca o "nao" imediatamente e faca pivot para as novas opcoes.
	- If filterMeta.fallbackPolicy is same_scope_only or the current car is in rejectedItems,
	  do not mention the rejected mismatch car again.
	- Em qualquer argumentacao de price_mismatch ou location_mismatch, termine com:
	  "Ou voce prefere que eu procure outras opcoes dentro do seu criterio original?"
	`;

    try {
      const generation = await closerAgent.generate(prompt);
      const reply = generation.text?.trim();

      if (reply && reply.length > 0) {
        return {
          reply,
          result: inputData.result,
          effectiveCriteria: inputData.effectiveCriteria,
          filterMeta: inputData.filterMeta,
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
      filterMeta: inputData.filterMeta,
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
