import test from 'node:test';
import assert from 'node:assert/strict';
import { getExpenseEntries } from '../src/controllers/expenseController.js';
import ExpenseEntry from '../src/models/ExpenseEntry.js';

const createMockRes = () => {
  const res = {};
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (payload) => {
    res.payload = payload;
    return res;
  };
  return res;
};

test('filters duplicate entries when requested', async () => {
  const entries = [
    {
      _id: '1',
      cardNumber: 'M1',
      date: '2025-01-01',
      particulars: 'Tool',
      businessUnit: 'DWSG',
      amount: 10,
      currency: 'USD',
      createdAt: '2025-01-01T00:00:00.000Z',
    },
    {
      _id: '2',
      cardNumber: 'M1',
      date: '2025-01-01',
      particulars: 'Tool',
      businessUnit: 'DWSG',
      amount: 10,
      currency: 'USD',
      createdAt: '2025-01-01T01:00:00.000Z',
    },
    {
      _id: '3',
      cardNumber: 'M2',
      date: '2025-01-02',
      particulars: 'Service',
      businessUnit: 'DWSG',
      amount: 20,
      currency: 'USD',
      createdAt: '2025-01-02T00:00:00.000Z',
    },
  ];

  ExpenseEntry.find = () => ({
    populate: () => ({
      sort: () => ({
        lean: async () => entries,
      }),
    }),
  });

  const req = {
    query: { duplicateStatus: 'Duplicate' },
    user: { role: 'mis_manager' },
  };
  const res = createMockRes();

  await getExpenseEntries(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.data.length, 2);
  assert.ok(res.payload.data.every((entry) => entry.duplicateFlag === 'duplicate'));
});

