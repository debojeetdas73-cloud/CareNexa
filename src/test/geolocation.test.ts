import { describe, expect, it } from "vitest";
import { distanceInKm, isWithinDistance } from "@/lib/geolocation";

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

  it("keeps hospitals outside the selected nearby radius out of results", () => {
    const dibrugarh = { latitude: 27.4728, longitude: 94.912 };
    const guwahati = { latitude: 26.1445, longitude: 91.7362 };
    const distance = distanceInKm(dibrugarh, guwahati);

    expect(distance).not.toBeNull();
    expect(distance).toBeGreaterThan(50);
    expect(isWithinDistance(distance, 50)).toBe(false);
    expect(isWithinDistance(distance, 500)).toBe(true);
  });

  it("excludes hospitals without a known distance from radius-filtered results", () => {
    expect(isWithinDistance(undefined, 50)).toBe(false);
    expect(isWithinDistance(undefined, null)).toBe(true);
  });
});
