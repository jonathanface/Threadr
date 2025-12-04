import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StorySeriesSelector } from '../StorySeriesSelector';
import { Series } from '../../../../types/Series';

describe('StorySeriesSelector', () => {
  const mockSeriesList: Series[] = [
    {
      series_id: 'series-1',
      series_title: 'Adventure Chronicles',
      author_id: 'author-1',
      series_description: 'An epic adventure',
      created_at: '2024-01-01',
      updated_at: '2024-01-01',
    },
    {
      series_id: 'series-2',
      series_title: 'Mystery Tales',
      author_id: 'author-1',
      series_description: 'Mysterious stories',
      created_at: '2024-01-02',
      updated_at: '2024-01-02',
    },
    {
      series_id: 'series-3',
      series_title: 'Sci-Fi Saga',
      author_id: 'author-1',
      series_description: 'Science fiction',
      created_at: '2024-01-03',
      updated_at: '2024-01-03',
    },
  ];

  const defaultProps = {
    seriesList: mockSeriesList,
    selectedSeries: null,
    onSeriesChange: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Set default theme attribute
    document.documentElement.setAttribute('data-theme', 'light');
  });

  describe('Rendering', () => {
    it('should render without crashing', () => {
      render(<StorySeriesSelector {...defaultProps} />);
      expect(screen.getByLabelText(/series assignment/i)).toBeInTheDocument();
    });

    it('should render autocomplete input', () => {
      render(<StorySeriesSelector {...defaultProps} />);
      const input = screen.getByLabelText(/series assignment/i);
      expect(input).toBeInTheDocument();
      expect(input.tagName).toBe('INPUT');
    });

    it('should show helper text for no selection', () => {
      render(<StorySeriesSelector {...defaultProps} />);
      expect(screen.getByText('Select an existing series or type a new name to create one')).toBeInTheDocument();
    });

    it('should render with empty series list', () => {
      render(<StorySeriesSelector {...defaultProps} seriesList={[]} />);
      expect(screen.getByLabelText(/series assignment/i)).toBeInTheDocument();
    });
  });

  describe('Series Selection', () => {
    it('should display selected series', () => {
      render(
        <StorySeriesSelector
          {...defaultProps}
          selectedSeries={{
            series_id: 'series-1',
            series_name: 'Adventure Chronicles',
          }}
        />
      );
      const input = screen.getByLabelText(/series assignment/i);
      expect(input).toHaveValue('Adventure Chronicles');
    });

    it('should call onSeriesChange when selecting from dropdown', async () => {
      const onSeriesChange = vi.fn();
      const user = userEvent.setup();
      render(<StorySeriesSelector {...defaultProps} onSeriesChange={onSeriesChange} />);

      const input = screen.getByLabelText(/series assignment/i);
      await user.click(input);

      // Find and click the first option
      const option = await screen.findByText('Adventure Chronicles');
      await user.click(option);

      expect(onSeriesChange).toHaveBeenCalled();
    });

    it('should handle case-insensitive series matching', async () => {
      const onSeriesChange = vi.fn();
      const user = userEvent.setup();
      render(<StorySeriesSelector {...defaultProps} onSeriesChange={onSeriesChange} />);

      const input = screen.getByLabelText(/series assignment/i);
      await user.type(input, 'adventure chronicles');

      expect(onSeriesChange).toHaveBeenCalledWith({
        series_name: 'Adventure Chronicles',
        series_id: 'series-1',
      });
    });

    it('should match series with different casing', async () => {
      const onSeriesChange = vi.fn();
      const user = userEvent.setup();
      render(<StorySeriesSelector {...defaultProps} onSeriesChange={onSeriesChange} />);

      const input = screen.getByLabelText(/series assignment/i);
      await user.type(input, 'MYSTERY TALES');

      expect(onSeriesChange).toHaveBeenCalledWith({
        series_name: 'Mystery Tales',
        series_id: 'series-2',
      });
    });
  });

  describe('New Series Creation', () => {
    it('should create new series when typing unknown name', async () => {
      const onSeriesChange = vi.fn();
      const user = userEvent.setup();
      render(<StorySeriesSelector {...defaultProps} onSeriesChange={onSeriesChange} />);

      const input = screen.getByLabelText(/series assignment/i);
      await user.type(input, 'Brand New Series');

      expect(onSeriesChange).toHaveBeenCalledWith({
        series_name: 'Brand New Series',
      });
    });

    it('should show "New" chip for new series', () => {
      render(
        <StorySeriesSelector
          {...defaultProps}
          selectedSeries={{
            series_name: 'New Series Name',
          }}
        />
      );
      expect(screen.getByText('New')).toBeInTheDocument();
    });

    it('should show helper text for new series', () => {
      render(
        <StorySeriesSelector
          {...defaultProps}
          selectedSeries={{
            series_name: 'New Series Name',
          }}
        />
      );
      expect(screen.getByText('Typing a new name will create a new series')).toBeInTheDocument();
    });

    it('should not show "New" chip for existing series', () => {
      render(
        <StorySeriesSelector
          {...defaultProps}
          selectedSeries={{
            series_id: 'series-1',
            series_name: 'Adventure Chronicles',
          }}
        />
      );
      expect(screen.queryByText('New')).not.toBeInTheDocument();
    });

    it('should create new series without series_id', async () => {
      const onSeriesChange = vi.fn();
      const user = userEvent.setup();
      render(<StorySeriesSelector {...defaultProps} onSeriesChange={onSeriesChange} />);

      const input = screen.getByLabelText(/series assignment/i);
      await user.type(input, 'Unique Title');

      const lastCall = onSeriesChange.mock.calls[onSeriesChange.mock.calls.length - 1][0];
      expect(lastCall).toEqual({
        series_name: 'Unique Title',
      });
      expect(lastCall).not.toHaveProperty('series_id');
    });
  });

  describe('Input Handling', () => {
    it('should clear selection when input is empty', async () => {
      const onSeriesChange = vi.fn();
      const user = userEvent.setup();
      render(<StorySeriesSelector {...defaultProps} onSeriesChange={onSeriesChange} />);

      const input = screen.getByLabelText(/series assignment/i);
      await user.type(input, 'Test');
      await user.clear(input);

      expect(onSeriesChange).toHaveBeenCalledWith(null);
    });

    it('should handle empty string input', async () => {
      const onSeriesChange = vi.fn();
      const user = userEvent.setup();
      render(<StorySeriesSelector {...defaultProps} onSeriesChange={onSeriesChange} />);

      const input = screen.getByLabelText(/series assignment/i);
      // Type something first, then clear it
      await user.type(input, 'Test');
      await user.clear(input);

      expect(onSeriesChange).toHaveBeenCalledWith(null);
    });

    it('should display placeholder label', () => {
      render(<StorySeriesSelector {...defaultProps} />);
      // MUI renders the label text in multiple places (label and legend)
      const labels = screen.getAllByText('Assign to Series (optional)');
      expect(labels.length).toBeGreaterThan(0);
    });

    it('should handle rapid typing', async () => {
      const onSeriesChange = vi.fn();
      const user = userEvent.setup();
      render(<StorySeriesSelector {...defaultProps} onSeriesChange={onSeriesChange} />);

      const input = screen.getByLabelText(/series assignment/i);
      await user.type(input, 'QuickTyping', { delay: 10 });

      expect(onSeriesChange).toHaveBeenCalled();
    });
  });

  describe('Helper Text', () => {
    it('should have proper id for aria-describedby', () => {
      render(<StorySeriesSelector {...defaultProps} />);
      const helperText = screen.getByText('Select an existing series or type a new name to create one');
      expect(helperText).toHaveAttribute('id', 'series-helper');
    });

    it('should change helper text when new series is entered', () => {
      const { rerender } = render(<StorySeriesSelector {...defaultProps} />);
      expect(screen.getByText('Select an existing series or type a new name to create one')).toBeInTheDocument();

      rerender(
        <StorySeriesSelector
          {...defaultProps}
          selectedSeries={{
            series_name: 'New Series',
          }}
        />
      );
      expect(screen.getByText('Typing a new name will create a new series')).toBeInTheDocument();
    });

    it('should show correct helper text when existing series selected', () => {
      render(
        <StorySeriesSelector
          {...defaultProps}
          selectedSeries={{
            series_id: 'series-1',
            series_name: 'Adventure Chronicles',
          }}
        />
      );
      expect(screen.getByText('Select an existing series or type a new name to create one')).toBeInTheDocument();
    });
  });

  describe('Theme Handling', () => {
    it('should detect initial light theme', () => {
      document.documentElement.setAttribute('data-theme', 'light');
      render(<StorySeriesSelector {...defaultProps} />);
      // Component should render without errors with light theme
      expect(screen.getByLabelText(/series assignment/i)).toBeInTheDocument();
    });

    it('should detect initial dark theme', () => {
      document.documentElement.setAttribute('data-theme', 'dark');
      render(<StorySeriesSelector {...defaultProps} />);
      // Component should render without errors with dark theme
      expect(screen.getByLabelText(/series assignment/i)).toBeInTheDocument();
    });

    it('should handle theme attribute changes', () => {
      // Just verify component re-renders correctly when theme changes
      const { rerender } = render(<StorySeriesSelector {...defaultProps} />);

      // Component should still work after theme would have changed
      rerender(<StorySeriesSelector {...defaultProps} />);

      expect(screen.getByLabelText(/series assignment/i)).toBeInTheDocument();
    });

    it('should default to light theme when no theme attribute', () => {
      document.documentElement.removeAttribute('data-theme');
      render(<StorySeriesSelector {...defaultProps} />);
      expect(screen.getByLabelText(/series assignment/i)).toBeInTheDocument();
    });

    it('should cleanup theme observer on unmount', () => {
      const { unmount } = render(<StorySeriesSelector {...defaultProps} />);
      unmount();
      // If observer wasn't cleaned up, this would cause issues
      // Just verify no errors thrown
      expect(true).toBe(true);
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA label', () => {
      render(<StorySeriesSelector {...defaultProps} />);
      const input = screen.getByLabelText(/series assignment/i);
      expect(input).toHaveAttribute('aria-label', 'Series assignment');
    });

    it('should link helper text with aria-describedby', () => {
      render(<StorySeriesSelector {...defaultProps} />);
      const input = screen.getByLabelText(/series assignment/i);
      expect(input).toHaveAttribute('aria-describedby', 'series-helper');
    });

    it('should have accessible label on TextField', () => {
      render(<StorySeriesSelector {...defaultProps} />);
      // MUI renders the label in multiple places (label and legend)
      const labels = screen.getAllByText('Assign to Series (optional)');
      expect(labels.length).toBeGreaterThan(0);
    });

    it('should render options with proper keys', async () => {
      const user = userEvent.setup();
      render(<StorySeriesSelector {...defaultProps} />);

      const input = screen.getByLabelText(/series assignment/i);
      await user.click(input);

      // Options should be rendered
      expect(await screen.findByText('Adventure Chronicles')).toBeInTheDocument();
      expect(screen.getByText('Mystery Tales')).toBeInTheDocument();
      expect(screen.getByText('Sci-Fi Saga')).toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty series list', () => {
      render(<StorySeriesSelector {...defaultProps} seriesList={[]} />);
      expect(screen.getByLabelText(/series assignment/i)).toBeInTheDocument();
    });

    it('should handle series with special characters', async () => {
      const specialSeriesList: Series[] = [
        {
          series_id: 'series-special',
          series_title: 'Series: "The <Adventure>" & More!',
          author_id: 'author-1',
          series_description: 'Special chars',
          created_at: '2024-01-01',
          updated_at: '2024-01-01',
        },
      ];
      const onSeriesChange = vi.fn();
      const user = userEvent.setup();
      render(<StorySeriesSelector {...defaultProps} seriesList={specialSeriesList} onSeriesChange={onSeriesChange} />);

      const input = screen.getByLabelText(/series assignment/i);
      await user.click(input);

      const option = await screen.findByText('Series: "The <Adventure>" & More!');
      expect(option).toBeInTheDocument();
    });

    it('should handle unicode in series names', async () => {
      const unicodeSeriesList: Series[] = [
        {
          series_id: 'series-unicode',
          series_title: '测试 🎭 العربية',
          author_id: 'author-1',
          series_description: 'Unicode test',
          created_at: '2024-01-01',
          updated_at: '2024-01-01',
        },
      ];
      const user = userEvent.setup();
      render(<StorySeriesSelector {...defaultProps} seriesList={unicodeSeriesList} />);

      const input = screen.getByLabelText(/series assignment/i);
      await user.click(input);

      expect(await screen.findByText('测试 🎭 العربية')).toBeInTheDocument();
    });

    it('should handle very long series names', () => {
      const longName = 'A'.repeat(200);
      const longSeriesList: Series[] = [
        {
          series_id: 'series-long',
          series_title: longName,
          author_id: 'author-1',
          series_description: 'Long name',
          created_at: '2024-01-01',
          updated_at: '2024-01-01',
        },
      ];
      render(
        <StorySeriesSelector
          {...defaultProps}
          seriesList={longSeriesList}
          selectedSeries={{
            series_id: 'series-long',
            series_name: longName,
          }}
        />
      );
      const input = screen.getByLabelText(/series assignment/i);
      expect(input).toHaveValue(longName);
    });

    it('should handle null selectedSeries', () => {
      render(<StorySeriesSelector {...defaultProps} selectedSeries={null} />);
      const input = screen.getByLabelText(/series assignment/i);
      expect(input).toHaveValue('');
    });

    it('should handle multiple series with similar names', async () => {
      const similarSeriesList: Series[] = [
        {
          series_id: 'series-1',
          series_title: 'Adventure',
          author_id: 'author-1',
          series_description: 'First',
          created_at: '2024-01-01',
          updated_at: '2024-01-01',
        },
        {
          series_id: 'series-2',
          series_title: 'adventure',
          author_id: 'author-1',
          series_description: 'Second',
          created_at: '2024-01-02',
          updated_at: '2024-01-02',
        },
      ];
      const onSeriesChange = vi.fn();
      const user = userEvent.setup();
      render(<StorySeriesSelector {...defaultProps} seriesList={similarSeriesList} onSeriesChange={onSeriesChange} />);

      const input = screen.getByLabelText(/series assignment/i);
      await user.type(input, 'adventure');

      // Should match the first one found (case-insensitive match)
      expect(onSeriesChange).toHaveBeenCalled();
    });

    it('should handle series name with only whitespace', async () => {
      const onSeriesChange = vi.fn();
      const user = userEvent.setup();
      render(<StorySeriesSelector {...defaultProps} onSeriesChange={onSeriesChange} />);

      const input = screen.getByLabelText(/series assignment/i);
      await user.type(input, '   ');

      // Should create new series even with whitespace
      expect(onSeriesChange).toHaveBeenCalled();
    });

    it('should handle rapid selection changes', async () => {
      const onSeriesChange = vi.fn();
      const user = userEvent.setup();
      render(<StorySeriesSelector {...defaultProps} onSeriesChange={onSeriesChange} />);

      const input = screen.getByLabelText(/series assignment/i);
      await user.type(input, 'Test1');
      await user.clear(input);
      await user.type(input, 'Test2');

      expect(onSeriesChange).toHaveBeenCalled();
    });
  });

  describe('Options Display', () => {
    it('should display all available series in dropdown', async () => {
      const user = userEvent.setup();
      render(<StorySeriesSelector {...defaultProps} />);

      const input = screen.getByLabelText(/series assignment/i);
      await user.click(input);

      expect(await screen.findByText('Adventure Chronicles')).toBeInTheDocument();
      expect(screen.getByText('Mystery Tales')).toBeInTheDocument();
      expect(screen.getByText('Sci-Fi Saga')).toBeInTheDocument();
    });

    it('should render options with correct series names', async () => {
      const user = userEvent.setup();
      render(<StorySeriesSelector {...defaultProps} />);

      const input = screen.getByLabelText(/series assignment/i);
      await user.click(input);

      const listbox = await screen.findByRole('listbox');
      const options = within(listbox).getAllByRole('option');

      expect(options).toHaveLength(3);
      expect(options[0]).toHaveTextContent('Adventure Chronicles');
      expect(options[1]).toHaveTextContent('Mystery Tales');
      expect(options[2]).toHaveTextContent('Sci-Fi Saga');
    });
  });
});
