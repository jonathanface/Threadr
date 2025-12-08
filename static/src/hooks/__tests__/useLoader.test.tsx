import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useLoader } from '../useLoader';
import { LoaderContext } from '../../contexts/loader';
import { ReactNode } from 'react';

describe('useLoader', () => {
  describe('Context Provider', () => {
    it('should return loader context values when used within provider', () => {
      const mockHideLoader = vi.fn();
      const mockShowLoader = vi.fn();

      const wrapper = ({ children }: { children: ReactNode }) => (
        <LoaderContext.Provider
          value={{
            hideLoader: mockHideLoader,
            showLoader: mockShowLoader,
            loadingCount: 0,
          }}
        >
          {children}
        </LoaderContext.Provider>
      );

      const { result } = renderHook(() => useLoader(), { wrapper });

      expect(result.current.hideLoader).toBe(mockHideLoader);
      expect(result.current.showLoader).toBe(mockShowLoader);
      expect(result.current.loadingCount).toBe(0);
    });

    it('should throw error when used outside provider', () => {
      expect(() => {
        renderHook(() => useLoader());
      }).toThrow('useLoader must be used within a LoaderProvider');
    });

    it('should throw error with exact error message', () => {
      expect(() => {
        renderHook(() => useLoader());
      }).toThrow('useLoader must be used within a LoaderProvider');
    });
  });

  describe('hideLoader Function', () => {
    it('should return hideLoader function', () => {
      const mockHideLoader = vi.fn();

      const wrapper = ({ children }: { children: ReactNode }) => (
        <LoaderContext.Provider
          value={{
            hideLoader: mockHideLoader,
            showLoader: vi.fn(),
            loadingCount: 0,
          }}
        >
          {children}
        </LoaderContext.Provider>
      );

      const { result } = renderHook(() => useLoader(), { wrapper });

      expect(result.current.hideLoader).toBe(mockHideLoader);
      expect(typeof result.current.hideLoader).toBe('function');
    });

    it('should be callable', () => {
      const mockHideLoader = vi.fn();

      const wrapper = ({ children }: { children: ReactNode }) => (
        <LoaderContext.Provider
          value={{
            hideLoader: mockHideLoader,
            showLoader: vi.fn(),
            loadingCount: 1,
          }}
        >
          {children}
        </LoaderContext.Provider>
      );

      const { result } = renderHook(() => useLoader(), { wrapper });

      result.current.hideLoader();

      expect(mockHideLoader).toHaveBeenCalledTimes(1);
    });
  });

  describe('showLoader Function', () => {
    it('should return showLoader function', () => {
      const mockShowLoader = vi.fn();

      const wrapper = ({ children }: { children: ReactNode }) => (
        <LoaderContext.Provider
          value={{
            hideLoader: vi.fn(),
            showLoader: mockShowLoader,
            loadingCount: 0,
          }}
        >
          {children}
        </LoaderContext.Provider>
      );

      const { result } = renderHook(() => useLoader(), { wrapper });

      expect(result.current.showLoader).toBe(mockShowLoader);
      expect(typeof result.current.showLoader).toBe('function');
    });

    it('should be callable', () => {
      const mockShowLoader = vi.fn();

      const wrapper = ({ children }: { children: ReactNode }) => (
        <LoaderContext.Provider
          value={{
            hideLoader: vi.fn(),
            showLoader: mockShowLoader,
            loadingCount: 0,
          }}
        >
          {children}
        </LoaderContext.Provider>
      );

      const { result } = renderHook(() => useLoader(), { wrapper });

      result.current.showLoader();

      expect(mockShowLoader).toHaveBeenCalledTimes(1);
    });
  });

  describe('loadingCount', () => {
    it('should return 0 when no loaders are active', () => {
      const wrapper = ({ children }: { children: ReactNode }) => (
        <LoaderContext.Provider
          value={{
            hideLoader: vi.fn(),
            showLoader: vi.fn(),
            loadingCount: 0,
          }}
        >
          {children}
        </LoaderContext.Provider>
      );

      const { result } = renderHook(() => useLoader(), { wrapper });

      expect(result.current.loadingCount).toBe(0);
    });

    it('should return 1 when one loader is active', () => {
      const wrapper = ({ children }: { children: ReactNode }) => (
        <LoaderContext.Provider
          value={{
            hideLoader: vi.fn(),
            showLoader: vi.fn(),
            loadingCount: 1,
          }}
        >
          {children}
        </LoaderContext.Provider>
      );

      const { result } = renderHook(() => useLoader(), { wrapper });

      expect(result.current.loadingCount).toBe(1);
    });

    it('should return higher counts for multiple loaders', () => {
      const wrapper = ({ children }: { children: ReactNode }) => (
        <LoaderContext.Provider
          value={{
            hideLoader: vi.fn(),
            showLoader: vi.fn(),
            loadingCount: 5,
          }}
        >
          {children}
        </LoaderContext.Provider>
      );

      const { result } = renderHook(() => useLoader(), { wrapper });

      expect(result.current.loadingCount).toBe(5);
    });

    it('should be a number type', () => {
      const wrapper = ({ children }: { children: ReactNode }) => (
        <LoaderContext.Provider
          value={{
            hideLoader: vi.fn(),
            showLoader: vi.fn(),
            loadingCount: 3,
          }}
        >
          {children}
        </LoaderContext.Provider>
      );

      const { result } = renderHook(() => useLoader(), { wrapper });

      expect(typeof result.current.loadingCount).toBe('number');
    });
  });

  describe('Multiple Function Calls', () => {
    it('should allow calling showLoader multiple times', () => {
      const mockShowLoader = vi.fn();

      const wrapper = ({ children }: { children: ReactNode }) => (
        <LoaderContext.Provider
          value={{
            hideLoader: vi.fn(),
            showLoader: mockShowLoader,
            loadingCount: 0,
          }}
        >
          {children}
        </LoaderContext.Provider>
      );

      const { result } = renderHook(() => useLoader(), { wrapper });

      result.current.showLoader();
      result.current.showLoader();
      result.current.showLoader();

      expect(mockShowLoader).toHaveBeenCalledTimes(3);
    });

    it('should allow calling hideLoader multiple times', () => {
      const mockHideLoader = vi.fn();

      const wrapper = ({ children }: { children: ReactNode }) => (
        <LoaderContext.Provider
          value={{
            hideLoader: mockHideLoader,
            showLoader: vi.fn(),
            loadingCount: 3,
          }}
        >
          {children}
        </LoaderContext.Provider>
      );

      const { result } = renderHook(() => useLoader(), { wrapper });

      result.current.hideLoader();
      result.current.hideLoader();
      result.current.hideLoader();

      expect(mockHideLoader).toHaveBeenCalledTimes(3);
    });

    it('should allow alternating show and hide calls', () => {
      const mockShowLoader = vi.fn();
      const mockHideLoader = vi.fn();

      const wrapper = ({ children }: { children: ReactNode }) => (
        <LoaderContext.Provider
          value={{
            hideLoader: mockHideLoader,
            showLoader: mockShowLoader,
            loadingCount: 1,
          }}
        >
          {children}
        </LoaderContext.Provider>
      );

      const { result } = renderHook(() => useLoader(), { wrapper });

      result.current.showLoader();
      result.current.hideLoader();
      result.current.showLoader();
      result.current.hideLoader();

      expect(mockShowLoader).toHaveBeenCalledTimes(2);
      expect(mockHideLoader).toHaveBeenCalledTimes(2);
    });
  });

  describe('Context Updates', () => {
    it('should handle context updates correctly', () => {
      const mockShowLoader = vi.fn();
      const mockHideLoader = vi.fn();

      const wrapper = ({ children }: { children: ReactNode }) => (
        <LoaderContext.Provider
          value={{
            hideLoader: mockHideLoader,
            showLoader: mockShowLoader,
            loadingCount: 0,
          }}
        >
          {children}
        </LoaderContext.Provider>
      );

      const { result, rerender } = renderHook(() => useLoader(), { wrapper });

      expect(result.current.loadingCount).toBe(0);

      // Rerender should maintain values
      rerender();

      expect(result.current.loadingCount).toBe(0);
      expect(result.current.showLoader).toBe(mockShowLoader);
      expect(result.current.hideLoader).toBe(mockHideLoader);
    });
  });

  describe('Type Safety', () => {
    it('should return LoaderContextType', () => {
      const mockHideLoader = vi.fn();
      const mockShowLoader = vi.fn();

      const wrapper = ({ children }: { children: ReactNode }) => (
        <LoaderContext.Provider
          value={{
            hideLoader: mockHideLoader,
            showLoader: mockShowLoader,
            loadingCount: 0,
          }}
        >
          {children}
        </LoaderContext.Provider>
      );

      const { result } = renderHook(() => useLoader(), { wrapper });

      // Check that result has all required properties
      expect(result.current).toHaveProperty('hideLoader');
      expect(result.current).toHaveProperty('showLoader');
      expect(result.current).toHaveProperty('loadingCount');
    });

    it('should have exactly three properties', () => {
      const wrapper = ({ children }: { children: ReactNode }) => (
        <LoaderContext.Provider
          value={{
            hideLoader: vi.fn(),
            showLoader: vi.fn(),
            loadingCount: 0,
          }}
        >
          {children}
        </LoaderContext.Provider>
      );

      const { result } = renderHook(() => useLoader(), { wrapper });

      expect(Object.keys(result.current)).toHaveLength(3);
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero loading count', () => {
      const wrapper = ({ children }: { children: ReactNode }) => (
        <LoaderContext.Provider
          value={{
            hideLoader: vi.fn(),
            showLoader: vi.fn(),
            loadingCount: 0,
          }}
        >
          {children}
        </LoaderContext.Provider>
      );

      const { result } = renderHook(() => useLoader(), { wrapper });

      expect(result.current.loadingCount).toBe(0);
    });

    it('should handle large loading counts', () => {
      const wrapper = ({ children }: { children: ReactNode }) => (
        <LoaderContext.Provider
          value={{
            hideLoader: vi.fn(),
            showLoader: vi.fn(),
            loadingCount: 999,
          }}
        >
          {children}
        </LoaderContext.Provider>
      );

      const { result } = renderHook(() => useLoader(), { wrapper });

      expect(result.current.loadingCount).toBe(999);
    });
  });
});
