import { ElementNode, LexicalNode, TextNode } from "lexical";
import { SimplifiedAssociation } from "../types/Associations";
import { ClickableDecoratorNode } from "../components/ThreadWriter/customNodes/ClickableDecoratorNode";

const escapeRegExp = (string: string) => {
    return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

export const processAssociations = (associations: SimplifiedAssociation[], rootNode: ElementNode, exclusionList?: string[], customLeftClick?: () => void | undefined) => {
    console.log("processing", associations)
    if (!associations.length) return;

    const textNodes: TextNode[] = [];
    const traverse = (node: LexicalNode) => {
        if (node instanceof TextNode) {
            textNodes.push(node);
        } else if (node instanceof ElementNode) {
            node.getChildren().forEach(traverse);
        }
    };
    rootNode.getChildren().forEach(traverse);

    textNodes.forEach((textNode) => {
        const textContent = textNode.getTextContent();
        associations.forEach((association) => {
            const aliases = association.aliases.length
                ? association.aliases.split(",").map(alias => alias.trim())
                : [];
            aliases.sort((a, b) => b.length - a.length); // Match longer aliases first
            const namesToMatch = [...aliases, association.association_name.trim()];

            for (const name of namesToMatch) {
                if (exclusionList?.includes(name)) {
                    continue;
                }

                const searchText = association.case_sensitive
                    ? textContent
                    : textContent.toLowerCase();
                const searchFor = association.case_sensitive
                    ? name
                    : name.toLowerCase();

                const regex = new RegExp(`\\b${escapeRegExp(searchFor)}\\b`, "g");
                let match: RegExpExecArray | null;

                while ((match = regex.exec(searchText)) !== null) {
                    const currentMatch = match;

                    const parent = textNode.getParent();
                    if (!(parent instanceof ElementNode)) return;

                    const beforeMatch = textContent.slice(0, currentMatch.index);
                    const matchedText = textContent.slice(
                        currentMatch.index,
                        currentMatch.index + searchFor.length
                    );
                    const afterMatch = textContent.slice(
                        currentMatch.index + searchFor.length
                    );

                    if (beforeMatch) {
                        const beforeNode = new TextNode(beforeMatch);
                        textNode.insertBefore(beforeNode);
                    }

                    const decoratorNode = new ClickableDecoratorNode(
                        matchedText,
                        association.association_id,
                        association.short_description,
                        association.association_type,
                        association.portrait,
                        undefined,
                        customLeftClick
                    );
                    textNode.insertBefore(decoratorNode);

                    if (afterMatch) {
                        const afterNode = new TextNode(afterMatch);
                        decoratorNode.insertAfter(afterNode);
                    }

                    textNode.remove();
                    break; // Stop processing after the first match for this association
                }
            }
        });
    });
};