import React, { useCallback, useEffect, useState } from "react";
import { useDropzone } from "react-dropzone";
import { useDispatch } from "react-redux";
import { setAlert } from "../../stores/alertSlice";
import { AppDispatch } from "../../stores/store";
import { AlertToast, AlertToastType } from "../../utils/Toaster";
import styles from "./portrait-dropper.module.css";

interface PortraitDropperProps {
  imageURL: string;
  name: string;
  onComplete?: Function;
  onImageLoaded?: Function;
}

const acceptedFileTypes = ["png", "jpg", "jpeg", "gif"];

const PortraitDropper = (props: PortraitDropperProps) => {
  const [imageURL, setImageURL] = useState(props.imageURL);
  const [name, setName] = useState(props.name);

  const useAppDispatch: () => AppDispatch = useDispatch;
  const dispatch = useAppDispatch();

  useEffect(() => {
    setImageURL(props.imageURL);
    setName(props.name);
  }, [props.imageURL, props.name]);

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      const droppedFile = acceptedFiles[0];
      if (droppedFile.type) {
        console.log("type", droppedFile.type);
        if (!acceptedFileTypes.includes(droppedFile.type.split("image/")[1])) {
          const confirmFormMessage: AlertToast = {
            title: "Cannot upload file",
            message: "Only images of the following type are allowed: " + acceptedFileTypes.toString(),
            severity: AlertToastType.warning,
            open: true,
            timeout: 10000,
          };
          dispatch(setAlert(confirmFormMessage));
          return;
        }
      }
      setImageURL(URL.createObjectURL(droppedFile));
      if (props.onComplete) {
        props.onComplete(acceptedFiles);
      }
    },
    [props]
  );

  const onImageLoaded = () => {
    if (props.onImageLoaded) {
      props.onImageLoaded();
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop });

  return (
    <div className={styles.portraitDropper}>
      <figure className={styles.portrait}>
        <span {...getRootProps()}>
          <img src={imageURL} onLoad={onImageLoaded} alt={name} title={name} />
          <figcaption>
            Drop an image over the picture to update, or click on it.
            <input {...getInputProps()} />
          </figcaption>
        </span>
      </figure>
    </div>
  );
};
export default PortraitDropper;
