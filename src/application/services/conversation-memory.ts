import type { SearchCarsInput, SearchCarsResult } from "@/domain/car";
import type { SessionState } from "@/domain/session-state";
import { sessionStateSchema } from "@/domain/session-state";

const MAX_SHORT_TERM_TURNS = 10;

const normalize = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const appendUnique = (items: string[], value?: string): string[] => {
  if (!value) {
    return items;
  }

  const normalizedValue = normalize(value);
  if (items.some((item) => normalize(item) === normalizedValue)) {
    return items;
  }

  return [...items, value];
};

const detectPrincipalFacts = (
  message: string,
  filters: Partial<SearchCarsInput>,
  result: SearchCarsResult
): string[] => {
  const facts: string[] = [];
  const normalizedMessage = normalize(message);

  if (filters.brand) {
    facts.push(`Marca de interesse: ${filters.brand}.`);
  }
  if (filters.model) {
    facts.push(`Modelo de interesse: ${filters.model}.`);
  }
  if (filters.location) {
    facts.push(`Cidade preferida: ${filters.location}.`);
  }
  if (filters.minPrice) {
    facts.push(
      `Busca acima de R$ ${filters.minPrice.toLocaleString("pt-BR")}.`
    );
  }
  if (filters.maxPrice) {
    facts.push(
      `Busca ate R$ ${filters.maxPrice.toLocaleString("pt-BR")}.`
    );
  }
  if (/mais caro|more expensive|acima desse|acima deste|superior a esse/i.test(message)) {
    facts.push("Refinamento relativo: usuario quer uma opcao mais cara.");
  }
  if (/mais barato|cheaper|menos caro|abaixo desse|abaixo deste/i.test(message)) {
    facts.push("Refinamento relativo: usuario quer uma opcao mais barata.");
  }
  if (/compar|versus|\bvs\b/.test(normalizedMessage)) {
    facts.push("Usuario pediu comparacao entre opcoes.");
  }
  if (result.scenario === "location_mismatch") {
    facts.push("Houve divergencia de localizacao nas sugestoes recentes.");
  }

  return facts;
};

const buildHistorySummary = (state: SessionState): string => {
  const lines: string[] = [];

  if (state.factMemory.budgetMin || state.factMemory.budgetMax) {
    const parts: string[] = [];

    if (state.factMemory.budgetMin) {
      parts.push(
        `acima de R$ ${state.factMemory.budgetMin.toLocaleString("pt-BR")}`
      );
    }
    if (state.factMemory.budgetMax) {
      parts.push(
        `ate R$ ${state.factMemory.budgetMax.toLocaleString("pt-BR")}`
      );
    }

    lines.push(`Orcamento: ${parts.join(" e ")}.`);
  }

  if (state.factMemory.preferredBrands.length > 0) {
    lines.push(
      `Marcas preferidas: ${state.factMemory.preferredBrands.join(", ")}.`
    );
  }

  if (state.factMemory.dislikedLocations.length > 0) {
    lines.push(
      `Localizacoes rejeitadas: ${state.factMemory.dislikedLocations.join(", ")}.`
    );
  }

  if (state.lastViewedCar) {
    lines.push(
      `Ultimo carro em foco: ${state.lastViewedCar.name} ${state.lastViewedCar.model} por R$ ${state.lastViewedCar.price.toLocaleString("pt-BR")} em ${state.lastViewedCar.location}.`
    );
  }

  if (state.factMemory.principalFacts.length > 0) {
    lines.push(`Fatos principais: ${state.factMemory.principalFacts.join(" ")}`);
  }

  return lines.join(" ");
};

const trimRecentTurns = (
  turns: SessionState["recentTurns"]
): SessionState["recentTurns"] => {
  return turns.slice(-6);
};

const detectDislikedLocation = (
  message: string,
  currentLocation?: string
): string | undefined => {
  if (!currentLocation) {
    return undefined;
  }

  if (/nao quero|não quero|evitar|nao aceito|não aceito/i.test(message)) {
    return currentLocation;
  }

  return undefined;
};

export const updateSessionStateMemory = ({
  previousState,
  userMessage,
  assistantReply,
  filters,
  result
}: {
  previousState: SessionState;
  userMessage: string;
  assistantReply: string;
  filters: Partial<SearchCarsInput>;
  result: SearchCarsResult;
}): SessionState => {
  const nextState = sessionStateSchema.parse({
    ...previousState,
    currentFilters: {
      ...previousState.currentFilters,
      ...filters
    },
    lastViewedCar: result.suggestions[0]?.car ?? previousState.lastViewedCar,
    recentTurns: [
      ...previousState.recentTurns,
      { role: "user", text: userMessage },
      { role: "assistant", text: assistantReply }
    ]
  });

  const dislikedLocation = detectDislikedLocation(userMessage, filters.location);
  const principalFacts = detectPrincipalFacts(userMessage, filters, result);

  const withFacts = sessionStateSchema.parse({
    ...nextState,
    factMemory: {
      preferredBrands: filters.brand
        ? appendUnique(nextState.factMemory.preferredBrands, filters.brand)
        : nextState.factMemory.preferredBrands,
      dislikedLocations: appendUnique(
        nextState.factMemory.dislikedLocations,
        dislikedLocation
      ),
      principalFacts: principalFacts
        .reduce((items, fact) => appendUnique(items, fact), nextState.factMemory.principalFacts)
        .slice(-8),
      budgetMin:
        filters.minPrice ?? nextState.factMemory.budgetMin,
      budgetMax:
        filters.maxPrice ?? nextState.factMemory.budgetMax
    }
  });

  // Quando o historico curto cresce demais, comprimimos em fatos tecnicos e
  // mantemos apenas as interacoes mais recentes para preservar contexto util.
  if (withFacts.recentTurns.length <= MAX_SHORT_TERM_TURNS * 2) {
    return withFacts;
  }

  return sessionStateSchema.parse({
    ...withFacts,
    historySummary: buildHistorySummary(withFacts),
    recentTurns: trimRecentTurns(withFacts.recentTurns)
  });
};
