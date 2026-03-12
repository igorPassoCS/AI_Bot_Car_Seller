import { NextResponse } from "next/server";
import { z } from "zod";
import { runSalesConsultant } from "@/application/services/chat-orchestrator";

const bodySchema = z.object({
  message: z.string().min(1),
  sessionId: z.string().min(1).optional(),
  criteria: z
    .object({
      brand: z.string().optional(),
      model: z.string().optional(),
      maxPrice: z.number().positive().optional(),
      location: z.string().optional(),
      limit: z.number().int().min(1).max(8).optional()
    })
    .optional()
});

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json();
    const parsed = bodySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Payload invalido.",
          details: parsed.error.flatten()
        },
        { status: 400 }
      );
    }

    const output = await runSalesConsultant(
      parsed.data.message,
      parsed.data.criteria,
      parsed.data.sessionId
    );

    return NextResponse.json({
      reply: output.reply,
      scenario: output.result.scenario,
      interpretedCriteria: output.result.interpretedCriteria,
      cars: output.result.suggestions,
      strategy: output.strategy,
      intentState: output.intentState
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Falha ao processar a consulta de carros.",
        details: error instanceof Error ? error.message : "Erro desconhecido"
      },
      { status: 500 }
    );
  }
}
