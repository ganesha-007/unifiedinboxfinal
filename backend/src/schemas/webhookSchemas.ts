import Joi from 'joi';

/**
 * Webhook payload schemas for validation
 */

// Base message schema
const messageSchema = Joi.object({
  id: Joi.string().required().min(1).max(255),
  body: Joi.string().required().max(10000),
  text: Joi.string().optional().max(10000),
  from: Joi.object({
    name: Joi.string().required().max(255),
    phone: Joi.string().required().max(50)
  }).required(),
  timestamp: Joi.string().isoDate().required(),
  attachments: Joi.array().items(
    Joi.object({
      id: Joi.string().required(),
      name: Joi.string().required(),
      type: Joi.string().required(),
      url: Joi.string().uri().required(),
      size: Joi.number().integer().min(0).max(50 * 1024 * 1024) // 50MB max
    })
  ).default([])
});

// UniPile message webhook schema
export const unipileMessageSchema = Joi.object({
  event: Joi.string().valid('message.new', 'message_received').required(),
  data: Joi.object({
    account_id: Joi.string().required().min(1).max(255),
    chat_id: Joi.string().required().min(1).max(255),
    message: messageSchema.required()
  }).required()
});

// Alternative UniPile format (direct properties)
export const unipileDirectMessageSchema = Joi.object({
  account_id: Joi.string().required().min(1).max(255),
  chat_id: Joi.string().optional().max(255),
  provider_chat_id: Joi.string().optional().max(255),
  message_id: Joi.string().required().min(1).max(255),
  id: Joi.string().optional().max(255),
  text: Joi.string().required().max(10000),
  message: Joi.string().optional().max(10000),
  body: Joi.string().optional().max(10000),
  sender: Joi.object({
    attendee_name: Joi.string().required().max(255),
    attendee_provider_id: Joi.string().required().max(50)
  }).optional(),
  from: Joi.object({
    name: Joi.string().required().max(255),
    phone: Joi.string().required().max(50)
  }).optional(),
  sender_name: Joi.string().optional().max(255),
  sender_id: Joi.string().optional().max(50),
  timestamp: Joi.string().isoDate().optional(),
  created_at: Joi.string().isoDate().optional(),
  attachments: Joi.array().items(
    Joi.object({
      id: Joi.string().required(),
      name: Joi.string().required(),
      type: Joi.string().required(),
      url: Joi.string().uri().required(),
      size: Joi.number().integer().min(0).max(50 * 1024 * 1024)
    })
  ).default([])
});

// Account status webhook schema
export const unipileAccountStatusSchema = Joi.object({
  event: Joi.string().valid('account.update').required(),
  data: Joi.object({
    account_id: Joi.string().required().min(1).max(255),
    status: Joi.string().valid('connected', 'disconnected', 'needs_action', 'stopped').required(),
    metadata: Joi.object({
      phone: Joi.string().optional().max(50),
      name: Joi.string().optional().max(255)
    }).optional()
  }).required()
});

// Gmail webhook schema (Pub/Sub)
export const gmailWebhookSchema = Joi.object({
  message: Joi.object({
    data: Joi.string().base64().required(),
    messageId: Joi.string().required(),
    publishTime: Joi.string().isoDate().required()
  }).required()
});

// Webhook challenge schema (for verification)
export const webhookChallengeSchema = Joi.object({
  challenge: Joi.string().required()
});

/**
 * Validate webhook payload based on its type
 */
export function validateWebhookPayload(payload: any, webhookType: 'unipile-message' | 'unipile-account' | 'gmail' | 'challenge'): { isValid: boolean; error?: string; sanitizedPayload?: any } {
  try {
    let schema: Joi.ObjectSchema;
    let sanitizedPayload: any;

    switch (webhookType) {
      case 'unipile-message':
        // Try both schemas for UniPile messages
        const unipileResult = unipileMessageSchema.validate(payload, { stripUnknown: true });
        if (!unipileResult.error) {
          sanitizedPayload = unipileResult.value;
        } else {
          const directResult = unipileDirectMessageSchema.validate(payload, { stripUnknown: true });
          if (directResult.error) {
            return { isValid: false, error: `UniPile message validation failed: ${directResult.error.details[0].message}` };
          }
          sanitizedPayload = directResult.value;
        }
        break;

      case 'unipile-account':
        const accountResult = unipileAccountStatusSchema.validate(payload, { stripUnknown: true });
        if (accountResult.error) {
          return { isValid: false, error: `Account status validation failed: ${accountResult.error.details[0].message}` };
        }
        sanitizedPayload = accountResult.value;
        break;

      case 'gmail':
        const gmailResult = gmailWebhookSchema.validate(payload, { stripUnknown: true });
        if (gmailResult.error) {
          return { isValid: false, error: `Gmail webhook validation failed: ${gmailResult.error.details[0].message}` };
        }
        sanitizedPayload = gmailResult.value;
        break;

      case 'challenge':
        const challengeResult = webhookChallengeSchema.validate(payload, { stripUnknown: true });
        if (challengeResult.error) {
          return { isValid: false, error: `Challenge validation failed: ${challengeResult.error.details[0].message}` };
        }
        sanitizedPayload = challengeResult.value;
        break;

      default:
        return { isValid: false, error: 'Unknown webhook type' };
    }

    return { isValid: true, sanitizedPayload };
  } catch (error) {
    return { isValid: false, error: `Validation error: ${error instanceof Error ? error.message : 'Unknown error'}` };
  }
}

