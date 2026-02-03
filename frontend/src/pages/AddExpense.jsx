import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/layout/Layout';
import Card from '../components/common/Card';
import Input from '../components/common/Input';
import Select from '../components/common/Select';
import Button from '../components/common/Button';
import Modal from '../components/common/Modal';
import { Plus, Trash2 } from 'lucide-react';
import { createExpense } from '../services/expenseService';
import { getCards, createCard, deleteCard } from '../services/cardService';
import { useAuth } from '../context/AuthContext';
import { 
  BUSINESS_UNITS,
  TYPES_OF_EXPENSE,
  COST_CENTERS,
  APPROVED_BY,
  RECURRING_OPTIONS,
  CURRENCIES,
  STATUS_OPTIONS,
} from '../utils/constants';
import { getMonthYear } from '../utils/formatters';
import toast from 'react-hot-toast';

const AddExpense = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [cardsLoading, setCardsLoading] = useState(false);
  const [cards, setCards] = useState([]);
  const [manageCardsOpen, setManageCardsOpen] = useState(false);
  const [newCardNumber, setNewCardNumber] = useState('');
  const [cardActionLoading, setCardActionLoading] = useState(false);
  const isBusinessUnitLocked = ['business_unit_admin', 'spoc'].includes(user?.role);
  const canManageCards = ['super_admin', 'business_unit_admin'].includes(user?.role);
  const [formData, setFormData] = useState({
    cardNumber: '',
    cardAssignedTo: '',
    date: '',
    month: '',
    status: 'Active',
    particulars: '',
    narration: '',
    currency: 'USD',
    billStatus: '',
    amount: '',
    typeOfService: '',
    businessUnit: user?.businessUnit || '',
    costCenter: '',
    approvedBy: '',
    serviceHandler: '',
    recurring: 'One-time',
    isShared: false,
    sharedAllocations: [],
  });

  useEffect(() => {
    const fetchCards = async () => {
      try {
        setCardsLoading(true);
        const response = await getCards();
        if (response.success) {
          setCards(response.data || []);
        }
      } catch (error) {
        toast.error('Unable to load card numbers');
      } finally {
        setCardsLoading(false);
      }
    };

    fetchCards();
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    const nextValue = name === 'cardNumber' ? value.toUpperCase() : value;

    setFormData((prev) => {
      const nextState = { ...prev, [name]: nextValue };

      if (name === 'date' && nextValue) {
        nextState.month = getMonthYear(nextValue);
      }

      if (name === 'particulars' && !prev.narration) {
        nextState.narration = nextValue;
      }

      return nextState;
    });
  };

  const refreshCards = async () => {
    try {
      setCardsLoading(true);
      const response = await getCards();
      if (response.success) {
        setCards(response.data || []);
      }
    } catch (error) {
      toast.error('Unable to refresh card list');
    } finally {
      setCardsLoading(false);
    }
  };

  const handleAddCard = async () => {
    const trimmed = newCardNumber.trim().toUpperCase();
    if (!trimmed) {
      toast.error('Please enter a card number');
      return;
    }
    try {
      setCardActionLoading(true);
      const response = await createCard({ number: trimmed });
      if (response.success) {
        toast.success('Card added successfully');
        setNewCardNumber('');
        await refreshCards();
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to add card');
    } finally {
      setCardActionLoading(false);
    }
  };

  const handleDeleteCard = async (cardId) => {
    if (!window.confirm('Delete this card number?')) return;
    try {
      setCardActionLoading(true);
      await deleteCard(cardId);
      toast.success('Card deleted');
      await refreshCards();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to delete card');
    } finally {
      setCardActionLoading(false);
    }
  };

  const handleSharedToggle = (checked) => {
    setFormData((prev) => {
      if (!checked) {
        return { ...prev, isShared: false, sharedAllocations: [] };
      }
      // Seed with current BU row if missing
      const existing = prev.sharedAllocations || [];
      const hasCurrentBU = existing.some((s) => s.businessUnit === prev.businessUnit);
      const baseAllocations = hasCurrentBU
        ? existing
        : [...existing, { businessUnit: prev.businessUnit || '', amount: '' }];
      return { ...prev, isShared: true, sharedAllocations: baseAllocations };
    });
  };

  const updateSharedAllocation = (businessUnit, amount) => {
    setFormData((prev) => {
      const allocations = [...(prev.sharedAllocations || [])];
      const idx = allocations.findIndex((a) => a.businessUnit === businessUnit);
      if (idx >= 0) {
        allocations[idx] = { ...allocations[idx], amount };
      } else {
        allocations.push({ businessUnit, amount });
      }
      return { ...prev, sharedAllocations: allocations };
    });
  };

  const toggleAllocation = (businessUnit, enabled) => {
    setFormData((prev) => {
      let allocations = [...(prev.sharedAllocations || [])];
      if (!enabled) {
        allocations = allocations.filter((a) => a.businessUnit !== businessUnit);
      } else {
        const exists = allocations.find((a) => a.businessUnit === businessUnit);
        if (!exists) {
          allocations.push({ businessUnit, amount: '' });
        }
      }
      return { ...prev, sharedAllocations: allocations };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const amountValue = parseFloat(formData.amount) || 0;
      const sharedAllocations = (formData.sharedAllocations || [])
        .map((item) => ({
          businessUnit: item.businessUnit,
          amount: parseFloat(item.amount) || 0,
        }))
        .filter((item) => item.amount > 0 && item.businessUnit);

      if (formData.isShared) {
        const totalShared = sharedAllocations.reduce((sum, item) => sum + item.amount, 0);
        if (sharedAllocations.length === 0) {
          toast.error('Please enter at least one shared allocation amount.');
          setLoading(false);
          return;
        }
        if (totalShared > amountValue) {
          toast.error('Shared allocations cannot exceed total amount.');
          setLoading(false);
          return;
        }
      }

      const response = await createExpense({
        ...formData,
        amount: amountValue,
        sharedAllocations,
      });
      if (response.success) {
        toast.success('Expense entry submitted for approval!');
        navigate('/expenses');
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to create expense entry');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout>
      <div className="max-w-4xl mx-auto">
        <Card title="Add New Expense Entry">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Card Information */}
            <div>
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Card Information</h3>
                {canManageCards && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setManageCardsOpen(true)}
                  >
                    Manage Cards
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Input
                    label="Card Number"
                    name="cardNumber"
                    value={formData.cardNumber}
                    onChange={handleChange}
                    placeholder="e.g., M003"
                    list="card-number-list"
                    hint="Select from the list or type a new card number."
                    required
                  />
                  <datalist id="card-number-list">
                    {cards.map((card) => (
                      <option key={card._id} value={card.number} />
                    ))}
                  </datalist>
                </div>
                <Input
                  label="Card Assigned To"
                  name="cardAssignedTo"
                  value={formData.cardAssignedTo}
                  onChange={handleChange}
                  placeholder="e.g., John Doe"
                  required
                />
              </div>
            </div>

            {/* Date and Status */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Date & Status</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Input
                  label="Date"
                  type="date"
                  name="date"
                  value={formData.date}
                  onChange={handleChange}
                  required
                />
                <Input
                  label="Month"
                  name="month"
                  value={formData.month}
                  onChange={handleChange}
                  placeholder="Auto-generated"
                  required
                />
                <Select
                  label="Status"
                  name="status"
                  value={formData.status}
                  onChange={handleChange}
                  options={STATUS_OPTIONS}
                  required
                />
              </div>
            </div>

            {/* Service Details */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Service Details</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="Particulars (Service Name)"
                  name="particulars"
                  value={formData.particulars}
                  onChange={handleChange}
                  placeholder="e.g., ChatGPT"
                  required
                />
                <Input
                  label="Narration"
                  name="narration"
                  value={formData.narration}
                  onChange={handleChange}
                  placeholder="e.g., ChatGPT Subscription"
                  required
                />
                <Select
                  label="Type of Service"
                  name="typeOfService"
                  value={formData.typeOfService}
                  onChange={handleChange}
                  options={TYPES_OF_EXPENSE}
                  required
                />
                <Input
                  label="Bill Status"
                  name="billStatus"
                  value={formData.billStatus}
                  onChange={handleChange}
                  placeholder="Optional"
                />
              </div>
            </div>

            {/* Amount Information */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Amount Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="Amount"
                  type="number"
                  step="0.01"
                  name="amount"
                  value={formData.amount}
                  onChange={handleChange}
                  placeholder="e.g., 200"
                  required
                />
                <Select
                  label="Currency"
                  name="currency"
                  value={formData.currency}
                  onChange={handleChange}
                  options={CURRENCIES}
                  required
                />
              </div>
            </div>

            {/* Shared Expense */}
            <div className="border border-slate-200 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Shared Expense</h3>
                  <p className="text-sm text-slate-500">
                    Toggle if this cost is split across business units. Total shared amounts cannot exceed the entry amount.
                  </p>
                </div>
                <label className="flex items-center gap-2 text-sm font-semibold">
                  <input
                    type="checkbox"
                    checked={formData.isShared}
                    onChange={(e) => handleSharedToggle(e.target.checked)}
                  />
                  Mark as shared
                </label>
              </div>
              {formData.isShared && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {BUSINESS_UNITS.map((bu) => {
                    const alloc = formData.sharedAllocations?.find((a) => a.businessUnit === bu);
                    const enabled = Boolean(alloc) || bu === formData.businessUnit;
                    return (
                      <div key={bu} className="border border-slate-200 rounded-lg p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-slate-800">{bu}</span>
                          <input
                            type="checkbox"
                            checked={enabled}
                            onChange={(e) => toggleAllocation(bu, e.target.checked)}
                            disabled={bu === formData.businessUnit}
                            title={bu === formData.businessUnit ? 'Primary business unit always included' : 'Include this BU in the split'}
                          />
                        </div>
                        {enabled && (
                          <Input
                            label="Amount"
                            type="number"
                            step="0.01"
                            name={`shared-${bu}`}
                            value={alloc?.amount || ''}
                            onChange={(e) => updateSharedAllocation(bu, e.target.value)}
                            placeholder="e.g., 200"
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Business Information */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Business Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Select
                  label="Business Unit"
                  name="businessUnit"
                  value={formData.businessUnit}
                  onChange={handleChange}
                  options={BUSINESS_UNITS}
                  disabled={isBusinessUnitLocked}
                  placeholder="Select Business Unit"
                  required
                />
                <Select
                  label="Cost Center"
                  name="costCenter"
                  value={formData.costCenter}
                  onChange={handleChange}
                  options={COST_CENTERS}
                  required
                />
                <Select
                  label="Approved By"
                  name="approvedBy"
                  value={formData.approvedBy}
                  onChange={handleChange}
                  options={APPROVED_BY}
                  required
                />
                <Input
                  label="Service Handler"
                  name="serviceHandler"
                  value={formData.serviceHandler}
                  onChange={handleChange}
                  placeholder="e.g., Raghav"
                  required
                />
              </div>
            </div>

            {/* Recurring */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Subscription Type</h3>
              <Select
                label="Recurring"
                name="recurring"
                value={formData.recurring}
                onChange={handleChange}
                options={RECURRING_OPTIONS}
                required
              />
            </div>

            {/* Submit Button */}
            <div className="flex justify-end space-x-3 pt-6 border-t border-gray-200">
              <Button
                type="button"
                variant="secondary"
                onClick={() => navigate('/expenses')}
              >
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={loading}>
                {loading ? 'Submitting...' : 'Submit for Approval'}
              </Button>
            </div>
          </form>
        </Card>

        {/* Info Card */}
        <div className="mt-6 p-4 bg-blue-50 rounded-lg">
          <p className="text-sm text-blue-800">
            <strong>Note:</strong> After submission, this entry will be marked approved and will be added to global expense sheet and your BU related sheet.
            
          </p>
        </div>
      </div>

      <Modal
        isOpen={manageCardsOpen}
        onClose={() => setManageCardsOpen(false)}
        title="Manage Card Numbers"
        size="md"
      >
        <div className="space-y-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-end">
            <div className="flex-1">
              <Input
                label="New Card Number"
                name="newCardNumber"
                value={newCardNumber}
                onChange={(e) => setNewCardNumber(e.target.value.toUpperCase())}
                placeholder="e.g., M003"
              />
            </div>
            <Button
              type="button"
              variant="primary"
              onClick={handleAddCard}
              disabled={cardActionLoading}
              className="md:mb-1"
            >
              <Plus size={16} />
              Add Card
            </Button>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
              <div>
                <p className="text-sm font-semibold text-slate-900">Available Cards</p>
                <p className="text-xs text-slate-500">
                  {cardsLoading ? 'Loading...' : `${cards.length} cards`}
                </p>
              </div>
            </div>
            <div className="divide-y divide-slate-100 max-h-72 overflow-y-auto subtle-scrollbar">
              {cards.length === 0 && !cardsLoading && (
                <div className="px-4 py-6 text-sm text-slate-500">No cards added yet.</div>
              )}
              {cards.map((card) => (
                <div key={card._id} className="flex items-center justify-between px-4 py-3">
                  <span className="text-sm font-semibold text-slate-800">{card.number}</span>
                  <button
                    type="button"
                    onClick={() => handleDeleteCard(card._id)}
                    className="inline-flex items-center gap-2 text-xs font-semibold text-rose-600 hover:text-rose-700"
                    disabled={cardActionLoading}
                  >
                    <Trash2 size={14} />
                    Delete
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Modal>
    </Layout>
  );
};

export default AddExpense;
