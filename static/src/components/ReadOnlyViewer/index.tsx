import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import LexicalErrorBoundary from "@lexical/react/LexicalErrorBoundary";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { Button, Stack } from "@mui/material";
import { $getRoot, LexicalEditor } from "lexical";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { sharedApi } from "../../api/shared";
import { Comment, CreateCommentRequest } from "../../types/Sharing";
import {
  CustomParagraphNode,
  type CustomSerializedParagraphNode,
} from "../ThreadWriter/customNodes/CustomParagraphNode";
import { CommentComposer } from "./CommentComposer";
import { CommentSidebar } from "./CommentSidebar";
import styles from "./readonlyviewer.module.css";

const theme = {
  "custom-paragraph": styles.customParagraph,
  text: {
    bold: styles.bold,
    italic: styles.italic,
    underline: styles.underline,
    strikethrough: styles.strikethrough,
  },
};

interface ReadOnlyViewerProps {
  token: string;
  storyId: string;
  chapterId: string;
  commentsEnabled: boolean;
  readerFirstName: string;
  readerLastName: string;
  onPrevChapter?: () => void;
  onNextChapter?: () => void;
  showNav?: boolean;
  chapterSelector?: React.ReactNode;
  showSignupPrompt?: boolean;
}

function LoadContentPlugin({
  token,
  chapterId,
  onBlocksLoaded,
}: {
  token: string;
  chapterId: string;
  onBlocksLoaded: (blockKeyIds: string[]) => void;
}) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    if (!chapterId) return;
    const ac = new AbortController();

    const loadContent = async () => {
      try {
        const { data } = await sharedApi.get<{
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          items?: Array<{ chunk: any; key_id: any }>;
        }>(`/${token}/content?chapter=${chapterId}`, { signal: ac.signal });

        if (!data?.items?.length) return;

        const keyIds: string[] = [];

        // Parse blocks using the same pattern as useFetchStoryBlocks
        const remappedBlocks: CustomSerializedParagraphNode[] =
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          data.items.map((item: any) => {
            const key = item.key_id?.Value || "";

            const fixed: CustomSerializedParagraphNode = item.chunk?.Value
              ? JSON.parse(item.chunk.Value)
              : {
                  children: [],
                  direction: "ltr",
                  format: "",
                  indent: 0,
                  textFormat: 0,
                  textStyle: "",
                  type: "custom-paragraph",
                  version: 1,
                  key_id: key,
                };
            fixed.key_id = key;

            if (fixed.type !== CustomParagraphNode.getType()) {
              fixed.type = CustomParagraphNode.getType();
            }

            keyIds.push(key);
            return fixed;
          });

        const editorState = editor.parseEditorState({
          root: {
            children: remappedBlocks,
            type: "root",
            version: 1,
            direction: "ltr",
            format: "",
            indent: 0,
          },
        });
        editor.setEditorState(editorState);

        onBlocksLoaded(keyIds);
      } catch (err) {
        if (!ac.signal.aborted) {
          console.error("Failed to load shared content:", err);
        }
      }
    };

    loadContent();
    return () => ac.abort();
  }, [editor, token, chapterId, onBlocksLoaded]);

  return null;
}

export const ReadOnlyViewer = ({
  token,
  chapterId,
  commentsEnabled,
  readerFirstName,
  readerLastName,
  onPrevChapter,
  onNextChapter,
  showNav,
  chapterSelector,
  showSignupPrompt,
}: ReadOnlyViewerProps) => {
  const [comments, setComments] = useState<Comment[]>([]);
  const [showComposer, setShowComposer] = useState(false);
  const [selectedText, setSelectedText] = useState("");
  const [selectionInfo, setSelectionInfo] = useState<{
    blockKeyId: string;
    anchorOffset: number;
    focusOffset: number;
  } | null>(null);
  const editorRef = useRef<LexicalEditor | null>(null);

  const [_blockKeyIds, setBlockKeyIds] = useState<string[]>([]);

  const initialConfig = {
    namespace: "SharedReader",
    theme,
    nodes: [CustomParagraphNode],
    editable: false,
    onError: (error: Error) => console.error(error),
  };

  // Fetch comments
  const fetchComments = useCallback(async () => {
    try {
      const res = await sharedApi.get<Comment[]>(`/${token}/comments`);
      setComments(res.data || []);
    } catch (err) {
      console.error("Failed to fetch comments:", err);
    }
  }, [token]);

  useEffect(() => {
    if (commentsEnabled) {
      fetchComments(); // eslint-disable-line react-hooks/set-state-in-effect
    }
  }, [commentsEnabled, fetchComments, chapterId]);

  const handleBlocksLoaded = useCallback((keyIds: string[]) => {
    setBlockKeyIds(keyIds);
  }, []);

  // Handle text selection for commenting
  const handleMouseUp = useCallback(() => {
    if (!commentsEnabled || !editorRef.current) return;

    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.toString().trim()) {
      return;
    }

    const text = selection.toString();

    // Find which paragraph the selection starts in by reading Lexical state
    editorRef.current.getEditorState().read(() => {
      const root = $getRoot();
      const children = root.getChildren();

      // Walk up from the DOM anchor node to find the containing <p> element
      let anchorElement =
        selection.anchorNode instanceof HTMLElement
          ? selection.anchorNode
          : selection.anchorNode?.parentElement;
      while (anchorElement && anchorElement.tagName !== "P") {
        anchorElement = anchorElement.parentElement;
      }

      if (!anchorElement) return;

      // Match the <p> element to a Lexical paragraph by its index in the editor
      const editorRoot = anchorElement.closest("[data-lexical-editor]");
      if (!editorRoot) return;

      const paragraphs = Array.from(editorRoot.querySelectorAll("p"));
      const paragraphIndex = paragraphs.indexOf(
        anchorElement as HTMLParagraphElement,
      );
      if (paragraphIndex === -1 || paragraphIndex >= children.length) return;

      const node = children[paragraphIndex];
      if (node instanceof CustomParagraphNode) {
        setSelectedText(text);
        setSelectionInfo({
          blockKeyId: node.getKeyId(),
          anchorOffset: selection.anchorOffset,
          focusOffset: selection.focusOffset,
        });
        setShowComposer(true);
      }
    });
  }, [commentsEnabled]);

  const handleSubmitComment = useCallback(
    async (body: string) => {
      if (!selectionInfo) return;

      const req: CreateCommentRequest = {
        chapter_id: chapterId,
        block_key_id: selectionInfo.blockKeyId,
        anchor_offset: selectionInfo.anchorOffset,
        focus_offset: selectionInfo.focusOffset,
        anchor_text_snapshot: selectedText,
        body,
      };

      try {
        await sharedApi.post(`/${token}/comments`, req);
        setShowComposer(false);
        setSelectedText("");
        setSelectionInfo(null);
        fetchComments();
      } catch (err) {
        console.error("Failed to create comment:", err);
      }
    },
    [token, chapterId, selectionInfo, selectedText, fetchComments],
  );

  const handleDeleteComment = useCallback(
    async (commentId: string) => {
      try {
        await sharedApi.delete(`/${token}/comments/${commentId}`);
        fetchComments();
      } catch (err) {
        console.error("Failed to delete comment:", err);
      }
    },
    [token, fetchComments],
  );

  const chapterComments = useMemo(
    () => comments.filter((c) => c.chapter_id === chapterId),
    [comments, chapterId],
  );
  const [highlightRects, setHighlightRects] = useState<
    {
      top: number;
      left: number;
      width: number;
      height: number;
      title: string;
      commentId: string;
    }[]
  >([]);

  const commentPositionMap = useMemo(
    () =>
      highlightRects.reduce(
        (acc, r) => {
          if (!(r.commentId in acc)) {
            acc[r.commentId] = r.top;
          }
          return acc;
        },
        {} as Record<string, number>,
      ),
    [highlightRects],
  );
  const [focusedCommentId, setFocusedCommentId] = useState<string | null>(null);
  const [hoveredComment, setHoveredComment] = useState<{
    comment: Comment;
    top: number;
    left: number;
  } | null>(null);
  const editorContainerRef = useRef<HTMLDivElement>(null);

  // Compute overlay highlight positions from comments (non-destructive, no DOM mutation)
  useEffect(() => {
    if (
      !editorRef.current ||
      chapterComments.length === 0 ||
      !editorContainerRef.current
    ) {
      setHighlightRects([]); // eslint-disable-line react-hooks/set-state-in-effect
      return;
    }

    const timer = setTimeout(() => {
      editorRef.current?.getEditorState().read(() => {
        const root = $getRoot();
        const children = root.getChildren();

        const keyIdToIndex = new Map<string, number>();
        children.forEach((node, index) => {
          if (node instanceof CustomParagraphNode) {
            keyIdToIndex.set(node.getKeyId(), index);
          }
        });

        const editorEl = editorContainerRef.current?.querySelector(
          "[data-lexical-editor]",
        );
        if (!editorEl) return;
        const containerRect = editorEl.getBoundingClientRect();
        const paragraphs = editorEl.querySelectorAll("p");
        const rects: typeof highlightRects = [];

        for (const comment of chapterComments) {
          if (comment.resolved || !comment.anchor_text_snapshot) continue;

          const pIndex = keyIdToIndex.get(comment.block_key_id);
          if (pIndex === undefined || pIndex >= paragraphs.length) continue;

          const p = paragraphs[pIndex];
          const textContent = p.textContent || "";

          // Use the stored anchor_offset first; fall back to text search
          let snippetStart = comment.anchor_offset;
          const snippetLen = comment.anchor_text_snapshot.length;

          // Verify the offset still matches the snapshot text
          if (
            snippetStart < 0 ||
            snippetStart + snippetLen > textContent.length ||
            textContent.substring(snippetStart, snippetStart + snippetLen) !==
              comment.anchor_text_snapshot
          ) {
            // Offset doesn't match (text was edited), fall back to indexOf
            snippetStart = textContent.indexOf(comment.anchor_text_snapshot);
            if (snippetStart === -1) continue;
          }
          const snippetEnd = snippetStart + snippetLen;

          // Walk text nodes to find the range
          const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
          let charCount = 0;
          let startNode: Text | null = null;
          let startOffset = 0;
          let endNode: Text | null = null;
          let endOffset = 0;

          while (walker.nextNode()) {
            const textNode = walker.currentNode as Text;
            const nodeLen = textNode.length;
            if (!startNode && charCount + nodeLen > snippetStart) {
              startNode = textNode;
              startOffset = snippetStart - charCount;
            }
            if (charCount + nodeLen >= snippetEnd) {
              endNode = textNode;
              endOffset = snippetEnd - charCount;
              break;
            }
            charCount += nodeLen;
          }

          if (!startNode || !endNode) continue;

          try {
            const range = document.createRange();
            range.setStart(startNode, startOffset);
            range.setEnd(endNode, endOffset);
            const title = `${comment.reader_first_name} ${comment.reader_last_name}: ${comment.body}`;

            for (const rect of range.getClientRects()) {
              rects.push({
                top: rect.top - containerRect.top,
                left: rect.left - containerRect.left,
                width: rect.width,
                height: rect.height,
                title,
                commentId: comment.comment_id,
              });
            }
          } catch {
            // getClientRects can fail in edge cases
          }
        }

        setHighlightRects(rects);
      });
    }, 200);

    return () => clearTimeout(timer);
  }, [chapterComments, _blockKeyIds]);

  return (
    <div className={styles.outerWrapper}>
      {chapterSelector && (
        <div
          className={styles.readerRow}
          style={{ marginTop: 0, marginBottom: 8 }}
        >
          <div className={styles.readerArea}>{chapterSelector}</div>
          {commentsEnabled && (
            <div style={{ width: 334, minWidth: 334, flexShrink: 0 }} />
          )}
        </div>
      )}
      {showNav && (
        <div
          className={styles.readerRow}
          style={{ marginTop: 0, marginBottom: 0 }}
        >
          <Stack
            direction="row"
            justifyContent="flex-start"
            gap={1}
            className={styles.readerArea}
            sx={{ mb: 1 }}
          >
            <Button
              size="small"
              disabled={!onPrevChapter}
              onClick={onPrevChapter}
            >
              &larr; Previous
            </Button>
            <Button
              size="small"
              disabled={!onNextChapter}
              onClick={onNextChapter}
            >
              Next &rarr;
            </Button>
          </Stack>
          {commentsEnabled && (
            <div style={{ width: 334, minWidth: 334, flexShrink: 0 }} />
          )}
        </div>
      )}
      <div className={styles.readerRow}>
        <div className={styles.readerArea}>
          <div ref={editorContainerRef} style={{ position: "relative" }}>
            {highlightRects.map((rect, i) => (
              <div
                key={i}
                className={styles.commentHighlight}
                onClick={() => {
                  setFocusedCommentId(rect.commentId);
                  setTimeout(() => {
                    const el = document.getElementById(
                      `comment-${rect.commentId}`,
                    );
                    if (el) {
                      el.scrollIntoView({
                        behavior: "smooth",
                        block: "nearest",
                      });
                    }
                  }, 50);
                }}
                onMouseEnter={(e) => {
                  const comment = chapterComments.find(
                    (c) => c.comment_id === rect.commentId,
                  );
                  if (comment) {
                    const containerRect =
                      editorContainerRef.current?.getBoundingClientRect();
                    setHoveredComment({
                      comment,
                      top: e.clientY - (containerRect?.top ?? 0) + 20,
                      left: e.clientX - (containerRect?.left ?? 0),
                    });
                  }
                }}
                onMouseLeave={() => setHoveredComment(null)}
                style={{
                  position: "absolute",
                  top: rect.top,
                  left: rect.left,
                  width: rect.width,
                  height: rect.height,
                  pointerEvents: "auto",
                }}
              />
            ))}
            {hoveredComment && (
              <div
                className={styles.commentBubble}
                style={{
                  top: hoveredComment.top,
                  left: hoveredComment.left,
                }}
              >
                <div className={styles.commentBubbleAuthor}>
                  {hoveredComment.comment.reader_first_name}{" "}
                  {hoveredComment.comment.reader_last_name}
                </div>
                <div className={styles.commentBubbleBody}>
                  {hoveredComment.comment.body.length > 200
                    ? hoveredComment.comment.body.slice(0, 200) + "…"
                    : hoveredComment.comment.body}
                </div>
              </div>
            )}
            <LexicalComposer
              key={chapterId}
              initialConfig={{
                ...initialConfig,
                editorState: (editor: LexicalEditor) => {
                  editorRef.current = editor;
                },
              }}
            >
              <RichTextPlugin
                contentEditable={
                  <ContentEditable
                    className={styles.readerInput}
                    onMouseUp={handleMouseUp}
                  />
                }
                placeholder={null}
                ErrorBoundary={LexicalErrorBoundary}
              />
              <LoadContentPlugin
                token={token}
                chapterId={chapterId}
                onBlocksLoaded={handleBlocksLoaded}
              />
            </LexicalComposer>
          </div>
        </div>

        {commentsEnabled && (
          <div style={{ display: "flex", flexDirection: "column", width: 332 }}>
            {showSignupPrompt && (
              <Button
                variant="contained"
                size="small"
                href="/signup"
                fullWidth
                sx={{
                  textTransform: "none",
                  fontSize: "0.8rem",
                  mb: 1,
                }}
              >
                Want to write your own? Create a free Docter account and get
                started.
              </Button>
            )}
            <CommentSidebar
              comments={chapterComments}
              readerFirstName={readerFirstName}
              readerLastName={readerLastName}
              onDelete={handleDeleteComment}
              focusedCommentId={focusedCommentId}
              onFocusClear={() => setFocusedCommentId(null)}
              commentPositions={commentPositionMap}
            />
          </div>
        )}
      </div>
      {showNav && (
        <div
          className={styles.readerRow}
          style={{ marginTop: 0, marginBottom: 0 }}
        >
          <Stack
            direction="row"
            justifyContent="flex-start"
            gap={1}
            className={styles.readerArea}
            sx={{ mt: 1 }}
          >
            <Button
              size="small"
              disabled={!onPrevChapter}
              onClick={onPrevChapter}
            >
              &larr; Previous
            </Button>
            <Button
              size="small"
              disabled={!onNextChapter}
              onClick={onNextChapter}
            >
              Next &rarr;
            </Button>
          </Stack>
          {commentsEnabled && (
            <div style={{ width: 334, minWidth: 334, flexShrink: 0 }} />
          )}
        </div>
      )}

      {showComposer && (
        <CommentComposer
          selectedText={selectedText}
          readerName={`${readerFirstName} ${readerLastName}`}
          onSubmit={handleSubmitComment}
          onCancel={() => {
            setShowComposer(false);
            setSelectedText("");
            setSelectionInfo(null);
          }}
        />
      )}
    </div>
  );
};
