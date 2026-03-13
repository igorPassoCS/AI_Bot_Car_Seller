import { z } from "zod";
import { imageSourceSchema } from "@/domain/car";
import {
  createInitialSearchIntentState,
  searchIntentStateSchema
} from "@/domain/search-intent";

export const sessionFiltersSchema = z.object({
  query: z.string().min(1).optional(),
  brand: z.string().min(1).optional(),
  model: z.string().min(1).optional(),
  location: z.string().min(1).optional(),
  minPrice: z.number().positive().optional(),
  maxPrice: z.number().positive().optional(),
  limit: z.number().int().min(1).max(8).optional()
});

export const sessionCarReferenceSchema = z.object({
  name: z.string().min(1),
  model: z.string().min(1),
  image: imageSourceSchema,
  price: z.number().positive(),
  location: z.string().min(1)
});

export const rejectedItemSchema = z.string().min(1);

export const sessionTurnSchema = z.object({
  role: z.enum(["user", "assistant"]),
  text: z.string().min(1)
});

export const sessionFactMemorySchema = z.object({
  preferredBrands: z.array(z.string().min(1)).default([]),
  dislikedLocations: z.array(z.string().min(1)).default([]),
  principalFacts: z.array(z.string().min(1)).default([]),
  budgetMin: z.number().positive().optional(),
  budgetMax: z.number().positive().optional()
});

export const sessionStateSchema = z.object({
  intentState: searchIntentStateSchema.default(createInitialSearchIntentState()),
  currentFilters: sessionFiltersSchema.default({}),
  lastViewedCar: sessionCarReferenceSchema.nullable().default(null),
  rejectedItems: z.array(rejectedItemSchema).default([]),
  mismatchPersuasionByCar: z.record(z.number().int().min(0)).default({}),
  recentTurns: z.array(sessionTurnSchema).default([]),
  historySummary: z.string().default(""),
  factMemory: sessionFactMemorySchema.default({})
});

export type SessionState = z.infer<typeof sessionStateSchema>;
export type SessionCarReference = z.infer<typeof sessionCarReferenceSchema>;

export const createInitialSessionState = (): SessionState =>
  sessionStateSchema.parse({});
