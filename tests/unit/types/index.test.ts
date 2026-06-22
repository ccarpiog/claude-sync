import { describe, it, expect } from 'vitest';
import { ClaudeSyncError, ErrorCode } from '../../../src/types/index.js';

describe('ClaudeSyncError', () => {
  it('should create error with message and code', () => {
    const error = new ClaudeSyncError(
      'Test error message',
      ErrorCode.NOT_INITIALIZED
    );

    expect(error.message).toBe('Test error message');
    expect(error.code).toBe(ErrorCode.NOT_INITIALIZED);
    expect(error.suggestion).toBeUndefined();
    expect(error.name).toBe('ClaudeSyncError');
    expect(error instanceof Error).toBe(true);
  });

  it('should create error with message, code, and suggestion', () => {
    const error = new ClaudeSyncError(
      'Test error message',
      ErrorCode.NOT_INITIALIZED,
      'Run claude-sync init first'
    );

    expect(error.message).toBe('Test error message');
    expect(error.code).toBe(ErrorCode.NOT_INITIALIZED);
    expect(error.suggestion).toBe('Run claude-sync init first');
  });

  it('should have correct error codes enum', () => {
    expect(ErrorCode.NOT_INITIALIZED).toBe('NOT_INITIALIZED');
    expect(ErrorCode.NOT_GIT_REPO).toBe('NOT_GIT_REPO');
    expect(ErrorCode.NO_REMOTE).toBe('NO_REMOTE');
    expect(ErrorCode.MERGE_CONFLICT).toBe('MERGE_CONFLICT');
    expect(ErrorCode.PERMISSION_DENIED).toBe('PERMISSION_DENIED');
    expect(ErrorCode.NETWORK_ERROR).toBe('NETWORK_ERROR');
    expect(ErrorCode.INVALID_CONFIG).toBe('INVALID_CONFIG');
    expect(ErrorCode.UNSUPPORTED_PLATFORM).toBe('UNSUPPORTED_PLATFORM');
    expect(ErrorCode.ALREADY_EXISTS).toBe('ALREADY_EXISTS');
    expect(ErrorCode.CLONE_FAILED).toBe('CLONE_FAILED');
  });

  it('should maintain stack trace', () => {
    const error = new ClaudeSyncError(
      'Test error',
      ErrorCode.NOT_INITIALIZED
    );

    expect(error.stack).toBeDefined();
    expect(error.stack).toContain('ClaudeSyncError');
  });
});
