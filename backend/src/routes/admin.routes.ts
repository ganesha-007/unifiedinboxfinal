import { Router } from 'express';
import { getWorkspaceLimits, upsertWorkspaceLimits, toggleTrialMode, listLimiterEvents } from '../controllers/admin.controller';

const router = Router();

router.get('/workspace/:userId/limits', getWorkspaceLimits);
router.put('/workspace/:userId/limits', upsertWorkspaceLimits);
router.post('/workspace/:userId/trial', toggleTrialMode);
router.get('/limiter-events', listLimiterEvents);

export default router;


