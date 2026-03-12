import { z } from "zod";
import type { SearchCarsInput, SearchCarsResult } from "@/domain/car";
import type { SearchIntentState } from "@/domain/search-intent";
import { searchIntentStateSchema } from "@/domain/search-intent";

const locationStrictPattern =
  /\b(nao quero|não quero|somente|apenas|so em|s[oó] em|must be|only in|nao aceito outra cidade|não aceito outra cidade|nao vou viajar|não vou viajar)\b/i;
const locationOpenPattern =
  /\b(qualquer cidade|pode ser outra cidade|aceito entrega|entrega|posso viajar|travel|any city|tanto faz a cidade)\b/i;
const budgetStrictPattern =
  /\b(nao passo|não passo|teto|maximo|máximo|limite|sem passar|can't exceed|cannot exceed|under)\b/i;
const budgetFlexiblePattern =
  /\b(posso aumentar|tenho flexibilidade|consigo subir|aceito pagar mais|esticar o orcamento|esticar o orçamento|a little more|can stretch)\b/i;
const greetingPattern =
  /^\s*(oi|ola|olá|opa|aoba|e ai|e aí|bom dia|boa tarde|boa noite|hello|hi|hey)\W*$/i;

const criteriaSchema = z.object({
  brand: z.string().optional(),
  model: z.string().optional(),
  maxPrice: z.number().positive().optional(),
  location: z.string().optional(),
  limit: z.number().int().min(1).max(8).optional()
});

export const intentTypeSchema = z.enum(["greeting", "search", "refinement"]);
export const missingFieldSchema = z.enum([
  "brand",
  "model",
  "maxPrice",
  "location"
]);

type MissingField = z.infer<typeof missingFieldSchema>;

export const intentParsingSchema = z.object({
  normalizedMessage: z.string().min(1),
  intentType: intentTypeSchema.default("search"),
  needsMoreInfo: z.boolean().default(false),
  missingFields: z.array(missingFieldSchema).default([]),
  criteria: criteriaSchema.default({}),
  behaviorSignals: z
    .object({
      locationPreference: z.enum(["strict", "open", "unchanged"]).default("unchanged"),
      budgetPreference: z.enum(["strict", "flexible", "unchanged"]).default("unchanged")
    })
    .default({
      locationPreference: "unchanged",
      budgetPreference: "unchanged"
    })
});

export type IntentParsingOutput = z.infer<typeof intentParsingSchema>;

const hasAnyCriteria = (criteria: Partial<SearchCarsInput>): boolean => {
  return Boolean(
    criteria.brand || criteria.model || criteria.maxPrice || criteria.location
  );
};

const inferMissingFields = (
  criteria: Partial<SearchCarsInput>
): MissingField[] => {
  const missing: MissingField[] = [];
  if (!criteria.brand) {
    missing.push("brand");
  }
  if (!criteria.model) {
    missing.push("model");
  }
  if (!criteria.maxPrice) {
    missing.push("maxPrice");
  }
  if (!criteria.location) {
    missing.push("location");
  }
  return missing;
};

export const normalizeIntentParsing = ({
  message,
  parsedIntent,
  hasHistory
}: {
  message: string;
  parsedIntent: IntentParsingOutput;
  hasHistory: boolean;
}): IntentParsingOutput => {
  const hasCriteria = hasAnyCriteria(parsedIntent.criteria);
  const heuristicGreeting =
    greetingPattern.test(message) && !hasCriteria && !hasHistory;
  const missingFields = inferMissingFields(parsedIntent.criteria);

  const fallbackIntentType: z.infer<typeof intentTypeSchema> = hasHistory
    ? "refinement"
    : "search";

  return intentParsingSchema.parse({
    ...parsedIntent,
    intentType: heuristicGreeting
      ? "greeting"
      : parsedIntent.intentType ?? fallbackIntentType,
    needsMoreInfo:
      heuristicGreeting ||
      parsedIntent.needsMoreInfo ||
      (!hasCriteria && !hasHistory),
    missingFields:
      parsedIntent.missingFields.length > 0
        ? parsedIntent.missingFields
        : missingFields
  });
};

const toLocationSensitivity = (
  locationRejectionCount: number
): SearchIntentState["locationSensitivity"] => {
  if (locationRejectionCount >= 2) {
    return "high";
  }
  if (locationRejectionCount === 0) {
    return "low";
  }
  return "medium";
};

const toBudgetFlexibility = (
  budgetResistanceCount: number
): SearchIntentState["budgetFlexibility"] => {
  if (budgetResistanceCount >= 2) {
    return "rigid";
  }
  if (budgetResistanceCount === 0) {
    return "flexible";
  }
  return "moderate";
};

const clampToZero = (value: number): number => Math.max(0, value);

const firstDefined = <T>(
  ...values: Array<T | undefined>
): T | undefined => values.find((value) => value !== undefined);

export const resolveCriteriaWithState = (
  overrides: Partial<SearchCarsInput>,
  parsedCriteria: Partial<SearchCarsInput>,
  state: SearchIntentState
): Partial<SearchCarsInput> => {
  return {
    brand: firstDefined(
      overrides.brand,
      parsedCriteria.brand,
      state.preferredCriteria.brand
    ),
    model: firstDefined(
      overrides.model,
      parsedCriteria.model,
      state.preferredCriteria.model
    ),
    location: firstDefined(
      overrides.location,
      parsedCriteria.location,
      state.preferredCriteria.location
    ),
    maxPrice: firstDefined(
      overrides.maxPrice,
      parsedCriteria.maxPrice,
      state.preferredCriteria.maxPrice
    ),
    limit: firstDefined(overrides.limit, parsedCriteria.limit, 3)
  };
};

export const evolveSearchIntentState = ({
  previousState,
  userMessage,
  parsedIntent,
  result
}: {
  previousState: SearchIntentState;
  userMessage: string;
  parsedIntent: IntentParsingOutput;
  result: SearchCarsResult;
}): SearchIntentState => {
  let nextLocationRejectionCount = previousState.locationRejectionCount;
  let nextBudgetResistanceCount = previousState.budgetResistanceCount;

  const locationIsStrict =
    parsedIntent.behaviorSignals.locationPreference === "strict" ||
    locationStrictPattern.test(userMessage);
  const locationIsOpen =
    parsedIntent.behaviorSignals.locationPreference === "open" ||
    locationOpenPattern.test(userMessage);
  const budgetIsStrict =
    parsedIntent.behaviorSignals.budgetPreference === "strict" ||
    budgetStrictPattern.test(userMessage);
  const budgetIsFlexible =
    parsedIntent.behaviorSignals.budgetPreference === "flexible" ||
    budgetFlexiblePattern.test(userMessage);

  if (locationIsStrict) {
    nextLocationRejectionCount += 1;
  }
  if (locationIsOpen) {
    nextLocationRejectionCount = clampToZero(nextLocationRejectionCount - 1);
  }
  if (budgetIsStrict) {
    nextBudgetResistanceCount += 1;
  }
  if (budgetIsFlexible) {
    nextBudgetResistanceCount = clampToZero(nextBudgetResistanceCount - 1);
  }

  const preferredCriteria = {
    ...previousState.preferredCriteria,
    ...Object.fromEntries(
      Object.entries(result.interpretedCriteria).filter(
        ([, value]) => value !== undefined
      )
    )
  };

  return searchIntentStateSchema.parse({
    ...previousState,
    turns: previousState.turns + 1,
    locationRejectionCount: nextLocationRejectionCount,
    budgetResistanceCount: nextBudgetResistanceCount,
    locationSensitivity: toLocationSensitivity(nextLocationRejectionCount),
    budgetFlexibility: toBudgetFlexibility(nextBudgetResistanceCount),
    preferredCriteria,
    lastScenario: result.scenario
  });
};
