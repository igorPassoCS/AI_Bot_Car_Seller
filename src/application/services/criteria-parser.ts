// Este arquivo traduz texto livre do usuario em criterios deterministicos de busca.
import type { Car, SearchCarsInput } from "@/domain/car";

// Normaliza texto para comparacoes sem acento e sem diferenca de caixa.
const normalize = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const LOCATION_ALIAS_MAP = {
  rio: "Rio de Janeiro",
  rj: "Rio de Janeiro",
  sp: "Sao Paulo",
  bh: "Belo Horizonte",
  poa: "Porto Alegre"
} as const;

const LOCATION_HINT_PATTERNS = [
  /\b(?:em|in|para|to|cidade)\s+([a-z]+(?:\s+(?:de|do|da|dos|das))?(?:\s+[a-z]+){0,2})/i,
  /\b(?:no|na)\s+([a-z]+(?:\s+(?:de|do|da|dos|das))?(?:\s+[a-z]+){0,2})/i
];

const LOCATION_HINT_STOP_WORDS = new Set([
  "conta",
  "faixa",
  "geral",
  "mente",
  "vista"
]);

// Escapa texto dinamico para montar expressoes regulares seguras.
const escapeRegExp = (value: string): string => {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

// Verifica se um termo aparece como palavra inteira dentro da mensagem normalizada.
const includesExactTerm = (message: string, term: string): boolean => {
  return new RegExp(`\\b${escapeRegExp(normalize(term))}\\b`, "i").test(message);
};

// Extrai um possivel trecho de cidade quando o usuario escreve "em X" ou "no Y".
const extractExplicitLocationHint = (
  normalizedMessage: string
): string | undefined => {
  for (const pattern of LOCATION_HINT_PATTERNS) {
    const match = normalizedMessage.match(pattern);
    const candidate = match?.[1]?.trim();
    if (!candidate) {
      continue;
    }

    const tokens = candidate.split(/\s+/);
    if (tokens.some((token) => LOCATION_HINT_STOP_WORDS.has(token))) {
      continue;
    }

    return candidate;
  }

  return undefined;
};

export type LocationResolution = {
  location?: string;
  origin: "none" | "explicit" | "alias";
  hasExplicitLocationHint: boolean;
  rawHint?: string;
};

// Resolve a cidade pedida pelo usuario priorizando match exato e depois aliases conhecidos.
export const resolveLocationFromMessage = (
  cars: Car[],
  message?: string
): LocationResolution => {
  if (!message) {
    return {
      origin: "none",
      hasExplicitLocationHint: false
    };
  }

  const normalizedMessage = normalize(message);
  const locations = [...new Set(cars.map((car) => car.location))].sort(
    (left, right) => right.length - left.length
  );
  const exactLocation = locations.find((candidate) =>
    includesExactTerm(normalizedMessage, candidate)
  );

  if (exactLocation) {
    return {
      location: exactLocation,
      origin: "explicit",
      hasExplicitLocationHint: true,
      rawHint: exactLocation
    };
  }

  const aliasEntry = Object.entries(LOCATION_ALIAS_MAP).find(
    ([alias, canonical]) =>
      includesExactTerm(normalizedMessage, alias) &&
      locations.some((candidate) => normalize(candidate) === normalize(canonical))
  );

  if (aliasEntry) {
    return {
      location: aliasEntry[1],
      origin: "alias",
      hasExplicitLocationHint: true,
      rawHint: aliasEntry[0]
    };
  }

  const rawHint = extractExplicitLocationHint(normalizedMessage);

  return {
    origin: "none",
    hasExplicitLocationHint: rawHint !== undefined,
    rawHint
  };
};

// Detecta um teto de preco informado de forma compacta ou numerica na mensagem.
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

// Faz uma extracao heuristica de marca, modelo, cidade e teto de preco a partir da mensagem.
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

  const brand = brands.find((candidate) =>
    normalizedMessage.includes(normalize(candidate))
  );
  const model = models.find((candidate) =>
    normalizedMessage.includes(normalize(candidate))
  );
  const location = resolveLocationFromMessage(cars, message).location;
  const maxPrice = extractBudget(message);

  return { brand, model, location, maxPrice };
};
