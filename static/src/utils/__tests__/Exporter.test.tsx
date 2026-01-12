import { describe, it, expect, vi, beforeEach } from "vitest";
import Exporter from "../Exporter";
import { api } from "../../api";

// Mock the API module
vi.mock("../../api", () => ({
  api: {
    get: vi.fn(),
  },
}));

describe("Exporter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("lexicalToHtml", () => {
    it("should convert Lexical JSON blocks to HTML with text content", async () => {
      // Mock story with chapter blocks containing Lexical JSON
      const mockFullStory = {
        story_title: "Test Story",
        chapters_with_contents: [
          {
            chapter: {
              id: "chapter-1",
              title: "Chapter One",
            },
            blocks: {
              items: [
                {
                  key_id: { Value: "block-1" },
                  chunk: {
                    Value: JSON.stringify({
                      children: [
                        {
                          type: "text",
                          version: 1,
                          text: "This is the first paragraph.",
                          format: 0,
                          style: "",
                          mode: "normal",
                          detail: 0,
                        },
                      ],
                      direction: "ltr",
                      format: "",
                      indent: 0,
                      type: "custom-paragraph",
                      version: 1,
                      textFormat: 0,
                      textStyle: "",
                      key_id: "block-1",
                    }),
                  },
                },
                {
                  key_id: { Value: "block-2" },
                  chunk: {
                    Value: JSON.stringify({
                      children: [
                        {
                          type: "text",
                          version: 1,
                          text: "This is the second paragraph with ",
                          format: 0,
                          style: "",
                          mode: "normal",
                          detail: 0,
                        },
                        {
                          type: "text",
                          version: 1,
                          text: "bold text",
                          format: 1, // Bold format
                          style: "",
                          mode: "normal",
                          detail: 0,
                        },
                        {
                          type: "text",
                          version: 1,
                          text: " in it.",
                          format: 0,
                          style: "",
                          mode: "normal",
                          detail: 0,
                        },
                      ],
                      direction: "ltr",
                      format: "",
                      indent: 0,
                      type: "custom-paragraph",
                      version: 1,
                      textFormat: 0,
                      textStyle: "",
                      key_id: "block-2",
                    }),
                  },
                },
              ],
            },
          },
        ],
      };

      vi.mocked(api.get).mockResolvedValue({ data: mockFullStory });

      const story = {
        story_id: "test-story-id",
        title: "Test Story",
        description: "A test story",
        chapters: [],
        image_url: "",
        series_id: "",
        created_at: 0,
      };

      const exporter = new Exporter(story);
      const result = await exporter.lexicalToHtml();

      // Verify API was called correctly
      expect(api.get).toHaveBeenCalledWith("/stories/test-story-id/full");

      // Verify we got one chapter back
      expect(result).toHaveLength(1);
      expect(result[0].chapter).toBe("Chapter One");

      // Verify HTML contains the actual text content (not empty paragraphs)
      expect(result[0].html).toContain("This is the first paragraph.");
      expect(result[0].html).toContain("This is the second paragraph with");
      expect(result[0].html).toContain("bold text");
      expect(result[0].html).toContain("in it.");

      // Verify HTML is not just empty <p></p> tags
      expect(result[0].html).not.toBe("<p></p><p></p>");
    });

    it("should handle multiple chapters", async () => {
      const mockFullStory = {
        story_title: "Multi-Chapter Story",
        chapters_with_contents: [
          {
            chapter: { id: "ch-1", title: "Prologue" },
            blocks: {
              items: [
                {
                  key_id: { Value: "b1" },
                  chunk: {
                    Value: JSON.stringify({
                      children: [
                        { type: "text", version: 1, text: "In the beginning...", format: 0, style: "", mode: "normal", detail: 0 },
                      ],
                      direction: "ltr",
                      format: "",
                      indent: 0,
                      type: "custom-paragraph",
                      version: 1,
                      textFormat: 0,
                      textStyle: "",
                      key_id: "b1",
                    }),
                  },
                },
              ],
            },
          },
          {
            chapter: { id: "ch-2", title: "Chapter 1" },
            blocks: {
              items: [
                {
                  key_id: { Value: "b2" },
                  chunk: {
                    Value: JSON.stringify({
                      children: [
                        { type: "text", version: 1, text: "The story continues...", format: 0, style: "", mode: "normal", detail: 0 },
                      ],
                      direction: "ltr",
                      format: "",
                      indent: 0,
                      type: "custom-paragraph",
                      version: 1,
                      textFormat: 0,
                      textStyle: "",
                      key_id: "b2",
                    }),
                  },
                },
              ],
            },
          },
        ],
      };

      vi.mocked(api.get).mockResolvedValue({ data: mockFullStory });

      const story = {
        story_id: "multi-chapter-story",
        title: "Multi-Chapter Story",
        description: "",
        chapters: [],
        image_url: "",
        series_id: "",
        created_at: 0,
      };

      const exporter = new Exporter(story);
      const result = await exporter.lexicalToHtml();

      expect(result).toHaveLength(2);
      expect(result[0].chapter).toBe("Prologue");
      expect(result[0].html).toContain("In the beginning...");
      expect(result[1].chapter).toBe("Chapter 1");
      expect(result[1].html).toContain("The story continues...");
    });

    it("should handle chapters with no blocks gracefully", async () => {
      const mockFullStory = {
        story_title: "Empty Chapter Story",
        chapters_with_contents: [
          {
            chapter: { id: "ch-1", title: "Empty Chapter" },
            blocks: null,
          },
          {
            chapter: { id: "ch-2", title: "Chapter With Content" },
            blocks: {
              items: [
                {
                  key_id: { Value: "b1" },
                  chunk: {
                    Value: JSON.stringify({
                      children: [
                        { type: "text", version: 1, text: "Some content here.", format: 0, style: "", mode: "normal", detail: 0 },
                      ],
                      direction: "ltr",
                      format: "",
                      indent: 0,
                      type: "custom-paragraph",
                      version: 1,
                      textFormat: 0,
                      textStyle: "",
                      key_id: "b1",
                    }),
                  },
                },
              ],
            },
          },
        ],
      };

      vi.mocked(api.get).mockResolvedValue({ data: mockFullStory });

      const story = {
        story_id: "empty-chapter-story",
        title: "Empty Chapter Story",
        description: "",
        chapters: [],
        image_url: "",
        series_id: "",
        created_at: 0,
      };

      const exporter = new Exporter(story);
      const result = await exporter.lexicalToHtml();

      // Should only return chapters that have blocks
      expect(result).toHaveLength(1);
      expect(result[0].chapter).toBe("Chapter With Content");
      expect(result[0].html).toContain("Some content here.");
    });

    it("should handle text with special formatting (italic, underline)", async () => {
      const mockFullStory = {
        story_title: "Formatted Story",
        chapters_with_contents: [
          {
            chapter: { id: "ch-1", title: "Formatted Chapter" },
            blocks: {
              items: [
                {
                  key_id: { Value: "b1" },
                  chunk: {
                    Value: JSON.stringify({
                      children: [
                        { type: "text", version: 1, text: "Normal ", format: 0, style: "", mode: "normal", detail: 0 },
                        { type: "text", version: 1, text: "italic", format: 2, style: "", mode: "normal", detail: 0 },
                        { type: "text", version: 1, text: " and ", format: 0, style: "", mode: "normal", detail: 0 },
                        { type: "text", version: 1, text: "bold italic", format: 3, style: "", mode: "normal", detail: 0 },
                        { type: "text", version: 1, text: " text.", format: 0, style: "", mode: "normal", detail: 0 },
                      ],
                      direction: "ltr",
                      format: "",
                      indent: 0,
                      type: "custom-paragraph",
                      version: 1,
                      textFormat: 0,
                      textStyle: "",
                      key_id: "b1",
                    }),
                  },
                },
              ],
            },
          },
        ],
      };

      vi.mocked(api.get).mockResolvedValue({ data: mockFullStory });

      const story = {
        story_id: "formatted-story",
        title: "Formatted Story",
        description: "",
        chapters: [],
        image_url: "",
        series_id: "",
        created_at: 0,
      };

      const exporter = new Exporter(story);
      const result = await exporter.lexicalToHtml();

      expect(result).toHaveLength(1);
      // Verify all text content is present
      expect(result[0].html).toContain("Normal");
      expect(result[0].html).toContain("italic");
      expect(result[0].html).toContain("bold italic");
      expect(result[0].html).toContain("text.");
    });
  });
});
