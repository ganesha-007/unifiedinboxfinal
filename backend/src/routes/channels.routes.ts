import { Router } from 'express';
import {
  getAccounts,
  getAvailableAccounts,
  connectAccount,
  getChats,
  getMessages,
  sendMessage,
  markAsRead,
  debugUniPile,
  cleanupDuplicates,
  cleanupUnknownChats,
} from '../controllers/channels.controller';
import {
  getGmailAccounts,
  getGmailChats,
  getGmailMessages,
  sendGmailMessage,
  markGmailAsRead,
  setupGmailWatchSubscription,
  getEmailLimits,
} from '../controllers/gmail.controller';
import {
  getOutlookAccounts,
  getOutlookChats,
  getOutlookMessages,
  sendOutlookMessage,
  markOutlookAsRead,
} from '../controllers/outlook.controller';
import { authenticate } from '../middleware/auth';
import { enforceUsageLimits, trackUsage } from '../middleware/usageEnforcement';

const router = Router();

// WhatsApp routes - AUTHENTICATION REQUIRED
router.get('/whatsapp/accounts', authenticate, getAccounts);
router.get('/whatsapp/available', authenticate, getAvailableAccounts);
router.post('/whatsapp/connect', authenticate, connectAccount);
router.get('/whatsapp/:accountId/chats', authenticate, getChats);
router.get('/whatsapp/:accountId/chats/:chatId/messages', authenticate, getMessages);
router.post('/whatsapp/:accountId/chats/:chatId/send', authenticate, enforceUsageLimits('whatsapp'), trackUsage(), sendMessage);
router.post('/whatsapp/:accountId/mark-read', authenticate, markAsRead);
router.post('/whatsapp/:accountId/cleanup-duplicates', authenticate, cleanupDuplicates);
router.post('/whatsapp/:accountId/cleanup-unknown-chats', authenticate, cleanupUnknownChats);

// Instagram routes - AUTHENTICATION REQUIRED
router.get('/instagram/accounts', authenticate, getAccounts);
router.get('/instagram/available', authenticate, getAvailableAccounts);
router.post('/instagram/connect', authenticate, connectAccount);
router.get('/instagram/:accountId/chats', authenticate, getChats);
router.get('/instagram/:accountId/chats/:chatId/messages', authenticate, getMessages);
router.post('/instagram/:accountId/chats/:chatId/send', authenticate, enforceUsageLimits('instagram'), trackUsage(), sendMessage);
router.post('/instagram/:accountId/mark-read', authenticate, markAsRead);

// Gmail routes - AUTHENTICATION REQUIRED
router.get('/email/accounts', authenticate, getGmailAccounts);
router.get('/email/:accountId/chats', authenticate, getGmailChats);
router.get('/email/:accountId/chats/:chatId/messages', authenticate, getGmailMessages);
router.post('/email/:accountId/chats/:chatId/send', authenticate, enforceUsageLimits('email'), trackUsage(), sendGmailMessage);
router.post('/email/:accountId/mark-read', authenticate, markGmailAsRead);
router.post('/email/setup-watch', authenticate, setupGmailWatchSubscription);
router.get('/email/:accountId/limits', authenticate, getEmailLimits);

// Outlook routes - AUTHENTICATION REQUIRED
router.get('/outlook/accounts', authenticate, getOutlookAccounts);
router.get('/outlook/:accountId/chats', authenticate, getOutlookChats);
router.get('/outlook/:accountId/chats/:chatId/messages', authenticate, getOutlookMessages);
router.post('/outlook/:accountId/chats/:chatId/send', authenticate, enforceUsageLimits('outlook'), trackUsage(), sendOutlookMessage);
router.post('/outlook/:accountId/mark-read', authenticate, markOutlookAsRead);

// Debug route - NO AUTHENTICATION (for development)
router.get('/debug/unipile', debugUniPile);

export default router;

