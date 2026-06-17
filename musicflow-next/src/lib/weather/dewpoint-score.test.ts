import { describe, it, expect } from "vitest";
import { scoreDewPoint, scoreComfort } from "@/lib/weather/dewpoint-score";

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

describe("scoreComfort", () => {
  it("leaves mild apparent temps governed by dew point", () => {
    expect(scoreComfort(72, 75).band).toBe(scoreDewPoint(72).band);
  });

  it("keeps a hot but dry day far better than a warm humid one", () => {
    const hotDry = scoreComfort(50, 88); // dew band 1 + 1 heat bump = 2
    const warmHumid = scoreComfort(72, 82); // dew band 5, no bump
    expect(hotDry.band).toBe(2);
    expect(warmHumid.band).toBe(5);
    expect(hotDry.band).toBeLessThan(warmHumid.band);
  });

  it("bumps two bands when the apparent temperature is extreme, clamped at 6", () => {
    expect(scoreComfort(50, 96).band).toBe(3); // 1 + 2
    expect(scoreComfort(76, 110).band).toBe(6); // 6 + 2 clamped
  });

  it("never improves a humid day just because it is cold", () => {
    expect(scoreComfort(72, 40).band).toBe(scoreDewPoint(72).band);
  });
});
