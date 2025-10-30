import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
  };
}

export function authenticate(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    // Internal job bypass using shared token
    const internalToken = req.headers['x-internal-job'] as string | undefined;
    const expected = process.env.INTERNAL_JOB_TOKEN;
    if (internalToken && expected && internalToken === expected) {
      const internalUser = (req.headers['x-internal-user'] as string) || 'system';
      req.user = { id: internalUser, email: `${internalUser}@internal` };
      return next();
    }

    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid authorization header' });
    }

    const token = authHeader.substring(7);
    // Allow a safe development fallback secret to avoid blocking local login
    const secret = process.env.JWT_SECRET || (process.env.NODE_ENV !== 'production' ? 'dev_secret_change_me' : '');
    if (!secret) {
      throw new Error('JWT_SECRET environment variable is required');
    }
    
    const decoded = jwt.verify(token, secret) as { userId: string; email: string };
    
    req.user = {
      id: decoded.userId,
      email: decoded.email,
    };
    
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Generate a test JWT token for development
export function generateTestToken(userId: string, email: string): string {
  // Allow a safe development fallback secret to avoid blocking local login
  const secret = process.env.JWT_SECRET || (process.env.NODE_ENV !== 'production' ? 'dev_secret_change_me' : '');
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is required');
  }
  return jwt.sign({ userId, email }, secret, { expiresIn: '30d' });
}

