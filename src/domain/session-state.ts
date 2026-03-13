// Este arquivo concentra o formato oficial do estado de sessao usado no workflow.
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

export const locationOriginSchema = z.enum([
  "none",
  "explicit",
  "alias",
  "inherited"
]);
export const priceOriginSchema = z.enum([
  "none",
  "explicit",
  "relative",
  "inherited"
]);
export const fallbackPolicySchema = z.enum([
  "allow_mismatch_once",
  "same_scope_only"
]);

export const sessionFilterMetaSchema = z.object({
  locationOrigin: locationOriginSchema.default("none"),
  priceOrigin: priceOriginSchema.default("none"),
  fallbackPolicy: fallbackPolicySchema.default("allow_mismatch_once")
});

export const sessionStateSchema = z.object({
  intentState: searchIntentStateSchema.default(createInitialSearchIntentState()),
  currentFilters: sessionFiltersSchema.default({}),
  referenceCar: sessionCarReferenceSchema.nullable().default(null),
  lastViewedCar: sessionCarReferenceSchema.nullable().default(null),
  filterMeta: sessionFilterMetaSchema.default({}),
  rejectedItems: z.array(rejectedItemSchema).default([]),
  mismatchPersuasionByCar: z.record(z.number().int().min(0)).default({}),
  recentTurns: z.array(sessionTurnSchema).default([]),
  historySummary: z.string().default(""),
  factMemory: sessionFactMemorySchema.default({})
});

export type SessionState = z.infer<typeof sessionStateSchema>;
export type SessionCarReference = z.infer<typeof sessionCarReferenceSchema>;
export type SessionFilterMeta = z.infer<typeof sessionFilterMetaSchema>;

// Cria um estado inicial consistente para novas conversas.
export const createInitialSessionState = (): SessionState =>
  sessionStateSchema.parse({});
