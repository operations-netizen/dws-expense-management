import express from 'express';
import { getCards, createCard, deleteCard } from '../controllers/cardController.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();

router.get('/', protect, getCards);
router.post('/', protect, authorize('super_admin', 'business_unit_admin'), createCard);
router.delete('/:id', protect, authorize('super_admin', 'business_unit_admin'), deleteCard);

export default router;
