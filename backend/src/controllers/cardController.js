import Card from '../models/Card.js';

const normalizeCardNumber = (value) => value?.toString().trim().toUpperCase();

// @desc    List all cards
// @route   GET /api/cards
// @access  Private
export const getCards = async (req, res) => {
  try {
    const cards = await Card.find().sort({ number: 1 }).lean();
    res.status(200).json({
      success: true,
      count: cards.length,
      data: cards,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Create a new card
// @route   POST /api/cards
// @access  Private (Super Admin, Business Unit Admin)
export const createCard = async (req, res) => {
  try {
    const number = normalizeCardNumber(req.body?.number);
    if (!number) {
      return res.status(400).json({
        success: false,
        message: 'Card number is required',
      });
    }

    const existing = await Card.findOne({ number });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'Card number already exists',
      });
    }

    const card = await Card.create({
      number,
      createdBy: req.user?._id || null,
    });

    res.status(201).json({
      success: true,
      message: 'Card created successfully',
      data: card,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'Card number already exists',
      });
    }
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Delete a card
// @route   DELETE /api/cards/:id
// @access  Private (Super Admin, Business Unit Admin)
export const deleteCard = async (req, res) => {
  try {
    const card = await Card.findByIdAndDelete(req.params.id);
    if (!card) {
      return res.status(404).json({
        success: false,
        message: 'Card not found',
      });
    }

    res.status(200).json({
      success: true,
      message: 'Card deleted successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export default {
  getCards,
  createCard,
  deleteCard,
};
