import { describe, it, expect } from "vitest";
import { scoreDewPoint } from "@/lib/weather/dewpoint-score";

describe("scoreDewPoint", () => {
  it("rates low dew points as ideal", () => {
    const c = scoreDewPoint(45);
    expect(c.band).toBe(0);
    expect(c.label).toBe("Ideal");
  });

  it("uses inclusive lower / exclusive upper band boundaries", () => {
    expect(scoreDewPoint(49.9).band).toBe(0);
    expect(scoreDewPoint(50).band).toBe(1);
    expect(scoreDewPoint(54.9).band).toBe(1);
    expect(scoreDewPoint(55).band).toBe(2);
    expect(scoreDewPoint(60).band).toBe(3);
    expect(scoreDewPoint(65).band).toBe(4);
    expect(scoreDewPoint(70).band).toBe(5);
    expect(scoreDewPoint(74.9).band).toBe(5);
    expect(scoreDewPoint(75).band).toBe(6);
  });

  it("rates very high dew points as dangerous", () => {
    const c = scoreDewPoint(80);
    expect(c.band).toBe(6);
    expect(c.label).toBe("Dangerous");
    expect(c.color).toContain("bg-");
    expect(c.advice.length).toBeGreaterThan(0);
  });
});
