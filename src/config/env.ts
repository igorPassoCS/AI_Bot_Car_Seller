import path from "node:path";
import { z } from "zod";

const envSchema = z.object({
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default("openai/gpt-4o-mini"),
  CARS_DATA_PATH: z.string().default(path.join("data", "cars.json"))
});

const parsedEnv = envSchema.safeParse(process.env);
if (!parsedEnv.success) {
  throw new Error(`Variaveis de ambiente invalidas: ${parsedEnv.error.message}`);
}

export const env = parsedEnv.data;
