// Este arquivo encapsula a atualizacao de carros de contexto apos cada busca.
import type { SearchCarsResult } from "@/domain/car";
import type {
  SessionCarReference,
  SessionState,
  SessionSuggestedCar
} from "@/domain/session-state";

// Normaliza texto para comparar itens rejeitados com os carros armazenados.
const normalize = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

// Gera uma chave estavel para usar em mapas de persuasao e comparacao.
export const buildCarReferenceKey = ({
  name,
  model
}: {
  name: string;
  model: string;
}): string => {
  return `${name} ${model}`.trim();
};

// Verifica se uma referencia de carro coincide com algum item rejeitado.
export const matchesCarReference = (
  car: SessionCarReference | null,
  rejectedItems: string[]
): boolean => {
  if (!car || rejectedItems.length === 0) {
    return false;
  }

  const values = [car.name, car.model, buildCarReferenceKey(car)];

  return rejectedItems.some((item) =>
    values.some((value) => normalize(value) === normalize(item))
  );
};

// Converte as sugestoes do resultado no ultimo conjunto estruturado exibido ao usuario.
export const buildRecentSuggestedCars = (
  result: SearchCarsResult
): SessionSuggestedCar[] => {
  return result.suggestions.map((suggestion, index) => ({
    ...suggestion.car,
    matchType: suggestion.matchType,
    sellingPoints: suggestion.sellingPoints,
    position: index
  }));
};

// Retorna o primeiro carro do conjunto recente, usado como fallback de curtissimo prazo.
export const getTopRecentSuggestedCar = (
  state: SessionState
): SessionSuggestedCar | null => {
  return state.recentSuggestedCars[0] ?? null;
};

// Busca uma opcao recente pela posicao exibida na vitrine mais recente.
export const getRecentSuggestedCarByPosition = (
  state: SessionState,
  position: number
): SessionSuggestedCar | null => {
  return state.recentSuggestedCars.find((car) => car.position === position) ?? null;
};

// Retorna outra opcao do ultimo conjunto, diferente do carro atualmente em foco.
export const getAlternativeRecentSuggestedCar = (
  state: SessionState,
  currentCar?: SessionCarReference | null
): SessionSuggestedCar | null => {
  const currentKey = currentCar ? buildCarReferenceKey(currentCar) : undefined;

  return state.recentSuggestedCars.find((car) => {
    if (!currentKey) {
      return car.position > 0;
    }

    return buildCarReferenceKey(car) !== currentKey;
  }) ?? null;
};

// Resolve a melhor ancora de comparacao entre o carro de referencia e a vitrine recente.
export const getComparisonAnchorCar = (
  state: SessionState
): SessionCarReference | null => {
  return state.referenceCar ?? getTopRecentSuggestedCar(state);
};

// Decide como ficam lastViewedCar, referenceCar e o ultimo conjunto recente depois da busca.
export const deriveCarContextAfterSearch = ({
  previousState,
  result,
  query,
  rejectedItems,
  shouldClearAnchors
}: {
  previousState: SessionState;
  result: SearchCarsResult;
  query?: string;
  rejectedItems: string[];
  shouldClearAnchors: boolean;
}): Pick<
  SessionState,
  | "lastViewedCar"
  | "referenceCar"
  | "recentSuggestedCars"
  | "recentSuggestedQuery"
  | "recentSuggestedScenario"
> => {
  const topSuggestion = result.suggestions[0]?.car ?? null;
  const recentSuggestedCars = buildRecentSuggestedCars(result);

  if (topSuggestion) {
    return {
      lastViewedCar: topSuggestion,
      referenceCar: topSuggestion,
      recentSuggestedCars,
      recentSuggestedQuery: query ?? previousState.recentSuggestedQuery,
      recentSuggestedScenario: result.scenario
    };
  }

  if (shouldClearAnchors) {
    return {
      lastViewedCar: null,
      referenceCar: null,
      recentSuggestedCars: [],
      recentSuggestedQuery: null,
      recentSuggestedScenario: null
    };
  }

  return {
    lastViewedCar: matchesCarReference(previousState.lastViewedCar, rejectedItems)
      ? null
      : previousState.lastViewedCar,
    referenceCar: matchesCarReference(previousState.referenceCar, rejectedItems)
      ? null
      : previousState.referenceCar,
    recentSuggestedCars: previousState.recentSuggestedCars,
    recentSuggestedQuery: previousState.recentSuggestedQuery,
    recentSuggestedScenario: previousState.recentSuggestedScenario
  };
};
