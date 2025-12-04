import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { logger } from '../logger';

describe('logger', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let consoleDebugSpy: ReturnType<typeof vi.spyOn>;
  let consoleInfoSpy: ReturnType<typeof vi.spyOn>;
  let originalViteMode: string | undefined;

  beforeEach(() => {
    // Save original env
    originalViteMode = import.meta.env.VITE_MODE;

    // Spy on console methods
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleDebugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
  });

  afterEach(() => {
    // Restore env
    if (originalViteMode !== undefined) {
      import.meta.env.VITE_MODE = originalViteMode;
    }

    // Restore console methods
    consoleLogSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    consoleDebugSpy.mockRestore();
    consoleInfoSpy.mockRestore();
  });

  describe('Development Mode', () => {
    beforeEach(() => {
      // Set to development mode
      import.meta.env.VITE_MODE = 'development';
    });

    it('should call console.log in development', () => {
      logger.log('test message');
      expect(consoleLogSpy).toHaveBeenCalledWith('test message');
    });

    it('should call console.warn in development', () => {
      logger.warn('warning message');
      expect(consoleWarnSpy).toHaveBeenCalledWith('warning message');
    });

    it('should call console.error in development', () => {
      logger.error('error message');
      expect(consoleErrorSpy).toHaveBeenCalledWith('error message');
    });

    it('should call console.debug in development', () => {
      logger.debug('debug message');
      expect(consoleDebugSpy).toHaveBeenCalledWith('debug message');
    });

    it('should call console.info in development', () => {
      logger.info('info message');
      expect(consoleInfoSpy).toHaveBeenCalledWith('info message');
    });

    it('should handle multiple arguments', () => {
      logger.log('multiple', 'arguments', 123, { obj: 'value' });
      expect(consoleLogSpy).toHaveBeenCalledWith('multiple', 'arguments', 123, { obj: 'value' });
    });

    it('should handle objects and arrays', () => {
      const obj = { key: 'value' };
      const arr = [1, 2, 3];
      logger.log(obj, arr);
      expect(consoleLogSpy).toHaveBeenCalledWith(obj, arr);
    });
  });

  // Note: Production mode tests are not included because import.meta.env.VITE_MODE
  // is evaluated at module load time and cannot be changed during test execution.
  // Production behavior is verified through manual testing and E2E tests.

  describe('Edge Cases', () => {
    it('should handle undefined arguments', () => {
      logger.log(undefined);
      expect(consoleLogSpy).toHaveBeenCalledWith(undefined);
    });

    it('should handle null arguments', () => {
      logger.log(null);
      expect(consoleLogSpy).toHaveBeenCalledWith(null);
    });

    it('should handle empty calls', () => {
      logger.log();
      expect(consoleLogSpy).toHaveBeenCalledWith();
    });

    it('should handle error objects', () => {
      const error = new Error('test error');
      logger.error(error);
      expect(consoleErrorSpy).toHaveBeenCalledWith(error);
    });
  });
});
