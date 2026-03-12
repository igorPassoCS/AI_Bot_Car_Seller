"use client";

import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState, type SubmitEvent } from "react";
import ReactMarkdown from "react-markdown";
import { CarCard, type CarCardData } from "@/components/car-card";
import { PrimaryButton } from "@/components/ui/primary-button";

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

type ChatComposerProps = {
  input: string;
  loading: boolean;
  error: string | null;
  hasInteracted: boolean;
  onSubmit: (event: SubmitEvent<HTMLFormElement>) => Promise<void>;
  onInputChange: (value: string) => void;
};

function ChatComposer({
  input,
  loading,
  error,
  hasInteracted,
  onSubmit,
  onInputChange
}: ChatComposerProps) {
  return (
    <form
      className="rounded-[24px] border border-black/10 bg-white/95 p-3 shadow-[0_16px_44px_rgba(26,29,31,0.14)] backdrop-blur"
      onSubmit={onSubmit}
    >
      <div className="flex flex-col gap-3 md:flex-row">
        <input
          value={input}
          onChange={(event) => onInputChange(event.target.value)}
          placeholder="Ex: Quero um Corolla ate 100000 em Sao Paulo"
          aria-label="Mensagem para o consultor"
          className="h-12 w-full rounded-2xl border border-black/10 bg-white px-4 text-[15px] text-[var(--klubi-text)] outline-none transition placeholder:text-[var(--klubi-text-muted)] focus:border-[var(--klubi-secondary)] focus:ring-2 focus:ring-black/5"
        />
        <PrimaryButton type="submit" disabled={loading} className="h-12 min-w-40">
          {loading
            ? "Analisando..."
            : hasInteracted
              ? "Enviar"
              : "Comecar busca"}
        </PrimaryButton>
      </div>
      {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}
    </form>
  );
}

export function ChatPage() {
  const [sessionId] = useState(() =>
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `session-${Math.random().toString(36).slice(2)}`
  );
  const [messages, setMessages] = useState<ChatItem[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasInteracted, setHasInteracted] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const lastPayload = useMemo(() => {
    const lastAssistant = [...messages]
      .reverse()
      .find((item) => item.role === "assistant" && item.payload);
    return lastAssistant?.payload;
  }, [messages]);
  const shouldShowCars =
    hasInteracted && lastPayload?.strategy?.approach !== "rapport_and_discovery";

  useEffect(() => {
    if (!hasInteracted) {
      return;
    }

    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, loading, hasInteracted, lastPayload?.cars?.length]);

  const onSubmit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const message = input.trim();
    if (!message || loading) {
      return;
    }

    setHasInteracted(true);
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
    <LayoutGroup>
      <main className="relative min-h-screen overflow-hidden bg-[var(--klubi-bg)] text-[var(--klubi-text)]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_10%_15%,rgba(255,184,0,0.28),transparent_30%),radial-gradient(circle_at_82%_12%,rgba(26,29,31,0.1),transparent_34%)]" />

        <AnimatePresence>
          {!hasInteracted ? (
            <motion.section
              key="discovery"
              className="relative z-10 flex min-h-screen flex-col items-center justify-center px-4 text-center md:px-8"
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -18 }}
              transition={{ duration: 0.35, ease: "easeOut" }}
            >
              <p className="mb-4 inline-flex rounded-full border border-black/10 bg-white px-4 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--klubi-secondary)]">
                Consultor de Veiculos com IA
              </p>
              <h1 className="max-w-4xl font-[var(--font-title)] text-4xl leading-tight text-[var(--klubi-secondary)] md:text-6xl">
                Encontre o carro ideal com estrategia de consultoria real.
              </h1>
              <p className="mt-5 max-w-2xl text-base text-[var(--klubi-text-muted)] md:text-lg">
                Conte seu momento de compra e a IA mapeia opcoes, restricoes de
                orcamento e alternativas inteligentes sem pressa de venda.
              </p>

              <motion.div layoutId="chat-composer" className="mt-10 w-full max-w-4xl">
                <ChatComposer
                  input={input}
                  loading={loading}
                  error={error}
                  hasInteracted={hasInteracted}
                  onSubmit={onSubmit}
                  onInputChange={setInput}
                />
              </motion.div>
            </motion.section>
          ) : null}
        </AnimatePresence>

        <AnimatePresence>
          {hasInteracted ? (
            <motion.section
              key="interaction"
              className="relative z-10 mx-auto flex h-screen w-full max-w-6xl flex-col px-4 pb-44 pt-8 md:px-8 md:pt-10"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
            >
              <div className="klubi-scrollbar flex-1 space-y-4 overflow-y-auto rounded-3xl border border-black/10 bg-white/85 p-4 shadow-[0_10px_28px_rgba(26,29,31,0.08)] backdrop-blur md:p-6">
                {messages.map((item, index) => (
                  <div
                    key={`${item.role}-${index}`}
                    className={`max-w-[92%] rounded-3xl px-5 py-4 text-[15px] leading-relaxed ${
                      item.role === "assistant"
                        ? "mr-auto border border-black/10 bg-white text-[var(--klubi-text)]"
                        : "ml-auto bg-[var(--klubi-secondary)] text-white"
                    }`}
                  >
                    {item.role === "assistant" ? (
                      // Mensagens do assistente continuam com suporte a markdown.
                      <div className="klubi-markdown">
                        <ReactMarkdown>{item.text}</ReactMarkdown>
                      </div>
                    ) : (
                      item.text
                    )}
                  </div>
                ))}
                {loading ? (
                  <div className="max-w-[92%] rounded-3xl border border-black/10 bg-white px-5 py-4 text-[15px] text-[var(--klubi-text-muted)]">
                    Analisando seu pedido...
                  </div>
                ) : null}

                {lastPayload ? (
                  <section className="space-y-4 pt-2">
                    <div className="rounded-3xl border border-black/10 bg-[var(--klubi-secondary)] px-5 py-4 text-white">
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-white/70">
                        Cenario atual
                      </p>
                      <p className="mt-1 text-lg font-medium">
                        {shouldShowCars
                          ? lastPayload.scenario
                          : "rapport_and_discovery"}
                      </p>
                      <p className="mt-2 text-sm text-white/80">
                        {shouldShowCars
                          ? "Selecione uma opcao e posso ajudar com argumentos de negociacao."
                          : "Vamos alinhar seu perfil antes de sugerir carros para manter precisao."}
                      </p>
                    </div>

                    {shouldShowCars && lastPayload.cars.length > 0 ? (
                      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                        {lastPayload.cars.map((item) => (
                          <CarCard
                            key={`${item.car.name}-${item.car.model}-${item.car.location}`}
                            item={item}
                          />
                        ))}
                      </div>
                    ) : null}
                  </section>
                ) : null}
                <div ref={bottomRef} />
              </div>
            </motion.section>
          ) : null}
        </AnimatePresence>

        {hasInteracted ? (
          <motion.div
            layoutId="chat-composer"
            className="fixed bottom-6 left-1/2 z-20 w-full max-w-4xl -translate-x-1/2 px-4 md:px-8"
          >
            <ChatComposer
              input={input}
              loading={loading}
              error={error}
              hasInteracted={hasInteracted}
              onSubmit={onSubmit}
              onInputChange={setInput}
            />
          </motion.div>
        ) : null}
      </main>
    </LayoutGroup>
  );
}
