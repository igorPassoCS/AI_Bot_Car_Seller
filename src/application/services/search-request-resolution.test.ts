// Este arquivo valida a montagem final dos filtros a partir do estado da sessao.
import test from "node:test";
import assert from "node:assert/strict";
import carsData from "../../../data/cars.json";
import { createInitialSessionState } from "../../domain/session-state";
import { intentParsingSchema } from "./search-intent-evolution";
import { resolveSearchRequestFromState } from "./search-request-resolution";

const cars = carsData.map((record) => ({
  name: record.Name,
  model: record.Model,
  image: record.Image,
  price: record.Price,
  location: record.Location
}));

// Cria uma estrutura minima de intent parsing para os cenarios de teste.
const makeParsedIntent = (overrides: Record<string, unknown> = {}) => {
  return intentParsingSchema.parse({
    normalizedMessage: "test",
    criteria: {},
    rejectedItems: [],
    resetMode: "none",
    behaviorSignals: {
      locationPreference: "unchanged",
      budgetPreference: "unchanged"
    },
    ...overrides
  });
};

const recentSuggestedCars = [
  {
    name: "Fiat",
    model: "Pulse",
    image: "/images/cars/fiat_pulse.jpg",
    price: 96000,
    location: "Sao Paulo",
    matchType: "exact_match" as const,
    sellingPoints: ["Modelo alinhado com os filtros solicitados."],
    position: 0
  },
  {
    name: "Honda",
    model: "Civic",
    image: "/images/cars/honda_civic.jpg",
    price: 105000,
    location: "Rio de Janeiro",
    matchType: "partial_match" as const,
    sellingPoints: ["Opcao alternativa para manter a busca ativa."],
    position: 1
  }
];

// Verifica que uma troca explicita de cidade nao herda o filtro anterior.
test("explicit city alias clears stale city inheritance and enables strict location", () => {
  const state = {
    ...createInitialSessionState(),
    currentFilters: {
      location: "Sao Paulo",
      brand: "Honda"
    },
    referenceCar: {
      name: "Honda",
      model: "Civic",
      image: "/images/cars/honda_civic.jpg",
      price: 105000,
      location: "Rio de Janeiro"
    },
    lastViewedCar: {
      name: "Honda",
      model: "Civic",
      image: "/images/cars/honda_civic.jpg",
      price: 105000,
      location: "Rio de Janeiro"
    }
  };

  const resolution = resolveSearchRequestFromState({
    cars,
    message: "quero um carro no Rio",
    overrides: {},
    parsedIntent: makeParsedIntent(),
    state
  });

  assert.equal(resolution.effectiveCriteria.location, "Rio de Janeiro");
  assert.equal(resolution.filterMeta.locationOrigin, "alias");
  assert.equal(resolution.effectiveCriteria.strictLocation, true);
  assert.equal(resolution.shouldClearAnchors, true);
});

// Verifica que o reset total limpa localizacao herdada e ancoras de comparacao.
test("search reset removes inherited city and clears anchors", () => {
  const state = {
    ...createInitialSessionState(),
    currentFilters: {
      location: "Sao Paulo",
      brand: "Honda"
    },
    referenceCar: {
      name: "Honda",
      model: "Civic",
      image: "/images/cars/honda_civic.jpg",
      price: 105000,
      location: "Rio de Janeiro"
    },
    lastViewedCar: {
      name: "Honda",
      model: "Civic",
      image: "/images/cars/honda_civic.jpg",
      price: 105000,
      location: "Rio de Janeiro"
    }
  };

  const resolution = resolveSearchRequestFromState({
    cars,
    message: "esquece isso, me mostra Toyota",
    overrides: {},
    parsedIntent: makeParsedIntent({
      criteria: { brand: "Toyota" },
      resetMode: "search"
    }),
    state
  });

  assert.equal(resolution.effectiveCriteria.brand, "Toyota");
  assert.equal(resolution.effectiveCriteria.location, undefined);
  assert.equal(resolution.shouldClearAnchors, true);
});

// Garante que o calculo de preco relativo usa somente o carro de referencia.
test("more expensive than this uses referenceCar price deterministically", () => {
  const state = {
    ...createInitialSessionState(),
    referenceCar: {
      name: "Honda",
      model: "Civic",
      image: "/images/cars/honda_civic.jpg",
      price: 105000,
      location: "Rio de Janeiro"
    }
  };

  const resolution = resolveSearchRequestFromState({
    cars,
    message: "mais caro que este",
    overrides: {},
    parsedIntent: makeParsedIntent(),
    state
  });

  assert.equal(resolution.effectiveCriteria.minPrice, 105001);
  assert.equal(resolution.effectiveCriteria.maxPrice, undefined);
  assert.equal(resolution.filterMeta.priceOrigin, "relative");
  assert.equal(resolution.missingRelativeAnchor, false);
});

// Garante que a busca nao inventa comparacao relativa sem ancora valida.
test("relative price without reference car does not invent a number", () => {
  const resolution = resolveSearchRequestFromState({
    cars,
    message: "mais caro que este",
    overrides: {},
    parsedIntent: makeParsedIntent(),
    state: createInitialSessionState()
  });

  assert.equal(resolution.effectiveCriteria.minPrice, undefined);
  assert.equal(resolution.effectiveCriteria.maxPrice, undefined);
  assert.equal(resolution.missingRelativeAnchor, true);
});

// Garante que o ultimo conjunto mostrado pode servir de ancora quando nao ha referenceCar.
test("recentSuggestedCars[0] is used as fallback anchor for cheaper-than queries", () => {
  const state = {
    ...createInitialSessionState(),
    recentSuggestedCars
  };

  const resolution = resolveSearchRequestFromState({
    cars,
    message: "mais barato que esse",
    overrides: {},
    parsedIntent: makeParsedIntent(),
    state
  });

  assert.equal(resolution.effectiveCriteria.maxPrice, 95999);
  assert.equal(resolution.missingRelativeAnchor, false);
});

// Garante que referencias posicionais usam a ordem do ultimo conjunto exibido.
test("the second option is used as the comparison anchor when referenced explicitly", () => {
  const state = {
    ...createInitialSessionState(),
    recentSuggestedCars
  };

  const resolution = resolveSearchRequestFromState({
    cars,
    message: "quero algo mais barato que o segundo",
    overrides: {},
    parsedIntent: makeParsedIntent(),
    state
  });

  assert.equal(resolution.effectiveCriteria.maxPrice, 104999);
  assert.equal(resolution.missingRelativeAnchor, false);
});

// Garante que pedidos referenciais herdam a marca do ultimo conjunto quando necessario.
test("brand is inherited from the last shown set for dessa empresa", () => {
  const state = {
    ...createInitialSessionState(),
    recentSuggestedCars
  };

  const resolution = resolveSearchRequestFromState({
    cars,
    message: "tem mais algum dessa empresa",
    overrides: {},
    parsedIntent: makeParsedIntent(),
    state
  });

  assert.equal(resolution.effectiveCriteria.brand, "Fiat");
});

// Garante que pedidos referenciais herdam a cidade do ultimo conjunto quando necessario.
test("location is inherited from the last shown set for dessa cidade", () => {
  const state = {
    ...createInitialSessionState(),
    recentSuggestedCars
  };

  const resolution = resolveSearchRequestFromState({
    cars,
    message: "tem mais algum dessa cidade",
    overrides: {},
    parsedIntent: makeParsedIntent(),
    state
  });

  assert.equal(resolution.effectiveCriteria.location, "Sao Paulo");
});

// Verifica que a segunda tentativa respeita o escopo estrito apos rejeicao.
test("rejected location mismatch switches fallback policy to same_scope_only", () => {
  const state = {
    ...createInitialSessionState(),
    currentFilters: {
      brand: "Jeep",
      location: "Rio de Janeiro"
    },
    lastViewedCar: {
      name: "Jeep",
      model: "Renegade",
      image: "/images/cars/jeep_renegade.jpg",
      price: 122000,
      location: "Porto Alegre"
    },
    filterMeta: {
      locationOrigin: "explicit" as const,
      priceOrigin: "none" as const,
      fallbackPolicy: "allow_mismatch_once" as const
    },
    mismatchPersuasionByCar: {
      "Jeep Renegade": 1
    },
    intentState: {
      ...createInitialSessionState().intentState,
      lastScenario: "location_mismatch" as const
    }
  };

  const resolution = resolveSearchRequestFromState({
    cars,
    message: "nao quero esse, quero algo no Rio de Janeiro",
    overrides: {},
    parsedIntent: makeParsedIntent({
      rejectedItems: ["Jeep Renegade"],
      behaviorSignals: {
        locationPreference: "strict",
        budgetPreference: "unchanged"
      }
    }),
    state
  });

  assert.equal(resolution.filterMeta.fallbackPolicy, "same_scope_only");
  assert.equal(resolution.effectiveCriteria.strictLocation, true);
});
