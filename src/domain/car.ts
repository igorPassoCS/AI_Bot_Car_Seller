import { z } from "zod";

const imageSourceSchema = z.string().trim().refine(
  (value) => {
    if (value.startsWith("/")) {
      return true;
    }

    try {
      const url = new URL(value);
      return url.protocol === "http:" || url.protocol === "https:";
    } catch {
      return false;
    }
  },
  {
    message: "Image must be an absolute URL or a local path starting with /."
  }
);

export const carSchema = z.object({
  Name: z.string().min(1),
  Model: z.string().min(1),
  Image: imageSourceSchema,
  Price: z.number().positive(),
  Location: z.string().min(1)
});

export type CarRecord = z.infer<typeof carSchema>;

export type Car = {
  name: string;
  model: string;
  image: string;
  price: number;
  location: string;
};

export type MatchType =
  | "exact_match"
  | "price_mismatch"
  | "location_mismatch"
  | "partial_match";

export type CarSuggestion = {
  car: Car;
  matchType: MatchType;
  sellingPoints: string[];
};

export type SearchCarsInput = {
  query?: string;
  brand?: string;
  model?: string;
  maxPrice?: number;
  location?: string;
  limit?: number;
};

export type SearchCarsResult = {
  scenario: MatchType | "no_filtered_match";
  interpretedCriteria: {
    brand?: string;
    model?: string;
    maxPrice?: number;
    location?: string;
  };
  suggestions: CarSuggestion[];
};
