import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CreateOrEditStory } from '../index';
import { api } from '../../../api';
import * as RouterModule from 'react-router-dom';

// Mock react-router-dom
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useParams: vi.fn(),
  };
});

// Mock hooks
vi.mock('../../../hooks/useLoader', () => ({
  useLoader: () => ({
    showLoader: vi.fn(),
    hideLoader: vi.fn(),
  }),
}));

vi.mock('../../../hooks/useWorksList', () => ({
  useWorksList: () => ({
    seriesList: [
      {
        series_id: 'series-1',
        series_title: 'Test Series',
        author_id: 'author-1',
        series_description: 'Description',
        created_at: '2024-01-01',
        updated_at: '2024-01-01',
      },
    ],
  }),
}));

vi.mock('../../../hooks/useToaster', () => ({
  useToaster: () => ({
    setAlertState: vi.fn(),
  }),
}));

// Mock custom hooks from ./hooks
const mockUseStoryForm = vi.fn(() => ({
  title: '',
  description: '',
  selectedSeries: null,
  validationErrors: [],
  isDirty: false,
  handleTitleChange: vi.fn(),
  handleDescriptionChange: vi.fn(),
  handleSeriesChange: vi.fn(),
  validate: vi.fn(() => true),
  setFormData: vi.fn(),
}));

vi.mock('../hooks/useStoryForm', () => ({
  useStoryForm: () => mockUseStoryForm(),
}));

vi.mock('../hooks/useStoryImage', () => ({
  useStoryImage: () => ({
    imageURL: '/test-image.jpg',
    isImageLoading: false,
    tempImageFile: { current: null },
    processImage: vi.fn(),
    getRandomImageURL: vi.fn(() => Promise.resolve('/random-image.jpg')),
    setImage: vi.fn(),
    onImageLoad: vi.fn(),
  }),
}));

vi.mock('../hooks/useStorySave', () => ({
  useStorySave: () => ({
    saveStory: vi.fn(),
  }),
}));

// Mock child components
vi.mock('../components/StoryFormFields', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  StoryFormFields: ({ title, description, onTitleChange, onDescriptionChange }: any) => (
    <div data-testid="story-form-fields">
      <input
        aria-label="Story title"
        value={title}
        onChange={(e) => onTitleChange(e.target.value)}
      />
      <textarea
        aria-label="Story description"
        value={description}
        onChange={(e) => onDescriptionChange(e.target.value)}
      />
    </div>
  ),
}));

vi.mock('../components/StorySeriesSelector', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  StorySeriesSelector: ({ selectedSeries, onSeriesChange }: any) => (
    <div data-testid="story-series-selector">
      <select
        aria-label="Series selector"
        value={selectedSeries?.series_id || ''}
        onChange={(e) => {
          if (e.target.value) {
            onSeriesChange({ series_id: e.target.value, series_name: 'Test' });
          } else {
            onSeriesChange(null);
          }
        }}
      >
        <option value="">None</option>
        <option value="series-1">Test Series</option>
      </select>
    </div>
  ),
}));

vi.mock('../components/StoryPreview', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  StoryPreview: ({ title, description, imageURL }: any) => (
    <div data-testid="story-preview">
      <div data-testid="preview-title">{title || 'Story Title'}</div>
      <div data-testid="preview-description">{description || 'Description'}</div>
      <div data-testid="preview-image">{imageURL}</div>
    </div>
  ),
}));

// Mock API
vi.mock('../../../api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
  },
}));

describe('CreateOrEditStory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (RouterModule.useParams as Mock).mockReturnValue({});
    // Clear window.confirm mock
    window.confirm = vi.fn(() => true);
  });

  describe('Rendering - Create Mode', () => {
    it('should render without crashing in create mode', () => {
      render(<CreateOrEditStory />);
      expect(screen.getByText('Create a Story')).toBeInTheDocument();
    });

    it('should show "Create a Story" title in create mode', () => {
      render(<CreateOrEditStory />);
      expect(screen.getByRole('heading', { name: /create a story/i })).toBeInTheDocument();
    });

    it('should show "Create Story" button in create mode', () => {
      render(<CreateOrEditStory />);
      expect(screen.getByRole('button', { name: /create story/i })).toBeInTheDocument();
    });

    it('should render close button', () => {
      render(<CreateOrEditStory />);
      expect(screen.getByRole('button', { name: /close and return/i })).toBeInTheDocument();
    });

    it('should render all child components', () => {
      render(<CreateOrEditStory />);
      expect(screen.getByTestId('story-form-fields')).toBeInTheDocument();
      expect(screen.getByTestId('story-series-selector')).toBeInTheDocument();
      expect(screen.getByTestId('story-preview')).toBeInTheDocument();
    });
  });

  describe('Rendering - Edit Mode', () => {
    beforeEach(() => {
      (RouterModule.useParams as Mock).mockReturnValue({ storyID: 'story-123' });
      (api.get as Mock).mockResolvedValue({
        data: {
          story_id: 'story-123',
          title: 'Existing Story',
          description: 'Existing description',
          image_url: '/existing-image.jpg',
        },
      });
    });

    it('should show "Update a Story" title in edit mode', () => {
      render(<CreateOrEditStory />);
      expect(screen.getByRole('heading', { name: /update a story/i })).toBeInTheDocument();
    });

    it('should show "Update Story" button in edit mode', () => {
      render(<CreateOrEditStory />);
      expect(screen.getByRole('button', { name: /update story/i })).toBeInTheDocument();
    });

    it('should fetch story data in edit mode', async () => {
      render(<CreateOrEditStory />);

      await waitFor(() => {
        expect(api.get).toHaveBeenCalledWith('/stories/story-123');
      });
    });

    it('should fetch series data if story has series', async () => {
      (api.get as Mock).mockImplementation((url: string) => {
        if (url === '/stories/story-123') {
          return Promise.resolve({
            data: {
              story_id: 'story-123',
              title: 'Story with Series',
              description: 'Description',
              image_url: '/image.jpg',
              series_id: 'series-1',
            },
          });
        }
        if (url === '/series/series-1') {
          return Promise.resolve({
            data: {
              series_id: 'series-1',
              series_title: 'My Series',
              author_id: 'author-1',
              series_description: 'Series description',
              created_at: '2024-01-01',
              updated_at: '2024-01-01',
            },
          });
        }
        return Promise.reject(new Error('Not found'));
      });

      render(<CreateOrEditStory />);

      await waitFor(() => {
        expect(api.get).toHaveBeenCalledWith('/stories/story-123');
        expect(api.get).toHaveBeenCalledWith('/series/series-1');
      });
    });
  });

  describe('Create from Series', () => {
    beforeEach(() => {
      (RouterModule.useParams as Mock).mockReturnValue({ seriesID: 'series-123' });
      (api.get as Mock).mockResolvedValue({
        data: {
          series_id: 'series-123',
          series_title: 'Series Title',
          author_id: 'author-1',
          series_description: 'Description',
          created_at: '2024-01-01',
          updated_at: '2024-01-01',
        },
      });
    });

    it('should fetch series data when creating from series', async () => {
      render(<CreateOrEditStory />);

      await waitFor(() => {
        expect(api.get).toHaveBeenCalledWith('/series/series-123');
      });
    });

    it('should still show create mode title', () => {
      render(<CreateOrEditStory />);
      expect(screen.getByRole('heading', { name: /create a story/i })).toBeInTheDocument();
    });
  });

  describe('Close Handling', () => {
    it('should navigate back when close button clicked without dirty state', async () => {
      const user = userEvent.setup();
      render(<CreateOrEditStory />);

      const closeButton = screen.getByRole('button', { name: /close and return/i });
      await user.click(closeButton);

      expect(mockNavigate).toHaveBeenCalledWith(-1);
    });

    it('should show confirm dialog when closing with unsaved changes', async () => {
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

      // Mock isDirty as true to simulate unsaved changes
      mockUseStoryForm.mockReturnValueOnce({
        title: '',
        description: '',
        selectedSeries: null,
        validationErrors: [],
        isDirty: true,
        handleTitleChange: vi.fn(),
        handleDescriptionChange: vi.fn(),
        handleSeriesChange: vi.fn(),
        validate: vi.fn(() => true),
        setFormData: vi.fn(),
      });

      const user = userEvent.setup();
      render(<CreateOrEditStory />);

      const closeButton = screen.getByRole('button', { name: /close and return/i });
      await user.click(closeButton);

      expect(confirmSpy).toHaveBeenCalledWith(
        'You have unsaved changes. Are you sure you want to leave?'
      );
      expect(mockNavigate).toHaveBeenCalledWith(-1);

      confirmSpy.mockRestore();
    });

    it('should not navigate if user cancels confirm dialog', async () => {
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

      // Mock isDirty as true to simulate unsaved changes
      mockUseStoryForm.mockReturnValueOnce({
        title: '',
        description: '',
        selectedSeries: null,
        validationErrors: [],
        isDirty: true,
        handleTitleChange: vi.fn(),
        handleDescriptionChange: vi.fn(),
        handleSeriesChange: vi.fn(),
        validate: vi.fn(() => true),
        setFormData: vi.fn(),
      });

      const user = userEvent.setup();
      render(<CreateOrEditStory />);

      const closeButton = screen.getByRole('button', { name: /close and return/i });
      await user.click(closeButton);

      expect(confirmSpy).toHaveBeenCalled();
      expect(mockNavigate).not.toHaveBeenCalled();

      confirmSpy.mockRestore();
    });
  });

  describe('Accessibility', () => {
    it('should have proper heading hierarchy', () => {
      render(<CreateOrEditStory />);
      const heading = screen.getByRole('heading', { level: 1 });
      expect(heading).toHaveTextContent('Create a Story');
    });

    it('should have accessible close button', () => {
      render(<CreateOrEditStory />);
      const closeButton = screen.getByRole('button', { name: /close and return/i });
      expect(closeButton).toHaveAttribute('aria-label', 'Close and return');
    });

    it('should have accessible save button in create mode', () => {
      render(<CreateOrEditStory />);
      const saveButton = screen.getByRole('button', { name: /create story/i });
      expect(saveButton).toHaveAttribute('aria-label', 'Create Story');
    });

    it('should have accessible save button in edit mode', () => {
      (RouterModule.useParams as Mock).mockReturnValue({ storyID: 'story-123' });
      render(<CreateOrEditStory />);
      const saveButton = screen.getByRole('button', { name: /update story/i });
      expect(saveButton).toHaveAttribute('aria-label', 'Update Story');
    });
  });

  describe('Error Handling', () => {
    it('should handle story fetch error', async () => {
      (RouterModule.useParams as Mock).mockReturnValue({ storyID: 'story-123' });
      (api.get as Mock).mockRejectedValue(new Error('Network error'));

      render(<CreateOrEditStory />);

      await waitFor(() => {
        expect(api.get).toHaveBeenCalledWith('/stories/story-123');
      });

      // Component should still render despite error
      expect(screen.getByText('Update a Story')).toBeInTheDocument();
    });

    it('should handle series fetch error', async () => {
      (RouterModule.useParams as Mock).mockReturnValue({ seriesID: 'series-123' });
      (api.get as Mock).mockRejectedValue(new Error('Network error'));

      render(<CreateOrEditStory />);

      await waitFor(() => {
        expect(api.get).toHaveBeenCalledWith('/series/series-123');
      });

      // Component should still render despite error
      expect(screen.getByText('Create a Story')).toBeInTheDocument();
    });
  });

  describe('Integration', () => {
    it('should render with all sections visible', () => {
      render(<CreateOrEditStory />);

      // Header section
      expect(screen.getByRole('button', { name: /close and return/i })).toBeInTheDocument();

      // Title section
      expect(screen.getByRole('heading', { name: /create a story/i })).toBeInTheDocument();

      // Form section
      expect(screen.getByTestId('story-form-fields')).toBeInTheDocument();
      expect(screen.getByTestId('story-series-selector')).toBeInTheDocument();

      // Button section
      expect(screen.getByRole('button', { name: /create story/i })).toBeInTheDocument();

      // Preview section
      expect(screen.getByTestId('story-preview')).toBeInTheDocument();
    });

    it('should render series selector only when seriesList is available', () => {
      render(<CreateOrEditStory />);
      expect(screen.getByTestId('story-series-selector')).toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('should handle missing storyID in edit mode', () => {
      (RouterModule.useParams as Mock).mockReturnValue({ storyID: undefined });
      render(<CreateOrEditStory />);

      // Should render in create mode
      expect(screen.getByText('Create a Story')).toBeInTheDocument();
    });

    it('should handle missing seriesID in series create mode', () => {
      (RouterModule.useParams as Mock).mockReturnValue({ seriesID: undefined });
      render(<CreateOrEditStory />);

      // Should render normally
      expect(screen.getByText('Create a Story')).toBeInTheDocument();
    });

    it('should handle both storyID and seriesID present', async () => {
      (RouterModule.useParams as Mock).mockReturnValue({
        storyID: 'story-123',
        seriesID: 'series-123',
      });
      (api.get as Mock).mockImplementation((url: string) => {
        if (url.includes('stories')) {
          return Promise.resolve({
            data: {
              story_id: 'story-123',
              title: 'Story',
              description: 'Description',
              image_url: '/image.jpg',
            },
          });
        }
        if (url.includes('series')) {
          return Promise.resolve({
            data: {
              series_id: 'series-123',
              series_title: 'Series',
              author_id: 'author-1',
              series_description: 'Description',
              created_at: '2024-01-01',
              updated_at: '2024-01-01',
            },
          });
        }
        return Promise.reject(new Error('Not found'));
      });

      render(<CreateOrEditStory />);

      // Should prioritize edit mode
      expect(screen.getByText('Update a Story')).toBeInTheDocument();

      await waitFor(() => {
        expect(api.get).toHaveBeenCalledWith('/stories/story-123');
        expect(api.get).toHaveBeenCalledWith('/series/series-123');
      });
    });
  });
});
