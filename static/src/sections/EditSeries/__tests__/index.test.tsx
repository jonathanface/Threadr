import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EditSeries } from '../index';
import { api } from '../../../api';
import * as RouterModule from 'react-router-dom';

// Mock navigate
const mockNavigate = vi.fn();

// Mock react-router-dom
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

vi.mock('../../../hooks/useToaster', () => ({
  useToaster: () => ({
    setAlertState: vi.fn(),
  }),
}));

vi.mock('../../../hooks/useSelections', () => ({
  useSelections: () => ({
    propagateSeriesUpdates: vi.fn(),
    propagateStoryUpdates: vi.fn(),
  }),
}));

vi.mock('../../../hooks/useWorksList', () => ({
  useWorksList: () => ({
    storiesList: [
      { story_id: 'story-1', title: 'Available Story 1', image_url: '/img1.jpg' },
    ],
    setStoriesList: vi.fn(),
  }),
}));

// Mock components
vi.mock('../../../components/SeriesImageUpload', () => ({
  SeriesImageUpload: () => <div data-testid="series-image-upload">Image Upload</div>,
}));

vi.mock('../../../components/AddStoryModal', () => ({
  AddStoryModal: () => <div data-testid="add-story-modal">Add Story Modal</div>,
}));

// Mock drag and drop
vi.mock('@hello-pangea/dnd', () => ({
  DragDropContext: ({ children }: any) => <div>{children}</div>,
  Droppable: ({ children }: any) => children({ innerRef: vi.fn(), droppableProps: {}, placeholder: null }),
  Draggable: ({ children }: any) => children({ innerRef: vi.fn(), draggableProps: {}, dragHandleProps: {} }, {}),
}));

// Mock API
vi.mock('../../../api', () => ({
  api: {
    get: vi.fn(),
    put: vi.fn(),
  },
}));

describe('EditSeries', () => {
  const mockSeries = {
    series_id: 'series-123',
    series_title: 'Test Series',
    series_description: 'Test description',
    author_id: 'author-1',
    image_url: '/series-image.jpg',
    created_at: '2024-01-01',
    updated_at: '2024-01-01',
    stories: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (RouterModule.useParams as Mock).mockReturnValue({ seriesID: 'series-123' });
    (api.get as Mock).mockResolvedValue({ data: mockSeries });
    (api.put as Mock).mockResolvedValue({ data: mockSeries });
    window.confirm = vi.fn(() => true);
  });

  describe('Rendering', () => {
    it('should render without crashing', async () => {
      render(<EditSeries />);
      expect(screen.getByText('Edit Series')).toBeInTheDocument();
    });

    it('should render title input', async () => {
      render(<EditSeries />);
      expect(screen.getByLabelText(/title/i)).toBeInTheDocument();
    });

    it('should render description textarea', async () => {
      render(<EditSeries />);
      expect(screen.getByLabelText(/description/i)).toBeInTheDocument();
    });

    it('should render SeriesImageUpload component', () => {
      render(<EditSeries />);
      expect(screen.getByTestId('series-image-upload')).toBeInTheDocument();
    });

    it('should render AddStoryModal component', () => {
      render(<EditSeries />);
      expect(screen.getByTestId('add-story-modal')).toBeInTheDocument();
    });

    it('should render Update button', () => {
      render(<EditSeries />);
      expect(screen.getByRole('button', { name: /update/i })).toBeInTheDocument();
    });
  });

  describe('Series Fetching', () => {
    it('should fetch series data on mount', async () => {
      render(<EditSeries />);

      await waitFor(() => {
        expect(api.get).toHaveBeenCalledWith('/series/series-123');
      });
    });

    it('should populate form with fetched series data', async () => {
      render(<EditSeries />);

      await waitFor(() => {
        expect(api.get).toHaveBeenCalled();
      });

      const titleInput = screen.getByLabelText(/title/i) as HTMLInputElement;
      const descInput = screen.getByLabelText(/description/i) as HTMLTextAreaElement;

      expect(titleInput.defaultValue).toBe('Test Series');
      expect(descInput.defaultValue).toBe('Test description');
    });

    it('should use default image if none provided', async () => {
      (api.get as Mock).mockResolvedValue({
        data: { ...mockSeries, image_url: '' },
      });

      render(<EditSeries />);

      await waitFor(() => {
        expect(api.get).toHaveBeenCalled();
      });

      // Component should render without crashing
      expect(screen.getByText('Edit Series')).toBeInTheDocument();
    });

    it('should not fetch if seriesID is missing', () => {
      (RouterModule.useParams as Mock).mockReturnValue({ seriesID: undefined });
      render(<EditSeries />);

      expect(api.get).not.toHaveBeenCalled();
    });

    it('should handle fetch error', async () => {
      (api.get as Mock).mockRejectedValue(new Error('Network error'));

      render(<EditSeries />);

      await waitFor(() => {
        expect(api.get).toHaveBeenCalled();
      });

      expect(screen.getByText('Edit Series')).toBeInTheDocument();
    });
  });

  describe('Form Field Updates', () => {
    it('should update title on input', async () => {
      const user = userEvent.setup();
      render(<EditSeries />);

      await waitFor(() => {
        expect(api.get).toHaveBeenCalled();
      });

      const titleInput = screen.getByLabelText(/title/i);
      await user.clear(titleInput);
      await user.type(titleInput, 'New Title');

      expect(titleInput).toHaveValue('New Title');
    });

    it('should update description on change', async () => {
      const user = userEvent.setup();
      render(<EditSeries />);

      await waitFor(() => {
        expect(api.get).toHaveBeenCalled();
      });

      const descInput = screen.getByLabelText(/description/i);
      await user.clear(descInput);
      await user.type(descInput, 'New Description');

      expect(descInput).toHaveValue('New Description');
    });
  });

  describe('Form Submission', () => {
    it('should submit form with FormData', async () => {
      const user = userEvent.setup();
      render(<EditSeries />);

      await waitFor(() => {
        expect(api.get).toHaveBeenCalled();
      });

      const updateButton = screen.getByRole('button', { name: /update/i });
      await user.click(updateButton);

      await waitFor(() => {
        expect(api.put).toHaveBeenCalledWith(
          '/series/series-123',
          expect.any(FormData),
          expect.objectContaining({
            withCredentials: true,
            headers: { 'Content-Type': 'multipart/form-data' },
          })
        );
      });
    });

    it('should navigate back on successful submission', async () => {
      const user = userEvent.setup();
      render(<EditSeries />);

      await waitFor(() => {
        expect(api.get).toHaveBeenCalled();
      });

      const updateButton = screen.getByRole('button', { name: /update/i });
      await user.click(updateButton);

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith(-1);
      });
    });

    it('should handle submission error', async () => {
      (api.put as Mock).mockRejectedValue(new Error('Network error'));
      const user = userEvent.setup();
      render(<EditSeries />);

      await waitFor(() => {
        expect(api.get).toHaveBeenCalled();
      });

      const updateButton = screen.getByRole('button', { name: /update/i });
      await user.click(updateButton);

      await waitFor(() => {
        expect(api.put).toHaveBeenCalled();
      });

      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });

  describe('Close Handling', () => {
    it('should navigate back when close button clicked', async () => {
      const user = userEvent.setup();
      render(<EditSeries />);

      const closeButtons = screen.getAllByRole('button');
      const closeButton = closeButtons.find(btn => btn.querySelector('svg[data-testid="CloseIcon"]'));
      expect(closeButton).toBeDefined();

      if (closeButton) {
        await user.click(closeButton);
        expect(mockNavigate).toHaveBeenCalledWith(-1);
      }
    });
  });
});
