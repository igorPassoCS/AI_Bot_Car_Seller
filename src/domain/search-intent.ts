import { z } from "zod";

export const locationSensitivitySchema = z.enum(["low", "medium", "high"]);
export const budgetFlexibilitySchema = z.enum([
  "rigid",
  "moderate",
  "flexible"
]);

export const preferredCriteriaSchema = z.object({
  brand: z.string().optional(),
  model: z.string().optional(),
  location: z.string().optional(),
  maxPrice: z.number().positive().optional()
});

export const searchIntentStateSchema = z.object({
  locationSensitivity: locationSensitivitySchema.default("medium"),
  budgetFlexibility: budgetFlexibilitySchema.default("moderate"),
  locationRejectionCount: z.number().int().min(0).default(1),
  budgetResistanceCount: z.number().int().min(0).default(1),
  turns: z.number().int().min(0).default(0),
  lastScenario: z
    .enum([
      "exact_match",
      "price_mismatch",
      "location_mismatch",
      "partial_match",
      "no_filtered_match"
    ])
    .optional(),
  preferredCriteria: preferredCriteriaSchema.default({})
});

export type SearchIntentState = z.infer<typeof searchIntentStateSchema>;

export const createInitialSearchIntentState = (): SearchIntentState =>
  searchIntentStateSchema.parse({});
