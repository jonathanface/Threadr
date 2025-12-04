import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

// Mock with simpler implementations
vi.mock('@hello-pangea/dnd', () => ({
  DragDropContext: ({ children }: any) => <div data-testid="dnd-context">{children}</div>,
  Droppable: ({ children }: any) => {
    const provided = { innerRef: () => {}, droppableProps: {}, placeholder: null };
    return children(provided);
  },
  Draggable: ({ children }: any) => {
    const provided = { innerRef: () => {}, draggableProps: {}, dragHandleProps: {} };
    return children(provided, {});
  },
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useParams: () => ({ seriesID: 'test-123' }),
}));

vi.mock('../../../hooks/useLoader', () => ({
  useLoader: () => ({ showLoader: vi.fn(), hideLoader: vi.fn() }),
}));

vi.mock('../../../hooks/useToaster', () => ({
  useToaster: () => ({ setAlertState: vi.fn() }),
}));

vi.mock('../../../hooks/useSelections', () => ({
  useSelections: () => ({
    propagateSeriesUpdates: vi.fn(),
    propagateStoryUpdates: vi.fn(),
  }),
}));

vi.mock('../../../hooks/useWorksList', () => ({
  useWorksList: () => ({ storiesList: [], setStoriesList: vi.fn() }),
}));

vi.mock('../../../components/SeriesImageUpload', () => ({
  SeriesImageUpload: () => <div data-testid="image-upload">Upload</div>,
}));

vi.mock('../../../components/AddStoryModal', () => ({
  AddStoryModal: () => <div data-testid="add-modal">Modal</div>,
}));

vi.mock('../../../api', () => ({
  api: {
    get: vi.fn(() => Promise.resolve({
      data: {
        series_id: 'test-123',
        series_title: 'Test',
        series_description: 'Desc',
        stories: [],
      },
    })),
    put: vi.fn(() => Promise.resolve({ data: {} })),
  },
}));

import { EditSeries } from '../index';

describe('Minimal Render Test', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render EditSeries', () => {
    const { container } = render(<EditSeries />);
    expect(container).toBeDefined();
  });
});
