// Main agents module - exports all agent-related functionality
export * from './types';
export * from './config';
export * from './registry';
export * from './lib/permissions';
export * from './lib/base';

// Export query functions
export * as queries from './queries';

// Export admin functions
export * as admin from './admin';

// Export intent rules functions
export * as intent_rules from './intent_rules';

// Export router and orchestrator
export { detectIntent, orchestrateMultiAgent } from './router';

// Export seed function
export { seedAgents } from './seed';
