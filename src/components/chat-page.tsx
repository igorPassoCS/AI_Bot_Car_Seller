"use client";

import { useMemo, useState, type SubmitEvent } from "react";
import { CarCard, type CarCardData } from "@/components/car-card";

type AssistantPayload = {
  reply: string;
  scenario: string;
  strategy?: {
    scenario: string;
    approach: string;
  };
  interpretedCriteria: {
    brand?: string;
    model?: string;
    maxPrice?: number;
    location?: string;
  };
  intentState?: {
    locationSensitivity: "low" | "medium" | "high";
    budgetFlexibility: "rigid" | "moderate" | "flexible";
  };
  cars: CarCardData[];
};

type ChatItem = {
  role: "user" | "assistant";
  text: string;
  payload?: AssistantPayload;
};

const starterMessage: ChatItem = {
  role: "assistant",
  text: "Sou seu consultor de vendas. Diga marca, modelo, faixa de preco e cidade para eu encontrar a melhor opcao."
};

export function ChatPage() {
  const [sessionId] = useState(() =>
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `session-${Math.random().toString(36).slice(2)}`
  );
  const [messages, setMessages] = useState<ChatItem[]>([starterMessage]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lastPayload = useMemo(() => {
    const lastAssistant = [...messages]
      .reverse()
      .find((item) => item.role === "assistant" && item.payload);
    return lastAssistant?.payload;
  }, [messages]);
  const shouldShowCars =
    lastPayload?.strategy?.approach !== "rapport_and_discovery";

  const onSubmit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const message = input.trim();
    if (!message || loading) {
      return;
    }

    setInput("");
    setLoading(true);
    setError(null);
    setMessages((current) => [...current, { role: "user", text: message }]);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ message, sessionId })
      });

      if (!response.ok) {
        throw new Error(`Falha HTTP ${response.status}`);
      }

      const payload = (await response.json()) as AssistantPayload;
      setMessages((current) => [
        ...current,
        { role: "assistant", text: payload.reply, payload }
      ]);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Nao foi possivel processar sua busca."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="app-shell">
      <section className="hero">
        <p className="hero__eyebrow">Consultor IA + Mastra</p>
        <h1>Car Search</h1>
        <p className="hero__subtitle">
          Converse com o agente para encontrar carros, negociar alternativas e
          descobrir oportunidades mesmo sem match perfeito.
        </p>
      </section>

      <section className="chat">
        <div className="chat__history">
          {messages.map((item, index) => (
            <div
              key={`${item.role}-${index}`}
              className={`bubble bubble--${item.role}`}
            >
              {item.text}
            </div>
          ))}
          {loading ? <div className="bubble bubble--assistant">Analisando seu pedido...</div> : null}
        </div>

        <form className="chat__input" onSubmit={onSubmit}>
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Ex: Quero um Corolla ate 100000 em Sao Paulo"
            aria-label="Mensagem para o consultor"
          />
          <button type="submit" disabled={loading}>
            {loading ? "Buscando..." : "Enviar"}
          </button>
        </form>
        {error ? <p className="chat__error">{error}</p> : null}
      </section>

      <section className="results">
        <div className="results__header">
          <h2>Sugestoes de carros</h2>
          <p>
            {lastPayload
              ? shouldShowCars
                ? `Cenario identificado: ${lastPayload.scenario}`
                : "Vamos primeiro alinhar seu perfil de busca."
              : "Envie uma mensagem para receber sugestoes."}
          </p>
        </div>

        <div className="results__grid">
          {shouldShowCars &&
            lastPayload?.cars?.map((item) => (
              <CarCard
                key={`${item.car.name}-${item.car.model}-${item.car.location}`}
                item={item}
              />
            ))}
        </div>
      </section>
    </main>
  );
}
