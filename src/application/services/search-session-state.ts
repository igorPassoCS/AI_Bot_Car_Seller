// Este arquivo encapsula a atualizacao de carros de contexto apos cada busca.
import type { SearchCarsResult } from "@/domain/car";
import type { SessionCarReference, SessionState } from "@/domain/session-state";

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

// Decide como ficam lastViewedCar e referenceCar depois do resultado da busca.
export const deriveCarContextAfterSearch = ({
  previousState,
  result,
  rejectedItems,
  shouldClearAnchors
}: {
  previousState: SessionState;
  result: SearchCarsResult;
  rejectedItems: string[];
  shouldClearAnchors: boolean;
}): Pick<SessionState, "lastViewedCar" | "referenceCar"> => {
  const topSuggestion = result.suggestions[0]?.car ?? null;

  if (topSuggestion) {
    return {
      lastViewedCar: topSuggestion,
      referenceCar: topSuggestion
    };
  }

  if (shouldClearAnchors) {
    return {
      lastViewedCar: null,
      referenceCar: null
    };
  }

  return {
    lastViewedCar: matchesCarReference(previousState.lastViewedCar, rejectedItems)
      ? null
      : previousState.lastViewedCar,
    referenceCar: matchesCarReference(previousState.referenceCar, rejectedItems)
      ? null
      : previousState.referenceCar
  };
};
