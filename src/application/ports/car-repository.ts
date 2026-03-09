import type { Car } from "@/domain/car";

export interface CarRepository {
  getAllCars(): Promise<Car[]>;
}
