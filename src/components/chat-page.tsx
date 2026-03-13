"use client";

import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import Image from "next/image";
import { useEffect, useRef, useState, type SubmitEvent } from "react";
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
    minPrice?: number;
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
  showQuickActions: boolean;
  isQuickActionsMinimized: boolean;
  onSubmit: (event: SubmitEvent<HTMLFormElement>) => Promise<void>;
  onInputChange: (value: string) => void;
  onQuickActionClick: (prompt: string) => Promise<void>;
};

const quickActions = [
  {
    label: "Quero um Fiat Pulse",
    prompt: "Quero um Fiat Pulse "
  },
  {
    label: "boa tarde, no que voce pode me ajudar?",
    prompt: "boa tarde, no que voce pode me ajudar?"
  },
  {
    label: "Essa opcao ta muito cara",
    prompt: "A opcao que voce me ofereceu está muito cara, mostre opções de carro com um preço mais barato que esse"
  },
  {
    label: "Moro no Rio de Janeiro",
    prompt: "moro na cidade do Rio de Janeiro?"
  }
] as const;

function ChatComposer({
  input,
  loading,
  error,
  hasInteracted,
  showQuickActions,
  isQuickActionsMinimized,
  onSubmit,
  onInputChange,
  onQuickActionClick
}: ChatComposerProps) {
  return (
    <form
      className="rounded-[24px] border border-black/10 bg-white/95 p-3 shadow-[0_16px_44px_rgba(26,29,31,0.14)] backdrop-blur"
      onSubmit={onSubmit}
    >
      {showQuickActions ? (
        // Os chips aceleram a validacao dos cenarios principais sem duplicar fluxo.
        <div className="mb-3 flex flex-wrap gap-2">
          {quickActions.map((action) => (
            <button
              key={action.label}
              type="button"
              disabled={loading}
              onClick={() => void onQuickActionClick(action.prompt)}
              className={`flex-auto rounded-full border border-orange-500 bg-white px-4 font-medium text-[var(--klubi-secondary)] transition hover:bg-orange-50 disabled:cursor-not-allowed disabled:opacity-60 sm:flex-none ${
                isQuickActionsMinimized
                  ? "py-2 text-xs"
                  : "py-2.5 text-sm"
              }`}
            >
              {action.label}
            </button>
          ))}
        </div>
      ) : null}

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
  const showQuickActions = true;
  const isQuickActionsMinimized = false;

  useEffect(() => {
    if (!hasInteracted) {
      return;
    }

    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, loading, hasInteracted]);

  const handleSendMessage = async (rawMessage: string) => {
    const message = rawMessage.trim();
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

  const onSubmit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    await handleSendMessage(input);
  };

  const onQuickActionClick = async (prompt: string) => {
    setInput(prompt);
    await handleSendMessage(prompt);
  };

  return (
    <LayoutGroup>
      <main className="relative min-h-screen overflow-hidden bg-[var(--klubi-bg)] text-[var(--klubi-text)]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_10%_15%,rgba(255,184,0,0.28),transparent_30%),radial-gradient(circle_at_82%_12%,rgba(26,29,31,0.1),transparent_34%)]" />

        <div className="pointer-events-none absolute left-1/2 top-6 z-20 w-[200px] -translate-x-1/2 sm:top-8">
          <Image
            src="/images/cupom-de-desconto-klubi-logo-200-115.webp"
            alt="Klubi"
            width={200}
            height={115}
            className="h-auto w-full object-contain"
            priority
          />
        </div>

        <AnimatePresence>
          {!hasInteracted ? (
            <motion.section
              key="discovery"
              className="relative z-10 flex min-h-screen flex-col items-center justify-center px-4 pb-20 pt-28 text-center md:px-8 md:pt-32"
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

              <motion.div
                layoutId="chat-composer"
                className="mt-10 w-[96%] max-w-[1200px] sm:w-[94%] md:w-[92%]"
              >
                <ChatComposer
                  input={input}
                  loading={loading}
                  error={error}
                  hasInteracted={hasInteracted}
                  showQuickActions={showQuickActions}
                  isQuickActionsMinimized={isQuickActionsMinimized}
                  onSubmit={onSubmit}
                  onInputChange={setInput}
                  onQuickActionClick={onQuickActionClick}
                />
              </motion.div>
            </motion.section>
          ) : null}
        </AnimatePresence>

        <AnimatePresence>
          {hasInteracted ? (
            <motion.section
              key="interaction"
              className="relative z-10 mx-auto flex h-screen w-[98%] max-w-[1280px] flex-col px-1 pb-44 pt-28 sm:w-[96%] sm:px-2 sm:pt-32 md:w-[95%] md:px-3 lg:w-[94%] lg:px-4"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
            >
              <div className="klubi-scrollbar flex-1 space-y-4 overflow-y-auto rounded-3xl border border-black/10 bg-white/85 p-4 shadow-[0_10px_28px_rgba(26,29,31,0.08)] backdrop-blur md:p-6">
                {messages.map((item, index) => {
                  const assistantPayload =
                    item.role === "assistant" ? item.payload : undefined;
                  const showCarsForMessage =
                    assistantPayload?.strategy?.approach !== "rapport_and_discovery" &&
                    (assistantPayload?.cars.length ?? 0) > 0;

                  return (
                    <div key={`${item.role}-${index}`} className="space-y-3">
                      {showCarsForMessage ? (
                        // Exibe os cards antes da persuasao para priorizar o produto no fluxo visual.
                        <div className="-mx-1 flex gap-4 overflow-x-auto pb-2 pr-1 md:mx-0 md:grid md:grid-cols-2 md:overflow-visible xl:grid-cols-3">
                          {(assistantPayload?.cars ?? []).map((carItem) => (
                            <div
                              key={`${carItem.car.name}-${carItem.car.model}-${carItem.car.location}-${index}`}
                              className="min-w-[285px] flex-none md:min-w-0"
                            >
                              <CarCard item={carItem} />
                            </div>
                          ))}
                        </div>
                      ) : null}

                      <div
                        className={`max-w-[95%] rounded-3xl px-5 py-4 text-[15px] leading-relaxed md:max-w-[90%] ${
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
                    </div>
                  );
                })}
                {loading ? (
                  <div className="max-w-[92%] rounded-3xl border border-black/10 bg-white px-5 py-4 text-[15px] text-[var(--klubi-text-muted)]">
                    Analisando seu pedido...
                  </div>
                ) : null}
                <div ref={bottomRef} />
              </div>
            </motion.section>
          ) : null}
        </AnimatePresence>

        {hasInteracted ? (
          <motion.div
            layoutId="chat-composer"
            className="fixed bottom-6 left-1/2 z-20 w-[96%] max-w-[1200px] -translate-x-1/2 sm:w-[95%] md:w-[92%] lg:w-[90%]"
          >
            <ChatComposer
              input={input}
              loading={loading}
              error={error}
              hasInteracted={hasInteracted}
              showQuickActions={showQuickActions}
              isQuickActionsMinimized={isQuickActionsMinimized}
              onSubmit={onSubmit}
              onInputChange={setInput}
              onQuickActionClick={onQuickActionClick}
            />
          </motion.div>
        ) : null}

        <div className="pointer-events-none absolute inset-x-0 bottom-4 z-20 flex justify-center px-4">
          <p className="pointer-events-auto text-center text-xs text-[var(--klubi-text-muted)]">
            made with &lt;3 by{" "}
            <a
              href="https://www.linkedin.com/in/igor-passo"
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-[var(--klubi-secondary)] underline decoration-orange-400 underline-offset-4 transition hover:text-[var(--klubi-primary)]"
            >
              Igor Passo
            </a>
          </p>
        </div>
      </main>
    </LayoutGroup>
  );
}
