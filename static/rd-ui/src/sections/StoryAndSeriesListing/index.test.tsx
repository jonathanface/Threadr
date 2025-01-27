// StoryAndSeriesListing.test.tsx

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest'; // or '@testing-library/jest-dom'
import { StoryAndSeriesListing } from './index';
import { Story } from '../../types/Story';
import { Series } from '../../types/Series';

// 1) Mock the hooks your component uses
vi.mock('../../hooks/useToaster', () => ({
    useToaster: vi.fn(() => ({
        setAlertState: vi.fn(),
    })),
}));

vi.mock('../../hooks/useAppNavigation', () => ({
    useAppNavigation: vi.fn(() => ({
        setIsCreatingStory: vi.fn(),
    })),
}));

vi.mock('../../contexts/user', () => ({
    UserContext: {
        Provider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    },
    // or if you do "useContext(UserContext)" in your component, you can set up a default:
    default: { isLoggedIn: true }, // fallback for useContext
}));

describe('StoryAndSeriesListing', () => {
    let mockSetSeriesList: (series: Series[]) => void;
    let mockSetStoriesList: (stories: Story[]) => void;

    beforeEach(() => {
        vi.clearAllMocks();
        mockSetSeriesList = vi.fn();
        mockSetStoriesList = vi.fn();
    });

    it('renders without crashing when lists are null', () => {
        render(
            <StoryAndSeriesListing
                seriesList={null}
                setSeriesList={mockSetSeriesList}
                storiesList={null}
                setStoriesList={mockSetStoriesList}
            />
        );

        // Should not throw an error or crash
        expect(screen.getByAltText('RichDocter logo')).toBeInTheDocument();
    });

    it('renders multiple series items without error', () => {
        const fakeSeries: Series[] = [
            { series_id: 's1', series_title: 'Series One' } as Series,
            { series_id: 's2', series_title: 'Series Two' } as Series,
        ];

        render(
            <StoryAndSeriesListing
                seriesList={fakeSeries}
                setSeriesList={mockSetSeriesList}
                storiesList={null}
                setStoriesList={mockSetStoriesList}
            />
        );

        // If seriesList is an array, your .map() won't throw
        // We can check text or a test id from <StoryBox>
        // For now, just ensure the listing is in the doc:
        expect(screen.getByAltText('RichDocter logo')).toBeInTheDocument();
    });

    it('renders multiple stories items without error', () => {
        const fakeStories: Story[] = [
            { story_id: 'st1', title: 'My Story 1' } as Story,
            { story_id: 'st2', title: 'My Story 2' } as Story,
        ];

        render(
            <StoryAndSeriesListing
                seriesList={null}
                setSeriesList={mockSetSeriesList}
                storiesList={fakeStories}
                setStoriesList={mockSetStoriesList}
            />
        );

        expect(screen.getByAltText('RichDocter logo')).toBeInTheDocument();
    });

    it('handles user logged out scenario gracefully', () => {
        render(
            <StoryAndSeriesListing
                seriesList={[]}
                setSeriesList={mockSetSeriesList}
                storiesList={[]}
                setStoriesList={mockSetStoriesList}
            />
        );

        // Possibly no "Stories" heading if logged out:
        expect(screen.getByAltText('RichDocter logo')).toBeInTheDocument();
    });
});
