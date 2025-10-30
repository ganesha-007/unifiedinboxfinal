import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

/**
 * Webhook signature verification middleware
 * Verifies HMAC-SHA256 signatures for webhook requests
 */
export function verifyWebhookSignature(req: Request, res: Response, next: NextFunction) {
  try {
    const signature = req.headers['x-unipile-signature'] as string;
    const webhookSecret = process.env.UNIPILE_WEBHOOK_SECRET;
    
    // Skip verification if no secret is configured (development mode)
    if (!webhookSecret) {
      console.log('⚠️ No webhook secret configured, skipping signature verification');
      return next();
    }
    
    if (!signature) {
      console.warn('❌ Missing webhook signature header');
      return res.status(401).json({ 
        error: 'Unauthorized', 
        message: 'Missing webhook signature' 
      });
    }
    
    // Get the raw body for signature verification
    const rawBody = JSON.stringify(req.body);
    
    // Verify the signature
    const isValid = verifySignature(rawBody, signature, webhookSecret);
    
    if (!isValid) {
      console.warn('❌ Invalid webhook signature');
      return res.status(401).json({ 
        error: 'Unauthorized', 
        message: 'Invalid webhook signature' 
      });
    }
    
    console.log('✅ Webhook signature verified successfully');
    next();
  } catch (error) {
    console.error('❌ Webhook signature verification error:', error);
    return res.status(500).json({ 
      error: 'Internal Server Error', 
      message: 'Failed to verify webhook signature' 
    });
  }
}

/**
 * Verify HMAC-SHA256 signature
 */
function verifySignature(payload: string, signature: string, secret: string): boolean {
  try {
    // Create HMAC hash
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(payload);
    const calculatedSignature = hmac.digest('hex');
    
    // Ensure both signatures are the same length before comparison
    if (signature.length !== calculatedSignature.length) {
      console.log('❌ Signature length mismatch:', signature.length, 'vs', calculatedSignature.length);
      return false;
    }
    
    // Use timing-safe comparison to prevent timing attacks
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(calculatedSignature, 'hex')
    );
  } catch (error) {
    console.error('Error verifying signature:', error);
    return false;
  }
}

/**
 * Generate webhook signature for testing
 */
export function generateWebhookSignature(payload: string, secret: string): string {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(payload);
  return hmac.digest('hex');
}
