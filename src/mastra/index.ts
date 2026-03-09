import { Mastra } from "@mastra/core";
import { salesConsultantAgent } from "@/mastra/agents/sales-consultant-agent";

export const mastra = new Mastra({
  agents: {
    salesConsultant: salesConsultantAgent
  }
});
