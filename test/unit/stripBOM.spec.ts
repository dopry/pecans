import { describe, it, expect } from "vitest";
import { stripBom } from "../../src/utils/stripBOM.js";

describe("stripBom", () => {
  it("should remove UTF-8 BOM from string", () => {
    // UTF-8 BOM becomes UTF-16 BOM (0xFEFF) when converted to string
    const stringWithBom = "\uFEFF" + "Hello, World!";
    const result = stripBom(stringWithBom);
    expect(result).toBe("Hello, World!");
  });

  it("should return string unchanged when no BOM present", () => {
    const normalString = "Hello, World!";
    const result = stripBom(normalString);
    expect(result).toBe("Hello, World!");
  });

  it("should handle empty string without BOM", () => {
    const result = stripBom("");
    expect(result).toBe("");
  });

  it("should handle empty string with BOM", () => {
    const stringWithBomOnly = "\uFEFF";
    const result = stripBom(stringWithBomOnly);
    expect(result).toBe("");
  });

  it("should handle string starting with non-BOM character 0xFEFE", () => {
    const stringWithSimilarChar = "\uFEFE" + "Hello, World!";
    const result = stripBom(stringWithSimilarChar);
    expect(result).toBe("\uFEFE" + "Hello, World!");
  });

  it("should handle string with BOM in the middle (should not remove)", () => {
    const stringWithMiddleBom = "Hello" + "\uFEFF" + "World";
    const result = stripBom(stringWithMiddleBom);
    expect(result).toBe("Hello" + "\uFEFF" + "World");
  });

  it("should handle multiline string with BOM", () => {
    const multilineWithBom = "\uFEFF" + "Line 1\nLine 2\nLine 3";
    const result = stripBom(multilineWithBom);
    expect(result).toBe("Line 1\nLine 2\nLine 3");
  });

  it("should handle string with special characters after BOM", () => {
    const specialCharsWithBom = "\uFEFF" + "§±²³´µ¶·¸¹º»¼½¾¿";
    const result = stripBom(specialCharsWithBom);
    expect(result).toBe("§±²³´µ¶·¸¹º»¼½¾¿");
  });

  it("should throw TypeError for non-string input - number", () => {
    expect(() => stripBom(123 as any)).toThrow(TypeError);
    expect(() => stripBom(123 as any)).toThrow("Expected a string, got number");
  });

  it("should throw TypeError for non-string input - null", () => {
    expect(() => stripBom(null as any)).toThrow(TypeError);
    expect(() => stripBom(null as any)).toThrow(
      "Expected a string, got object"
    );
  });

  it("should throw TypeError for non-string input - undefined", () => {
    expect(() => stripBom(undefined as any)).toThrow(TypeError);
    expect(() => stripBom(undefined as any)).toThrow(
      "Expected a string, got undefined"
    );
  });

  it("should throw TypeError for non-string input - boolean", () => {
    expect(() => stripBom(true as any)).toThrow(TypeError);
    expect(() => stripBom(true as any)).toThrow(
      "Expected a string, got boolean"
    );
  });

  it("should throw TypeError for non-string input - object", () => {
    expect(() => stripBom({} as any)).toThrow(TypeError);
    expect(() => stripBom({} as any)).toThrow("Expected a string, got object");
  });

  it("should throw TypeError for non-string input - array", () => {
    expect(() => stripBom([] as any)).toThrow(TypeError);
    expect(() => stripBom([] as any)).toThrow("Expected a string, got object");
  });
});
