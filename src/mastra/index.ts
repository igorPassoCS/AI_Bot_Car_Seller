import { Mastra } from "@mastra/core";
import { researcherAgent } from "@/mastra/agents/researcher-agent";
import { closerAgent } from "@/mastra/agents/closer-agent";
import { carSalesWorkflow } from "@/mastra/workflows/car-sales-workflow";

export const mastra = new Mastra({
  agents: {
    researcher: researcherAgent,
    closer: closerAgent
  },
  workflows: {
    carSalesWorkflow
  }
});
