export const MAX_SOURCE_LENGTH = 50_000;
export const MAX_SOURCE_BYTES = 100_000;
export const DEFAULT_TIMEOUT_MS = 5_000;
export const MAX_TIMEOUT_MS = 30_000;
export const MAX_CONCURRENCY = 2;
export const RESOURCE_LIMITS = Object.freeze({
  maxOldGenerationSizeMb: 128, maxYoungGenerationSizeMb: 16, stackSizeMb: 4,
});
export const failure = (kind, message) => ({ valid: false, error: { kind, message } });
