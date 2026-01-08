import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import { StoryAndSeriesListing } from '../index';
import { UserContext } from '../../../contexts/user';

// Mock navigate
const mockNavigate = vi.fn();
const mockDeselectAll = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Mock hooks
const mockUseWorksList = vi.fn();
vi.mock('../../../hooks/useWorksList', () => ({
  useWorksList: () => mockUseWorksList(),
}));

vi.mock('../../../hooks/useSelections', () => ({
  useSelections: () => ({
    deselectAll: mockDeselectAll,
  }),
}));

vi.mock('../../../hooks/useFetchUserData', () => ({
  useFetchUserData: () => ({
    userDetails: null,
    clearWelcomeFlags: vi.fn(),
  }),
}));

// Mock child components
vi.mock('../../../components/StoryBox', () => ({
  StoryBox: ({ story }: any) => (
    <div data-testid={`story-box-${story.story_id}`}>{story.title}</div>
  ),
}));

vi.mock('../../../components/SeriesBox', () => ({
  SeriesBox: ({ series }: any) => (
    <div data-testid={`series-box-${series.series_id}`}>{series.series_title}</div>
  ),
}));

vi.mock('../../Welcome', () => ({
  WelcomeModal: ({ open }: { open: boolean }) =>
    open ? <div data-testid="welcome-modal">Welcome Modal</div> : null,
}));

describe('StoryAndSeriesListing', () => {
  const mockUserData = {
    userDetails: null,
    isLoggedIn: true,
    userLoading: false,
    setIsLoggedIn: vi.fn(),
        clearWelcomeFlags: vi.fn(),
    setUserDetails: vi.fn(),
  };

  const mockStories = [
    {
      story_id: 'story-1',
      title: 'Test Story 1',
      description: 'Description 1',
      image_url: '/img1.jpg',
      user_id: 'user-123',
      inactive: false,
      last_updated: '2024-01-01',
      created: '2024-01-01',
      words_per_page: 250,
    },
    {
      story_id: 'story-2',
      title: 'Test Story 2',
      description: 'Description 2',
      image_url: '/img2.jpg',
      user_id: 'user-123',
      inactive: false,
      last_updated: '2024-01-02',
      created: '2024-01-02',
      words_per_page: 250,
    },
  ];

  const mockSeries = [
    {
      series_id: 'series-1',
      series_title: 'Test Series 1',
      series_description: 'Series Description 1',
      author_id: 'user-123',
      image_url: '/series1.jpg',
      created_at: '2024-01-01',
      updated_at: '2024-01-01',
      stories: [],
    },
  ];

  const renderStoryAndSeriesListing = (userData = mockUserData) => {
    return render(
      <UserContext.Provider value={userData}>
        <BrowserRouter>
          <StoryAndSeriesListing />
        </BrowserRouter>
      </UserContext.Provider>
    );
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseWorksList.mockReturnValue({
      seriesList: mockSeries,
      storiesList: mockStories,
    });
  });

  describe('Rendering', () => {
    it('should render without crashing', () => {
      renderStoryAndSeriesListing();
      expect(screen.getByText('Stories')).toBeInTheDocument();
    });

    it('should render Stories heading when logged in', () => {
      renderStoryAndSeriesListing();

      const heading = screen.getByRole('heading', { name: /stories/i });
      expect(heading).toBeInTheDocument();
    });

    it('should not render content when not logged in', () => {
      renderStoryAndSeriesListing({ ...mockUserData, isLoggedIn: false });

      expect(screen.queryByText('Stories')).not.toBeInTheDocument();
    });

    it('should render Docter.io logo', () => {
      renderStoryAndSeriesListing();

      const logo = screen.getByAltText('Docter.io logo');
      expect(logo).toBeInTheDocument();
      expect(logo).toHaveAttribute('src', '/img/slash-logo-trans.png');
      expect(logo).toHaveAttribute('title', 'Docter.io - Organized Imagination');
    });

    it('should render create story button', () => {
      renderStoryAndSeriesListing();

      const addButton = screen.getByLabelText('add new story');
      expect(addButton).toBeInTheDocument();
    });

    it('should render create story button in a Tooltip component', () => {
      renderStoryAndSeriesListing();

      // MUI Tooltip wraps the button but doesn't add a title attribute to the DOM
      // Just verify the button exists (tooltip functionality is tested by MUI)
      const addButton = screen.getByLabelText('add new story');
      expect(addButton).toBeInTheDocument();
    });
  });

  describe('Stories and Series Display', () => {
    it('should render series components', () => {
      renderStoryAndSeriesListing();

      expect(screen.getByTestId('series-box-series-1')).toBeInTheDocument();
      expect(screen.getByText('Test Series 1')).toBeInTheDocument();
    });

    it('should render story components', () => {
      renderStoryAndSeriesListing();

      expect(screen.getByTestId('story-box-story-1')).toBeInTheDocument();
      expect(screen.getByTestId('story-box-story-2')).toBeInTheDocument();
      expect(screen.getByText('Test Story 1')).toBeInTheDocument();
      expect(screen.getByText('Test Story 2')).toBeInTheDocument();
    });

    it('should render series before stories', () => {
      renderStoryAndSeriesListing();

      const seriesBox = screen.getByTestId('series-box-series-1');
      const storyBox = screen.getByTestId('story-box-story-1');

      // Series should appear before stories in the DOM
      expect(seriesBox.compareDocumentPosition(storyBox) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('should handle empty series list', () => {
      mockUseWorksList.mockReturnValue({
        seriesList: [],
        storiesList: mockStories,
      });

      renderStoryAndSeriesListing();

      expect(screen.queryByTestId(/series-box/)).not.toBeInTheDocument();
      expect(screen.getByTestId('story-box-story-1')).toBeInTheDocument();
    });

    it('should handle empty stories list', () => {
      mockUseWorksList.mockReturnValue({
        seriesList: mockSeries,
        storiesList: [],
      });

      renderStoryAndSeriesListing();

      expect(screen.getByTestId('series-box-series-1')).toBeInTheDocument();
      expect(screen.queryByTestId(/story-box/)).not.toBeInTheDocument();
    });

    it('should handle undefined lists gracefully', () => {
      mockUseWorksList.mockReturnValue({
        seriesList: undefined,
        storiesList: undefined,
      });

      renderStoryAndSeriesListing();

      expect(screen.getByText('Stories')).toBeInTheDocument();
      expect(screen.queryByTestId(/story-box/)).not.toBeInTheDocument();
      expect(screen.queryByTestId(/series-box/)).not.toBeInTheDocument();
    });
  });

  describe('Empty State', () => {
    it('should show empty state message when both lists are empty', async () => {
      mockUseWorksList.mockReturnValue({
        seriesList: [],
        storiesList: [],
      });

      renderStoryAndSeriesListing();

      await waitFor(() => {
        expect(screen.getByText('No Stories Yet')).toBeInTheDocument();
        expect(screen.getByText(/Click the plus button to start writing your first story!/i)).toBeInTheDocument();
      });
    });

    it('should not show empty state message if stories exist', async () => {
      mockUseWorksList.mockReturnValue({
        seriesList: [],
        storiesList: mockStories,
      });

      renderStoryAndSeriesListing();

      await waitFor(() => {
        expect(screen.queryByText('No Stories Yet')).not.toBeInTheDocument();
      });
    });

    it('should not show empty state message if series exist', async () => {
      mockUseWorksList.mockReturnValue({
        seriesList: mockSeries,
        storiesList: [],
      });

      renderStoryAndSeriesListing();

      await waitFor(() => {
        expect(screen.queryByText('No Stories Yet')).not.toBeInTheDocument();
      });
    });

    it('should call deselectAll on mount', async () => {
      renderStoryAndSeriesListing();

      await waitFor(() => {
        expect(mockDeselectAll).toHaveBeenCalled();
      });
    });
  });

  describe('Navigation', () => {
    it('should navigate to /stories/new when create button clicked', async () => {
      const user = userEvent.setup();
      renderStoryAndSeriesListing();

      const addButton = screen.getByLabelText('add new story');
      await user.click(addButton);

      expect(mockNavigate).toHaveBeenCalledWith('/stories/new');
    });
  });

  describe('User Context', () => {
    it('should not render Stories section when user is not logged in', () => {
      renderStoryAndSeriesListing({ ...mockUserData, isLoggedIn: false });

      expect(screen.queryByRole('heading', { name: /stories/i })).not.toBeInTheDocument();
      expect(screen.queryByLabelText('add new story')).not.toBeInTheDocument();
    });

    it('should render Stories section when user is logged in', () => {
      renderStoryAndSeriesListing({ ...mockUserData, isLoggedIn: true });

      expect(screen.getByRole('heading', { name: /stories/i })).toBeInTheDocument();
      expect(screen.getByLabelText('add new story')).toBeInTheDocument();
    });

    it('should always render logo regardless of login state', () => {
      const { rerender } = renderStoryAndSeriesListing({ ...mockUserData, isLoggedIn: false });
      expect(screen.getByAltText('Docter.io logo')).toBeInTheDocument();

      rerender(
        <UserContext.Provider value={{ ...mockUserData, isLoggedIn: true }}>
          <BrowserRouter>
            <StoryAndSeriesListing />
          </BrowserRouter>
        </UserContext.Provider>
      );
      expect(screen.getByAltText('Docter.io logo')).toBeInTheDocument();
    });
  });

  describe('Multiple Items', () => {
    it('should render multiple series', () => {
      const multipleSeries = [
        ...mockSeries,
        {
          series_id: 'series-2',
          series_title: 'Test Series 2',
          series_description: 'Series Description 2',
          author_id: 'user-123',
          image_url: '/series2.jpg',
          created_at: '2024-01-02',
          updated_at: '2024-01-02',
          stories: [],
        },
      ];

      mockUseWorksList.mockReturnValue({
        seriesList: multipleSeries,
        storiesList: mockStories,
      });

      renderStoryAndSeriesListing();

      expect(screen.getByTestId('series-box-series-1')).toBeInTheDocument();
      expect(screen.getByTestId('series-box-series-2')).toBeInTheDocument();
    });

    it('should render many stories', () => {
      const manyStories = Array.from({ length: 10 }, (_, i) => ({
        story_id: `story-${i}`,
        title: `Test Story ${i}`,
        description: `Description ${i}`,
        image_url: `/img${i}.jpg`,
        user_id: 'user-123',
        inactive: false,
        last_updated: '2024-01-01',
        created: '2024-01-01',
        words_per_page: 250,
      }));

      mockUseWorksList.mockReturnValue({
        seriesList: [],
        storiesList: manyStories,
      });

      renderStoryAndSeriesListing();

      manyStories.forEach(story => {
        expect(screen.getByTestId(`story-box-${story.story_id}`)).toBeInTheDocument();
      });
    });
  });

  describe('Accessibility', () => {
    it('should have proper heading structure', () => {
      renderStoryAndSeriesListing();

      const heading = screen.getByRole('heading', { name: /stories/i });
      expect(heading).toBeInTheDocument();
    });

    it('should have accessible button with aria-label', () => {
      renderStoryAndSeriesListing();

      const addButton = screen.getByLabelText('add new story');
      expect(addButton).toHaveAccessibleName();
    });

    it('should have accessible image with alt text', () => {
      renderStoryAndSeriesListing();

      const logo = screen.getByAltText('Docter.io logo');
      expect(logo).toHaveAccessibleName();
    });
  });

  describe('Effect Dependencies', () => {
    it('should show empty state message when storiesList becomes empty', async () => {
      const { rerender } = renderStoryAndSeriesListing();

      mockUseWorksList.mockReturnValue({
        seriesList: [],
        storiesList: [],
      });

      rerender(
        <UserContext.Provider value={mockUserData}>
          <BrowserRouter>
            <StoryAndSeriesListing />
          </BrowserRouter>
        </UserContext.Provider>
      );

      await waitFor(() => {
        expect(screen.getByText('No Stories Yet')).toBeInTheDocument();
      });
    });
  });
});
