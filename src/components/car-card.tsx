"use client";

import Image from "next/image";

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
    <article className="car-card">
      <div className="car-card__image-wrap">
        <Image
          src={item.car.image}
          alt={`${item.car.name} ${item.car.model}`}
          fill
          sizes="(max-width: 768px) 100vw, 33vw"
          className="car-card__image"
        />
      </div>

      <div className="car-card__content">
        <p className="car-card__tag">{matchTypeLabel[item.matchType] ?? "Sugestao"}</p>
        <h3>
          {item.car.name} {item.car.model}
        </h3>
        <p className="car-card__price">
          {item.car.price.toLocaleString("pt-BR", {
            style: "currency",
            currency: "BRL"
          })}
        </p>
        <p className="car-card__location">{item.car.location}</p>
        <ul className="car-card__selling-points">
          {item.sellingPoints.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>
      </div>
    </article>
  );
}
