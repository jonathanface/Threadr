import { IconButton, Tooltip } from "@mui/material";
import { useState } from "react";
import styles from "./documentexporter.module.css";
import FileDownloadIcon from "@mui/icons-material/FileDownload";
import { DocumentExportType } from "../../../../../types/DocumentExport";
import { useSelections } from "../../../../../hooks/useSelections";
import {
  AlertCommandType,
  AlertFunctionCall,
  AlertToastType,
} from "../../../../../types/AlertToasts";
import Exporter from "../../../../../utils/Exporter";
import { useFetchUserData } from "../../../../../hooks/useFetchUserData";
import { useToaster } from "../../../../../hooks/useToaster";
import axios from "axios";
import { api } from "../../../../../api";

export const DocumentExporter = () => {
  const [isOpen, setIsOpen] = useState(false);
  const { story } = useSelections();
  const { setAlertState } = useToaster();
  const { userDetails } = useFetchUserData();

  const exportDoc = async (type: DocumentExportType) => {
    if (story) {
      const exp = new Exporter(story);
      let htmlData;
      setIsOpen(false);
      setAlertState({
        title: "Exporting",
        message:
          "Your export is being prepared. You will be notified when the document is ready.",
        open: true,
        severity: AlertToastType.info,
      });
      try {
        htmlData = await exp.lexicalToHtml();
      } catch (error) {
        console.error(`error from lexicalToHTML: ${error}`);
        setAlertState({
          title: "Error",
          message:
            "Unable to export your document at this time. Please try again later, or contact support@richdocter.io.",
          open: true,
          severity: AlertToastType.error,
        });
        return;
      }

      try {
        // Build author name from first and last name, fallback to email
        const authorName = userDetails?.first_name
          ? `${userDetails.first_name}${
              userDetails.last_name ? ` ${userDetails.last_name}` : ""
            }`
          : userDetails?.email;

        const { data: json } = await api.put<{ url: string }>(
          `/stories/${story.story_id}/export`,
          {
            html_by_chapter: htmlData,
            title: story.title,
            story_id: story.story_id,
            type,
            author: authorName,
            cover_image: story.image_url || undefined,
          },
          {
            headers: { "Content-Type": "application/json" },
            params: { type },
          },
        );

        const alertLink = {
          url: json.url,
          text: "download/open",
        };

        setAlertState({
          title: "Conversion complete",
          message: "Right-click the link to save your document.",
          open: true,
          severity: AlertToastType.success,
          link: alertLink,
          timeout: null,
        });
      } catch (error) {
        if (axios.isAxiosError(error) && error.response?.status === 402) {
          const subscribeFunc: AlertFunctionCall = {
            type: AlertCommandType.subscribe,
            text: "subscribe",
          };
          setAlertState({
            title: "Insufficient subscription",
            message: "Free accounts are unable to export their stories.",
            open: true,
            severity: AlertToastType.warning,
            timeout: null,
            callback: subscribeFunc,
          });
        } else {
          console.error(error);
          setAlertState({
            title: "Error",
            message:
              "Unable to export your document at this time. Please try again later, or contact support@richdocter.io.",
            open: true,
            severity: AlertToastType.error,
          });
        }
      }
    }
  };
  let disabled = false;
  if (!userDetails?.subscriber) {
    disabled = true;
  }
  const altText = !userDetails?.subscriber
    ? "Exporting stories is only available to subscribers"
    : "Export story";

  return (
    <div
      className={styles.exporter}
      onMouseEnter={() => (!disabled ? setIsOpen(true) : null)}
      onMouseLeave={() => (!disabled ? setIsOpen(false) : null)}
      style={{ position: "relative", display: "inline-block" }} // Ensure positioning
    >
      <Tooltip title={altText} placement="top">
        <span>
          <IconButton
            className={styles.parentButton}
            aria-label="export"
            disabled={disabled}
            onClick={() => (!disabled ? setIsOpen(!isOpen) : null)}
          >
            <FileDownloadIcon fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>
      {isOpen && (
        <ul>
          <li onClick={() => exportDoc(DocumentExportType.pdf)}>PDF</li>
          <li onClick={() => exportDoc(DocumentExportType.docx)}>DOCX</li>
          <li onClick={() => exportDoc(DocumentExportType.epub)}>EPUB</li>
        </ul>
      )}
    </div>
  );
};
