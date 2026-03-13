// Este arquivo concentra as regras que evoluem a intencao de busca a cada turno.
import { z } from "zod";
import type { SearchCarsInput, SearchCarsResult } from "@/domain/car";
import type { SearchIntentState } from "@/domain/search-intent";
import type {
  SessionFilterMeta,
  SessionState
} from "@/domain/session-state";
import { searchIntentStateSchema } from "@/domain/search-intent";
import type { LocationResolution } from "@/application/services/criteria-parser";
import { getComparisonAnchorCar } from "@/application/services/search-session-state";

const locationStrictPattern =
  /\b(nao quero|não quero|somente|apenas|so em|s[oó] em|must be|only in|nao aceito outra cidade|não aceito outra cidade|nao vou viajar|não vou viajar|tem que ser)\b/i;
const locationOpenPattern =
  /\b(qualquer cidade|pode ser outra cidade|aceito entrega|entrega|posso viajar|travel|any city|tanto faz a cidade)\b/i;
const budgetStrictPattern =
  /\b(nao passo|não passo|teto|maximo|máximo|limite|sem passar|can't exceed|cannot exceed|under)\b/i;
const budgetFlexiblePattern =
  /\b(posso aumentar|tenho flexibilidade|consigo subir|aceito pagar mais|esticar o orcamento|esticar o orçamento|a little more|can stretch)\b/i;
const greetingPattern =
  /^\s*(oi|ola|olá|opa|aoba|e ai|e aí|bom dia|boa tarde|boa noite|hello|hi|hey)\W*$/i;
const explicitRejectionPattern =
  /\b(nao quero|não quero|chega desse|chega disto|dispenso|descarta|descartar|not the|not this|esse nao|esse não|esse ai nao|esse aí não)\b/i;
const currentOfferRejectionPattern =
  /\b(chega desse|chega disto|esse nao|esse não|esse ai nao|esse aí não|nao quero esse|não quero esse|nao esse|não esse|not this|not this one)\b/i;
const resetSearchPattern =
  /\b(esquece isso|quero outra coisa|quero algo diferente|outra coisa|muda isso|muda tudo|troca tudo|vamos do zero)\b/i;

// Normaliza texto para comparacoes deterministicas entre mensagens e estado.
const normalize = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

// Remove duplicatas sem depender de caixa ou acentuacao.
const uniqueItems = (items: string[]): string[] => {
  return items.filter(
    (item, index) =>
      items.findIndex((candidate) => normalize(candidate) === normalize(item)) ===
      index
  );
};

// Gera uma chave humana e estavel para identificar um carro ao longo da conversa.
const buildCarReferenceKey = ({
  name,
  model
}: {
  name: string;
  model: string;
}): string => {
  return `${name} ${model}`.trim();
};

// Compara um valor qualquer com um item rejeitado usando a mesma normalizacao.
const matchesRejectedItem = (
  candidate: string,
  rejectedItem: string
): boolean => {
  return normalize(candidate) === normalize(rejectedItem);
};

// Verifica se o carro atual do contexto foi rejeitado pelo usuario.
const lastViewedCarMatchesRejectedItems = (
  state: SessionState,
  rejectedItems: string[]
): boolean => {
  if (!state.lastViewedCar || rejectedItems.length === 0) {
    return false;
  }

  const values = [
    state.lastViewedCar.name,
    state.lastViewedCar.model,
    buildCarReferenceKey(state.lastViewedCar)
  ];

  return rejectedItems.some((rejectedItem) =>
    values.some((value) => matchesRejectedItem(value, rejectedItem))
  );
};

// Detecta se a mensagem pede uma comparacao relativa de preco.
export const getRelativePricePreference = (
  message: string
): "higher" | "lower" | undefined => {
  if (/mais caro|more expensive|acima desse|acima deste|superior a esse/i.test(message)) {
    return "higher";
  }

  if (/mais barato|cheaper|menos caro|abaixo desse|abaixo deste|inferior a esse/i.test(message)) {
    return "lower";
  }

  return undefined;
};

export const resetModeSchema = z.enum(["none", "model", "search"]);

const criteriaSchema = z.object({
  brand: z.string().optional(),
  model: z.string().optional(),
  minPrice: z.number().positive().optional(),
  maxPrice: z.number().positive().optional(),
  location: z.string().optional(),
  limit: z.number().int().min(1).max(8).optional()
});

export const intentTypeSchema = z.enum(["greeting", "search", "refinement"]);
export const missingFieldSchema = z.enum([
  "brand",
  "model",
  "maxPrice",
  "location"
]);

type MissingField = z.infer<typeof missingFieldSchema>;

export const intentParsingSchema = z.object({
  normalizedMessage: z.string().min(1),
  intentType: intentTypeSchema.default("search"),
  needsMoreInfo: z.boolean().default(false),
  missingFields: z.array(missingFieldSchema).default([]),
  criteria: criteriaSchema.default({}),
  rejectedItems: z.array(z.string().min(1)).default([]),
  resetMode: resetModeSchema.default("none"),
  behaviorSignals: z
    .object({
      locationPreference: z.enum(["strict", "open", "unchanged"]).default("unchanged"),
      budgetPreference: z.enum(["strict", "flexible", "unchanged"]).default("unchanged")
    })
    .default({
      locationPreference: "unchanged",
      budgetPreference: "unchanged"
    })
});

export type IntentParsingOutput = z.infer<typeof intentParsingSchema>;
export type CriteriaResolutionResult = {
  criteria: Partial<SearchCarsInput>;
  filterMeta: SessionFilterMeta;
  missingRelativeAnchor: boolean;
};

// Informa se ja existe criterio suficiente para tratar a mensagem como busca.
const hasAnyCriteria = (criteria: Partial<SearchCarsInput>): boolean => {
  return Boolean(
    criteria.brand ||
      criteria.model ||
      criteria.minPrice ||
      criteria.maxPrice ||
      criteria.location
  );
};

// Lista os campos que ainda faltam para uma recomendacao mais segura.
const inferMissingFields = (
  criteria: Partial<SearchCarsInput>
): MissingField[] => {
  const missing: MissingField[] = [];

  if (!criteria.brand) {
    missing.push("brand");
  }
  if (!criteria.model) {
    missing.push("model");
  }
  if (!criteria.minPrice && !criteria.maxPrice) {
    missing.push("maxPrice");
  }
  if (!criteria.location) {
    missing.push("location");
  }

  return missing;
};

// Deduz itens rejeitados quando o usuario rejeita a oferta atual ou um modelo citado.
const inferRejectedItemsFromState = ({
  message,
  state,
  criteria
}: {
  message: string;
  state: SessionState;
  criteria: Partial<SearchCarsInput>;
}): string[] => {
  if (!explicitRejectionPattern.test(message) && !currentOfferRejectionPattern.test(message)) {
    return [];
  }

  const rejectedItems: string[] = [];

  if (criteria.model) {
    rejectedItems.push(criteria.model);
  }
  if (criteria.brand) {
    rejectedItems.push(criteria.brand);
  }

  if (
    state.lastViewedCar &&
    (currentOfferRejectionPattern.test(message) || rejectedItems.length === 0)
  ) {
    rejectedItems.push(state.lastViewedCar.model);
    rejectedItems.push(buildCarReferenceKey(state.lastViewedCar));
  }

  return uniqueItems(rejectedItems);
};

// Decide quando a regra de uma unica tentativa de persuasao exige pivot imediato.
const shouldPivotAfterRepeatedMismatch = ({
  message,
  parsedIntent,
  state
}: {
  message: string;
  parsedIntent: IntentParsingOutput;
  state: SessionState;
}): boolean => {
  if (!state.lastViewedCar) {
    return false;
  }

  const persuasionCount =
    state.mismatchPersuasionByCar[buildCarReferenceKey(state.lastViewedCar)] ?? 0;
  if (persuasionCount === 0) {
    return false;
  }

  if (state.intentState.lastScenario === "location_mismatch") {
    return (
      parsedIntent.behaviorSignals.locationPreference === "strict" ||
      locationStrictPattern.test(message)
    );
  }

  if (state.intentState.lastScenario === "price_mismatch") {
    return (
      parsedIntent.behaviorSignals.budgetPreference === "strict" ||
      budgetStrictPattern.test(message)
    );
  }

  return false;
};

// Consolida rejeicoes e resets para o restante do fluxo trabalhar com sinais limpos.
const inferNegativeIntentSignals = ({
  message,
  parsedIntent,
  state
}: {
  message: string;
  parsedIntent: IntentParsingOutput;
  state: SessionState;
}): Pick<IntentParsingOutput, "rejectedItems" | "resetMode"> => {
  const inferredRejectedItems = inferRejectedItemsFromState({
    message,
    state,
    criteria: parsedIntent.criteria
  });
  const shouldPivotCurrentCar = shouldPivotAfterRepeatedMismatch({
    message,
    parsedIntent,
    state
  });

  if (shouldPivotCurrentCar && state.lastViewedCar) {
    inferredRejectedItems.push(state.lastViewedCar.model);
    inferredRejectedItems.push(buildCarReferenceKey(state.lastViewedCar));
  }

  const rejectedItems = uniqueItems([
    ...parsedIntent.rejectedItems,
    ...inferredRejectedItems
  ]);

  let resetMode: z.infer<typeof resetModeSchema> = parsedIntent.resetMode;

  if (resetSearchPattern.test(message)) {
    resetMode = "search";
  } else if (
    resetMode === "none" &&
    (rejectedItems.length > 0 || currentOfferRejectionPattern.test(message))
  ) {
    resetMode = "model";
  }

  return {
    rejectedItems,
    resetMode
  };
};

// Completa a interpretacao do LLM com heuristicas locais e defaults consistentes.
export const normalizeIntentParsing = ({
  message,
  parsedIntent,
  hasHistory,
  state
}: {
  message: string;
  parsedIntent: IntentParsingOutput;
  hasHistory: boolean;
  state: SessionState;
}): IntentParsingOutput => {
  const negativeSignals = inferNegativeIntentSignals({
    message,
    parsedIntent,
    state
  });
  const mergedIntent = intentParsingSchema.parse({
    ...parsedIntent,
    rejectedItems: negativeSignals.rejectedItems,
    resetMode: negativeSignals.resetMode
  });
  const hasCriteria = hasAnyCriteria(mergedIntent.criteria);
  const missingRelativeReference =
    getRelativePricePreference(message) !== undefined &&
    !getComparisonAnchorCar(state);
  const heuristicGreeting =
    greetingPattern.test(message) && !hasCriteria && !hasHistory;
  const missingFields = inferMissingFields(mergedIntent.criteria);

  const fallbackIntentType: z.infer<typeof intentTypeSchema> = hasHistory
    ? "refinement"
    : "search";

  return intentParsingSchema.parse({
    ...mergedIntent,
    intentType: heuristicGreeting
      ? "greeting"
      : mergedIntent.intentType ?? fallbackIntentType,
    needsMoreInfo:
      heuristicGreeting ||
      mergedIntent.needsMoreInfo ||
      missingRelativeReference ||
      (!hasCriteria && !hasHistory),
    missingFields:
      mergedIntent.missingFields.length > 0
        ? mergedIntent.missingFields
        : missingFields
  });
};

// Traduz a contagem de rejeicoes de cidade em um nivel de sensibilidade.
const toLocationSensitivity = (
  locationRejectionCount: number
): SearchIntentState["locationSensitivity"] => {
  if (locationRejectionCount >= 2) {
    return "high";
  }
  if (locationRejectionCount === 0) {
    return "low";
  }
  return "medium";
};

// Traduz a resistencia de preco em um nivel de flexibilidade de orcamento.
const toBudgetFlexibility = (
  budgetResistanceCount: number
): SearchIntentState["budgetFlexibility"] => {
  if (budgetResistanceCount >= 2) {
    return "rigid";
  }
  if (budgetResistanceCount === 0) {
    return "flexible";
  }
  return "moderate";
};

// Evita contadores negativos quando o usuario flexibiliza uma restricao.
const clampToZero = (value: number): number => Math.max(0, value);

// Retorna a primeira string realmente utilizavel entre varias fontes de contexto.
const firstMeaningfulString = (
  ...values: Array<string | undefined>
): string | undefined => {
  return values.find((value) => value !== undefined && value.trim().length > 0);
};

// Retorna o primeiro numero disponivel respeitando a ordem de precedencia.
const firstMeaningfulNumber = (
  ...values: Array<number | undefined>
): number | undefined => {
  return values.find((value) => value !== undefined);
};

// Resolve criterios relativos com base no carro de referencia atual da sessao.
export const inferContextualCriteriaFromState = (
  message: string,
  state: SessionState
): Partial<SearchCarsInput> => {
  const relativePrice = getRelativePricePreference(message);
  const anchorCar = getComparisonAnchorCar(state);

  if (!anchorCar || !relativePrice) {
    return {};
  }

  if (relativePrice === "higher") {
    return {
      minPrice: anchorCar.price + 1,
      maxPrice: undefined
    };
  }

  return {
    minPrice: undefined,
    maxPrice: Math.max(anchorCar.price - 1, 1)
  };
};

// Decide quando a mudanca de cidade ou um reset invalida as ancoras atuais.
export const shouldClearSearchAnchors = ({
  overrides,
  parsedCriteria,
  locationResolution,
  resetMode,
  state
}: {
  overrides: Partial<SearchCarsInput>;
  parsedCriteria: Partial<SearchCarsInput>;
  locationResolution?: LocationResolution;
  resetMode: z.infer<typeof resetModeSchema>;
  state: SessionState;
}): boolean => {
  if (resetMode === "search") {
    return true;
  }

  const hasExplicitLocationSignal =
    locationResolution?.hasExplicitLocationHint ||
    overrides.location !== undefined ||
    parsedCriteria.location !== undefined;

  if (!hasExplicitLocationSignal) {
    return false;
  }

  const nextLocation = firstMeaningfulString(
    overrides.location,
    parsedCriteria.location,
    locationResolution?.location
  );
  const currentLocation = state.currentFilters.location;

  if (!nextLocation || !currentLocation) {
    return true;
  }

  return normalize(nextLocation) !== normalize(currentLocation);
};

// Mescla overrides, parser e estado anterior em um conjunto final de criterios.
export const resolveCriteriaWithState = (
  overrides: Partial<SearchCarsInput>,
  parsedCriteria: Partial<SearchCarsInput>,
  state: SessionState,
  options?: {
    locationResolution?: LocationResolution;
  }
): CriteriaResolutionResult => {
  const message = overrides.query ?? parsedCriteria.query ?? "";
  const relativePricePreference = getRelativePricePreference(message);
  const comparisonAnchor = getComparisonAnchorCar(state);
  const inheritedExcludedItems = uniqueItems([
    ...(state.rejectedItems ?? []),
    ...(parsedCriteria.excludedItems ?? []),
    ...(overrides.excludedItems ?? [])
  ]);
  const shouldClearBySearchReset = resetSearchPattern.test(message);
  const hasExplicitLocationSignal =
    options?.locationResolution?.hasExplicitLocationHint ||
    overrides.location !== undefined ||
    parsedCriteria.location !== undefined;
  const shouldClearByModelReset =
    shouldClearBySearchReset || inheritedExcludedItems.length > 0;
  const shouldClearBrandContext =
    shouldClearBySearchReset ||
    lastViewedCarMatchesRejectedItems(state, inheritedExcludedItems);
  const canInheritLocation = !shouldClearBySearchReset && !hasExplicitLocationSignal;

  const nextMinPrice = firstMeaningfulNumber(
    overrides.minPrice,
    parsedCriteria.minPrice,
    ...(relativePricePreference === "lower" || shouldClearBySearchReset
      ? []
      : [
          state.currentFilters.minPrice,
          state.intentState.preferredCriteria.minPrice
        ])
  );
  const nextMaxPrice = firstMeaningfulNumber(
    overrides.maxPrice,
    parsedCriteria.maxPrice,
    ...(relativePricePreference === "higher" || shouldClearBySearchReset
      ? []
      : [
          state.currentFilters.maxPrice,
          state.intentState.preferredCriteria.maxPrice
        ])
  );

  const nextLocation = firstMeaningfulString(
    overrides.location,
    parsedCriteria.location,
    ...(canInheritLocation
      ? [
          state.currentFilters.location,
          state.intentState.preferredCriteria.location
        ]
      : [])
  );
  const hasExplicitPrice =
    overrides.minPrice !== undefined ||
    overrides.maxPrice !== undefined ||
    parsedCriteria.minPrice !== undefined ||
    parsedCriteria.maxPrice !== undefined;
  const nextCriteria = {
    query: firstMeaningfulString(
      overrides.query,
      parsedCriteria.query,
      shouldClearBySearchReset ? undefined : state.currentFilters.query
    ),
    brand: firstMeaningfulString(
      overrides.brand,
      parsedCriteria.brand,
      ...(shouldClearBrandContext
        ? []
        : [
            state.currentFilters.brand,
            state.intentState.preferredCriteria.brand
          ])
    ),
    model: firstMeaningfulString(
      overrides.model,
      parsedCriteria.model,
      ...(shouldClearByModelReset
        ? []
        : [
            state.currentFilters.model,
            state.intentState.preferredCriteria.model
          ])
    ),
    location: nextLocation,
    minPrice:
      nextMinPrice && nextMaxPrice && nextMinPrice > nextMaxPrice
        ? undefined
        : nextMinPrice,
    maxPrice:
      nextMaxPrice && nextMinPrice && nextMaxPrice < nextMinPrice
        ? undefined
        : nextMaxPrice,
    limit: firstMeaningfulNumber(
      overrides.limit,
      parsedCriteria.limit,
      state.currentFilters.limit,
      3
      ),
    excludedItems: inheritedExcludedItems
  };
  const locationOrigin: SessionFilterMeta["locationOrigin"] =
    !nextLocation
      ? "none"
      : overrides.location !== undefined
        ? "explicit"
        : options?.locationResolution?.origin === "alias"
          ? "alias"
          : parsedCriteria.location !== undefined ||
              options?.locationResolution?.origin === "explicit"
            ? "explicit"
            : "inherited";
  const priceOrigin: SessionFilterMeta["priceOrigin"] =
    relativePricePreference !== undefined && comparisonAnchor
      ? "relative"
      : hasExplicitPrice
        ? "explicit"
        : nextCriteria.minPrice !== undefined || nextCriteria.maxPrice !== undefined
          ? "inherited"
          : "none";

  return {
    criteria: nextCriteria,
    filterMeta: {
      locationOrigin,
      priceOrigin,
      fallbackPolicy: state.filterMeta.fallbackPolicy
    },
    missingRelativeAnchor:
      relativePricePreference !== undefined && !comparisonAnchor
  };
};

// Define se a mensagem justifica uma consulta ao inventario neste turno.
export const shouldRunInventorySearch = ({
  message,
  parsedIntent,
  effectiveCriteria,
  state
}: {
  message: string;
  parsedIntent: IntentParsingOutput;
  effectiveCriteria: Partial<SearchCarsInput>;
  state: SessionState;
}): boolean => {
  if (parsedIntent.intentType === "greeting") {
    return false;
  }

  const normalizedMessage = normalize(message);
  const hasCriteria = hasAnyCriteria(effectiveCriteria);
  const hasRelativeReference =
    Boolean(getComparisonAnchorCar(state)) &&
    /\b(esse|este|this one|mais caro|mais barato|more expensive|cheaper)\b/.test(
      normalizedMessage
    );
  const hasSearchVerb =
    /\b(quero|buscar|busca|encontre|encontrar|procuro|procurando|mostrar|mostre|compare|comparar|versus|vs|similar|outra opcao|outra opção)\b/.test(
      normalizedMessage
    );
  const hasRejectionOrReset =
    parsedIntent.rejectedItems.length > 0 || parsedIntent.resetMode !== "none";

  return hasCriteria || hasRelativeReference || hasSearchVerb || hasRejectionOrReset;
};

// Atualiza a memoria de intencao com sinais de rigidez de localizacao e preco.
export const evolveSearchIntentState = ({
  previousState,
  userMessage,
  parsedIntent,
  result
}: {
  previousState: SearchIntentState;
  userMessage: string;
  parsedIntent: IntentParsingOutput;
  result: SearchCarsResult;
}): SearchIntentState => {
  let nextLocationRejectionCount = previousState.locationRejectionCount;
  let nextBudgetResistanceCount = previousState.budgetResistanceCount;

  const locationIsStrict =
    parsedIntent.behaviorSignals.locationPreference === "strict" ||
    locationStrictPattern.test(userMessage);
  const locationIsOpen =
    parsedIntent.behaviorSignals.locationPreference === "open" ||
    locationOpenPattern.test(userMessage);
  const budgetIsStrict =
    parsedIntent.behaviorSignals.budgetPreference === "strict" ||
    budgetStrictPattern.test(userMessage);
  const budgetIsFlexible =
    parsedIntent.behaviorSignals.budgetPreference === "flexible" ||
    budgetFlexiblePattern.test(userMessage);

  if (locationIsStrict) {
    nextLocationRejectionCount += 1;
  }
  if (locationIsOpen) {
    nextLocationRejectionCount = clampToZero(nextLocationRejectionCount - 1);
  }
  if (budgetIsStrict) {
    nextBudgetResistanceCount += 1;
  }
  if (budgetIsFlexible) {
    nextBudgetResistanceCount = clampToZero(nextBudgetResistanceCount - 1);
  }

  const preferredCriteria = {
    ...previousState.preferredCriteria,
    ...Object.fromEntries(
      Object.entries(result.interpretedCriteria).filter(
        ([, value]) => value !== undefined
      )
    )
  };

  if (parsedIntent.resetMode === "search") {
    delete preferredCriteria.brand;
    delete preferredCriteria.model;
    delete preferredCriteria.location;
    delete preferredCriteria.minPrice;
    delete preferredCriteria.maxPrice;
  }

  if (parsedIntent.resetMode === "model") {
    delete preferredCriteria.model;
  }

  return searchIntentStateSchema.parse({
    ...previousState,
    turns: previousState.turns + 1,
    locationRejectionCount: nextLocationRejectionCount,
    budgetResistanceCount: nextBudgetResistanceCount,
    locationSensitivity: toLocationSensitivity(nextLocationRejectionCount),
    budgetFlexibility: toBudgetFlexibility(nextBudgetResistanceCount),
    preferredCriteria,
    lastScenario: result.scenario
  });
};
