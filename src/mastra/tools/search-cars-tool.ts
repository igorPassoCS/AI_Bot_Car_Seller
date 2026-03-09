import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { env } from "@/config/env";
import { JsonCarRepository } from "@/infrastructure/repositories/json-car-repository";
import { SearchCarsUseCase } from "@/application/use-cases/search-cars";

const inputSchema = z.object({
  query: z.string().optional(),
  brand: z.string().optional(),
  model: z.string().optional(),
  maxPrice: z.number().positive().optional(),
  location: z.string().optional(),
  limit: z.number().int().min(1).max(8).optional()
});

const outputSchema = z.object({
  scenario: z.string(),
  interpretedCriteria: z.object({
    brand: z.string().optional(),
    model: z.string().optional(),
    maxPrice: z.number().optional(),
    location: z.string().optional()
  }),
  suggestions: z.array(
    z.object({
      car: z.object({
        name: z.string(),
        model: z.string(),
        image: z.string().url(),
        price: z.number(),
        location: z.string()
      }),
      matchType: z.string(),
      sellingPoints: z.array(z.string())
    })
  )
});

export const searchCarsTool = createTool({
  id: "searchCars",
  description:
    "Busca carros no estoque local. Tambem retorna alternativas quando preco ou localizacao nao batem.",
  inputSchema,
  outputSchema,
  execute: async ({ context }) => {
    const repository = new JsonCarRepository(env.CARS_DATA_PATH);
    const useCase = new SearchCarsUseCase(repository);
    return useCase.execute(context);
  }
});
