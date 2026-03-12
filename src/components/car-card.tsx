"use client";

import Image from "next/image";
import { PrimaryButton } from "@/components/ui/primary-button";

export type CarCardData = {
  car: {
    name: string;
    model: string;
    image: string;
    price: number;
    location: string;
  };
  matchType: string;
  sellingPoints: string[];
};

type CarCardProps = {
  item: CarCardData;
};

const matchTypeLabel: Record<string, string> = {
  exact_match: "Match Exato",
  price_mismatch: "Acima do Orcamento",
  location_mismatch: "Cidade Alternativa",
  partial_match: "Sugestao Similar"
};

export function CarCard({ item }: CarCardProps) {
  return (
    <article className="group overflow-hidden rounded-3xl border border-black/10 bg-white shadow-[0_10px_30px_rgba(26,29,31,0.08)] transition hover:-translate-y-0.5 hover:shadow-[0_14px_34px_rgba(26,29,31,0.12)]">
      <div className="relative min-h-48">
        <Image
          src={item.car.image}
          alt={`${item.car.name} ${item.car.model}`}
          fill
          sizes="(max-width: 768px) 100vw, 33vw"
          className="object-cover transition duration-500 group-hover:scale-[1.03]"
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent" />
      </div>

      <div className="space-y-3 p-6">
        <p className="inline-flex rounded-full border border-amber-200 bg-amber-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-amber-900">
          {matchTypeLabel[item.matchType] ?? "Sugestao"}
        </p>
        <h3 className="font-[var(--font-title)] text-2xl leading-tight text-[var(--klubi-secondary)]">
          {item.car.name} {item.car.model}
        </h3>
        <p className="text-lg font-semibold text-[var(--klubi-secondary)]">
          {item.car.price.toLocaleString("pt-BR", {
            style: "currency",
            currency: "BRL"
          })}
        </p>
        <p className="text-sm text-[var(--klubi-text-muted)]">{item.car.location}</p>
        <ul className="space-y-2 text-sm text-[var(--klubi-text-muted)]">
          {item.sellingPoints.map((point) => (
            <li key={point} className="flex items-start gap-2">
              <span className="mt-[6px] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--klubi-primary)]" />
              <span>{point}</span>
            </li>
          ))}
        </ul>
        <PrimaryButton type="button" className="mt-2 w-full">
          Quero esse
        </PrimaryButton>
      </div>
    </article>
  );
}
