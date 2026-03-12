import type { SearchCarsResult } from "@/domain/car";

export const buildFallbackReply = (result: SearchCarsResult): string => {
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
