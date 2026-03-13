// Este arquivo adapta o caso de uso de busca para o formato de tool do Mastra.
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { env } from "@/config/env";
import type { SearchCarsInput } from "@/domain/car";
import { imageSourceSchema } from "@/domain/car";
import { JsonCarRepository } from "@/infrastructure/repositories/json-car-repository";
import { SearchCarsUseCase } from "@/application/use-cases/search-cars";

const inputSchema = z.object({
  query: z.string().trim().min(1).nullable(),
  brand: z.string().trim().min(1).nullable(),
  model: z.string().trim().min(1).nullable(),
  minPrice: z.number().positive().nullable(),
    maxPrice: z.number().positive().nullable(),
    location: z.string().trim().min(1).nullable(),
    limit: z.number().int().min(1).max(8).nullable(),
    excludedItems: z.array(z.string().trim().min(1)).nullable(),
    strictLocation: z.boolean().nullable(),
    fallbackPolicy: z
      .enum(["allow_mismatch_once", "same_scope_only"])
      .nullable()
  });

const outputSchema = z.object({
  scenario: z.string(),
  interpretedCriteria: z.object({
    brand: z.string().optional(),
    model: z.string().optional(),
    minPrice: z.number().optional(),
    maxPrice: z.number().optional(),
    location: z.string().optional()
  }),
  suggestions: z.array(
    z.object({
      car: z.object({
        name: z.string(),
        model: z.string(),
        image: imageSourceSchema,
        price: z.number(),
        location: z.string()
      }),
      matchType: z.string(),
      sellingPoints: z.array(z.string())
    })
  )
});

// Converte null vindo da tool em undefined para o caso de uso interno.
const toOptional = <T>(value: T | null): T | undefined => {
  return value === null ? undefined : value;
};

// Normaliza o payload da tool para o formato usado pela busca local.
const normalizeToolInput = (
  input: z.infer<typeof inputSchema>
): SearchCarsInput => {
  return {
    query: toOptional(input.query),
    brand: toOptional(input.brand),
    model: toOptional(input.model),
    minPrice: toOptional(input.minPrice),
    maxPrice: toOptional(input.maxPrice),
    location: toOptional(input.location),
    limit: toOptional(input.limit),
    excludedItems: toOptional(input.excludedItems),
    strictLocation: toOptional(input.strictLocation),
    fallbackPolicy: toOptional(input.fallbackPolicy)
  };
};

export const searchCarsTool = createTool({
  id: "searchCars",
  description:
    "Busca carros no estoque local. Tambem retorna alternativas quando preco ou localizacao nao batem.",
  inputSchema,
  outputSchema,
  execute: async (context) => {
    const repository = new JsonCarRepository(env.CARS_DATA_PATH);
    const useCase = new SearchCarsUseCase(repository);
    return useCase.execute(normalizeToolInput(context));
  }
});
