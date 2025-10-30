import { Router, Response } from 'express';
import { generateTestToken } from '../middleware/auth';
import { initiateGmailAuth, handleGmailCallback, getUserEmailLimits } from '../controllers/gmail.controller';
import { initiateOutlookAuth, handleOutlookCallback } from '../controllers/outlook.controller';
import { authenticate } from '../middleware/auth';

const router = Router();

/**
 * Login endpoint - generates JWT token
 */
router.post('/login', (req, res: Response) => {
  try {
    const { userId, email } = req.body;
    
    if (!userId || !email) {
      return res.status(400).json({ 
        error: 'userId and email are required' 
      });
    }

    // Generate JWT token
    const token = generateTestToken(userId, email);

    res.json({ 
      success: true,
      token,
      user: {
        id: userId,
        email
      },
      message: 'Login successful'
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to login' });
  }
});

/**
 * Test token endpoint for development
 */
router.post('/test-token', (req, res: Response) => {
  try {
    const { userId, email } = req.body;
    
    if (!userId || !email) {
      return res.status(400).json({ 
        error: 'userId and email are required' 
      });
    }

    // Generate JWT token
    const token = generateTestToken(userId, email);

    res.json({ 
      success: true,
      token,
      user: {
        id: userId,
        email
      }
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to generate token' });
  }
});

/**
 * Gmail OAuth endpoints
 */
router.get('/gmail', authenticate, initiateGmailAuth);
router.get('/gmail/callback', handleGmailCallback);

/**
 * Outlook OAuth endpoints
 */
router.get('/outlook', authenticate, initiateOutlookAuth);
router.get('/outlook/callback', handleOutlookCallback);

/**
 * User-specific email limits endpoint
 */
router.get('/me/limits/email', authenticate, getUserEmailLimits);

export default router;

