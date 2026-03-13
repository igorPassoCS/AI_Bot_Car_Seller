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
  const hasCurrencyHint = /r\$\s*\d|\breais?\b/i.test(message);

  const normalizedMessage = message
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  const compactMatches = [...normalizedMessage.matchAll(
    /(\d{1,3}(?:[.,]\d{1,2})?)\s*(k|milhao|milhaoes|milhoes|m|mil)\b/gi
  )];
  const compactValues = compactMatches
    .map((entry) => {
      const rawNumber = Number(entry[1].replace(",", "."));
      if (!Number.isFinite(rawNumber) || rawNumber <= 0) {
        return undefined;
      }

      const unit = entry[2].toLowerCase();
      if (unit === "k" || unit === "mil") {
        return Math.round(rawNumber * 1_000);
      }
      if (unit === "m" || unit.includes("milhao")) {
        return Math.round(rawNumber * 1_000_000);
      }
      return undefined;
    })
    .filter((value): value is number => value !== undefined);

  if (compactValues.length > 0) {
    return Math.max(...compactValues);
  }

  if (!hasBudgetHint && !hasCurrencyHint) {
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

  return Math.max(...parsed);
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
