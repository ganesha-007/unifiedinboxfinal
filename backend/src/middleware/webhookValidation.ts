import { Request, Response, NextFunction } from 'express';
import { validateWebhookPayload as validatePayload } from '../schemas/webhookSchemas';

/**
 * Webhook payload validation middleware
 * Validates and sanitizes webhook payloads based on their type
 */
export function validateWebhookPayload(req: Request, res: Response, next: NextFunction) {
  try {
    // Determine webhook type based on the route
    let webhookType: 'unipile-message' | 'unipile-account' | 'gmail' | 'challenge';
    
    if (req.path.includes('/unipile/messages')) {
      webhookType = 'unipile-message';
    } else if (req.path.includes('/unipile/account-status')) {
      webhookType = 'unipile-account';
    } else if (req.path.includes('/gmail/messages')) {
      webhookType = 'gmail';
    } else {
      // Default to challenge for unknown webhook types
      webhookType = 'challenge';
    }

    console.log(`🔍 Validating webhook payload for type: ${webhookType}`);

    // Validate the payload
    const validationResult = validatePayload(req.body, webhookType);
    
    if (!validationResult.isValid) {
      console.warn('❌ Webhook payload validation failed:', validationResult.error);
      return res.status(400).json({
        error: 'Invalid webhook payload',
        message: validationResult.error,
        details: 'The webhook payload does not match the expected schema'
      });
    }

    // Replace the request body with the sanitized payload
    if (validationResult.sanitizedPayload) {
      req.body = validationResult.sanitizedPayload;
      console.log('✅ Webhook payload validated and sanitized successfully');
    }

    next();
  } catch (error) {
    console.error('❌ Webhook payload validation error:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to validate webhook payload'
    });
  }
}

/**
 * Enhanced webhook validation with detailed logging
 */
export function validateWebhookPayloadWithLogging(req: Request, res: Response, next: NextFunction) {
  try {
    console.log('📥 Webhook validation - Raw payload:', JSON.stringify(req.body, null, 2));
    
    // Determine webhook type
    let webhookType: 'unipile-message' | 'unipile-account' | 'gmail' | 'challenge';
    
    if (req.path.includes('/unipile/messages')) {
      webhookType = 'unipile-message';
    } else if (req.path.includes('/unipile/account-status')) {
      webhookType = 'unipile-account';
    } else if (req.path.includes('/gmail/messages')) {
      webhookType = 'gmail';
    } else {
      webhookType = 'challenge';
    }

    console.log(`🔍 Validating webhook payload for type: ${webhookType}`);

    // Validate the payload
    const validationResult = validatePayload(req.body, webhookType);
    
    if (!validationResult.isValid) {
      console.warn('❌ Webhook payload validation failed:', validationResult.error);
      console.warn('❌ Invalid payload:', JSON.stringify(req.body, null, 2));
      return res.status(400).json({
        error: 'Invalid webhook payload',
        message: validationResult.error,
        details: 'The webhook payload does not match the expected schema',
        receivedPayload: req.body
      });
    }

    // Replace the request body with the sanitized payload
    if (validationResult.sanitizedPayload) {
      console.log('✅ Webhook payload validated and sanitized successfully');
      console.log('🧹 Sanitized payload:', JSON.stringify(validationResult.sanitizedPayload, null, 2));
      req.body = validationResult.sanitizedPayload;
    }

    next();
  } catch (error) {
    console.error('❌ Webhook payload validation error:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to validate webhook payload'
    });
  }
}
