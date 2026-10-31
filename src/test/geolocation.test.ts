import { describe, expect, it } from "vitest";
import { distanceInKm } from "@/lib/geolocation";

describe("distanceInKm", () => {
  it("calculates distance between customer and pharmacy coordinates", () => {
    const distance = distanceInKm(
      { latitude: 12.9716, longitude: 77.5946 },
      { latitude: 12.9784, longitude: 77.6408 },
    );

    expect(distance).toBeGreaterThan(4.9);
    expect(distance).toBeLessThan(5.2);
  });

  it("returns null for missing pharmacy coordinates", () => {
    expect(distanceInKm(
      { latitude: 12.9716, longitude: 77.5946 },
      { latitude: 0, longitude: 0 },
    )).toBeNull();
  });
});
