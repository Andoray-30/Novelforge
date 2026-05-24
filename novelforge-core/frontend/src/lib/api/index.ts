export { APIClient, APIError, isAPIError } from './client';
export * from './novelforge-api';
export { SillyTavernAPI } from './sillytavern';

// Legacy API aliases.
import {
  aiService,
  workflowService,
  novelforgeClient
} from './novelforge-api';

export const aiAPI = aiService;
export const workflowAPI = workflowService;
export const novelforgeAPI = novelforgeClient;
