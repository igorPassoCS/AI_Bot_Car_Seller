// Este arquivo valida a persistencia do ultimo conjunto estruturado exibido.
import test from "node:test";
import assert from "node:assert/strict";
import { createInitialSessionState } from "../../domain/session-state";
import { deriveCarContextAfterSearch } from "./search-session-state";

const exactResult = {
  scenario: "exact_match" as const,
  interpretedCriteria: {
    brand: "Fiat",
    location: "Sao Paulo"
  },
  suggestions: [
    {
      car: {
        name: "Fiat",
        model: "Pulse",
        image: "/images/cars/fiat_pulse.jpg",
        price: 96000,
        location: "Sao Paulo"
      },
      matchType: "exact_match" as const,
      sellingPoints: ["Modelo alinhado com os filtros solicitados."]
    },
    {
      car: {
        name: "Honda",
        model: "Civic",
        image: "/images/cars/honda_civic.jpg",
        price: 105000,
        location: "Rio de Janeiro"
      },
      matchType: "partial_match" as const,
      sellingPoints: ["Opcao alternativa para manter a busca ativa."]
    }
  ]
};

// Garante que o ultimo conjunto exibido preserva ordem, metadados e carro principal.
test("deriveCarContextAfterSearch stores the latest shown set with positions", () => {
  const context = deriveCarContextAfterSearch({
    previousState: createInitialSessionState(),
    result: exactResult,
    query: "quero um fiat",
    rejectedItems: [],
    shouldClearAnchors: false
  });

  assert.equal(context.lastViewedCar?.name, "Fiat");
  assert.equal(context.referenceCar?.name, "Fiat");
  assert.equal(context.recentSuggestedCars.length, 2);
  assert.equal(context.recentSuggestedCars[0]?.position, 0);
  assert.equal(context.recentSuggestedCars[1]?.position, 1);
  assert.equal(context.recentSuggestedQuery, "quero um fiat");
  assert.equal(context.recentSuggestedScenario, "exact_match");
});

// Garante que um reset amplo limpa tambem o ultimo conjunto estruturado.
test("deriveCarContextAfterSearch clears recentSuggestedCars when anchors are cleared without new results", () => {
  const previousState = {
    ...createInitialSessionState(),
    recentSuggestedCars: [
      {
        name: "Fiat",
        model: "Pulse",
        image: "/images/cars/fiat_pulse.jpg",
        price: 96000,
        location: "Sao Paulo",
        matchType: "exact_match" as const,
        sellingPoints: ["Modelo alinhado com os filtros solicitados."],
        position: 0
      }
    ],
    recentSuggestedQuery: "quero um fiat",
    recentSuggestedScenario: "exact_match" as const,
    referenceCar: {
      name: "Fiat",
      model: "Pulse",
      image: "/images/cars/fiat_pulse.jpg",
      price: 96000,
      location: "Sao Paulo"
    },
    lastViewedCar: {
      name: "Fiat",
      model: "Pulse",
      image: "/images/cars/fiat_pulse.jpg",
      price: 96000,
      location: "Sao Paulo"
    }
  };

  const context = deriveCarContextAfterSearch({
    previousState,
    result: {
      scenario: "no_filtered_match" as const,
      interpretedCriteria: {},
      suggestions: []
    },
    query: "esquece isso",
    rejectedItems: [],
    shouldClearAnchors: true
  });

  assert.equal(context.lastViewedCar, null);
  assert.equal(context.referenceCar, null);
  assert.equal(context.recentSuggestedCars.length, 0);
  assert.equal(context.recentSuggestedQuery, null);
  assert.equal(context.recentSuggestedScenario, null);
});
