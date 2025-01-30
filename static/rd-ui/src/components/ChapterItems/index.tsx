import { SimpleTreeView, TreeItem } from "@mui/x-tree-view"
import { Chapter } from "../../types/Chapter"
import styles from "./chapteritems.module.css"
import { useSelections } from "../../hooks/useSelections";

interface SettingsMenuProps {
    chapters: Chapter[];
    closeFn: (close: Boolean) => void;
}

export const ChapterItems = ({ chapters, closeFn }: SettingsMenuProps) => {

    const { chapter, setChapter } = useSelections();
    if (!chapter) return;

    const handleNodeSelect = (_event: React.MouseEvent, selectedItemId: string) => {
        if (selectedItemId !== chapter.id) {
            const newChapter = chapters.find(chapter => chapter.id === selectedItemId);
            if (newChapter) {
                var newurl = window.location.protocol + "//" + window.location.host + window.location.pathname + '?chapter=' + newChapter.id;
                window.history.pushState({ path: newurl }, '', newurl);
                setChapter(newChapter);
                //closeFn(false);
            }
        }
    };

    return (
        <SimpleTreeView className={styles.parentView} onItemClick={handleNodeSelect}>
            <TreeItem itemId="chapters" label="Chapters" sx={{
                "& .MuiTreeItem-label": {
                    fontFamily: "Segoe Print",
                    fontSize: '0.9rem'
                }
            }}>
                {chapters.map((chapter) => <TreeItem key={chapter.id} title={chapter.id} itemId={chapter.id} label={chapter.title} sx={{
                    "& .MuiTreeItem-label": {
                        fontSize: '0.8rem',
                    }
                }}></TreeItem>)}
            </TreeItem>
            <TreeItem itemId="outline" label="Outline" disabled={true} sx={{
                "& .MuiTreeItem-label": {
                    fontFamily: "Segoe Print",
                    fontSize: '0.9rem'
                }
            }}></TreeItem>
        </SimpleTreeView>
    );
}
