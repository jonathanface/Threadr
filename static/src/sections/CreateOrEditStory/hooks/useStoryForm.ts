import { useState, useCallback } from "react";
import { validateStoryForm, ValidationError } from "../utils/validation";

interface AvailableSeries {
  series_id?: string;
  series_name: string;
}

export const useStoryForm = () => {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [selectedSeries, setSelectedSeries] = useState<AvailableSeries | null>(null);
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const [isDirty, setIsDirty] = useState(false);

  const handleTitleChange = useCallback((value: string) => {
    setTitle(value);
    setIsDirty(true);
  }, []);

  const handleDescriptionChange = useCallback((value: string) => {
    setDescription(value);
    setIsDirty(true);
  }, []);

  const handleSeriesChange = useCallback((series: AvailableSeries | null) => {
    setSelectedSeries(series);
    setIsDirty(true);
  }, []);

  const validate = useCallback((): boolean => {
    const errors = validateStoryForm(title, description);
    setValidationErrors(errors);
    return errors.length === 0;
  }, [title, description]);

  const resetForm = useCallback(() => {
    setTitle("");
    setDescription("");
    setSelectedSeries(null);
    setValidationErrors([]);
    setIsDirty(false);
  }, []);

  const setFormData = useCallback((data: {
    title?: string;
    description?: string;
    series?: AvailableSeries | null;
  }) => {
    if (data.title !== undefined) setTitle(data.title);
    if (data.description !== undefined) setDescription(data.description);
    if (data.series !== undefined) setSelectedSeries(data.series);
    setIsDirty(false);
  }, []);

  return {
    title,
    description,
    selectedSeries,
    validationErrors,
    isDirty,
    handleTitleChange,
    handleDescriptionChange,
    handleSeriesChange,
    validate,
    resetForm,
    setFormData,
  };
};
