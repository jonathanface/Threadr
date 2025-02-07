import { Box, Button, createTheme, IconButton, Step, StepLabel, Stepper, ThemeProvider, Typography } from "@mui/material";
import { useEffect, useRef, useState } from "react";
import styles from './createeditstoryslideshow.module.css'
import { TitleStep } from "./TitleStep";
import { ImageStep } from "./ImageStep";
import { useLoader } from "../../hooks/useLoader";
import { DescriptionStep } from "./DescriptionStep";
import { SeriesStep } from "./SeriesStep";
import { VerificationStep } from "./VerificationStep";
import { useWorksList } from "../../hooks/useWorksList";
import { useSelections } from "../../hooks/useSelections";
import { Story } from "../../types/Story";
import { Series } from "../../types/Series";
import { useToaster } from "../../hooks/useToaster";
import { AlertCommandType, AlertToastType } from "../../types/AlertToasts";
import { useNavigate, useParams } from "react-router-dom";
import CloseIcon from '@mui/icons-material/Close';

const steps = ['Title', 'Image', 'Description', 'Series'];

interface CreateStoryForm {
    [key: string]: string | undefined | File | number;
    story_id?: string;
    title?: string;
    description?: string;
    series_id?: string;
    series_title?: string;
    image?: File;
    image_url?: string;
    series_place?: number;
}

interface SelectedSeries {
    series_id?: string;
    series_title: string;
}

export const CreateEditStorySlideshow = () => {
    const [activeStep, setActiveStep] = useState(0);
    const [skipped, setSkipped] = useState(new Set<number>());
    const [storyBuild, setStoryBuild] = useState<CreateStoryForm>({
        title: "",
        description: "",
        series_id: undefined,
        series_title: undefined,
        series_place: 0,
        image: undefined,
    });
    const { showLoader, hideLoader } = useLoader();
    const [warning, setWarning] = useState("");
    const [tempTitle, setTempTitle] = useState("");
    const [tempImageURL, setTempImageURL] = useState<string | undefined>(undefined);
    const [tempDescription, setTempDescription] = useState("")
    const [tempSeries, setTempSeries] = useState<SelectedSeries | undefined>(undefined);
    const { seriesList, setSeriesList, storiesList, setStoriesList } = useWorksList();
    const { propagateSeriesUpdates, propagateStoryUpdates } = useSelections();
    const { setAlertState } = useToaster();
    const navigate = useNavigate();
    const { storyID } = useParams<{ storyID: string }>();
    const storedSeriesID = useRef("")

    const handleSeriesChange = (value: string, seriesId?: string) => {
        setTempSeries({
            series_id: seriesId,
            series_title: value
        })
    };

    useEffect(() => {
        if (!storyID || !storyID.length) return;
        const fetchStory = async () => {
            try {
                showLoader();
                const response = await fetch(`/api/stories/${storyID}`);
                if (!response.ok) throw new Error('Story not found');
                const data = await response.json() as Story;

                console.log("setting story from index", data);
                const editingStoryBuild: CreateStoryForm = {
                    story_id: data.story_id,
                    title: data.title,
                    description: data.description,
                    series_id: data.series_id,
                    image_url: data.image_url,
                    series_place: data.place
                }
                setTempTitle(data.title);
                setTempImageURL(data.image_url);
                setTempDescription(data.description);
                if (data.series_id) {
                    storedSeriesID.current = data.series_id;
                    const seriesResponse = await fetch(`/api/series/${data.series_id}`);
                    if (!seriesResponse.ok) throw new Error('Series not found');
                    const seriesData = await response.json() as Series;
                    editingStoryBuild.series_title = seriesData.series_title;
                    setTempSeries({
                        series_id: seriesData.series_id,
                        series_title: seriesData.series_title
                    });
                }
                setStoryBuild(editingStoryBuild);
            } catch (err) {
                console.error(err);
                setAlertState({
                    title: "Error retrieving data",
                    message:
                        "We are experiencing difficulty retrieving some or all of your data",
                    severity: AlertToastType.error,
                    open: true,
                    timeout: 6000,
                });
            } finally {
                hideLoader();
            }
        };
        fetchStory();
    }, [storyID, showLoader, hideLoader, setAlertState]);

    const isStepOptional = (step: number) => {
        return step === 1 || step === 2;
    };

    const isStepSkipped = (step: number) => {
        return skipped.has(step);
    };

    const buildFormData = (buildObj: CreateStoryForm): FormData => {
        const formData = new FormData();
        for (const key in buildObj) {
            if (Object.prototype.hasOwnProperty.call(buildObj, key)) {
                const value = buildObj[key];
                if (value === undefined) continue;
                if (typeof value === "string" || typeof value === "number") {
                    formData.append(key, value.toString());
                    continue;
                }
                if (value instanceof File) {
                    formData.append("file", value);
                }
            }
        }
        return formData;
    }

    const editStory = async () => {
        if (!storyBuild.title || !storyBuild.title.trim().length) {
            setWarning("You have to specify a title.");
            return;
        }

        if (storyBuild.series_id && storyBuild.series_id.length && storyBuild.series_id !== storedSeriesID.current) {
            // we have moved this story a new series
            const foundSeries = seriesList?.find((srs) => srs.series_id === storyBuild.series_id);
            if (foundSeries) {
                storyBuild.series_place = foundSeries.stories.length ? foundSeries.stories.length : 1;
            }
        } else if (!storyBuild.series_id && storyBuild.series_title) {
            // we are creating a new series
            const foundSeries = seriesList?.find((srs) => srs.series_title === storyBuild.series_title);
            if (foundSeries) {
                storyBuild.series_id = foundSeries.series_id;
                storyBuild.series_place = foundSeries.stories.length ? foundSeries.stories.length : 1;
            } else {
                storyBuild.series_place = 1;
            }
        } else if (!storyBuild.series_id && storedSeriesID.current.length) {
            // we have removed this story from a series...
        }

        try {
            showLoader();
            const response = await fetch(`/api/stories/${storyID}/details`, {
                credentials: "include",
                method: "PUT",
                body: buildFormData(storyBuild),
            });
            if (!response.ok) {
                const errorData = await response.json();
                const error: Error = new Error(JSON.stringify(errorData));
                error.message = response.statusText;
                error.name = response.status.toString();
                throw error;
            }
            const updatedStory = await response.json() as Story;
            if (updatedStory.series_id) {
                const newSeries: Series = {
                    series_id: updatedStory.series_id,
                    series_title: storyBuild.series_title || "New Series",
                    series_description: "",
                    stories: [updatedStory],
                    image_url: "/img/icons/story_series_icon.jpg"
                }
                if (seriesList) {
                    const foundSeriesIndex = seriesList?.findIndex((srs) => srs.series_id === updatedStory.series_id);
                    if (foundSeriesIndex !== undefined && foundSeriesIndex !== -1) {
                        const updatedSeries = { ...seriesList[foundSeriesIndex] };
                        propagateSeriesUpdates(updatedSeries, updatedStory);
                    } else {
                        setSeriesList([...seriesList, newSeries]);
                    }
                } else {
                    setSeriesList([newSeries]);
                }
            }
            propagateStoryUpdates(updatedStory);
            setAlertState({
                title: "Story edit success",
                message: "",
                severity: AlertToastType.success,
                open: true
            });
            navigate(`/stories/`);
        } catch (error: unknown) {
            console.error(error);
            setAlertState({
                title: "Error editing story",
                severity: AlertToastType.error,
                message: "Please try again later or contact support.",
                open: true,
            });
        } finally {
            hideLoader();
        }

    }

    const saveNewStory = async () => {
        if (!storyBuild.title || !storyBuild.title.trim().length) {
            setWarning("You have to specify a title.");
            return;
        }
        if (storyBuild.series_id) {
            const foundSeries = seriesList?.find((srs) => srs.series_id === storyBuild.series_id);
            if (foundSeries) {
                storyBuild.series_place = foundSeries.stories.length ? foundSeries.stories.length : 1;
            }
        } else if (storyBuild.series_title) {
            const foundSeries = seriesList?.find((srs) => srs.series_title === storyBuild.series_title);
            if (foundSeries) {
                storyBuild.series_id = foundSeries.series_id;
                storyBuild.series_place = foundSeries.stories.length ? foundSeries.stories.length : 1;
            } else {
                storyBuild.series_place = 1;
            }
        }
        try {
            showLoader();
            const response = await fetch("/api/stories", {
                credentials: "include",
                method: "POST",
                body: buildFormData(storyBuild),
            });
            if (!response.ok) throw response;
            const newStory = await response.json() as Story;
            if (newStory.series_id) {
                const newSeries: Series = {
                    series_id: newStory.series_id,
                    series_title: storyBuild.series_title || "New Series",
                    series_description: "",
                    stories: [newStory],
                    image_url: "/img/icons/story_series_icon.jpg"
                }
                if (seriesList) {
                    const foundSeriesIndex = seriesList?.findIndex((srs) => srs.series_id === newStory.series_id);
                    if (foundSeriesIndex !== undefined && foundSeriesIndex !== -1) {
                        const updatedSeries = { ...seriesList[foundSeriesIndex] };
                        propagateSeriesUpdates(updatedSeries, newStory);
                    } else {
                        setSeriesList([...seriesList, newSeries]);
                    }
                } else {
                    setSeriesList([newSeries]);
                }
            } else if (storiesList) {
                setStoriesList([...storiesList, newStory]);
            } else {
                setStoriesList([newStory]);
            }
            setAlertState({
                title: "Story creation success",
                message: "",
                severity: AlertToastType.success,
                open: true
            });
            navigate(`/stories/${newStory.story_id}`);
        } catch (error: unknown) {
            const fetchError = error as Response;
            console.error(fetchError.statusText);
            if (fetchError.status === 401) {
                setAlertState({
                    title: "Insufficient subscription",
                    severity: AlertToastType.warning,
                    message: "Non-subscribers are limited to just one story. You may click the link below if you want to subscribe.",
                    open: true,
                    callback: {
                        type: AlertCommandType.subscribe,
                        text: "subscribe",
                    }
                });
            } else {
                setAlertState({
                    title: "Error creating story",
                    severity: AlertToastType.error,
                    message: "Please try again later or contact support.",
                    open: true,
                });
            }
        } finally {
            hideLoader();
        }
    }

    const handleNext = () => {
        if (activeStep === 0 && !tempTitle.trim().length) {
            setWarning("Sorry, this step is required.")
            return;
        }
        if (activeStep === 0) {
            setStoryBuild((prev) => ({ ...prev, title: tempTitle }));
        }
        if (activeStep === 1 && tempImageURL) {
            attachImageToForm(tempImageURL);
        }
        if (activeStep === 2) {
            setStoryBuild((prev) => ({ ...prev, description: tempDescription }));
        }
        if (activeStep === 3 && tempSeries) {
            setStoryBuild((prev) => ({ ...prev, series_id: tempSeries.series_id, series_title: tempSeries.series_title }));
        }
        if (activeStep === 4) {
            if (storyID) {
                editStory();
            } else {
                saveNewStory();
            }
        }
        setWarning("");
        let newSkipped = skipped;
        if (isStepSkipped(activeStep)) {
            newSkipped = new Set(newSkipped.values());
            newSkipped.delete(activeStep);
        }
        setActiveStep((prevActiveStep) => prevActiveStep + 1);
        setSkipped(newSkipped);
    };

    const handleClose = () => {
        handleReset();
        navigate('/stories');
    }

    const handleBack = () => {
        switch (activeStep) {
            case 1:
                setStoryBuild((prev) => ({ ...prev, title: "" }));
                break;
            case 2:
                setStoryBuild((prev) => ({ ...prev, image: undefined }));
                break;
            case 3:
                setStoryBuild((prev) => ({ ...prev, description: "" }));
                break;
            case 4:
                setStoryBuild((prev) => ({ ...prev, series_id: undefined, series_title: undefined }));
                break;
        }
        setActiveStep((prevActiveStep) => prevActiveStep - 1);
    };

    const handleSkip = () => {
        if (!isStepOptional(activeStep)) {
            throw new Error("You can't skip a step that isn't optional.");
        }

        setActiveStep((prevActiveStep) => prevActiveStep + 1);
        setSkipped((prevSkipped) => {
            const newSkipped = new Set(prevSkipped.values());
            newSkipped.add(activeStep);
            return newSkipped;
        });
    };

    const handleReset = () => {
        setActiveStep(0);
        setStoryBuild({
            title: "",
            description: "",
            series_id: undefined,
            series_title: undefined,
            series_place: 0,
            image: undefined
        });
        setTempTitle("");
        setTempImageURL(undefined);
        setTempDescription("");
        setTempSeries(undefined);
    };

    const getBlobExtension = (mimeType: string) => {
        switch (mimeType) {
            case "image/jpeg":
                return ".jpg";
            case "image/png":
                return ".png";
            case "image/gif":
                return ".gif";
            default:
                return "";
        }
    };

    const attachImageToForm = async (imageURL: string) => {
        if (!imageURL) return;
        try {
            showLoader();
            const response = await fetch(imageURL, {
                headers: { Accept: "image/*" },
            });
            if (!response.ok) throw new Error(response.statusText);
            const blob = await response.blob();
            const file = new File([blob], "temp" + getBlobExtension(blob.type));
            setStoryBuild((prev) => ({ ...prev, image: file }));
        } catch (error: unknown) {
            console.error("Image fetch operation failed: ", error);
        } finally {
            hideLoader();
        }
    };

    const processImage = (acceptedFiles: File[]) => {
        acceptedFiles.forEach((file) => {
            const reader = new FileReader();
            reader.onabort = () => console.log("File reading was aborted");
            reader.onerror = () => console.error("File reading has failed");
            reader.onload = () => {
                setTempImageURL(URL.createObjectURL(file));
            };
            reader.readAsArrayBuffer(file);
        });
    };



    const stepIconTheme = createTheme({
        components: {
            // Name of the component
            MuiStepIcon: {
                styleOverrides: {
                    // Name of the slot
                    root: {
                        color: '#0D5750 !important',
                        "&.Mui-active": {
                            color: '#437543 !important'
                        },
                        "&.Mui-completed": {
                            opacity: 0.5
                        }
                    }
                },
            },
        },
    });

    const textfieldTheme = createTheme({
        components: {
            // Inputs
            MuiOutlinedInput: {
                styleOverrides: {
                    root: {
                        "&.MuiOutlinedInput-root": {
                            padding: `0`
                        },
                        "&.MuiOutlinedInput-notchedOutline": {
                            border: `none`,
                        },
                        "&.Mui-focused": {
                            "& .MuiOutlinedInput-notchedOutline": {
                                border: `none`,
                            },
                        }
                    },
                }
            }
        }
    });

    return (
        <Box className={styles.slideshowParent}>
            <Box className={styles.header}>
                <IconButton onClick={handleClose} sx={{ mr: 1 }}>
                    <CloseIcon />
                </IconButton>
            </Box>
            <ThemeProvider theme={stepIconTheme}>
                <Stepper activeStep={activeStep}>
                    {steps.map((label, index) => {
                        const stepProps: { completed?: boolean } = {};
                        const labelProps: {
                            optional?: React.ReactNode;
                        } = {};
                        if (isStepSkipped(index)) {
                            stepProps.completed = false;
                        }
                        return (
                            <Step key={label} {...stepProps}>
                                <StepLabel {...labelProps}>{label}</StepLabel>
                            </Step>
                        );
                    })}
                </Stepper>
                <>
                    <Box sx={{ display: 'flex' }}>
                        <Box className={styles.finalProduct}>
                            <Typography variant="subtitle1" className={`${styles.finalTitle} ${storyBuild.title && storyBuild.title.trim().length > 0 ? styles.hasText : ''}`}>{`${storyBuild.title}`}</Typography>
                            <img className={`${styles.finalImage} ${storyBuild.image || storyBuild.image_url ? styles.hasText : ''}`} src={tempImageURL} />
                            <Typography variant="body2" className={`${styles.finalDescription} ${storyBuild.description && storyBuild.description.trim().length > 0 ? styles.hasText : ''}`}>{storyBuild.description}</Typography>
                            <Typography variant="body2" className={`${styles.finalSeries} ${storyBuild.series_title && storyBuild.series_title.trim().length > 0 ? styles.hasText : ''}`}><b>Series: </b>{storyBuild.series_title}</Typography>
                        </Box>
                        <Box className={styles.editWindow}>
                            {
                                activeStep === 0
                                    ? <TitleStep theme={textfieldTheme} title={tempTitle} onChange={(e) => setTempTitle(e.target.value)} />
                                    : activeStep === 1
                                        ? <ImageStep title={storyBuild.title || ""} onComplete={processImage} initialImageURL={tempImageURL?.length ? tempImageURL : undefined} />
                                        : activeStep === 2
                                            ? <DescriptionStep theme={textfieldTheme} text={tempDescription} onChange={(e) => setTempDescription(e.target.value)} />
                                            : activeStep === 3 ? <SeriesStep theme={textfieldTheme} onSeriesChange={handleSeriesChange} />
                                                : activeStep === 4 ?
                                                    <VerificationStep isEditing={storyID ? true : false} onBack={handleBack} onReset={handleReset} /> : ""
                            }
                            <Box sx={{ color: '#8e0000' }}>{warning}</Box>
                        </Box>
                    </Box>
                    <Box sx={{ display: 'flex', flexDirection: 'row', pt: 2 }}>
                        <Button
                            color="inherit"
                            disabled={activeStep === 0}
                            onClick={handleBack}
                            sx={{ mr: 1 }}
                        >
                            Back
                        </Button>
                        <Box sx={{ flex: '1 1 auto' }} />
                        {isStepOptional(activeStep) && (
                            <Button color="inherit" onClick={handleSkip} sx={{ mr: 1 }}>
                                Skip
                            </Button>
                        )}
                        {activeStep === 4 && (
                            <Button onClick={handleReset}>Reset</Button>
                        )}
                        <Button onClick={handleNext}>
                            {activeStep === 4 ? 'Finish' : 'Next'}
                        </Button>
                    </Box>
                </>
            </ThemeProvider>
        </Box >
    )
}