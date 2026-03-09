import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Car } from "@/domain/car";
import { carSchema } from "@/domain/car";
import type { CarRepository } from "@/application/ports/car-repository";

export class JsonCarRepository implements CarRepository {
  constructor(private readonly dataFilePath: string) {}

  async getAllCars(): Promise<Car[]> {
    const absolutePath = path.isAbsolute(this.dataFilePath)
      ? this.dataFilePath
      : path.join(process.cwd(), this.dataFilePath);

    let rawData: string;
    try {
      rawData = await readFile(absolutePath, "utf-8");
    } catch (error) {
      throw new Error(
        `Nao foi possivel ler o arquivo de carros em ${absolutePath}.`,
        { cause: error }
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawData);
    } catch (error) {
      throw new Error("O arquivo cars.json possui JSON invalido.", {
        cause: error
      });
    }

    if (!Array.isArray(parsed)) {
      throw new Error("O arquivo cars.json precisa conter uma lista de carros.");
    }

    const records = parsed.map((item) => carSchema.parse(item));

    return records.map((record) => ({
      name: record.Name,
      model: record.Model,
      image: record.Image,
      price: record.Price,
      location: record.Location
    }));
  }
}
