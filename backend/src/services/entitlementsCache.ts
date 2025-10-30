type Entitlements = Record<string, boolean>;

class EntitlementsCacheService {
  private cache = new Map<string, { value: Entitlements; expiresAt: number }>();
  private ttlMs: number;
  private disabled: boolean;

  constructor() {
    const ttl = Number(process.env.ENTITLEMENTS_CACHE_TTL_MS || 60000);
    this.ttlMs = Number.isFinite(ttl) && ttl > 0 ? ttl : 60000;
    this.disabled = process.env.NODE_ENV === 'test';
  }

  get(userId: string): Entitlements | null {
    if (this.disabled) return null;
    const entry = this.cache.get(userId);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(userId);
      return null;
    }
    return entry.value;
  }

  set(userId: string, value: Entitlements): void {
    if (this.disabled) return;
    this.cache.set(userId, { value, expiresAt: Date.now() + this.ttlMs });
  }

  invalidate(userId: string): void {
    this.cache.delete(userId);
  }

  clearAll(): void {
    this.cache.clear();
  }
}

export const entitlementsCache = new EntitlementsCacheService();


