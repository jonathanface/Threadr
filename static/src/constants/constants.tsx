import { $getRoot, LexicalEditor, TextNode } from "lexical";

const simple32BitHash = (str: string): string => {
  let hash = 0;
  // A simple, fast, 32-bit polynomial rolling hash
  for (let i = 0; i < str.length; i++) {
    hash = (Math.imul(31, hash) + str.charCodeAt(i)) | 0;
  }
  // Convert the signed 32-bit result to an unsigned base-36 string
  return (hash >>> 0).toString(36);
};

export const generateTextHash = (editor: LexicalEditor): string => {
  let hash = "";
  editor.getEditorState().read(() => {
    const root = $getRoot();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const traverseNode = (node: any) => {
      if (typeof node.getKey !== "function") {
        console.error("Node is missing getKey method:", node);
        return;
      }
      const nodeKey = node.getKey();
      const nodeType = node.getType();
      const textContent = node.getTextContent();

      // Include formatting attributes (e.g., bold, italic)
      const formatAttributes =
        node instanceof TextNode
          ? JSON.stringify({
              format: node.getFormat(), // Bitmask for bold, italic, underline, etc.
              style: node.getStyle(), // Inline styles (e.g., font size, color)
            })
          : "";

      // Include node's serialized data in the hash
      hash += `${nodeKey}:${nodeType}:${textContent}:${formatAttributes};`;

      // Recursively process children (if any)
      if (node.getChildren) {
        node.getChildren().forEach(traverseNode);
      }
    };

    traverseNode(root);
  });
  return simple32BitHash(hash);
};

export type Quote = {
  text: string;
  source: string;
};

export const NOT_FOUND_QUOTES: Quote[] = [
  {
    text: "These aren’t the droids you’re looking for.",
    source: "Star Wars (1977)",
  },
  {
    text: "Toto, I’ve a feeling we’re not in Kansas anymore.",
    source: "The Wizard of Oz (1939)",
  },
  {
    text: "Not all those who wander are lost.",
    source: "J.R.R. Tolkien (1954)",
  },
  {
    text: "Would you tell me, please, which way I ought to go from here? — That depends a good deal on where you want to get to.",
    source: "Lewis Carroll (1865)",
  },
  {
    text: "Roads? Where we’re going, we don’t need roads.",
    source: "Back to the Future (1985)",
  },
  { text: "Just keep swimming.", source: "Finding Nemo (2003)" },
  { text: "Houston, we have a problem.", source: "Apollo 13 (1995)" },
  {
    text: "I knew I shoulda taken that left turn at Albuquerque.",
    source: "Looney Tunes",
  },
  { text: "Follow the white rabbit.", source: "The Matrix (1999)" },
  {
    text: "Stay off the moors. Stick to the road.",
    source: "An American Werewolf in London (1981)",
  },
  { text: "There’s no place like home.", source: "The Wizard of Oz (1939)" },
  {
    text: "All those moments will be lost in time, like tears in rain.",
    source: "Blade Runner (1982)",
  },
  { text: "Wherever you go, there you are.", source: "Buckaroo Banzai (1984)" },
  { text: "Two roads diverged in a wood…", source: "Robert Frost (1916)" },
  {
    text: "Not until we are lost do we begin to find ourselves.",
    source: "Thoreau (1849)",
  },
  { text: "Here be dragons.", source: "Old maps" },
  { text: "You can’t get there from here.", source: "Folk saying" },
  { text: "Adventure is out there!", source: "Up (2009)" },
  {
    text: "Off the edge of the map… here there be monsters.",
    source: "Pirates of the Caribbean (2007)",
  },
  { text: "I’m not even supposed to be here today!", source: "Clerks (1994)" },
  { text: "The road goes ever on and on.", source: "J.R.R. Tolkien" },
  { text: "We shall not cease from exploration…", source: "T.S. Eliot (1942)" },
  {
    text: "I once was lost, but now am found.",
    source: "Amazing Grace (1772)",
  },
  { text: "We’re all stories, in the end.", source: "Doctor Who" },
];
