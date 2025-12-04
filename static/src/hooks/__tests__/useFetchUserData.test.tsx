import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useFetchUserData } from '../useFetchUserData';
import { UserContext } from '../../contexts/user';
import type { UserDetails } from '../../types/User';
import { ReactNode } from 'react';

const mockUserDetails: UserDetails = {
  user_id: 'user-123',
  email: 'test@example.com',
  username: 'testuser',
  created: '2024-01-01T00:00:00Z',
  last_updated: '2024-01-01T00:00:00Z',
};

describe('useFetchUserData', () => {
  describe('Context Provider', () => {
    it('should return user context values when used within provider', () => {
      const mockSetIsLoggedIn = vi.fn();
      const mockSetUserDetails = vi.fn();

      const wrapper = ({ children }: { children: ReactNode }) => (
        <UserContext.Provider
          value={{
            userDetails: mockUserDetails,
            isLoggedIn: true,
            userLoading: false,
            setIsLoggedIn: mockSetIsLoggedIn,
            setUserDetails: mockSetUserDetails,
          }}
        >
          {children}
        </UserContext.Provider>
      );

      const { result } = renderHook(() => useFetchUserData(), { wrapper });

      expect(result.current.userDetails).toEqual(mockUserDetails);
      expect(result.current.isLoggedIn).toBe(true);
      expect(result.current.userLoading).toBe(false);
      expect(result.current.setIsLoggedIn).toBe(mockSetIsLoggedIn);
      expect(result.current.setUserDetails).toBe(mockSetUserDetails);
    });

    it('should throw error when used outside provider', () => {
      expect(() => {
        renderHook(() => useFetchUserData());
      }).toThrow('UserContext must be used within a UserContext.Provider');
    });

    it('should throw error with exact error message', () => {
      expect(() => {
        renderHook(() => useFetchUserData());
      }).toThrow('UserContext must be used within a UserContext.Provider');
    });
  });

  describe('User Details', () => {
    it('should return null userDetails when user is not loaded', () => {
      const wrapper = ({ children }: { children: ReactNode }) => (
        <UserContext.Provider
          value={{
            userDetails: null,
            isLoggedIn: false,
            userLoading: false,
            setIsLoggedIn: vi.fn(),
            setUserDetails: vi.fn(),
          }}
        >
          {children}
        </UserContext.Provider>
      );

      const { result } = renderHook(() => useFetchUserData(), { wrapper });

      expect(result.current.userDetails).toBeNull();
    });

    it('should return full user details when available', () => {
      const wrapper = ({ children }: { children: ReactNode }) => (
        <UserContext.Provider
          value={{
            userDetails: mockUserDetails,
            isLoggedIn: true,
            userLoading: false,
            setIsLoggedIn: vi.fn(),
            setUserDetails: vi.fn(),
          }}
        >
          {children}
        </UserContext.Provider>
      );

      const { result } = renderHook(() => useFetchUserData(), { wrapper });

      expect(result.current.userDetails?.user_id).toBe('user-123');
      expect(result.current.userDetails?.email).toBe('test@example.com');
      expect(result.current.userDetails?.username).toBe('testuser');
    });
  });

  describe('Login State', () => {
    it('should return isLoggedIn as true when user is logged in', () => {
      const wrapper = ({ children }: { children: ReactNode }) => (
        <UserContext.Provider
          value={{
            userDetails: mockUserDetails,
            isLoggedIn: true,
            userLoading: false,
            setIsLoggedIn: vi.fn(),
            setUserDetails: vi.fn(),
          }}
        >
          {children}
        </UserContext.Provider>
      );

      const { result } = renderHook(() => useFetchUserData(), { wrapper });

      expect(result.current.isLoggedIn).toBe(true);
    });

    it('should return isLoggedIn as false when user is not logged in', () => {
      const wrapper = ({ children }: { children: ReactNode }) => (
        <UserContext.Provider
          value={{
            userDetails: null,
            isLoggedIn: false,
            userLoading: false,
            setIsLoggedIn: vi.fn(),
            setUserDetails: vi.fn(),
          }}
        >
          {children}
        </UserContext.Provider>
      );

      const { result } = renderHook(() => useFetchUserData(), { wrapper });

      expect(result.current.isLoggedIn).toBe(false);
    });
  });

  describe('Loading State', () => {
    it('should return userLoading as true when user data is loading', () => {
      const wrapper = ({ children }: { children: ReactNode }) => (
        <UserContext.Provider
          value={{
            userDetails: null,
            isLoggedIn: false,
            userLoading: true,
            setIsLoggedIn: vi.fn(),
            setUserDetails: vi.fn(),
          }}
        >
          {children}
        </UserContext.Provider>
      );

      const { result } = renderHook(() => useFetchUserData(), { wrapper });

      expect(result.current.userLoading).toBe(true);
    });

    it('should return userLoading as false when user data is loaded', () => {
      const wrapper = ({ children }: { children: ReactNode }) => (
        <UserContext.Provider
          value={{
            userDetails: mockUserDetails,
            isLoggedIn: true,
            userLoading: false,
            setIsLoggedIn: vi.fn(),
            setUserDetails: vi.fn(),
          }}
        >
          {children}
        </UserContext.Provider>
      );

      const { result } = renderHook(() => useFetchUserData(), { wrapper });

      expect(result.current.userLoading).toBe(false);
    });
  });

  describe('Setter Functions', () => {
    it('should return setIsLoggedIn function', () => {
      const mockSetIsLoggedIn = vi.fn();

      const wrapper = ({ children }: { children: ReactNode }) => (
        <UserContext.Provider
          value={{
            userDetails: null,
            isLoggedIn: false,
            userLoading: false,
            setIsLoggedIn: mockSetIsLoggedIn,
            setUserDetails: vi.fn(),
          }}
        >
          {children}
        </UserContext.Provider>
      );

      const { result } = renderHook(() => useFetchUserData(), { wrapper });

      expect(result.current.setIsLoggedIn).toBe(mockSetIsLoggedIn);
      expect(typeof result.current.setIsLoggedIn).toBe('function');
    });

    it('should return setUserDetails function', () => {
      const mockSetUserDetails = vi.fn();

      const wrapper = ({ children }: { children: ReactNode }) => (
        <UserContext.Provider
          value={{
            userDetails: null,
            isLoggedIn: false,
            userLoading: false,
            setIsLoggedIn: vi.fn(),
            setUserDetails: mockSetUserDetails,
          }}
        >
          {children}
        </UserContext.Provider>
      );

      const { result } = renderHook(() => useFetchUserData(), { wrapper });

      expect(result.current.setUserDetails).toBe(mockSetUserDetails);
      expect(typeof result.current.setUserDetails).toBe('function');
    });
  });

  describe('Multiple Contexts', () => {
    it('should handle context updates correctly', () => {
      const mockSetIsLoggedIn = vi.fn();
      const mockSetUserDetails = vi.fn();

      const wrapper = ({ children }: { children: ReactNode }) => (
        <UserContext.Provider
          value={{
            userDetails: mockUserDetails,
            isLoggedIn: true,
            userLoading: false,
            setIsLoggedIn: mockSetIsLoggedIn,
            setUserDetails: mockSetUserDetails,
          }}
        >
          {children}
        </UserContext.Provider>
      );

      const { result, rerender } = renderHook(() => useFetchUserData(), { wrapper });

      expect(result.current.userDetails).toEqual(mockUserDetails);
      expect(result.current.isLoggedIn).toBe(true);

      // Rerender should maintain values
      rerender();

      expect(result.current.userDetails).toEqual(mockUserDetails);
      expect(result.current.isLoggedIn).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle user details with minimal data', () => {
      const minimalUserDetails: UserDetails = {
        user_id: 'user-123',
        email: 'test@example.com',
        username: 'test',
        created: '2024-01-01T00:00:00Z',
        last_updated: '2024-01-01T00:00:00Z',
      };

      const wrapper = ({ children }: { children: ReactNode }) => (
        <UserContext.Provider
          value={{
            userDetails: minimalUserDetails,
            isLoggedIn: true,
            userLoading: false,
            setIsLoggedIn: vi.fn(),
            setUserDetails: vi.fn(),
          }}
        >
          {children}
        </UserContext.Provider>
      );

      const { result } = renderHook(() => useFetchUserData(), { wrapper });

      expect(result.current.userDetails).toEqual(minimalUserDetails);
    });

    it('should handle transitional state (loading to loaded)', () => {
      const wrapper = ({ children }: { children: ReactNode }) => (
        <UserContext.Provider
          value={{
            userDetails: null,
            isLoggedIn: false,
            userLoading: true,
            setIsLoggedIn: vi.fn(),
            setUserDetails: vi.fn(),
          }}
        >
          {children}
        </UserContext.Provider>
      );

      const { result } = renderHook(() => useFetchUserData(), { wrapper });

      expect(result.current.userLoading).toBe(true);
      expect(result.current.userDetails).toBeNull();
      expect(result.current.isLoggedIn).toBe(false);
    });
  });
});
