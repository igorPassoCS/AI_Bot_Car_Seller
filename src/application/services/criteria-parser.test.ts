// Este arquivo cobre a resolucao deterministica de cidade no parser heuristico.
import test from "node:test";
import assert from "node:assert/strict";
import carsData from "../../../data/cars.json";
import {
  parseCriteriaFromMessage,
  resolveLocationFromMessage
} from "./criteria-parser";

const cars = carsData.map((record) => ({
  name: record.Name,
  model: record.Model,
  image: record.Image,
  price: record.Price,
  location: record.Location
}));

// Valida que aliases conhecidos sao convertidos para a cidade canonica do inventario.
test("resolveLocationFromMessage maps Rio alias to Rio de Janeiro", () => {
  const resolution = resolveLocationFromMessage(cars, "I want a car in Rio");

  assert.equal(resolution.location, "Rio de Janeiro");
  assert.equal(resolution.origin, "alias");
  assert.equal(resolution.hasExplicitLocationHint, true);
});

// Garante que a extracao principal reaproveita a mesma logica de alias.
test("parseCriteriaFromMessage prefers deterministic city aliases", () => {
  const criteria = parseCriteriaFromMessage(cars, "quero um carro no Rio");

  assert.equal(criteria.location, "Rio de Janeiro");
});

// Garante que uma cidade desconhecida nao reutiliza uma cidade antiga por engano.
test("resolveLocationFromMessage keeps explicit unresolved city hints without inventing a city", () => {
  const resolution = resolveLocationFromMessage(cars, "quero um carro em Salvador");

  assert.equal(resolution.location, undefined);
  assert.equal(resolution.origin, "none");
  assert.equal(resolution.hasExplicitLocationHint, true);
});
