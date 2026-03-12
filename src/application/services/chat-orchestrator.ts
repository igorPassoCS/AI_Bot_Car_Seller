import type { SearchCarsInput, SearchCarsResult } from "@/domain/car";
import { env } from "@/config/env";
import { mastra } from "@/mastra";
import { JsonCarRepository } from "@/infrastructure/repositories/json-car-repository";
import { SearchCarsUseCase } from "@/application/use-cases/search-cars";

export type ChatResponse = {
  reply: string;
  result: SearchCarsResult;
};

// Prompt part of the application:
const buildPrompt = (message: string, result: SearchCarsResult): string => {
  return `
User request:
${message}

Search result JSON:
${JSON.stringify(result, null, 2)}

Provide a concise sales response using this result.
Mention mismatch reasons when applicable and recommend the top options.
`;
};

const buildFallbackReply = (result: SearchCarsResult): string => {
  const top = result.suggestions[0];
  if (!top) {
    return "Nao encontrei carros agora. Tente ajustar os filtros de marca, preco ou cidade.";
  }

  const base = `${top.car.name} ${top.car.model} por R$ ${top.car.price.toLocaleString(
    "pt-BR"
  )} em ${top.car.location}.`;

  if (result.scenario === "exact_match") {
    return `Encontrei uma opcao alinhada ao seu pedido: ${base}`;
  }

  if (result.scenario === "price_mismatch") {
    return `Nao achei dentro do teto exato, mas a melhor aproximacao e ${base} Vale considerar pelo custo-beneficio e liquidez.`;
  }

  if (result.scenario === "location_mismatch") {
    return `Nao achei na cidade exata, mas esta opcao se destaca: ${base} Podemos avaliar entrega ou reserva remota.`;
  }

  return `Nao houve match exato, mas recomendo comecar por: ${base}`;
};

export const runSalesConsultant = async (
  message: string,
  overrides: Partial<SearchCarsInput> = {}
): Promise<ChatResponse> => {
  const repository = new JsonCarRepository(env.CARS_DATA_PATH);
  const useCase = new SearchCarsUseCase(repository);
  const result = await useCase.execute({
    query: message,
    ...overrides
  });

  try {
    const agent = mastra.getAgent("salesConsultant");
    const generation = await agent.generate(buildPrompt(message, result));
    const reply = generation.text?.trim();
    if (reply && reply.length > 0) {
      return { reply, result };
    }
    return { reply: buildFallbackReply(result), result };
  } catch {
    return { reply: buildFallbackReply(result), result };
  }
};
