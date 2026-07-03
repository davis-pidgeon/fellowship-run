import { describe, it, expect } from "vitest";
import { isValidCharacter } from "./character";

describe("isValidCharacter", () => {
  it("accepts a known character", () => expect(isValidCharacter("frodo")).toBe(true));
  it("rejects an unknown character", () => expect(isValidCharacter("sauron")).toBe(false));
});
