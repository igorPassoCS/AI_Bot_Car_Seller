// Este arquivo monta a requisicao final de busca a partir da mensagem e do estado.
import type { Car, SearchCarsInput } from "@/domain/car";
import type { SessionFilterMeta, SessionState } from "@/domain/session-state";
import {
  getRelativePricePreference,
  inferContextualCriteriaFromState,
  type IntentParsingOutput,
  resolveCriteriaWithState,
  shouldClearSearchAnchors
} from "@/application/services/search-intent-evolution";
import {
  parseCriteriaFromMessage,
  resolveLocationFromMessage
} from "@/application/services/criteria-parser";

const locationStrictPattern =
  /\b(nao quero|não quero|somente|apenas|so em|s[oó] em|must be|only in|nao aceito outra cidade|não aceito outra cidade|nao vou viajar|não vou viajar|tem que ser)\b/i;

// Normaliza texto para comparacoes entre filtros antigos e novos.
const normalize = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

// Remove itens duplicados preservando somente uma ocorrencia sem ruido textual.
const uniqueItems = (items: string[]): string[] => {
  return items.filter(
    (item, index) =>
      items.findIndex((candidate) => normalize(candidate) === normalize(item)) ===
      index
  );
};

// Cria a mesma chave usada para rastrear tentativas de persuasao por carro.
const buildCarReferenceKey = ({
  name,
  model
}: {
  name: string;
  model: string;
}): string => {
  return `${name} ${model}`.trim();
};

// Define se a busca ainda pode oferecer mismatch ou se deve ficar no mesmo escopo.
const resolveFallbackPolicy = ({
  message,
  parsedIntent,
  state,
  nextLocation,
  locationOrigin,
  shouldClearAnchors
}: {
  message: string;
  parsedIntent: IntentParsingOutput;
  state: SessionState;
  nextLocation?: string;
  locationOrigin: SessionFilterMeta["locationOrigin"];
  shouldClearAnchors: boolean;
}): SessionFilterMeta["fallbackPolicy"] => {
  const isStrictLocation =
    locationOrigin === "explicit" || locationOrigin === "alias";

  if (!isStrictLocation || shouldClearAnchors || parsedIntent.resetMode === "search") {
    return "allow_mismatch_once";
  }

  const currentLocation = state.currentFilters.location;
  const sameLocation =
    nextLocation !== undefined &&
    currentLocation !== undefined &&
    normalize(nextLocation) === normalize(currentLocation);

  if (state.filterMeta.fallbackPolicy === "same_scope_only" && sameLocation) {
    return "same_scope_only";
  }

  if (!state.lastViewedCar || state.intentState.lastScenario !== "location_mismatch") {
    return "allow_mismatch_once";
  }

  const persuasionCount =
    state.mismatchPersuasionByCar[buildCarReferenceKey(state.lastViewedCar)] ?? 0;
  const reassertsStrictLocation =
    parsedIntent.rejectedItems.length > 0 ||
    parsedIntent.behaviorSignals.locationPreference === "strict" ||
    locationStrictPattern.test(message);

  if (persuasionCount > 0 && sameLocation && reassertsStrictLocation) {
    return "same_scope_only";
  }

  return "allow_mismatch_once";
};

export type ResolvedSearchRequest = {
  effectiveCriteria: Partial<SearchCarsInput>;
  filterMeta: SessionFilterMeta;
  shouldClearAnchors: boolean;
  missingRelativeAnchor: boolean;
};

// Resolve criterios finais, origem dos filtros e politica de fallback para a busca.
export const resolveSearchRequestFromState = ({
  cars,
  message,
  overrides,
  parsedIntent,
  state
}: {
  cars: Car[];
  message: string;
  overrides: Partial<SearchCarsInput>;
  parsedIntent: IntentParsingOutput;
  state: SessionState;
}): ResolvedSearchRequest => {
  const inferredCriteria = parseCriteriaFromMessage(cars, message);
  const locationResolution = resolveLocationFromMessage(cars, message);
  const shouldClearAnchors = shouldClearSearchAnchors({
    overrides,
    parsedCriteria: {
      location: inferredCriteria.location ?? parsedIntent.criteria.location
    },
    locationResolution,
    resetMode: parsedIntent.resetMode,
    state
  });
  const stateForResolution = shouldClearAnchors
    ? {
        ...state,
        referenceCar: null,
        lastViewedCar: null
      }
    : state;
  const relativePricePreference = getRelativePricePreference(message);
  const contextualCriteria = inferContextualCriteriaFromState(
    message,
    stateForResolution
  );
  const resolvedParsingCriteria: Partial<SearchCarsInput> = {
    query: message,
    brand: parsedIntent.criteria.brand ?? inferredCriteria.brand,
    model: parsedIntent.criteria.model ?? inferredCriteria.model,
    location: inferredCriteria.location ?? parsedIntent.criteria.location,
    minPrice:
      relativePricePreference === "higher"
        ? contextualCriteria.minPrice
        : relativePricePreference === "lower"
          ? undefined
          : parsedIntent.criteria.minPrice,
    maxPrice:
      relativePricePreference === "lower"
        ? contextualCriteria.maxPrice
        : relativePricePreference === "higher"
          ? undefined
          : parsedIntent.criteria.maxPrice ?? inferredCriteria.maxPrice,
    limit: parsedIntent.criteria.limit,
    excludedItems: uniqueItems([
      ...state.rejectedItems,
      ...parsedIntent.rejectedItems
    ])
  };
  const resolution = resolveCriteriaWithState(
    {
      query: message,
      ...overrides
    },
    resolvedParsingCriteria,
    stateForResolution,
    {
      locationResolution
    }
  );
  const fallbackPolicy = resolveFallbackPolicy({
    message,
    parsedIntent,
    state,
    nextLocation: resolution.criteria.location,
    locationOrigin: resolution.filterMeta.locationOrigin,
    shouldClearAnchors
  });
  const strictLocation =
    resolution.filterMeta.locationOrigin === "explicit" ||
    resolution.filterMeta.locationOrigin === "alias";

  return {
    effectiveCriteria: {
      ...resolution.criteria,
      strictLocation,
      fallbackPolicy
    },
    filterMeta: {
      ...resolution.filterMeta,
      fallbackPolicy
    },
    shouldClearAnchors,
    missingRelativeAnchor: resolution.missingRelativeAnchor
  };
};
