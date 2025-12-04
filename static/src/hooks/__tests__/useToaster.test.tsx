import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useToaster } from '../useToaster';
import { AlertContext } from '../../contexts/alert';
import { AlertState, AlertCommandType } from '../../types/AlertToasts';
import { ReactNode } from 'react';

// Mock react-router-dom
const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

const baseAlertState: AlertState = {
  open: false,
  severity: 'info',
  message: '',
  title: '',
};

describe('useToaster', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Context Provider', () => {
    it('should throw error when used outside provider', () => {
      expect(() => {
        renderHook(() => useToaster());
      }).toThrow('alertContext must be used within an AlertProvider');
    });

    it('should return alert context values when used within provider', () => {
      const mockClearAlert = vi.fn();
      const mockSetAlertState = vi.fn();

      const wrapper = ({ children }: { children: ReactNode }) => (
        <AlertContext.Provider
          value={{
            alertState: baseAlertState,
            clearAlert: mockClearAlert,
            setAlertState: mockSetAlertState,
          }}
        >
          {children}
        </AlertContext.Provider>
      );

      const { result } = renderHook(() => useToaster(), { wrapper });

      expect(result.current.alertState).toEqual(baseAlertState);
      expect(result.current.clearAlert).toBe(mockClearAlert);
      expect(result.current.setAlertState).toBe(mockSetAlertState);
    });
  });

  describe('alertState', () => {
    it('should return alertState with message', () => {
      const alertState: AlertState = {
        ...baseAlertState,
        open: true,
        message: 'Test message',
        severity: 'success',
      };

      const wrapper = ({ children }: { children: ReactNode }) => (
        <AlertContext.Provider
          value={{
            alertState,
            clearAlert: vi.fn(),
            setAlertState: vi.fn(),
          }}
        >
          {children}
        </AlertContext.Provider>
      );

      const { result } = renderHook(() => useToaster(), { wrapper });

      expect(result.current.alertState.message).toBe('Test message');
      expect(result.current.alertState.severity).toBe('success');
      expect(result.current.alertState.open).toBe(true);
    });

    it('should return alertState with title', () => {
      const alertState: AlertState = {
        ...baseAlertState,
        title: 'Test Title',
      };

      const wrapper = ({ children }: { children: ReactNode }) => (
        <AlertContext.Provider
          value={{
            alertState,
            clearAlert: vi.fn(),
            setAlertState: vi.fn(),
          }}
        >
          {children}
        </AlertContext.Provider>
      );

      const { result } = renderHook(() => useToaster(), { wrapper });

      expect(result.current.alertState.title).toBe('Test Title');
    });

    it('should handle different severity levels', () => {
      const severities = ['success', 'info', 'warning', 'error'];

      severities.forEach((severity) => {
        const alertState: AlertState = {
          ...baseAlertState,
          severity,
        };

        const wrapper = ({ children }: { children: ReactNode }) => (
          <AlertContext.Provider
            value={{
              alertState,
              clearAlert: vi.fn(),
              setAlertState: vi.fn(),
            }}
          >
            {children}
          </AlertContext.Provider>
        );

        const { result } = renderHook(() => useToaster(), { wrapper });

        expect(result.current.alertState.severity).toBe(severity);
      });
    });
  });

  describe('clearAlert', () => {
    it('should call clearAlert when invoked', () => {
      const mockClearAlert = vi.fn();

      const wrapper = ({ children }: { children: ReactNode }) => (
        <AlertContext.Provider
          value={{
            alertState: baseAlertState,
            clearAlert: mockClearAlert,
            setAlertState: vi.fn(),
          }}
        >
          {children}
        </AlertContext.Provider>
      );

      const { result } = renderHook(() => useToaster(), { wrapper });

      act(() => {
        result.current.clearAlert();
      });

      expect(mockClearAlert).toHaveBeenCalledTimes(1);
    });
  });

  describe('setAlertState', () => {
    it('should call setAlertState when invoked', () => {
      const mockSetAlertState = vi.fn();
      const newAlertState: AlertState = {
        ...baseAlertState,
        open: true,
        message: 'New message',
      };

      const wrapper = ({ children }: { children: ReactNode }) => (
        <AlertContext.Provider
          value={{
            alertState: baseAlertState,
            clearAlert: vi.fn(),
            setAlertState: mockSetAlertState,
          }}
        >
          {children}
        </AlertContext.Provider>
      );

      const { result } = renderHook(() => useToaster(), { wrapper });

      act(() => {
        result.current.setAlertState(newAlertState);
      });

      expect(mockSetAlertState).toHaveBeenCalledWith(newAlertState);
    });
  });

  describe('handleFunc - Subscribe Callback', () => {
    it('should navigate to /subscribe when callback type is subscribe', () => {
      const alertState: AlertState = {
        ...baseAlertState,
        callback: {
          type: AlertCommandType.subscribe,
          text: 'Subscribe now',
        },
      };

      const wrapper = ({ children }: { children: ReactNode }) => (
        <AlertContext.Provider
          value={{
            alertState,
            clearAlert: vi.fn(),
            setAlertState: vi.fn(),
          }}
        >
          {children}
        </AlertContext.Provider>
      );

      const { result } = renderHook(() => useToaster(), { wrapper });

      act(() => {
        result.current.handleFunc();
      });

      expect(mockNavigate).toHaveBeenCalledWith('/subscribe');
    });
  });

  describe('handleFunc - Renew Callback', () => {
    it('should navigate to /settings when callback type is renew', () => {
      const alertState: AlertState = {
        ...baseAlertState,
        callback: {
          type: AlertCommandType.renew,
          text: 'Renew subscription',
        },
      };

      const wrapper = ({ children }: { children: ReactNode }) => (
        <AlertContext.Provider
          value={{
            alertState,
            clearAlert: vi.fn(),
            setAlertState: vi.fn(),
          }}
        >
          {children}
        </AlertContext.Provider>
      );

      const { result } = renderHook(() => useToaster(), { wrapper });

      act(() => {
        result.current.handleFunc();
      });

      expect(mockNavigate).toHaveBeenCalledWith('/settings');
    });
  });

  describe('handleFunc - No Callback', () => {
    it('should not navigate when no callback is present', () => {
      const alertState: AlertState = {
        ...baseAlertState,
        callback: undefined,
      };

      const wrapper = ({ children }: { children: ReactNode }) => (
        <AlertContext.Provider
          value={{
            alertState,
            clearAlert: vi.fn(),
            setAlertState: vi.fn(),
          }}
        >
          {children}
        </AlertContext.Provider>
      );

      const { result } = renderHook(() => useToaster(), { wrapper });

      act(() => {
        result.current.handleFunc();
      });

      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('should not navigate when alertState is null', () => {
      const wrapper = ({ children }: { children: ReactNode }) => (
        <AlertContext.Provider
          value={{
            alertState: null as any,
            clearAlert: vi.fn(),
            setAlertState: vi.fn(),
          }}
        >
          {children}
        </AlertContext.Provider>
      );

      const { result } = renderHook(() => useToaster(), { wrapper });

      act(() => {
        result.current.handleFunc();
      });

      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });

  describe('handleFunc - Multiple Calls', () => {
    it('should navigate correctly on multiple calls with subscribe', () => {
      const alertState: AlertState = {
        ...baseAlertState,
        callback: {
          type: AlertCommandType.subscribe,
          text: 'Subscribe',
        },
      };

      const wrapper = ({ children }: { children: ReactNode }) => (
        <AlertContext.Provider
          value={{
            alertState,
            clearAlert: vi.fn(),
            setAlertState: vi.fn(),
          }}
        >
          {children}
        </AlertContext.Provider>
      );

      const { result } = renderHook(() => useToaster(), { wrapper });

      act(() => {
        result.current.handleFunc();
      });

      expect(mockNavigate).toHaveBeenCalledWith('/subscribe');
      expect(mockNavigate).toHaveBeenCalledTimes(1);

      act(() => {
        result.current.handleFunc();
      });

      expect(mockNavigate).toHaveBeenCalledTimes(2);
      expect(mockNavigate).toHaveBeenLastCalledWith('/subscribe');
    });

    it('should navigate correctly on multiple calls with renew', () => {
      const alertState: AlertState = {
        ...baseAlertState,
        callback: {
          type: AlertCommandType.renew,
          text: 'Renew',
        },
      };

      const wrapper = ({ children }: { children: ReactNode }) => (
        <AlertContext.Provider
          value={{
            alertState,
            clearAlert: vi.fn(),
            setAlertState: vi.fn(),
          }}
        >
          {children}
        </AlertContext.Provider>
      );

      const { result } = renderHook(() => useToaster(), { wrapper });

      act(() => {
        result.current.handleFunc();
      });

      expect(mockNavigate).toHaveBeenCalledWith('/settings');
      expect(mockNavigate).toHaveBeenCalledTimes(1);
    });
  });

  describe('Alert Links', () => {
    it('should handle alertState with link', () => {
      const alertState: AlertState = {
        ...baseAlertState,
        link: {
          url: 'https://example.com',
          text: 'Click here',
        },
      };

      const wrapper = ({ children }: { children: ReactNode }) => (
        <AlertContext.Provider
          value={{
            alertState,
            clearAlert: vi.fn(),
            setAlertState: vi.fn(),
          }}
        >
          {children}
        </AlertContext.Provider>
      );

      const { result } = renderHook(() => useToaster(), { wrapper });

      expect(result.current.alertState.link).toEqual({
        url: 'https://example.com',
        text: 'Click here',
      });
    });
  });

  describe('Alert Timeout', () => {
    it('should handle alertState with timeout', () => {
      const alertState: AlertState = {
        ...baseAlertState,
        timeout: 5000,
      };

      const wrapper = ({ children }: { children: ReactNode }) => (
        <AlertContext.Provider
          value={{
            alertState,
            clearAlert: vi.fn(),
            setAlertState: vi.fn(),
          }}
        >
          {children}
        </AlertContext.Provider>
      );

      const { result } = renderHook(() => useToaster(), { wrapper });

      expect(result.current.alertState.timeout).toBe(5000);
    });

    it('should handle alertState with null timeout', () => {
      const alertState: AlertState = {
        ...baseAlertState,
        timeout: null,
      };

      const wrapper = ({ children }: { children: ReactNode }) => (
        <AlertContext.Provider
          value={{
            alertState,
            clearAlert: vi.fn(),
            setAlertState: vi.fn(),
          }}
        >
          {children}
        </AlertContext.Provider>
      );

      const { result } = renderHook(() => useToaster(), { wrapper });

      expect(result.current.alertState.timeout).toBeNull();
    });
  });

  describe('Alert Origin', () => {
    it('should handle alertState with origin', () => {
      const alertState: AlertState = {
        ...baseAlertState,
        origin: {
          vertical: 'top',
          horizontal: 'center',
        },
      };

      const wrapper = ({ children }: { children: ReactNode }) => (
        <AlertContext.Provider
          value={{
            alertState,
            clearAlert: vi.fn(),
            setAlertState: vi.fn(),
          }}
        >
          {children}
        </AlertContext.Provider>
      );

      const { result } = renderHook(() => useToaster(), { wrapper });

      expect(result.current.alertState.origin).toEqual({
        vertical: 'top',
        horizontal: 'center',
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty message', () => {
      const alertState: AlertState = {
        ...baseAlertState,
        message: '',
      };

      const wrapper = ({ children }: { children: ReactNode }) => (
        <AlertContext.Provider
          value={{
            alertState,
            clearAlert: vi.fn(),
            setAlertState: vi.fn(),
          }}
        >
          {children}
        </AlertContext.Provider>
      );

      const { result } = renderHook(() => useToaster(), { wrapper });

      expect(result.current.alertState.message).toBe('');
    });

    it('should handle long messages', () => {
      const longMessage = 'A'.repeat(1000);
      const alertState: AlertState = {
        ...baseAlertState,
        message: longMessage,
      };

      const wrapper = ({ children }: { children: ReactNode }) => (
        <AlertContext.Provider
          value={{
            alertState,
            clearAlert: vi.fn(),
            setAlertState: vi.fn(),
          }}
        >
          {children}
        </AlertContext.Provider>
      );

      const { result } = renderHook(() => useToaster(), { wrapper });

      expect(result.current.alertState.message).toBe(longMessage);
    });

    it('should handle special characters in message', () => {
      const specialMessage = 'Test & Message <script>alert("xss")</script>';
      const alertState: AlertState = {
        ...baseAlertState,
        message: specialMessage,
      };

      const wrapper = ({ children }: { children: ReactNode }) => (
        <AlertContext.Provider
          value={{
            alertState,
            clearAlert: vi.fn(),
            setAlertState: vi.fn(),
          }}
        >
          {children}
        </AlertContext.Provider>
      );

      const { result } = renderHook(() => useToaster(), { wrapper });

      expect(result.current.alertState.message).toBe(specialMessage);
    });
  });
});
