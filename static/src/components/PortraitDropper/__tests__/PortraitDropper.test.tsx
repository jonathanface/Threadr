import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { PortraitDropper } from '../index';
import { AlertToastType } from '../../../types/AlertToasts';

// Mock dependencies
const mockSetAlertState = vi.fn();
vi.mock('../../../hooks/useToaster', () => ({
  useToaster: () => ({
    setAlertState: mockSetAlertState,
  }),
}));

// Mock react-dropzone
const mockGetRootProps = vi.fn(() => ({
  'data-testid': 'dropzone',
}));
const mockGetInputProps = vi.fn(() => ({
  'data-testid': 'dropzone-input',
  type: 'file',
}));
const mockOnDrop = vi.fn();

vi.mock('react-dropzone', () => ({
  useDropzone: (config: { onDrop: (files: File[]) => void }) => {
    mockOnDrop.mockImplementation(config.onDrop);
    return {
      getRootProps: mockGetRootProps,
      getInputProps: mockGetInputProps,
    };
  },
}));

// Mock URL.createObjectURL
global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');

describe('PortraitDropper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render with initial image URL', () => {
      render(
        <PortraitDropper
          imageURL="https://example.com/image.jpg"
          name="Test Image"
        />
      );

      const img = screen.getByAltText('Test Image');
      expect(img).toBeInTheDocument();
      expect(img).toHaveAttribute('src', 'https://example.com/image.jpg');
      expect(img).toHaveAttribute('title', 'Test Image');
    });

    it('should render without image URL', () => {
      render(
        <PortraitDropper
          imageURL={null}
          name="Test Image"
        />
      );

      const img = screen.getByAltText('Test Image');
      expect(img).toBeInTheDocument();
      expect(img).not.toHaveAttribute('src');
    });

    it('should render with label by default', () => {
      render(
        <PortraitDropper
          imageURL="https://example.com/image.jpg"
          name="Test Image"
        />
      );

      expect(screen.getByText(/Drop an image over the picture/)).toBeInTheDocument();
    });

    it('should hide label when hideLabel prop is true', () => {
      render(
        <PortraitDropper
          imageURL="https://example.com/image.jpg"
          name="Test Image"
          hideLabel={true}
        />
      );

      expect(screen.queryByText(/Drop an image over the picture/)).not.toBeInTheDocument();
    });

    it('should apply custom className', () => {
      const { container } = render(
        <PortraitDropper
          imageURL="https://example.com/image.jpg"
          name="Test Image"
          className="custom-class"
        />
      );

      const dropperDiv = container.firstChild;
      expect(dropperDiv).toHaveClass('custom-class');
    });
  });

  describe('Props Updates', () => {
    it('should update image when imageURL prop changes', () => {
      const { rerender } = render(
        <PortraitDropper
          imageURL="https://example.com/initial.jpg"
          name="Test Image"
        />
      );

      const img = screen.getByAltText('Test Image');
      expect(img).toHaveAttribute('src', 'https://example.com/initial.jpg');

      rerender(
        <PortraitDropper
          imageURL="https://example.com/updated.jpg"
          name="Test Image"
        />
      );

      expect(img).toHaveAttribute('src', 'https://example.com/updated.jpg');
    });

    it('should update name when name prop changes', () => {
      const { rerender } = render(
        <PortraitDropper
          imageURL="https://example.com/image.jpg"
          name="Initial Name"
        />
      );

      expect(screen.getByAltText('Initial Name')).toBeInTheDocument();

      rerender(
        <PortraitDropper
          imageURL="https://example.com/image.jpg"
          name="Updated Name"
        />
      );

      expect(screen.getByAltText('Updated Name')).toBeInTheDocument();
      expect(screen.queryByAltText('Initial Name')).not.toBeInTheDocument();
    });
  });

  describe('File Drop', () => {
    it('should accept valid image file (PNG)', () => {
      const mockOnComplete = vi.fn();
      const file = new File(['dummy'], 'test.png', { type: 'image/png' });

      render(
        <PortraitDropper
          imageURL={null}
          name="Test Image"
          onComplete={mockOnComplete}
        />
      );

      act(() => {
        mockOnDrop([file]);
      });

      expect(URL.createObjectURL).toHaveBeenCalledWith(file);
      expect(mockOnComplete).toHaveBeenCalledWith([file]);
      expect(mockSetAlertState).not.toHaveBeenCalled();
    });

    it('should accept valid image file (JPG)', () => {
      const mockOnComplete = vi.fn();
      const file = new File(['dummy'], 'test.jpg', { type: 'image/jpg' });

      render(
        <PortraitDropper
          imageURL={null}
          name="Test Image"
          onComplete={mockOnComplete}
        />
      );

      act(() => {
        mockOnDrop([file]);
      });

      expect(URL.createObjectURL).toHaveBeenCalledWith(file);
      expect(mockOnComplete).toHaveBeenCalledWith([file]);
      expect(mockSetAlertState).not.toHaveBeenCalled();
    });

    it('should accept valid image file (JPEG)', () => {
      const mockOnComplete = vi.fn();
      const file = new File(['dummy'], 'test.jpeg', { type: 'image/jpeg' });

      render(
        <PortraitDropper
          imageURL={null}
          name="Test Image"
          onComplete={mockOnComplete}
        />
      );

      act(() => {
        mockOnDrop([file]);
      });

      expect(URL.createObjectURL).toHaveBeenCalledWith(file);
      expect(mockOnComplete).toHaveBeenCalledWith([file]);
      expect(mockSetAlertState).not.toHaveBeenCalled();
    });

    it('should accept valid image file (GIF)', () => {
      const mockOnComplete = vi.fn();
      const file = new File(['dummy'], 'test.gif', { type: 'image/gif' });

      render(
        <PortraitDropper
          imageURL={null}
          name="Test Image"
          onComplete={mockOnComplete}
        />
      );

      act(() => {
        mockOnDrop([file]);
      });

      expect(URL.createObjectURL).toHaveBeenCalledWith(file);
      expect(mockOnComplete).toHaveBeenCalledWith([file]);
      expect(mockSetAlertState).not.toHaveBeenCalled();
    });

    it('should reject invalid file type', () => {
      const mockOnComplete = vi.fn();
      const file = new File(['dummy'], 'test.pdf', { type: 'application/pdf' });

      render(
        <PortraitDropper
          imageURL={null}
          name="Test Image"
          onComplete={mockOnComplete}
        />
      );

      mockOnDrop([file]);

      expect(URL.createObjectURL).not.toHaveBeenCalled();
      expect(mockOnComplete).not.toHaveBeenCalled();
      expect(mockSetAlertState).toHaveBeenCalledWith({
        title: 'Cannot upload file',
        message: 'Only images of the following type are allowed: png,jpg,jpeg,gif',
        severity: AlertToastType.warning,
        open: true,
        timeout: 10000,
      });
    });

    it('should reject image file with unsupported format', () => {
      const mockOnComplete = vi.fn();
      const file = new File(['dummy'], 'test.bmp', { type: 'image/bmp' });

      render(
        <PortraitDropper
          imageURL={null}
          name="Test Image"
          onComplete={mockOnComplete}
        />
      );

      mockOnDrop([file]);

      expect(URL.createObjectURL).not.toHaveBeenCalled();
      expect(mockOnComplete).not.toHaveBeenCalled();
      expect(mockSetAlertState).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Cannot upload file',
          severity: AlertToastType.warning,
        })
      );
    });

    it('should update image preview after successful drop', async () => {
      const file = new File(['dummy'], 'test.png', { type: 'image/png' });

      render(
        <PortraitDropper
          imageURL={null}
          name="Test Image"
        />
      );

      const imgBefore = screen.getByAltText('Test Image');
      expect(imgBefore).not.toHaveAttribute('src');

      act(() => {
        mockOnDrop([file]);
      });

      await waitFor(() => {
        const imgAfter = screen.getByAltText('Test Image');
        expect(imgAfter).toHaveAttribute('src', 'blob:mock-url');
      });
    });

    it('should work without onComplete callback', () => {
      const file = new File(['dummy'], 'test.png', { type: 'image/png' });

      render(
        <PortraitDropper
          imageURL={null}
          name="Test Image"
        />
      );

      expect(() => {
        act(() => {
          mockOnDrop([file]);
        });
      }).not.toThrow();
      expect(URL.createObjectURL).toHaveBeenCalledWith(file);
    });
  });

  describe('Image Load Callback', () => {
    it('should call onImageLoaded when image loads', () => {
      const mockOnImageLoaded = vi.fn();

      render(
        <PortraitDropper
          imageURL="https://example.com/image.jpg"
          name="Test Image"
          onImageLoaded={mockOnImageLoaded}
        />
      );

      const img = screen.getByAltText('Test Image');
      fireEvent.load(img);

      expect(mockOnImageLoaded).toHaveBeenCalled();
    });

    it('should work without onImageLoaded callback', () => {
      render(
        <PortraitDropper
          imageURL="https://example.com/image.jpg"
          name="Test Image"
        />
      );

      const img = screen.getByAltText('Test Image');
      expect(() => fireEvent.load(img)).not.toThrow();
    });
  });

  describe('Dropzone Integration', () => {
    it('should configure dropzone with onDrop handler', () => {
      render(
        <PortraitDropper
          imageURL={null}
          name="Test Image"
        />
      );

      expect(mockGetRootProps).toHaveBeenCalled();
      expect(mockGetInputProps).toHaveBeenCalled();
    });

    it('should render dropzone input', () => {
      render(
        <PortraitDropper
          imageURL={null}
          name="Test Image"
        />
      );

      const input = screen.getByTestId('dropzone-input');
      expect(input).toBeInTheDocument();
      expect(input).toHaveAttribute('type', 'file');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty file name', () => {
      render(
        <PortraitDropper
          imageURL="https://example.com/image.jpg"
          name=""
        />
      );

      const img = screen.getByAltText('');
      expect(img).toBeInTheDocument();
    });

    it('should handle very long file names', () => {
      const longName = 'A'.repeat(200);
      render(
        <PortraitDropper
          imageURL="https://example.com/image.jpg"
          name={longName}
        />
      );

      const img = screen.getByAltText(longName);
      expect(img).toBeInTheDocument();
    });

    it('should handle file without type property', () => {
      const mockOnComplete = vi.fn();
      const file = new File(['dummy'], 'test.png', { type: '' });

      render(
        <PortraitDropper
          imageURL={null}
          name="Test Image"
          onComplete={mockOnComplete}
        />
      );

      // File without type should be accepted (no validation)
      act(() => {
        mockOnDrop([file]);
      });

      expect(URL.createObjectURL).toHaveBeenCalledWith(file);
      expect(mockOnComplete).toHaveBeenCalledWith([file]);
    });

    it('should handle special characters in name', () => {
      const specialName = '<script>alert("xss")</script>';
      render(
        <PortraitDropper
          imageURL="https://example.com/image.jpg"
          name={specialName}
        />
      );

      const img = screen.getByAltText(specialName);
      expect(img).toBeInTheDocument();
    });

    it('should handle null to valid URL transition', () => {
      const { rerender } = render(
        <PortraitDropper
          imageURL={null}
          name="Test Image"
        />
      );

      const img = screen.getByAltText('Test Image');
      expect(img).not.toHaveAttribute('src');

      rerender(
        <PortraitDropper
          imageURL="https://example.com/image.jpg"
          name="Test Image"
        />
      );

      expect(img).toHaveAttribute('src', 'https://example.com/image.jpg');
    });

    it('should handle valid URL to null transition', () => {
      const { rerender } = render(
        <PortraitDropper
          imageURL="https://example.com/image.jpg"
          name="Test Image"
        />
      );

      const img = screen.getByAltText('Test Image');
      expect(img).toHaveAttribute('src', 'https://example.com/image.jpg');

      rerender(
        <PortraitDropper
          imageURL={null}
          name="Test Image"
        />
      );

      expect(img).not.toHaveAttribute('src');
    });
  });

  describe('Accessibility', () => {
    it('should have alt text for image', () => {
      render(
        <PortraitDropper
          imageURL="https://example.com/image.jpg"
          name="Profile Picture"
        />
      );

      const img = screen.getByAltText('Profile Picture');
      expect(img).toBeInTheDocument();
    });

    it('should have title attribute for image', () => {
      render(
        <PortraitDropper
          imageURL="https://example.com/image.jpg"
          name="Profile Picture"
        />
      );

      const img = screen.getByAltText('Profile Picture');
      expect(img).toHaveAttribute('title', 'Profile Picture');
    });

    it('should provide clear instructions to users', () => {
      render(
        <PortraitDropper
          imageURL="https://example.com/image.jpg"
          name="Test Image"
        />
      );

      expect(screen.getByText(/Drop an image over the picture to update, or click on it/)).toBeInTheDocument();
    });
  });
});
