import type {
  Car,
  CarSuggestion,
  SearchCarsInput,
  SearchCarsResult
} from "@/domain/car";
import type { CarRepository } from "@/application/ports/car-repository";
import { parseCriteriaFromMessage } from "@/application/services/criteria-parser";

const normalize = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const locationEquals = (a: string, b: string): boolean =>
  normalize(a) === normalize(b);

const includesTerm = (value: string, term?: string): boolean => {
  if (!term) {
    return true;
  }
  return normalize(value).includes(normalize(term));
};

const isRejectedCar = (car: Car, rejectedItems: string[] = []): boolean => {
  if (rejectedItems.length === 0) {
    return false;
  }

  const brand = normalize(car.name);
  const model = normalize(car.model);
  const composite = normalize(`${car.name} ${car.model}`);

  return rejectedItems.some((item) => {
    const normalizedItem = normalize(item);
    return (
      normalizedItem === brand ||
      normalizedItem === model ||
      normalizedItem === composite
    );
  });
};

const buildSellingPoints = (
  car: Car,
  matchType: CarSuggestion["matchType"],
  requestedLocation?: string,
  requestedBudget?: number
): string[] => {
  if (matchType === "exact_match") {
    return [
      "Modelo alinhado com os filtros solicitados.",
      `Disponivel em ${car.location} com preco competitivo para a categoria.`
    ];
  }

  if (matchType === "price_mismatch") {
    const delta = requestedBudget ? car.price - requestedBudget : undefined;
    return [
      delta && delta > 0
        ? `Fica R$ ${delta.toLocaleString("pt-BR")} acima do seu teto, mas entrega mais valor por equipamento e revenda.`
        : "Mesmo acima do valor ideal, este carro entrega excelente custo-beneficio na categoria.",
      `${car.name} ${car.model} tem liquidez forte e manutencao previsivel no mercado brasileiro.`
    ];
  }

  if (matchType === "location_mismatch") {
    return [
      `Esta opcao esta em ${car.location}, diferente de ${requestedLocation}.`,
      "Podemos negociar entrega, vistoria remota e reservar o carro para evitar perder a oportunidade."
    ];
  }

  return [
    "Opcao alternativa para manter a busca ativa com modelos proximos ao seu objetivo.",
    `${car.name} ${car.model} combina bom pacote de tecnologia, conforto e custo de uso.`
  ];
};

const orderByPriceDistance = (
  cars: Car[],
  maxPrice?: number,
  minPrice?: number
): Car[] => {
  if (minPrice && !maxPrice) {
    return [...cars].sort((a, b) => {
      const distanceA = Math.abs(a.price - minPrice);
      const distanceB = Math.abs(b.price - minPrice);
      return distanceA - distanceB;
    });
  }

  if (!maxPrice) {
    return [...cars].sort((a, b) => a.price - b.price);
  }
  return [...cars].sort((a, b) => {
    const distanceA = Math.abs(a.price - maxPrice);
    const distanceB = Math.abs(b.price - maxPrice);
    return distanceA - distanceB;
  });
};

export class SearchCarsUseCase {
  constructor(private readonly carRepository: CarRepository) {}

  async execute(input: SearchCarsInput): Promise<SearchCarsResult> {
    const allCars = await this.carRepository.getAllCars();
    const inferred = parseCriteriaFromMessage(allCars, input.query);

    const brand = input.brand ?? inferred.brand;
    const model = input.model ?? inferred.model;
    const location = input.location ?? inferred.location;
    const minPrice = input.minPrice;
    const maxPrice = input.maxPrice ?? inferred.maxPrice;
    const limit = input.limit ?? 3;
    const excludedItems = input.excludedItems ?? [];
    const hasActiveCriteria = Boolean(
      brand || model || location || minPrice || maxPrice
    );
    const isPriceOnlySearch = Boolean(
      (minPrice || maxPrice) && !brand && !model && !location
    );

    const baseFiltered = allCars.filter(
      (car) =>
        !isRejectedCar(car, excludedItems) &&
        includesTerm(car.name, brand) &&
        includesTerm(car.model, model) &&
        (!location || locationEquals(car.location, location))
    );

    const relaxedFiltered = allCars.filter(
      (car) =>
        !isRejectedCar(car, excludedItems) &&
        includesTerm(car.name, brand) &&
        includesTerm(car.model, model)
    );

    const exact = baseFiltered.filter((car) =>
      (minPrice ? car.price >= minPrice : true) &&
      (maxPrice ? car.price <= maxPrice : true)
    );

    // Evita falso positivo de "match exato" quando o usuario ainda nao definiu filtros reais.
    if (hasActiveCriteria && exact.length > 0) {
      return {
        scenario: "exact_match",
        interpretedCriteria: { brand, model, location, minPrice, maxPrice },
        suggestions: orderByPriceDistance(exact, maxPrice, minPrice)
          .slice(0, limit)
          .map((car) => ({
            car,
            matchType: "exact_match",
            sellingPoints: buildSellingPoints(car, "exact_match", location, maxPrice)
          }))
      };
    }

    if (relaxedFiltered.length > 0 && maxPrice) {
      const aboveBudget = relaxedFiltered.filter((car) => car.price > maxPrice);
      if (aboveBudget.length > 0) {
        // Para consultas apenas por teto de preco, mostra a melhor aproximacao para evitar ruido visual.
        const priceMismatchLimit = isPriceOnlySearch ? 1 : limit;
        return {
          scenario: "price_mismatch",
          interpretedCriteria: { brand, model, location, minPrice, maxPrice },
          suggestions: orderByPriceDistance(aboveBudget, maxPrice, minPrice)
            .slice(0, priceMismatchLimit)
            .map((car) => ({
              car,
              matchType: "price_mismatch",
              sellingPoints: buildSellingPoints(
                car,
                "price_mismatch",
                location,
                maxPrice
              )
            }))
        };
      }
    }

    if (relaxedFiltered.length > 0 && location) {
      const differentLocation = relaxedFiltered.filter(
        (car) => !locationEquals(car.location, location)
      );
      if (differentLocation.length > 0) {
        return {
          scenario: "location_mismatch",
          interpretedCriteria: { brand, model, location, minPrice, maxPrice },
          suggestions: orderByPriceDistance(differentLocation, maxPrice, minPrice)
            .slice(0, limit)
            .map((car) => ({
              car,
              matchType: "location_mismatch",
              sellingPoints: buildSellingPoints(
                car,
                "location_mismatch",
                location,
                maxPrice
              )
            }))
        };
      }
    }

    const fallbackBase = allCars.filter((car) =>
      !isRejectedCar(car, excludedItems) &&
      (minPrice ? car.price >= minPrice : true) &&
      (maxPrice ? car.price <= maxPrice : true)
    );
    const fallbackPool = fallbackBase.length > 0
      ? fallbackBase
      : allCars.filter((car) => !isRejectedCar(car, excludedItems));
    const fallback = orderByPriceDistance(
      fallbackPool,
      maxPrice,
      minPrice
    ).slice(0, limit);
    return {
      scenario: "no_filtered_match",
      interpretedCriteria: { brand, model, location, minPrice, maxPrice },
      suggestions: fallback.map((car) => ({
        car,
        matchType: "partial_match",
        sellingPoints: buildSellingPoints(car, "partial_match", location, maxPrice)
      }))
    };
  }
}
