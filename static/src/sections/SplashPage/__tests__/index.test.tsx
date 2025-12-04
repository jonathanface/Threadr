import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import { SplashPage } from '../index';

// Mock navigate
const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Mock ThreadWriterDemo component
vi.mock('../../../components/demoComponents/ThreadWriterDemo', () => ({
  ThreadWriterDemo: () => <div data-testid="thread-writer-demo">Thread Writer Demo</div>,
}));

describe('SplashPage', () => {
  const renderSplashPage = () => {
    return render(
      <BrowserRouter>
        <SplashPage />
      </BrowserRouter>
    );
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render without crashing', () => {
      renderSplashPage();
      expect(screen.getByText(/The Writing Platform That Keeps Your Story Organized/i)).toBeInTheDocument();
    });

    it('should render hero section with title', () => {
      renderSplashPage();

      const heroTitle = screen.getByRole('heading', { name: /The Writing Platform That Keeps Your Story Organized/i });
      expect(heroTitle).toBeInTheDocument();
    });

    it('should render hero subtitle', () => {
      renderSplashPage();

      expect(screen.getByText(/Link characters, places, and events directly in your text/i)).toBeInTheDocument();
    });

    it('should render primary CTA buttons', () => {
      renderSplashPage();

      const ctaButtons = screen.getAllByRole('button', { name: /start writing free/i });
      expect(ctaButtons.length).toBeGreaterThanOrEqual(1);
    });

    it('should render pricing information', () => {
      renderSplashPage();

      expect(screen.getByText(/Free: Unlimited stories \+ 20 story elements/i)).toBeInTheDocument();
    });

    it('should render demo section', () => {
      renderSplashPage();

      expect(screen.getByTestId('thread-writer-demo')).toBeInTheDocument();
    });

    it('should render demo instructions', () => {
      renderSplashPage();

      expect(screen.getByText(/Try It Now - No Signup Required/i)).toBeInTheDocument();
    });
  });

  describe('Navigation', () => {
    it('should navigate to /signin when CTA button clicked', async () => {
      const user = userEvent.setup();
      renderSplashPage();

      const ctaButton = screen.getAllByRole('button', { name: /start writing free/i })[0];
      await user.click(ctaButton);

      expect(mockNavigate).toHaveBeenCalledWith('/signin');
    });

    it('should navigate to /signin when final CTA clicked', async () => {
      const user = userEvent.setup();
      renderSplashPage();

      const ctaButtons = screen.getAllByRole('button', { name: /start writing free/i });
      const finalCTA = ctaButtons[ctaButtons.length - 1];
      await user.click(finalCTA);

      expect(mockNavigate).toHaveBeenCalledWith('/signin');
    });

    it('should have multiple CTA buttons that all navigate to signin', async () => {
      const user = userEvent.setup();
      renderSplashPage();

      const ctaButtons = screen.getAllByRole('button', { name: /start writing free/i });
      expect(ctaButtons.length).toBeGreaterThanOrEqual(2);

      // Click each button and verify navigation
      for (const button of ctaButtons) {
        await user.click(button);
      }

      expect(mockNavigate).toHaveBeenCalledWith('/signin');
      expect(mockNavigate).toHaveBeenCalledTimes(ctaButtons.length);
    });
  });

  describe('How It Works Section', () => {
    it('should render "How It Works" section', () => {
      renderSplashPage();

      expect(screen.getByRole('heading', { name: /how it works/i })).toBeInTheDocument();
    });

    it('should render three steps', () => {
      renderSplashPage();

      expect(screen.getByText(/Write Your Story/i)).toBeInTheDocument();
      expect(screen.getByText(/Link Story Elements/i)).toBeInTheDocument();
      expect(screen.getByText(/Stay Organized/i)).toBeInTheDocument();
    });

    it('should render step descriptions', () => {
      renderSplashPage();

      expect(screen.getByText(/Draft chapters in a clean, distraction-free editor/i)).toBeInTheDocument();
      expect(screen.getByText(/Highlight text and create references to characters/i)).toBeInTheDocument();
      expect(screen.getByText(/Click any reference to view details/i)).toBeInTheDocument();
    });

    it('should render step numbers', () => {
      renderSplashPage();

      expect(screen.getByText('1')).toBeInTheDocument();
      expect(screen.getByText('2')).toBeInTheDocument();
      expect(screen.getByText('3')).toBeInTheDocument();
    });
  });

  describe('Features Section', () => {
    it('should render features section title', () => {
      renderSplashPage();

      expect(screen.getByRole('heading', { name: /write smarter, not harder/i })).toBeInTheDocument();
    });

    it('should render features intro', () => {
      renderSplashPage();

      expect(screen.getByText(/Built for writers working on novels, series, and complex narratives/i)).toBeInTheDocument();
    });

    it('should render inline references feature', () => {
      renderSplashPage();

      expect(screen.getByText(/Inline References:/i)).toBeInTheDocument();
    });

    it('should render quick access feature', () => {
      renderSplashPage();

      expect(screen.getByText(/Quick Access:/i)).toBeInTheDocument();
    });

    it('should render no context switching feature', () => {
      renderSplashPage();

      expect(screen.getByText(/No Context Switching:/i)).toBeInTheDocument();
    });

    it('should render export feature', () => {
      renderSplashPage();

      expect(screen.getByText(/Export Ready \(Pro\):/i)).toBeInTheDocument();
    });
  });

  describe('Complex Storytelling Section', () => {
    it('should render complex storytelling section', () => {
      renderSplashPage();

      expect(screen.getByRole('heading', { name: /perfect for complex storytelling/i })).toBeInTheDocument();
    });

    it('should render storytelling benefits list', () => {
      renderSplashPage();

      expect(screen.getByText(/Track multiple character arcs/i)).toBeInTheDocument();
      expect(screen.getByText(/Never forget what a place looks like/i)).toBeInTheDocument();
      expect(screen.getByText(/Maintain consistency in names/i)).toBeInTheDocument();
    });

    it('should render writer desk image', () => {
      renderSplashPage();

      const image = screen.getByAltText('Writer organizing story elements');
      expect(image).toBeInTheDocument();
      expect(image).toHaveAttribute('src', './img/writerdesk.jpg');
    });
  });

  describe('FAQ Section', () => {
    it('should render FAQ section', () => {
      renderSplashPage();

      expect(screen.getByRole('heading', { name: /frequently asked questions/i })).toBeInTheDocument();
    });

    it('should render free plan question', () => {
      renderSplashPage();

      expect(screen.getByRole('heading', { name: /is there a free plan\?/i })).toBeInTheDocument();
    });

    it('should render pro features question', () => {
      renderSplashPage();

      expect(screen.getByRole('heading', { name: /what do i get with pro\?/i })).toBeInTheDocument();
    });

    it('should render export question', () => {
      renderSplashPage();

      expect(screen.getByRole('heading', { name: /can i export my work\?/i })).toBeInTheDocument();
    });

    it('should render ownership question', () => {
      renderSplashPage();

      expect(screen.getByRole('heading', { name: /do i own my content\?/i })).toBeInTheDocument();
    });

    it('should render FAQ answers', () => {
      renderSplashPage();

      expect(screen.getByText(/Yes! Free accounts get unlimited stories/i)).toBeInTheDocument();
      expect(screen.getByText(/Pro members \(\$5\/month\) get unlimited/i)).toBeInTheDocument();
      expect(screen.getByText(/Absolutely. You own 100% of everything you write/i)).toBeInTheDocument();
    });
  });

  describe('Demo Section', () => {
    it('should render demo component', () => {
      renderSplashPage();

      expect(screen.getByTestId('thread-writer-demo')).toBeInTheDocument();
    });

    it('should render demo attribution', () => {
      renderSplashPage();

      expect(screen.getByText(/Demo text from/i)).toBeInTheDocument();
    });

    it('should render demo book link', () => {
      renderSplashPage();

      const link = screen.getByRole('link', { name: /the remnants: dead loss/i });
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute('href', 'https://www.amazon.com/Remnants-Dead-Loss-Jonathan-Face-ebook/dp/B071V6BV9J');
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    });
  });

  describe('Final CTA Section', () => {
    it('should render final CTA heading', () => {
      renderSplashPage();

      expect(screen.getByRole('heading', { name: /ready to organize your story\?/i })).toBeInTheDocument();
    });

    it('should render final CTA description', () => {
      renderSplashPage();

      expect(screen.getByText(/Join writers who keep their characters, places, and events organized/i)).toBeInTheDocument();
    });

    it('should render no credit card message', () => {
      renderSplashPage();

      expect(screen.getByText(/No credit card required • Free forever/i)).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have proper heading hierarchy', () => {
      renderSplashPage();

      const h1 = screen.getByRole('heading', { level: 1 });
      expect(h1).toBeInTheDocument();

      const h2s = screen.getAllByRole('heading', { level: 2 });
      expect(h2s.length).toBeGreaterThan(0);

      const h3s = screen.getAllByRole('heading', { level: 3 });
      expect(h3s.length).toBeGreaterThan(0);
    });

    it('should have accessible buttons', () => {
      renderSplashPage();

      const buttons = screen.getAllByRole('button');
      buttons.forEach(button => {
        expect(button).toHaveAccessibleName();
      });
    });

    it('should have accessible links', () => {
      renderSplashPage();

      const link = screen.getByRole('link', { name: /the remnants: dead loss/i });
      expect(link).toHaveAccessibleName();
    });

    it('should have alt text for images', () => {
      renderSplashPage();

      const image = screen.getByAltText('Writer organizing story elements');
      expect(image).toBeInTheDocument();
    });
  });

  describe('Content Completeness', () => {
    it('should render all major sections', () => {
      renderSplashPage();

      // Hero
      expect(screen.getByText(/The Writing Platform That Keeps Your Story Organized/i)).toBeInTheDocument();

      // Demo
      expect(screen.getByTestId('thread-writer-demo')).toBeInTheDocument();

      // How it Works
      expect(screen.getByRole('heading', { name: /how it works/i })).toBeInTheDocument();

      // Features
      expect(screen.getByRole('heading', { name: /write smarter, not harder/i })).toBeInTheDocument();

      // Complex Storytelling
      expect(screen.getByRole('heading', { name: /perfect for complex storytelling/i })).toBeInTheDocument();

      // FAQ
      expect(screen.getByRole('heading', { name: /frequently asked questions/i })).toBeInTheDocument();

      // Final CTA
      expect(screen.getByRole('heading', { name: /ready to organize your story\?/i })).toBeInTheDocument();
    });
  });
});
