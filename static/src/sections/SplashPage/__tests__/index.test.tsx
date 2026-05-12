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
      expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    });

    it('should render hero section with title', () => {
      renderSplashPage();

      const heroTitle = screen.getByRole('heading', { level: 1 });
      expect(heroTitle).toHaveTextContent(/Your Characters Remember Everything/i);
    });

    it('should render hero subtitle', () => {
      renderSplashPage();

      expect(screen.getByText(/Threadr embeds your characters, places, and events directly into your manuscript/i)).toBeInTheDocument();
    });

    it('should render primary CTA buttons', () => {
      renderSplashPage();

      const ctaButtons = screen.getAllByRole('button', { name: /try now/i });
      expect(ctaButtons.length).toBeGreaterThanOrEqual(1);
    });

    it('should render demo section', () => {
      renderSplashPage();

      expect(screen.getByTestId('thread-writer-demo')).toBeInTheDocument();
    });

    it('should render demo instructions', () => {
      renderSplashPage();

      expect(screen.getByText(/See It in Action/i)).toBeInTheDocument();
    });
  });

  describe('Navigation', () => {
    it('should navigate to /try when primary CTA clicked', async () => {
      const user = userEvent.setup();
      renderSplashPage();

      const ctaButton = screen.getAllByRole('button', { name: /try now/i })[0];
      await user.click(ctaButton);

      expect(mockNavigate).toHaveBeenCalledWith('/try');
    });

    it('should navigate to /try when final CTA clicked', async () => {
      const user = userEvent.setup();
      renderSplashPage();

      const ctaButtons = screen.getAllByRole('button', { name: /try now/i });
      const finalCTA = ctaButtons[ctaButtons.length - 1];
      await user.click(finalCTA);

      expect(mockNavigate).toHaveBeenCalledWith('/try');
    });

    it('should have multiple Try Now CTA buttons that all navigate to /try', async () => {
      const user = userEvent.setup();
      renderSplashPage();

      const ctaButtons = screen.getAllByRole('button', { name: /try now/i });
      expect(ctaButtons.length).toBeGreaterThanOrEqual(2);

      for (const button of ctaButtons) {
        await user.click(button);
      }

      expect(mockNavigate).toHaveBeenCalledWith('/try');
      expect(mockNavigate).toHaveBeenCalledTimes(ctaButtons.length);
    });

    it('should navigate to /signup when "Skip the demo" link clicked', async () => {
      const user = userEvent.setup();
      renderSplashPage();

      const skipButtons = screen.getAllByRole('button', { name: /skip the demo/i });
      expect(skipButtons.length).toBeGreaterThanOrEqual(1);
      await user.click(skipButtons[0]);

      expect(mockNavigate).toHaveBeenCalledWith('/signup');
    });
  });

  describe('How It Works Section', () => {
    it('should render "How It Works" section', () => {
      renderSplashPage();

      expect(screen.getByRole('heading', { name: /Three Steps to a Linked Manuscript/i })).toBeInTheDocument();
    });

    it('should render three steps', () => {
      renderSplashPage();

      expect(screen.getByRole('heading', { name: /^Write$/i })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: /^Link$/i })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: /^Recall$/i })).toBeInTheDocument();
    });

    it('should render step descriptions', () => {
      renderSplashPage();

      expect(screen.getByText(/Draft chapters in a clean editor built for long-form fiction/i)).toBeInTheDocument();
      expect(screen.getByText(/Highlight a character's name, a location, or a pivotal event/i)).toBeInTheDocument();
      expect(screen.getByText(/Click any linked reference to instantly see its full profile/i)).toBeInTheDocument();
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

      expect(screen.getByRole('heading', { name: /Built for the Long Haul/i })).toBeInTheDocument();
    });

    it('should render features intro', () => {
      renderSplashPage();

      expect(screen.getByText(/Novels grow. Characters multiply. Timelines tangle/i)).toBeInTheDocument();
    });

    it('should render inline story elements feature', () => {
      renderSplashPage();

      expect(screen.getByText(/Inline Story Elements/i)).toBeInTheDocument();
    });

    it('should render one-click recall feature', () => {
      renderSplashPage();

      expect(screen.getByText(/One-Click Recall/i)).toBeInTheDocument();
    });

    it('should render series support feature', () => {
      renderSplashPage();

      expect(screen.getByText(/Series Support/i)).toBeInTheDocument();
    });

    it('should render export feature', () => {
      renderSplashPage();

      expect(screen.getByText(/Export Your Way/i)).toBeInTheDocument();
    });
  });

  describe('FAQ Section', () => {
    it('should render FAQ section', () => {
      renderSplashPage();

      expect(screen.getByRole('heading', { name: /Common Questions/i })).toBeInTheDocument();
    });

    it('should render free plan question', () => {
      renderSplashPage();

      expect(screen.getByRole('heading', { name: /What's free\?/i })).toBeInTheDocument();
    });

    it('should render pro features question', () => {
      renderSplashPage();

      expect(screen.getByRole('heading', { name: /What does Pro add\?/i })).toBeInTheDocument();
    });

    it('should render export question', () => {
      renderSplashPage();

      expect(screen.getByRole('heading', { name: /Can I export my manuscript\?/i })).toBeInTheDocument();
    });

    it('should render ownership question', () => {
      renderSplashPage();

      expect(screen.getByRole('heading', { name: /Who owns what I write\?/i })).toBeInTheDocument();
    });

    it('should render FAQ answers', () => {
      renderSplashPage();

      expect(screen.getByText(/Unlimited stories with up to 10 story elements/i)).toBeInTheDocument();
      expect(screen.getByText(/Unlimited story elements per story, document export/i)).toBeInTheDocument();
      expect(screen.getByText(/You do. Everything you create belongs to you/i)).toBeInTheDocument();
    });
  });

  describe('Demo Section', () => {
    it('should render demo component', () => {
      renderSplashPage();

      expect(screen.getByTestId('thread-writer-demo')).toBeInTheDocument();
    });

  });

  describe('Final CTA Section', () => {
    it('should render final CTA heading', () => {
      renderSplashPage();

      expect(screen.getByRole('heading', { name: /Take It for a Spin/i })).toBeInTheDocument();
    });

    it('should render final CTA description', () => {
      renderSplashPage();

      expect(screen.getByText(/Start writing with the editor that remembers your world/i)).toBeInTheDocument();
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

    it('should have alt text for all images', () => {
      renderSplashPage();

      const images = screen.queryAllByRole('img');
      images.forEach((img) => {
        expect(img).toHaveAccessibleName();
      });
    });
  });

  describe('Content Completeness', () => {
    it('should render all major sections', () => {
      renderSplashPage();

      // Hero
      expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();

      // Demo
      expect(screen.getByTestId('thread-writer-demo')).toBeInTheDocument();

      // How it Works
      expect(screen.getByRole('heading', { name: /Three Steps to a Linked Manuscript/i })).toBeInTheDocument();

      // Features
      expect(screen.getByRole('heading', { name: /Built for the Long Haul/i })).toBeInTheDocument();

      // FAQ
      expect(screen.getByRole('heading', { name: /Common Questions/i })).toBeInTheDocument();

      // Final CTA
      expect(screen.getByRole('heading', { name: /Take It for a Spin/i })).toBeInTheDocument();
    });
  });
});
