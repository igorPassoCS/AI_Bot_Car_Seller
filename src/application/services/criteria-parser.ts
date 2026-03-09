import type { Car, SearchCarsInput } from "@/domain/car";

const normalize = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const extractBudget = (message: string): number | undefined => {
  const hasBudgetHint =
    /\b(ate|under|below|budget|max|price|preco|valor|custar)\b/i.test(message);
  if (!hasBudgetHint) {
    return undefined;
  }

  const candidates = message.match(/(\d{2,3}(?:[.,]\d{3})+|\d{4,6})/g);
  if (!candidates || candidates.length === 0) {
    return undefined;
  }

  const parsed = candidates
    .map((candidate) =>
      Number(candidate.replaceAll(".", "").replaceAll(",", ""))
    )
    .filter((value) => Number.isFinite(value) && value > 0);

  return parsed[0];
};

export const parseCriteriaFromMessage = (
  cars: Car[],
  message?: string
): Partial<SearchCarsInput> => {
  if (!message) {
    return {};
  }

  const normalizedMessage = normalize(message);

  const brands = [...new Set(cars.map((car) => car.name))];
  const models = [...new Set(cars.map((car) => car.model))];
  const locations = [...new Set(cars.map((car) => car.location))];

  const brand = brands.find((candidate) =>
    normalizedMessage.includes(normalize(candidate))
  );
  const model = models.find((candidate) =>
    normalizedMessage.includes(normalize(candidate))
  );
  const location = locations.find((candidate) =>
    normalizedMessage.includes(normalize(candidate))
  );
  const maxPrice = extractBudget(message);

  return { brand, model, location, maxPrice };
};
