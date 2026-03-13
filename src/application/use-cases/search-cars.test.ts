// Este arquivo cobre o comportamento de fallback do caso de uso de busca.
import test from "node:test";
import assert from "node:assert/strict";
import carsData from "../../../data/cars.json";
import { SearchCarsUseCase } from "./search-cars";

const cars = carsData.map((record) => ({
  name: record.Name,
  model: record.Model,
  image: record.Image,
  price: record.Price,
  location: record.Location
}));

const useCase = new SearchCarsUseCase({
  getAllCars: async () => cars
});

// Garante que o sistema ainda pode tentar uma unica sugestao fora da cidade.
test("strict location allows one location mismatch suggestion before pivot", async () => {
  const result = await useCase.execute({
    query: "Jeep no Rio de Janeiro",
    brand: "Jeep",
    location: "Rio de Janeiro",
    strictLocation: true,
    fallbackPolicy: "allow_mismatch_once"
  });

  assert.equal(result.scenario, "location_mismatch");
  assert.equal(result.suggestions[0]?.car.name, "Jeep");
  assert.equal(result.suggestions[0]?.car.model, "Renegade");
});

// Garante que, apos a rejeicao, a busca nao cai para o inventario global.
test("same_scope_only stops broad fallback after a rejected location mismatch", async () => {
  const result = await useCase.execute({
    query: "Jeep no Rio de Janeiro",
    brand: "Jeep",
    location: "Rio de Janeiro",
    strictLocation: true,
    fallbackPolicy: "same_scope_only",
    excludedItems: ["Renegade", "Jeep Renegade"]
  });

  assert.equal(result.scenario, "no_filtered_match");
  assert.equal(result.suggestions.length, 0);
});
