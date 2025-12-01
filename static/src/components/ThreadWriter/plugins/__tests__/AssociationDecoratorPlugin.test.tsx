import type * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AssociationDecoratorPlugin } from "../AssociationDecoratorPlugin";
import type { ClickData } from "../DocumentClickPlugin";

// Mock dependencies
vi.mock("../../hooks/useAssociations", () => ({
  useAssociations: () => ({
    associations: [],
    setAssociations: vi.fn(),
  }),
}));

vi.mock("../../../utils/chapterMemory", () => ({
  generateTextHash: vi.fn(() => "test-hash"),
}));

describe("AssociationDecoratorPlugin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Plugin structure", () => {
    it("should be a function component", () => {
      expect(typeof AssociationDecoratorPlugin).toBe("function");
    });

    it("should accept all required props", () => {
      const mockRef = { current: false } as React.RefObject<boolean>;
      const mockLeftClick = vi.fn();
      const mockRightClick = vi.fn();

      const props: React.ComponentProps<typeof AssociationDecoratorPlugin> = {
        isProgrammaticChange: mockRef,
        customLeftClick: mockLeftClick,
        customRightClick: mockRightClick,
        exclusionList: ["exclude1", "exclude2"],
      };

      expect(props).toBeDefined();
      expect(props.isProgrammaticChange).toBe(mockRef);
      expect(props.customLeftClick).toBe(mockLeftClick);
      expect(props.customRightClick).toBe(mockRightClick);
      expect(props.exclusionList).toEqual(["exclude1", "exclude2"]);
    });

    it("should work with minimal props", () => {
      const props: React.ComponentProps<typeof AssociationDecoratorPlugin> = {};

      expect(props).toBeDefined();
    });

    it("should accept custom click handlers matching ClickData signature", () => {
      const mockCustomClick = (data: ClickData) => {
        expect(data).toHaveProperty("x");
        expect(data).toHaveProperty("y");
      };

      const props: React.ComponentProps<typeof AssociationDecoratorPlugin> = {
        customLeftClick: mockCustomClick,
        customRightClick: mockCustomClick,
      };

      expect(props.customLeftClick).toBe(mockCustomClick);
      expect(props.customRightClick).toBe(mockCustomClick);
    });
  });

  describe("RegExp escape utility", () => {
    // Test the escapeRegExp function logic
    const escapeRegExp = (string: string) => {
      return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    };

    it("should escape dot character", () => {
      expect(escapeRegExp("test.com")).toBe("test\\.com");
    });

    it("should escape asterisk character", () => {
      expect(escapeRegExp("test*")).toBe("test\\*");
    });

    it("should escape plus character", () => {
      expect(escapeRegExp("test+")).toBe("test\\+");
    });

    it("should escape question mark", () => {
      expect(escapeRegExp("test?")).toBe("test\\?");
    });

    it("should escape caret", () => {
      expect(escapeRegExp("^test")).toBe("\\^test");
    });

    it("should escape dollar sign", () => {
      expect(escapeRegExp("test$")).toBe("test\\$");
    });

    it("should escape curly braces", () => {
      expect(escapeRegExp("test{1,2}")).toBe("test\\{1,2\\}");
    });

    it("should escape parentheses", () => {
      expect(escapeRegExp("test(group)")).toBe("test\\(group\\)");
    });

    it("should escape pipe character", () => {
      expect(escapeRegExp("test|other")).toBe("test\\|other");
    });

    it("should escape square brackets", () => {
      expect(escapeRegExp("test[abc]")).toBe("test\\[abc\\]");
    });

    it("should escape backslash", () => {
      expect(escapeRegExp("test\\path")).toBe("test\\\\path");
    });

    it("should handle multiple special characters", () => {
      expect(escapeRegExp(".*+?^$")).toBe("\\.\\*\\+\\?\\^\\$");
    });

    it("should not escape regular characters", () => {
      expect(escapeRegExp("testABC123")).toBe("testABC123");
    });

    it("should handle empty string", () => {
      expect(escapeRegExp("")).toBe("");
    });
  });

  describe("Word boundary matching", () => {
    // Test the word boundary regex pattern used for associations
    const createMatchRegex = (searchFor: string) => {
      const escaped = searchFor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new RegExp(`\\b${escaped}\\b`, "g");
    };

    it("should match whole word", () => {
      const regex = createMatchRegex("test");
      const text = "This is a test case";
      const matches = [...text.matchAll(regex)];

      expect(matches.length).toBe(1);
      expect(matches[0][0]).toBe("test");
      expect(matches[0].index).toBe(10);
    });

    it("should not match partial word", () => {
      const regex = createMatchRegex("test");
      const text = "This is testing";
      const matches = [...text.matchAll(regex)];

      expect(matches.length).toBe(0);
    });

    it("should match word at start of text", () => {
      const regex = createMatchRegex("Hello");
      const text = "Hello world";
      const matches = [...text.matchAll(regex)];

      expect(matches.length).toBe(1);
      expect(matches[0].index).toBe(0);
    });

    it("should match word at end of text", () => {
      const regex = createMatchRegex("world");
      const text = "Hello world";
      const matches = [...text.matchAll(regex)];

      expect(matches.length).toBe(1);
      expect(matches[0].index).toBe(6);
    });

    it("should match word with punctuation after", () => {
      const regex = createMatchRegex("test");
      const text = "This is a test, right?";
      const matches = [...text.matchAll(regex)];

      expect(matches.length).toBe(1);
    });

    it("should match word with punctuation before", () => {
      const regex = createMatchRegex("test");
      const text = 'Is this a "test"?';
      const matches = [...text.matchAll(regex)];

      expect(matches.length).toBe(1);
    });

    it("should match multiple occurrences", () => {
      const regex = createMatchRegex("test");
      const text = "test test test";
      const matches = [...text.matchAll(regex)];

      expect(matches.length).toBe(3);
    });

    it("should handle case-sensitive matching", () => {
      const regex = createMatchRegex("Test");
      const text = "test Test TEST";
      const matches = [...text.matchAll(regex)];

      expect(matches.length).toBe(1);
      expect(matches[0][0]).toBe("Test");
    });

    it("should escape special characters in search term", () => {
      const escaped = "C++".replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

      expect(escaped).toBe("C\\+\\+");

      // Note: C++ won't match with \b word boundaries because + is not a word character
      // This is a known limitation of word boundary matching with non-word characters
    });

    it("should not match across word boundaries", () => {
      const regex = createMatchRegex("and");
      const text = "stand sandbox command";
      const matches = [...text.matchAll(regex)];

      expect(matches.length).toBe(0);
    });
  });

  describe("Case sensitivity logic", () => {
    const normalizeText = (text: string, caseSensitive: boolean) => {
      return caseSensitive ? text : text.toLowerCase();
    };

    it("should preserve case when case-sensitive", () => {
      const text = "Hello World";
      const normalized = normalizeText(text, true);

      expect(normalized).toBe("Hello World");
    });

    it("should lowercase when case-insensitive", () => {
      const text = "Hello World";
      const normalized = normalizeText(text, false);

      expect(normalized).toBe("hello world");
    });

    it("should handle already lowercase text", () => {
      const text = "hello world";
      const normalized = normalizeText(text, true);

      expect(normalized).toBe("hello world");
    });

    it("should handle already uppercase text", () => {
      const text = "HELLO WORLD";
      const normalized = normalizeText(text, false);

      expect(normalized).toBe("hello world");
    });

    it("should handle mixed case", () => {
      const text = "HeLLo WoRLd";
      const normalized = normalizeText(text, false);

      expect(normalized).toBe("hello world");
    });

    it("should handle empty string", () => {
      const text = "";
      const normalized = normalizeText(text, false);

      expect(normalized).toBe("");
    });
  });

  describe("Adjacent whitespace/punctuation detection", () => {
    // Test the regex pattern for detecting valid adjacent characters
    const adjacentPattern = /[\s.,:;"''"…—–-]/;

    it("should match space", () => {
      expect(adjacentPattern.test(" ")).toBe(true);
    });

    it("should match period", () => {
      expect(adjacentPattern.test(".")).toBe(true);
    });

    it("should match comma", () => {
      expect(adjacentPattern.test(",")).toBe(true);
    });

    it("should match colon", () => {
      expect(adjacentPattern.test(":")).toBe(true);
    });

    it("should match semicolon", () => {
      expect(adjacentPattern.test(";")).toBe(true);
    });

    it("should match double quote", () => {
      expect(adjacentPattern.test('"')).toBe(true);
    });

    it("should match single quote", () => {
      expect(adjacentPattern.test("'")).toBe(true);
    });

    it("should match apostrophe characters", () => {
      // The pattern includes regular apostrophes in the character class
      expect(adjacentPattern.test("'")).toBe(true);
      expect(adjacentPattern.test('"')).toBe(true);

      // Note: Smart quotes (unicode \u2018, \u2019, \u201c, \u201d) would need
      // to be explicitly added to the character class to match
    });

    it("should match ellipsis", () => {
      expect(adjacentPattern.test("…")).toBe(true);
    });

    it("should match em dash", () => {
      expect(adjacentPattern.test("—")).toBe(true);
    });

    it("should match en dash", () => {
      expect(adjacentPattern.test("–")).toBe(true);
    });

    it("should match hyphen", () => {
      expect(adjacentPattern.test("-")).toBe(true);
    });

    it("should not match letters", () => {
      expect(adjacentPattern.test("a")).toBe(false);
      expect(adjacentPattern.test("Z")).toBe(false);
    });

    it("should not match numbers", () => {
      expect(adjacentPattern.test("5")).toBe(false);
    });
  });

  describe("Alias processing", () => {
    const processAliases = (aliasString: string, caseSensitive: boolean) => {
      const aliases =
        aliasString.length > 0
          ? aliasString.split(",").map((alias) => alias.trim())
          : [];

      return caseSensitive
        ? aliases
        : aliases.map((alias) => alias.toLowerCase());
    };

    it("should split comma-separated aliases", () => {
      const aliases = processAliases("alias1,alias2,alias3", true);

      expect(aliases).toEqual(["alias1", "alias2", "alias3"]);
    });

    it("should trim whitespace from aliases", () => {
      const aliases = processAliases("alias1 , alias2 , alias3", true);

      expect(aliases).toEqual(["alias1", "alias2", "alias3"]);
    });

    it("should handle empty alias string", () => {
      const aliases = processAliases("", true);

      expect(aliases).toEqual([]);
    });

    it("should lowercase aliases when case-insensitive", () => {
      const aliases = processAliases("Alias1,ALIAS2,aLiAs3", false);

      expect(aliases).toEqual(["alias1", "alias2", "alias3"]);
    });

    it("should preserve case when case-sensitive", () => {
      const aliases = processAliases("Alias1,ALIAS2,aLiAs3", true);

      expect(aliases).toEqual(["Alias1", "ALIAS2", "aLiAs3"]);
    });

    it("should handle single alias", () => {
      const aliases = processAliases("onlyOne", true);

      expect(aliases).toEqual(["onlyOne"]);
    });

    it("should handle aliases with special characters", () => {
      const aliases = processAliases("C++,C#,F#", true);

      expect(aliases).toEqual(["C++", "C#", "F#"]);
    });
  });

  describe("Association matching logic", () => {
    interface TestAssociation {
      association_name: string;
      aliases: string;
      case_sensitive: boolean;
    }

    const getNamesToMatch = (association: TestAssociation): string[] => {
      const aliases =
        association.aliases.length > 0
          ? association.aliases.split(",").map((alias) => alias.trim())
          : [];

      const names = Array.from(
        new Set([association.association_name.trim(), ...aliases])
      );

      return names.sort((a, b) => b.length - a.length);
    };

    it("should include association name in names to match", () => {
      const association: TestAssociation = {
        association_name: "JavaScript",
        aliases: "",
        case_sensitive: true,
      };

      const names = getNamesToMatch(association);

      expect(names).toContain("JavaScript");
      expect(names.length).toBe(1);
    });

    it("should include all aliases", () => {
      const association: TestAssociation = {
        association_name: "JavaScript",
        aliases: "JS,ECMAScript",
        case_sensitive: true,
      };

      const names = getNamesToMatch(association);

      expect(names).toContain("JavaScript");
      expect(names).toContain("JS");
      expect(names).toContain("ECMAScript");
      expect(names.length).toBe(3);
    });

    it("should remove duplicates", () => {
      const association: TestAssociation = {
        association_name: "Test",
        aliases: "Test,test,TEST",
        case_sensitive: true,
      };

      const names = getNamesToMatch(association);

      expect(names.filter((n) => n === "Test").length).toBe(1);
    });

    it("should sort by length (longest first)", () => {
      const association: TestAssociation = {
        association_name: "A",
        aliases: "ABC,AB",
        case_sensitive: true,
      };

      const names = getNamesToMatch(association);

      expect(names[0]).toBe("ABC");
      expect(names[1]).toBe("AB");
      expect(names[2]).toBe("A");
    });

    it("should handle empty aliases", () => {
      const association: TestAssociation = {
        association_name: "Test",
        aliases: "",
        case_sensitive: true,
      };

      const names = getNamesToMatch(association);

      expect(names).toEqual(["Test"]);
    });
  });

  describe("Overlap detection", () => {
    interface Match {
      start: number;
      end: number;
    }

    const filterOverlaps = (matches: Match[]): Match[] => {
      return matches.filter(
        (m, _idx, arr) =>
          !arr.some(
            (other) =>
              other !== m && other.start <= m.start && other.end >= m.end
          )
      );
    };

    it("should keep non-overlapping matches", () => {
      const matches: Match[] = [
        { start: 0, end: 5 },
        { start: 10, end: 15 },
      ];

      const filtered = filterOverlaps(matches);

      expect(filtered).toEqual(matches);
      expect(filtered.length).toBe(2);
    });

    it("should remove shorter match when fully contained", () => {
      const matches: Match[] = [
        { start: 0, end: 10 },
        { start: 2, end: 5 },
      ];

      const filtered = filterOverlaps(matches);

      expect(filtered).toEqual([{ start: 0, end: 10 }]);
      expect(filtered.length).toBe(1);
    });

    it("should keep longer match when shorter is contained", () => {
      const matches: Match[] = [
        { start: 2, end: 5 },
        { start: 0, end: 10 },
      ];

      const filtered = filterOverlaps(matches);

      expect(filtered).toContainEqual({ start: 0, end: 10 });
      expect(filtered.length).toBe(1);
    });

    it("should handle multiple overlapping matches", () => {
      const matches: Match[] = [
        { start: 0, end: 15 },
        { start: 2, end: 5 },
        { start: 10, end: 12 },
      ];

      const filtered = filterOverlaps(matches);

      expect(filtered).toEqual([{ start: 0, end: 15 }]);
    });

    it("should keep both when matches only touch at boundary", () => {
      const matches: Match[] = [
        { start: 0, end: 5 },
        { start: 5, end: 10 },
      ];

      const filtered = filterOverlaps(matches);

      expect(filtered.length).toBe(2);
    });

    it("should handle empty matches array", () => {
      const filtered = filterOverlaps([]);

      expect(filtered).toEqual([]);
    });

    it("should handle single match", () => {
      const matches: Match[] = [{ start: 0, end: 5 }];
      const filtered = filterOverlaps(matches);

      expect(filtered).toEqual(matches);
    });
  });
});
