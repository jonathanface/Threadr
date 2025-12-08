import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { SeriesImageUpload } from '../index';
import type { Story } from '../../../types/Story';

// Mock dependencies
const mockSetAlertState = vi.fn();
vi.mock('../../../hooks/useToaster', () => ({
  useToaster: () => ({
    setAlertState: mockSetAlertState,
  }),
}));

// Mock PortraitDropper component
vi.mock('../../PortraitDropper', () => ({
  PortraitDropper: ({ imageURL, name, onImageLoaded, onComplete }: any) => (
    <div data-testid="portrait-dropper">
      <div data-testid="portrait-dropper-image">{imageURL}</div>
      <div data-testid="portrait-dropper-name">{name}</div>
      <button onClick={() => onImageLoaded()}>Load Image</button>
      <button onClick={() => onComplete([new File([], 'test.jpg')])}>
        Complete Upload
      </button>
    </div>
  ),
}));

// Mock react-dropzone
vi.mock('react-dropzone', () => ({
  useDropzone: ({ onDrop }: any) => ({
    getRootProps: () => ({
      'data-testid': 'dropzone-root',
      onClick: () => {
        // Simulate file drop with valid image
        const file = new File(['image'], 'test.png', { type: 'image/png' });
        onDrop([file]);
      },
    }),
    getInputProps: () => ({
      'data-testid': 'dropzone-input',
    }),
  }),
}));

// Mock URL.createObjectURL
global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');

const mockStory1: Story = {
  story_id: 'story-1',
  title: 'First Story',
  description: 'Description',
  image_url: 'https://example.com/story1.jpg',
  chapters: [],
  inactive: false,
};

const mockStory2: Story = {
  ...mockStory1,
  story_id: 'story-2',
  title: 'Second Story',
  image_url: 'https://example.com/story2.jpg',
};

const mockStory3: Story = {
  ...mockStory1,
  story_id: 'story-3',
  title: 'Third Story',
  image_url: 'https://example.com/story3.jpg',
};

const mockStory4: Story = {
  ...mockStory1,
  story_id: 'story-4',
  title: 'Fourth Story',
  image_url: 'https://example.com/story4.jpg',
};

describe('SeriesImageUpload', () => {
  const mockOnComplete = vi.fn();
  const mockOnImageLoaded = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering with Custom Image', () => {
    it('should render PortraitDropper when custom image is provided', () => {
      render(
        <SeriesImageUpload
          imageURL="https://example.com/custom.jpg"
          name="Test Series"
          onComplete={mockOnComplete}
          onImageLoaded={mockOnImageLoaded}
        />
      );

      expect(screen.getByTestId('portrait-dropper')).toBeInTheDocument();
    });

    it('should pass imageURL to PortraitDropper', () => {
      render(
        <SeriesImageUpload
          imageURL="https://example.com/custom.jpg"
          name="Test Series"
          onComplete={mockOnComplete}
          onImageLoaded={mockOnImageLoaded}
        />
      );

      const imageDiv = screen.getByTestId('portrait-dropper-image');
      expect(imageDiv.textContent).toBe('https://example.com/custom.jpg');
    });

    it('should pass name to PortraitDropper', () => {
      render(
        <SeriesImageUpload
          imageURL="https://example.com/custom.jpg"
          name="My Test Series"
          onComplete={mockOnComplete}
          onImageLoaded={mockOnImageLoaded}
        />
      );

      const nameDiv = screen.getByTestId('portrait-dropper-name');
      expect(nameDiv.textContent).toBe('My Test Series');
    });

    it('should call onImageLoaded when PortraitDropper loads image', () => {
      render(
        <SeriesImageUpload
          imageURL="https://example.com/custom.jpg"
          name="Test Series"
          onComplete={mockOnComplete}
          onImageLoaded={mockOnImageLoaded}
        />
      );

      const loadButton = screen.getByText('Load Image');
      fireEvent.click(loadButton);

      expect(mockOnImageLoaded).toHaveBeenCalled();
    });
  });

  describe('Rendering with Composite Background', () => {
    it('should render composite background when no custom image and has stories', () => {
      const { container } = render(
        <SeriesImageUpload
          imageURL="/img/icons/story_series_icon.jpg"
          name="Test Series"
          stories={[mockStory1, mockStory2]}
          onComplete={mockOnComplete}
          onImageLoaded={mockOnImageLoaded}
        />
      );

      const composite = container.querySelector('[class*="compositeBackground"]');
      expect(composite).toBeInTheDocument();
    });

    it('should render upload hint text in composite mode', () => {
      render(
        <SeriesImageUpload
          imageURL="/img/icons/story_series_icon.jpg"
          name="Test Series"
          stories={[mockStory1, mockStory2]}
          onComplete={mockOnComplete}
          onImageLoaded={mockOnImageLoaded}
        />
      );

      expect(screen.getByText('Click or drag to upload series image')).toBeInTheDocument();
    });

    it('should render up to 4 story images in composite', () => {
      const fiveStories = [mockStory1, mockStory2, mockStory3, mockStory4,
        { ...mockStory1, story_id: 'story-5', image_url: 'https://example.com/story5.jpg' }
      ];

      const { container } = render(
        <SeriesImageUpload
          imageURL="/img/icons/story_series_icon.jpg"
          name="Test Series"
          stories={fiveStories}
          onComplete={mockOnComplete}
          onImageLoaded={mockOnImageLoaded}
        />
      );

      const compositeImages = container.querySelectorAll('[class*="compositeImage"]');
      expect(compositeImages).toHaveLength(4);
    });

    it('should set background images for story images', () => {
      const { container } = render(
        <SeriesImageUpload
          imageURL="/img/icons/story_series_icon.jpg"
          name="Test Series"
          stories={[mockStory1, mockStory2]}
          onComplete={mockOnComplete}
          onImageLoaded={mockOnImageLoaded}
        />
      );

      const compositeImages = container.querySelectorAll('[style*="background-image"]');
      expect(compositeImages.length).toBeGreaterThan(0);
    });

    it('should render dropzone in composite mode', () => {
      render(
        <SeriesImageUpload
          imageURL="/img/icons/story_series_icon.jpg"
          name="Test Series"
          stories={[mockStory1, mockStory2]}
          onComplete={mockOnComplete}
          onImageLoaded={mockOnImageLoaded}
        />
      );

      const dropzone = screen.getByTestId('dropzone-root');
      expect(dropzone).toBeInTheDocument();
    });
  });

  describe('Default Image Handling', () => {
    it('should use PortraitDropper with default image when no stories', () => {
      render(
        <SeriesImageUpload
          imageURL="/img/icons/story_series_icon.jpg"
          name="Test Series"
          stories={[]}
          onComplete={mockOnComplete}
          onImageLoaded={mockOnImageLoaded}
        />
      );

      expect(screen.getByTestId('portrait-dropper')).toBeInTheDocument();
    });

    it('should use PortraitDropper when imageURL is empty', () => {
      render(
        <SeriesImageUpload
          imageURL=""
          name="Test Series"
          onComplete={mockOnComplete}
          onImageLoaded={mockOnImageLoaded}
        />
      );

      expect(screen.getByTestId('portrait-dropper')).toBeInTheDocument();
    });
  });

  describe('File Upload Behavior', () => {
    it('should call onComplete when file is uploaded via PortraitDropper', () => {
      render(
        <SeriesImageUpload
          imageURL="https://example.com/custom.jpg"
          name="Test Series"
          onComplete={mockOnComplete}
          onImageLoaded={mockOnImageLoaded}
        />
      );

      const completeButton = screen.getByText('Complete Upload');
      fireEvent.click(completeButton);

      expect(mockOnComplete).toHaveBeenCalled();
    });

    it('should create preview URL when file is uploaded', () => {
      render(
        <SeriesImageUpload
          imageURL="https://example.com/custom.jpg"
          name="Test Series"
          onComplete={mockOnComplete}
          onImageLoaded={mockOnImageLoaded}
        />
      );

      const completeButton = screen.getByText('Complete Upload');
      fireEvent.click(completeButton);

      expect(URL.createObjectURL).toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    it('should handle undefined stories', () => {
      expect(() =>
        render(
          <SeriesImageUpload
            imageURL="/img/icons/story_series_icon.jpg"
            name="Test Series"
            onComplete={mockOnComplete}
            onImageLoaded={mockOnImageLoaded}
          />
        )
      ).not.toThrow();
    });

    it('should handle empty stories array', () => {
      render(
        <SeriesImageUpload
          imageURL="/img/icons/story_series_icon.jpg"
          name="Test Series"
          stories={[]}
          onComplete={mockOnComplete}
          onImageLoaded={mockOnImageLoaded}
        />
      );

      expect(screen.getByTestId('portrait-dropper')).toBeInTheDocument();
    });

    it('should handle single story in composite', () => {
      const { container } = render(
        <SeriesImageUpload
          imageURL="/img/icons/story_series_icon.jpg"
          name="Test Series"
          stories={[mockStory1]}
          onComplete={mockOnComplete}
          onImageLoaded={mockOnImageLoaded}
        />
      );

      const compositeImages = container.querySelectorAll('[class*="compositeImage"]');
      expect(compositeImages).toHaveLength(1);
    });

    it('should handle very long series name', () => {
      const longName = 'A'.repeat(200);
      render(
        <SeriesImageUpload
          imageURL="https://example.com/custom.jpg"
          name={longName}
          onComplete={mockOnComplete}
          onImageLoaded={mockOnImageLoaded}
        />
      );

      const nameDiv = screen.getByTestId('portrait-dropper-name');
      expect(nameDiv.textContent).toBe(longName);
    });

    it('should handle special characters in name', () => {
      const specialName = 'Test & Series <script>alert("xss")</script>';
      render(
        <SeriesImageUpload
          imageURL="https://example.com/custom.jpg"
          name={specialName}
          onComplete={mockOnComplete}
          onImageLoaded={mockOnImageLoaded}
        />
      );

      const nameDiv = screen.getByTestId('portrait-dropper-name');
      expect(nameDiv.textContent).toBe(specialName);
    });

    it('should handle stories with missing image URLs', () => {
      const storyWithoutImage = { ...mockStory1, image_url: undefined as any };
      const { container } = render(
        <SeriesImageUpload
          imageURL="/img/icons/story_series_icon.jpg"
          name="Test Series"
          stories={[storyWithoutImage]}
          onComplete={mockOnComplete}
          onImageLoaded={mockOnImageLoaded}
        />
      );

      const compositeImages = container.querySelectorAll('[class*="compositeImage"]');
      expect(compositeImages).toHaveLength(1);
    });
  });

  describe('Mode Switching', () => {
    it('should switch to PortraitDropper when custom image is set', () => {
      const { rerender } = render(
        <SeriesImageUpload
          imageURL="/img/icons/story_series_icon.jpg"
          name="Test Series"
          stories={[mockStory1, mockStory2]}
          onComplete={mockOnComplete}
          onImageLoaded={mockOnImageLoaded}
        />
      );

      // Should show composite initially
      expect(screen.getByText('Click or drag to upload series image')).toBeInTheDocument();

      // Update to custom image
      rerender(
        <SeriesImageUpload
          imageURL="https://example.com/custom.jpg"
          name="Test Series"
          stories={[mockStory1, mockStory2]}
          onComplete={mockOnComplete}
          onImageLoaded={mockOnImageLoaded}
        />
      );

      // Should switch to PortraitDropper
      expect(screen.getByTestId('portrait-dropper')).toBeInTheDocument();
    });

    it('should switch to composite when custom image is removed and stories exist', () => {
      const { rerender } = render(
        <SeriesImageUpload
          imageURL="https://example.com/custom.jpg"
          name="Test Series"
          stories={[mockStory1, mockStory2]}
          onComplete={mockOnComplete}
          onImageLoaded={mockOnImageLoaded}
        />
      );

      // Should show PortraitDropper initially
      expect(screen.getByTestId('portrait-dropper')).toBeInTheDocument();

      // Update to default image
      rerender(
        <SeriesImageUpload
          imageURL="/img/icons/story_series_icon.jpg"
          name="Test Series"
          stories={[mockStory1, mockStory2]}
          onComplete={mockOnComplete}
          onImageLoaded={mockOnImageLoaded}
        />
      );

      // Should switch to composite
      expect(screen.getByText('Click or drag to upload series image')).toBeInTheDocument();
    });
  });

  describe('Structure', () => {
    it('should have upload wrapper in composite mode', () => {
      const { container } = render(
        <SeriesImageUpload
          imageURL="/img/icons/story_series_icon.jpg"
          name="Test Series"
          stories={[mockStory1, mockStory2]}
          onComplete={mockOnComplete}
          onImageLoaded={mockOnImageLoaded}
        />
      );

      const uploadWrapper = container.querySelector('[class*="uploadWrapper"]');
      expect(uploadWrapper).toBeInTheDocument();
    });

    it('should have uploader overlay in composite mode', () => {
      const { container } = render(
        <SeriesImageUpload
          imageURL="/img/icons/story_series_icon.jpg"
          name="Test Series"
          stories={[mockStory1, mockStory2]}
          onComplete={mockOnComplete}
          onImageLoaded={mockOnImageLoaded}
        />
      );

      const uploaderOverlay = container.querySelector('[class*="uploaderOverlay"]');
      expect(uploaderOverlay).toBeInTheDocument();
    });
  });
});
