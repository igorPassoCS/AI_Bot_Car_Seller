import { Agent } from "@mastra/core/agent";
import { env } from "@/config/env";
import { searchCarsTool } from "@/mastra/tools/search-cars-tool";

export const salesConsultantAgent = new Agent({
  name: "Sales Consultant",
  instructions: `
You are an expert car salesman.
Always use the searchCars tool before answering.
If the user criteria are not fully met:
- For price mismatch: suggest the closest alternatives and explain concrete value (resale, features, reliability).
- For location mismatch: still recommend the car and explain delivery options or why the trip is worthwhile.
Be transparent about mismatches, stay persuasive, and keep the user engaged.
`,
  model: env.OPENAI_MODEL,
  tools: {
    searchCars: searchCarsTool
  }
});
