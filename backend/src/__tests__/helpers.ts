// Test utilities and helpers
import { Pool } from 'pg';

/**
 * Mock database pool for testing
 */
export class MockPool {
  private queries: Array<{ query: string; params: any[]; result: any }> = [];
  
  setQueryResult(query: string, params: any[], result: any) {
    this.queries.push({ query, params, result });
  }
  
  async query(queryText: string, params?: any[]): Promise<any> {
    const matchingQuery = this.queries.find(
      q => this.queryMatches(q.query, queryText) && this.paramsMatch(q.params, params || [])
    );
    
    if (matchingQuery) {
      return matchingQuery.result;
    }
    
    // Default empty result
    return { rows: [], rowCount: 0 };
  }
  
  private queryMatches(expected: string, actual: string): boolean {
    // Simple matching - can be improved
    const normalizedExpected = expected.replace(/\s+/g, ' ').trim();
    const normalizedActual = actual.replace(/\s+/g, ' ').trim();
    return normalizedExpected.includes(normalizedActual) || normalizedActual.includes(normalizedExpected);
  }
  
  private paramsMatch(expected: any[], actual: any[]): boolean {
    if (!expected && !actual) return true;
    if (!expected || !actual) return false;
    if (expected.length !== actual.length) return false;
    
    return expected.every((val, idx) => val === actual[idx]);
  }
  
  clear() {
    this.queries = [];
  }
  
  async end() {
    // Mock implementation
  }
}

/**
 * Create a mock user object for testing
 */
export function createMockUser(userId: string = 'test-user-123', email: string = 'test@example.com') {
  return {
    id: userId,
    email: email,
  };
}

/**
 * Create a mock request object for testing
 */
export function createMockRequest(user?: any, body: any = {}, params: any = {}) {
  return {
    user: user || createMockUser(),
    body,
    params,
    query: {},
    headers: {},
  } as any;
}

/**
 * Create a mock response object for testing
 */
export function createMockResponse() {
  const res: any = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
  };
  return res;
}

/**
 * Create a mock next function for testing
 */
export function createMockNext() {
  return jest.fn();
}

/**
 * Helper to wait for async operations
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Database query result builders
 */
export const createQueryResult = (rows: any[] = []) => ({
  rows,
  rowCount: rows.length,
});

export const createUserPlanResult = (plan: string) => 
  createQueryResult([{ plan }]);

export const createAddonsResult = (addons: string[] = []) => 
  createQueryResult(addons.map(addon => ({ provider: addon })));

export const createEntitlementResult = (entitlements: any[] = []) => 
  createQueryResult(entitlements);

