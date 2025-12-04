import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useStoryForm } from '../useStoryForm';

describe('useStoryForm', () => {
  describe('Initial State', () => {
    it('should initialize with empty title', () => {
      const { result } = renderHook(() => useStoryForm());

      expect(result.current.title).toBe('');
    });

    it('should initialize with empty description', () => {
      const { result } = renderHook(() => useStoryForm());

      expect(result.current.description).toBe('');
    });

    it('should initialize with null selected series', () => {
      const { result } = renderHook(() => useStoryForm());

      expect(result.current.selectedSeries).toBeNull();
    });

    it('should initialize with empty validation errors', () => {
      const { result } = renderHook(() => useStoryForm());

      expect(result.current.validationErrors).toEqual([]);
    });

    it('should initialize with isDirty as false', () => {
      const { result } = renderHook(() => useStoryForm());

      expect(result.current.isDirty).toBe(false);
    });
  });

  describe('handleTitleChange', () => {
    it('should update title', () => {
      const { result } = renderHook(() => useStoryForm());

      act(() => {
        result.current.handleTitleChange('New Title');
      });

      expect(result.current.title).toBe('New Title');
    });

    it('should set isDirty to true', () => {
      const { result } = renderHook(() => useStoryForm());

      act(() => {
        result.current.handleTitleChange('New Title');
      });

      expect(result.current.isDirty).toBe(true);
    });

    it('should update title multiple times', () => {
      const { result } = renderHook(() => useStoryForm());

      act(() => {
        result.current.handleTitleChange('Title 1');
      });

      expect(result.current.title).toBe('Title 1');

      act(() => {
        result.current.handleTitleChange('Title 2');
      });

      expect(result.current.title).toBe('Title 2');
    });

    it('should handle empty string', () => {
      const { result } = renderHook(() => useStoryForm());

      act(() => {
        result.current.handleTitleChange('Some Title');
      });

      act(() => {
        result.current.handleTitleChange('');
      });

      expect(result.current.title).toBe('');
    });
  });

  describe('handleDescriptionChange', () => {
    it('should update description', () => {
      const { result } = renderHook(() => useStoryForm());

      act(() => {
        result.current.handleDescriptionChange('New Description');
      });

      expect(result.current.description).toBe('New Description');
    });

    it('should set isDirty to true', () => {
      const { result } = renderHook(() => useStoryForm());

      act(() => {
        result.current.handleDescriptionChange('New Description');
      });

      expect(result.current.isDirty).toBe(true);
    });

    it('should update description multiple times', () => {
      const { result } = renderHook(() => useStoryForm());

      act(() => {
        result.current.handleDescriptionChange('Description 1');
      });

      expect(result.current.description).toBe('Description 1');

      act(() => {
        result.current.handleDescriptionChange('Description 2');
      });

      expect(result.current.description).toBe('Description 2');
    });

    it('should handle multiline descriptions', () => {
      const { result } = renderHook(() => useStoryForm());

      act(() => {
        result.current.handleDescriptionChange('Line 1\nLine 2\nLine 3');
      });

      expect(result.current.description).toBe('Line 1\nLine 2\nLine 3');
    });
  });

  describe('handleSeriesChange', () => {
    it('should update selected series', () => {
      const { result } = renderHook(() => useStoryForm());
      const series = {
        series_id: 'series-1',
        series_name: 'Test Series',
      };

      act(() => {
        result.current.handleSeriesChange(series);
      });

      expect(result.current.selectedSeries).toEqual(series);
    });

    it('should set isDirty to true', () => {
      const { result } = renderHook(() => useStoryForm());
      const series = {
        series_id: 'series-1',
        series_name: 'Test Series',
      };

      act(() => {
        result.current.handleSeriesChange(series);
      });

      expect(result.current.isDirty).toBe(true);
    });

    it('should clear selected series when set to null', () => {
      const { result } = renderHook(() => useStoryForm());
      const series = {
        series_id: 'series-1',
        series_name: 'Test Series',
      };

      act(() => {
        result.current.handleSeriesChange(series);
      });

      expect(result.current.selectedSeries).toEqual(series);

      act(() => {
        result.current.handleSeriesChange(null);
      });

      expect(result.current.selectedSeries).toBeNull();
    });

    it('should handle series without series_id', () => {
      const { result } = renderHook(() => useStoryForm());
      const series = {
        series_name: 'New Series',
      };

      act(() => {
        result.current.handleSeriesChange(series);
      });

      expect(result.current.selectedSeries).toEqual(series);
    });

    it('should replace existing series', () => {
      const { result } = renderHook(() => useStoryForm());
      const series1 = { series_id: 'series-1', series_name: 'Series 1' };
      const series2 = { series_id: 'series-2', series_name: 'Series 2' };

      act(() => {
        result.current.handleSeriesChange(series1);
      });

      act(() => {
        result.current.handleSeriesChange(series2);
      });

      expect(result.current.selectedSeries).toEqual(series2);
    });
  });

  describe('validate', () => {
    it('should return true for valid form', () => {
      const { result } = renderHook(() => useStoryForm());

      act(() => {
        result.current.handleTitleChange('Valid Title');
        result.current.handleDescriptionChange('Valid Description');
      });

      let isValid = false;
      act(() => {
        isValid = result.current.validate();
      });

      expect(isValid).toBe(true);
      expect(result.current.validationErrors).toEqual([]);
    });

    it('should return false when title is empty', () => {
      const { result } = renderHook(() => useStoryForm());

      act(() => {
        result.current.handleDescriptionChange('Valid Description');
      });

      let isValid = true;
      act(() => {
        isValid = result.current.validate();
      });

      expect(isValid).toBe(false);
      expect(result.current.validationErrors).toHaveLength(1);
      expect(result.current.validationErrors[0].field).toBe('title');
    });

    it('should return false when description is empty', () => {
      const { result } = renderHook(() => useStoryForm());

      act(() => {
        result.current.handleTitleChange('Valid Title');
      });

      let isValid = true;
      act(() => {
        isValid = result.current.validate();
      });

      expect(isValid).toBe(false);
      expect(result.current.validationErrors).toHaveLength(1);
      expect(result.current.validationErrors[0].field).toBe('description');
    });

    it('should return false when both title and description are empty', () => {
      const { result } = renderHook(() => useStoryForm());

      let isValid = true;
      act(() => {
        isValid = result.current.validate();
      });

      expect(isValid).toBe(false);
      expect(result.current.validationErrors).toHaveLength(2);
    });

    it('should set validation errors', () => {
      const { result } = renderHook(() => useStoryForm());

      act(() => {
        result.current.validate();
      });

      expect(result.current.validationErrors.length).toBeGreaterThan(0);
    });

    it('should clear previous validation errors on successful validation', () => {
      const { result } = renderHook(() => useStoryForm());

      act(() => {
        result.current.validate();
      });

      expect(result.current.validationErrors.length).toBeGreaterThan(0);

      act(() => {
        result.current.handleTitleChange('Valid Title');
        result.current.handleDescriptionChange('Valid Description');
      });

      act(() => {
        result.current.validate();
      });

      expect(result.current.validationErrors).toEqual([]);
    });

    it('should validate title length', () => {
      const { result } = renderHook(() => useStoryForm());
      const longTitle = 'A'.repeat(257);

      act(() => {
        result.current.handleTitleChange(longTitle);
        result.current.handleDescriptionChange('Valid Description');
      });

      let isValid = true;
      act(() => {
        isValid = result.current.validate();
      });

      expect(isValid).toBe(false);
      expect(result.current.validationErrors[0].field).toBe('title');
    });

    it('should validate description length', () => {
      const { result } = renderHook(() => useStoryForm());
      const longDescription = 'A'.repeat(5001);

      act(() => {
        result.current.handleTitleChange('Valid Title');
        result.current.handleDescriptionChange(longDescription);
      });

      let isValid = true;
      act(() => {
        isValid = result.current.validate();
      });

      expect(isValid).toBe(false);
      expect(result.current.validationErrors[0].field).toBe('description');
    });

    it('should validate title pattern', () => {
      const { result } = renderHook(() => useStoryForm());

      act(() => {
        result.current.handleTitleChange('Invalid#Title');
        result.current.handleDescriptionChange('Valid Description');
      });

      let isValid = true;
      act(() => {
        isValid = result.current.validate();
      });

      expect(isValid).toBe(false);
      expect(result.current.validationErrors[0].field).toBe('title');
    });
  });

  describe('resetForm', () => {
    it('should reset all form fields', () => {
      const { result } = renderHook(() => useStoryForm());

      act(() => {
        result.current.handleTitleChange('Title');
        result.current.handleDescriptionChange('Description');
        result.current.handleSeriesChange({ series_id: 'series-1', series_name: 'Series' });
      });

      act(() => {
        result.current.resetForm();
      });

      expect(result.current.title).toBe('');
      expect(result.current.description).toBe('');
      expect(result.current.selectedSeries).toBeNull();
    });

    it('should clear validation errors', () => {
      const { result } = renderHook(() => useStoryForm());

      act(() => {
        result.current.validate();
      });

      expect(result.current.validationErrors.length).toBeGreaterThan(0);

      act(() => {
        result.current.resetForm();
      });

      expect(result.current.validationErrors).toEqual([]);
    });

    it('should reset isDirty to false', () => {
      const { result } = renderHook(() => useStoryForm());

      act(() => {
        result.current.handleTitleChange('Title');
      });

      expect(result.current.isDirty).toBe(true);

      act(() => {
        result.current.resetForm();
      });

      expect(result.current.isDirty).toBe(false);
    });
  });

  describe('setFormData', () => {
    it('should set title when provided', () => {
      const { result } = renderHook(() => useStoryForm());

      act(() => {
        result.current.setFormData({ title: 'Initial Title' });
      });

      expect(result.current.title).toBe('Initial Title');
    });

    it('should set description when provided', () => {
      const { result } = renderHook(() => useStoryForm());

      act(() => {
        result.current.setFormData({ description: 'Initial Description' });
      });

      expect(result.current.description).toBe('Initial Description');
    });

    it('should set series when provided', () => {
      const { result } = renderHook(() => useStoryForm());
      const series = { series_id: 'series-1', series_name: 'Series' };

      act(() => {
        result.current.setFormData({ series });
      });

      expect(result.current.selectedSeries).toEqual(series);
    });

    it('should set all fields when all provided', () => {
      const { result } = renderHook(() => useStoryForm());
      const series = { series_id: 'series-1', series_name: 'Series' };

      act(() => {
        result.current.setFormData({
          title: 'Title',
          description: 'Description',
          series,
        });
      });

      expect(result.current.title).toBe('Title');
      expect(result.current.description).toBe('Description');
      expect(result.current.selectedSeries).toEqual(series);
    });

    it('should set isDirty to false', () => {
      const { result } = renderHook(() => useStoryForm());

      act(() => {
        result.current.handleTitleChange('Title');
      });

      expect(result.current.isDirty).toBe(true);

      act(() => {
        result.current.setFormData({ title: 'New Title' });
      });

      expect(result.current.isDirty).toBe(false);
    });

    it('should not change fields that are not provided', () => {
      const { result } = renderHook(() => useStoryForm());

      act(() => {
        result.current.handleTitleChange('Initial Title');
        result.current.handleDescriptionChange('Initial Description');
      });

      act(() => {
        result.current.setFormData({ title: 'New Title' });
      });

      expect(result.current.title).toBe('New Title');
      expect(result.current.description).toBe('Initial Description');
    });

    it('should set series to null when explicitly provided as null', () => {
      const { result } = renderHook(() => useStoryForm());

      act(() => {
        result.current.handleSeriesChange({ series_id: 'series-1', series_name: 'Series' });
      });

      act(() => {
        result.current.setFormData({ series: null });
      });

      expect(result.current.selectedSeries).toBeNull();
    });

    it('should handle empty object', () => {
      const { result } = renderHook(() => useStoryForm());

      act(() => {
        result.current.handleTitleChange('Title');
        result.current.handleDescriptionChange('Description');
      });

      act(() => {
        result.current.setFormData({});
      });

      expect(result.current.title).toBe('Title');
      expect(result.current.description).toBe('Description');
      expect(result.current.isDirty).toBe(false);
    });
  });

  describe('isDirty State', () => {
    it('should track changes correctly', () => {
      const { result } = renderHook(() => useStoryForm());

      expect(result.current.isDirty).toBe(false);

      act(() => {
        result.current.handleTitleChange('Title');
      });

      expect(result.current.isDirty).toBe(true);
    });

    it('should remain dirty after multiple changes', () => {
      const { result } = renderHook(() => useStoryForm());

      act(() => {
        result.current.handleTitleChange('Title');
        result.current.handleDescriptionChange('Description');
        result.current.handleSeriesChange({ series_id: 'series-1', series_name: 'Series' });
      });

      expect(result.current.isDirty).toBe(true);
    });

    it('should be false after setFormData', () => {
      const { result } = renderHook(() => useStoryForm());

      act(() => {
        result.current.handleTitleChange('Title');
      });

      act(() => {
        result.current.setFormData({ title: 'New Title' });
      });

      expect(result.current.isDirty).toBe(false);
    });

    it('should be false after resetForm', () => {
      const { result } = renderHook(() => useStoryForm());

      act(() => {
        result.current.handleTitleChange('Title');
      });

      act(() => {
        result.current.resetForm();
      });

      expect(result.current.isDirty).toBe(false);
    });
  });

  describe('Integration', () => {
    it('should support complete form workflow', () => {
      const { result } = renderHook(() => useStoryForm());

      // Initial state
      expect(result.current.isDirty).toBe(false);

      // Fill form
      act(() => {
        result.current.handleTitleChange('My Story');
        result.current.handleDescriptionChange('Story description');
        result.current.handleSeriesChange({ series_id: 'series-1', series_name: 'My Series' });
      });

      expect(result.current.isDirty).toBe(true);

      // Validate
      let isValid = false;
      act(() => {
        isValid = result.current.validate();
      });

      expect(isValid).toBe(true);

      // Reset
      act(() => {
        result.current.resetForm();
      });

      expect(result.current.title).toBe('');
      expect(result.current.isDirty).toBe(false);
    });

    it('should support editing existing story', () => {
      const { result } = renderHook(() => useStoryForm());
      const existingSeries = { series_id: 'series-1', series_name: 'Existing Series' };

      // Load existing data
      act(() => {
        result.current.setFormData({
          title: 'Existing Title',
          description: 'Existing Description',
          series: existingSeries,
        });
      });

      expect(result.current.isDirty).toBe(false);

      // Make changes
      act(() => {
        result.current.handleTitleChange('Updated Title');
      });

      expect(result.current.isDirty).toBe(true);
      expect(result.current.title).toBe('Updated Title');
      expect(result.current.description).toBe('Existing Description');
    });
  });
});
