import mongoose from 'mongoose';
import ExpenseEntry from '../models/ExpenseEntry.js';
import User from '../models/User.js';
import Notification from '../models/Notification.js';
import { generateApprovalToken } from '../utils/jwt.js';
import {
  sendBUEntryNoticeEmail, 
  sendMISNotificationEmail,
  sendServiceHandlerEntryEmail, 
  sendSpocEntryEmail,
} from '../services/emailService.js';
import { convertToINR } from '../services/currencyService.js';
import RenewalLog from '../models/RenewalLog.js';
import { annotateDuplicates, filterByDuplicateStatus } from '../utils/duplicateUtils.js';

const validateSharedAllocations = (isShared, sharedAllocations = [], totalAmount, primaryBU) => {
  if (!isShared) return { isShared: false, sharedAllocations: [] };
  const safeTotal = normalizePositiveAmount(totalAmount);
  const cleaned = (sharedAllocations || [])
    .map((item) => ({
      businessUnit: item.businessUnit,
      amount: normalizePositiveAmount(item.amount),
    }))
    .filter((item) => item.businessUnit && item.amount > 0);

  // Ensure primary BU appears at least with 0 (optional)
  const hasPrimary = cleaned.some((item) => item.businessUnit === primaryBU);
  if (!hasPrimary) {
    cleaned.push({ businessUnit: primaryBU, amount: 0 });
  }

  const total = cleaned.reduce((sum, item) => sum + item.amount, 0);
  if (total > safeTotal) {
    throw new Error('Shared allocations exceed total amount');
  }

  return { isShared: true, sharedAllocations: cleaned };
};

const escapeRegex = (value = '') => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const parseMultiValues = (value) =>
  value
    ?.toString()
    .split(',')
    .map((val) => val.trim())
    .filter(Boolean) || [];

const buildRegexList = (values) => values.map((val) => new RegExp(escapeRegex(val), 'i'));

const EMPTY_FILTER_VALUE = '__empty__';

const applyEmptyFilter = (query, field, rawValue) => {
  if (rawValue !== EMPTY_FILTER_VALUE) return false;
  const clause = {
    $or: [{ [field]: { $exists: false } }, { [field]: null }, { [field]: '' }],
  };
  query.$and = query.$and ? [...query.$and, clause] : [clause];
  return true;
};

const parseAmountValue = (value) => {
  if (value === undefined || value === null) return NaN;
  if (typeof value === 'number') return value;
  const text = value.toString().trim();
  if (!text) return NaN;
  const isParen = /^\(.*\)$/.test(text);
  const cleaned = text.replace(/[^0-9.-]/g, '');
  const parsed = Number(cleaned);
  if (Number.isNaN(parsed)) return NaN;
  return isParen ? -Math.abs(parsed) : parsed;
};

const normalizePositiveAmount = (value) => {
  const parsed = parseAmountValue(value);
  if (Number.isNaN(parsed)) return 0;
  return Math.abs(parsed);
};

const applyMultiValueFilter = (query, field, rawValue) => {
  const values = parseMultiValues(rawValue);
  if (values.length === 0) return;
  const regexes = buildRegexList(values);
  const clause = regexes.length === 1 ? regexes[0] : { $in: regexes };

  if (query[field]) {
    const existing = query[field];
    delete query[field];
    query.$and = query.$and ? [...query.$and, { [field]: existing }, { [field]: clause }] : [{ [field]: existing }, { [field]: clause }];
  } else {
    query[field] = clause;
  }
};

const normalizeAllocationsForCompare = (allocations = []) =>
  (allocations || [])
    .filter((alloc) => alloc.businessUnit)
    .map((alloc) => ({
      businessUnit: alloc.businessUnit,
      amount: Number(alloc.amount) || 0,
    }))
    .sort((a, b) => a.businessUnit.localeCompare(b.businessUnit));

const allocationsEqual = (a = [], b = []) => {
  if (a.length !== b.length) return false;
  return a.every((item, idx) => item.businessUnit === b[idx].businessUnit && item.amount === b[idx].amount);
};

const formatAllocations = (allocations = []) =>
  allocations.map((alloc) => `${alloc.businessUnit}: ${alloc.amount}`).join(', ');

const parseFilterDate = (value, endOfDay = false) => {
  if (!value) return undefined;
  if (/^\d{2}-\d{2}-\d{4}$/.test(value)) {
    const [dd, mm, yyyy] = value.split('-');
    const iso = `${yyyy}-${mm}-${dd}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`;
    return new Date(iso);
  }
  return new Date(value);
};

const parseNameList = (value) =>
  value
    ?.toString()
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean) || [];

const parseBooleanFlag = (value) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return ['true', '1', 'yes', 'on'].includes(normalized);
  }
  return false;
};

const isBlank = (value) =>
  value === undefined ||
  value === null ||
  (typeof value === 'string' && value.trim() === '');

const omitBlankFields = (payload, fields = []) => {
  fields.forEach((field) => {
    if (isBlank(payload[field])) {
      delete payload[field];
    }
  });
  return payload;
};

const resolveUserEmailsByNames = async ({
  names = [],
  businessUnit,
  roles = null,
}) => {
  const emails = new Set();

  for (const rawName of names) {
    const token = rawName?.trim();
    if (!token) continue;

    // Allow direct email entry in Card Assigned / Service Handler fields.
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(token)) {
      emails.add(token);
      continue;
    }

    const baseQuery = {
      isActive: true,
      name: new RegExp(`^${escapeRegex(token)}$`, 'i'),
      ...(roles?.length ? { role: { $in: roles } } : {}),
    };

    const withBuQuery = businessUnit
      ? {
          ...baseQuery,
          $or: [{ businessUnit }, { businessUnit: null }],
        }
      : baseQuery;

    let users = await User.find(withBuQuery).select('email').lean();
    if (!users.length && businessUnit) {
      users = await User.find(baseQuery).select('email').lean();
    }

    users.forEach((user) => {
      if (user?.email) emails.add(user.email);
    });
  }

  return emails;
};

const CARD_ASSIGNED_EMAIL_CREATOR_ROLES = ['mis_manager', 'super_admin', 'business_unit_admin'];

const resolveSubmittedBy = (entry, fallbackUser) =>
  entry?.cardAssignedTo || entry?.createdBy?.name || fallbackUser?.name || 'MIS';

const sendMisNotificationsForEntry = async (entry, submittedBy, cachedMisManagers = null) => {
  const misManagers =
    cachedMisManagers || (await User.find({ role: 'mis_manager', isActive: true }).lean());
  const recipients = misManagers.filter((mis) => mis.email);
  if (recipients.length === 0) {
    return { total: 0, success: 0, failed: 0 };
  }

  const results = await Promise.allSettled(
    recipients.map((mis) => sendMISNotificationEmail(mis.email, entry, submittedBy))
  );

  let success = 0;
  let failed = 0;
  results.forEach((result, index) => {
    const email = recipients[index]?.email;
    if (result.status === 'fulfilled' && result.value) {
      success += 1;
      return;
    }
    failed += 1;
    console.warn('[MIS Email] Failed to send notification', {
      email,
      entryId: entry?._id?.toString?.() || entry?._id,
      error: result.status === 'rejected' ? result.reason?.message || result.reason : 'send-failed',
    });
  });

  return { total: recipients.length, success, failed };
};

const CLUB_CLEAR_FIELDS = {
  clubGroupId: null,
  isClubRepresentative: false,
  clubbedBy: null,
  clubbedAt: null,
};

const getComparableTime = (value) => {
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
};

const sortEntriesByRecency = (entries = []) =>
  [...entries].sort((a, b) => {
    const timeDiff = getComparableTime(b?.date || b?.createdAt) - getComparableTime(a?.date || a?.createdAt);
    if (timeDiff !== 0) return timeDiff;
    return (a?._id?.toString?.() || '').localeCompare(b?._id?.toString?.() || '');
  });

const buildClubbedExpenseRows = (entries = []) => {
  const grouped = new Map();

  entries.forEach((entry) => {
    const groupId = entry?.clubGroupId;
    if (groupId) {
      if (!grouped.has(groupId)) grouped.set(groupId, []);
      grouped.get(groupId).push(entry);
    }
  });

  const emittedGroups = new Set();
  const rows = [];

  entries.forEach((entry) => {
    const groupId = entry?.clubGroupId;
    if (!groupId) {
      rows.push(entry);
      return;
    }
    if (emittedGroups.has(groupId)) return;

    const members = grouped.get(groupId) || [];
    const sortedMembers = sortEntriesByRecency(members);
    if (sortedMembers.length === 0) return;

    const representative = members.find((item) => item.isClubRepresentative) || sortedMembers[0];
    const clubbedEntries = sortedMembers.map((item, idx) => ({
      ...item,
      clubMemberIndex: idx + 1,
    }));
    const totalAmount = clubbedEntries.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
    const totalAmountInINR = clubbedEntries.reduce((sum, item) => sum + (Number(item.amountInINR) || 0), 0);

    rows.push({
      ...representative,
      amount: totalAmount,
      amountInINR: totalAmountInINR,
      isClubbed: true,
      clubGroupId: groupId,
      clubbedEntryCount: clubbedEntries.length,
      clubbedEntries,
      clubbedSummary: `${clubbedEntries.length} entries clubbed`,
    });
    emittedGroups.add(groupId);
  });

  return rows;
};

const ensureClubRepresentatives = async (groupIds = []) => {
  const normalized = [...new Set((groupIds || []).filter(Boolean))];
  if (normalized.length === 0) return;

  const groupedEntries = await ExpenseEntry.find({ clubGroupId: { $in: normalized } })
    .select('_id clubGroupId isClubRepresentative date createdAt')
    .lean();

  const byGroup = new Map();
  groupedEntries.forEach((entry) => {
    if (!entry.clubGroupId) return;
    if (!byGroup.has(entry.clubGroupId)) byGroup.set(entry.clubGroupId, []);
    byGroup.get(entry.clubGroupId).push(entry);
  });

  for (const [groupId, entries] of byGroup.entries()) {
    if (!entries?.length) continue;
    if (entries.some((entry) => entry.isClubRepresentative)) continue;

    const fallback = sortEntriesByRecency(entries)[0];
    if (!fallback?._id) continue;

    await ExpenseEntry.findByIdAndUpdate(fallback._id, {
      $set: { isClubRepresentative: true },
    });
  }
};

// @desc    Create new expense entry
// @route   POST /api/expenses
// @access  Private (SPOC, MIS, Super Admin, Business Unit Admin)
export const createExpenseEntry = async (req, res) => {
  try {
    const isMisBypassEnabled =
      req.user.role === 'mis_manager' && parseBooleanFlag(req.body?.misBypassMandatoryFields);

    const {
      cardNumber,
      cardAssignedTo,
      cardAssignedToUserId,
      date,
      month,
      status,
      particulars,
      narration,
      currency,
      billStatus,
      amount,
      typeOfService,
      businessUnit,
      costCenter,
      approvedBy,
      serviceHandler,
      recurring,
      isShared = false,
      sharedAllocations = [],
    } = req.body;

    const missingFields = [];
    const conditionalRequiredFields = [
      ['typeOfService', typeOfService, 'Type of Service'],
      ['businessUnit', businessUnit, 'Business Unit'],
      ['costCenter', costCenter, 'Cost Center'],
      ['approvedBy', approvedBy, 'Approved By'],
      ['serviceHandler', serviceHandler, 'Service Handler'],
    ];

    if (!isMisBypassEnabled) {
      conditionalRequiredFields.forEach(([, value, label]) => {
        if (isBlank(value)) missingFields.push(label);
      });
      if (missingFields.length) {
        return res.status(400).json({
          success: false,
          message: `Missing required field(s): ${missingFields.join(', ')}`,
        });
      }
    }

    const creatorRequiresCardAssignedSelection = CARD_ASSIGNED_EMAIL_CREATOR_ROLES.includes(req.user.role);
    let selectedCardAssignedUser = null;

    if (cardAssignedToUserId) {
      if (!mongoose.Types.ObjectId.isValid(cardAssignedToUserId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid Card Assigned To user selection',
        });
      }

      selectedCardAssignedUser = await User.findOne({
        _id: cardAssignedToUserId,
        isActive: true,
      })
        .select('_id name email role businessUnit isActive')
        .lean();

      if (!selectedCardAssignedUser) {
        return res.status(400).json({
          success: false,
          message: 'Selected Card Assigned To user is not available',
        });
      }
    }

    if (creatorRequiresCardAssignedSelection && !selectedCardAssignedUser) {
      return res.status(400).json({
        success: false,
        message: 'Please select a valid "Card Assigned To" user from the dropdown',
      });
    }

    // Restrict SPOC/Business Unit Admin to their own business unit
    if (['spoc', 'business_unit_admin'].includes(req.user.role)) {
      if (businessUnit !== req.user.businessUnit) {
        return res.status(403).json({
          success: false,
          message: 'You can only create entries for your assigned business unit',
        });
      }
    }

    const parsedAmount = parseAmountValue(amount);
    if (Number.isNaN(parsedAmount)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid amount value',
      });
    }
    const normalizedAmount = Math.abs(parsedAmount);

    // Get current exchange rate
    const { rate, amountInINR } = await convertToINR(normalizedAmount, currency);

    // Validate shared allocations
    let sharedPayload = { isShared: false, sharedAllocations: [] };
    try {
      sharedPayload = validateSharedAllocations(isShared, sharedAllocations, normalizedAmount, businessUnit);
    } catch (err) {
      return res.status(400).json({
        success: false,
        message: err.message,
      });
    }

    const recurringLabel = recurring
      ? recurring.toString().trim().toLowerCase() === 'quarterly'
        ? 'Quaterly'
        : recurring.toString().trim().toLowerCase() === 'quaterly'
        ? 'Quaterly'
        : recurring
      : recurring;

    // Calculate next renewal date if recurring
    let nextRenewalDate = null;
    if (recurringLabel === 'Monthly') {
      nextRenewalDate = new Date(date);
      nextRenewalDate.setMonth(nextRenewalDate.getMonth() + 1);
    } else if (recurringLabel === 'Yearly') {
      nextRenewalDate = new Date(date);
      nextRenewalDate.setFullYear(nextRenewalDate.getFullYear() + 1);
    } else if (recurringLabel === 'Quaterly') {
      nextRenewalDate = new Date(date);
      nextRenewalDate.setMonth(nextRenewalDate.getMonth() + 3);
    }

    let duplicateStatus = null;
    if (['mis_manager', 'super_admin'].includes(req.user.role) && req.body?.duplicateStatus === 'Unique') {
      duplicateStatus = 'Unique';
    }

    // Determine entry status based on user role
    let entryStatus = 'Pending';
    let approvalToken = null;

    // Auto-approve all roles (including SPOC). SPOC now informational-only.
    if (['mis_manager', 'super_admin', 'business_unit_admin', 'spoc'].includes(req.user.role)) {
      entryStatus = 'Accepted';
    }

    const createPayload = omitBlankFields(
      {
        cardNumber,
        cardAssignedTo: selectedCardAssignedUser?.name || cardAssignedTo,
        cardAssignedToUser: selectedCardAssignedUser?._id || null,
        date,
        month,
        status,
        particulars,
        narration,
        currency,
        billStatus,
        amount: normalizedAmount,
        xeRate: Math.abs(rate),
        amountInINR: Math.abs(amountInINR),
        typeOfService,
        businessUnit,
        costCenter,
        approvedBy,
        serviceHandler,
        recurring: recurringLabel,
        entryStatus,
        duplicateStatus: ['mis_manager', 'super_admin'].includes(req.user.role) ? duplicateStatus : null,
        createdBy: req.user._id,
        approvalToken,
        nextRenewalDate,
        isShared: sharedPayload.isShared,
        sharedAllocations: sharedPayload.sharedAllocations,
      },
      ['status', 'billStatus', 'typeOfService', 'businessUnit', 'costCenter', 'approvedBy', 'serviceHandler', 'recurring']
    );

    // Create expense entry
    const expenseEntry = await ExpenseEntry.create(createPayload);

    const isActiveStatus = (status || '').toString().toLowerCase() === 'active';
    const uploaderName = req.user?.name || 'MIS';
    let misManagers = [];
    let misEmailSet = new Set();

    if (entryStatus === 'Accepted') {
      misManagers = await User.find({ role: 'mis_manager', isActive: true }).lean();
      misEmailSet = new Set(
        misManagers
          .map((mis) => mis.email?.toLowerCase())
          .filter((email) => email)
      );
    }

    if (entryStatus === 'Accepted' && isActiveStatus && businessUnit) {
      // Notify BU admins (always for accepted active entries)
      const businessUnitAdmins = await User.find({
        role: 'business_unit_admin',
        businessUnit,
      });

      await Promise.all(
        businessUnitAdmins.map(async (admin) => {
          await Notification.create({
            user: admin._id,
            type: 'entry_approved',
            title: 'New expense entry added',
            message: `${uploaderName} added ${expenseEntry.particulars} (${expenseEntry.currency} ${expenseEntry.amount}) to ${expenseEntry.businessUnit}.`,
            relatedEntry: expenseEntry._id,
            actionRequired: false,
          });
          const adminEmail = admin.email?.toLowerCase();
          if (adminEmail && !misEmailSet.has(adminEmail)) {
            await sendBUEntryNoticeEmail(admin.email, expenseEntry, uploaderName);
          }
        })
      );
    }

    if (entryStatus === 'Accepted' && isActiveStatus) {
      // Notify Card Assigned user(s) + service handler
      const spocNames = parseNameList(cardAssignedTo);
      const handlerNames = parseNameList(serviceHandler);

      let spocEmails = new Set();
      const shouldSendCardAssignedEmail = CARD_ASSIGNED_EMAIL_CREATOR_ROLES.includes(req.user.role);
      if (shouldSendCardAssignedEmail) {
        if (selectedCardAssignedUser?.email) {
          spocEmails.add(selectedCardAssignedUser.email);
        } else {
          // Backward-compatible fallback for older clients that may not send cardAssignedToUserId.
          spocEmails = await resolveUserEmailsByNames({
            names: spocNames,
            businessUnit,
            roles: ['spoc', 'business_unit_admin', 'service_handler', 'mis_manager', 'super_admin'],
          });
        }
      }

      const handlerEmails = await resolveUserEmailsByNames({
        names: handlerNames,
        businessUnit,
        roles: ['service_handler'],
      });

      await Promise.all([
        ...[...spocEmails]
          .filter((email) => !misEmailSet.has(String(email).toLowerCase()))
          .map((email) => sendSpocEntryEmail(email, expenseEntry, uploaderName)),
        ...[...handlerEmails]
          .filter((email) => !misEmailSet.has(String(email).toLowerCase()))
          .map((email) =>
          sendServiceHandlerEntryEmail(email, expenseEntry, uploaderName)
        ),
      ]);
    }

    if (entryStatus === 'Accepted') {
      await sendMisNotificationsForEntry(expenseEntry, uploaderName, misManagers);
    }

    res.status(201).json({
      success: true,
      message: 'Expense entry created successfully',
      data: expenseEntry,
    });
  } catch (error) {
    console.error('Error creating expense entry:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get all expense entries (with filters)
// @route   GET /api/expenses
// @access  Private
export const getExpenseEntries = async (req, res) => {
  try {
    const {
      businessUnit,
      cardNumber,
      cardAssignedTo,
      status,
      date,
      month,
      typeOfService,
      serviceHandler,
      search,
      startDate,
      endDate,
      minAmount,
      maxAmount,
      costCenter,
      approvedBy,
      recurring,
      duplicateStatus,
      disableStartDate,
      disableEndDate,
      isShared,
    } = req.query;

    let query = {};

    // Role-based filtering
    if (['business_unit_admin', 'spoc', 'service_handler'].includes(req.user.role)) {
      query.businessUnit = req.user.businessUnit;
    }

    if (req.user.role === 'service_handler') {
      const escapedName = req.user.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const tokens = req.user.name
        .split(' ')
        .map((t) => t.trim())
        .filter(Boolean)
        .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
      const patternParts = [escapedName, ...tokens];
      const pattern = patternParts.join('|');
      query.serviceHandler = { $regex: pattern, $options: 'i' };
    }

    // Apply filters
    if (!['business_unit_admin', 'spoc', 'service_handler'].includes(req.user.role) && businessUnit) {
      if (!applyEmptyFilter(query, 'businessUnit', businessUnit)) {
        query.businessUnit = businessUnit;
      }
    }
    if (cardNumber) query.cardNumber = cardNumber;
    if (status) {
      if (!applyEmptyFilter(query, 'status', status)) {
        query.status = status;
      }
    }
    if (month) query.month = month;
    if (typeOfService) {
      if (!applyEmptyFilter(query, 'typeOfService', typeOfService)) {
        query.typeOfService = typeOfService;
      }
    }
    if (serviceHandler) applyMultiValueFilter(query, 'serviceHandler', serviceHandler);
    if (cardAssignedTo) applyMultiValueFilter(query, 'cardAssignedTo', cardAssignedTo);
    if (costCenter) {
      if (!applyEmptyFilter(query, 'costCenter', costCenter)) {
        query.costCenter = costCenter;
      }
    }
    if (approvedBy) {
      if (!applyEmptyFilter(query, 'approvedBy', approvedBy)) {
        query.approvedBy = approvedBy;
      }
    }
    if (recurring) {
      if (!applyEmptyFilter(query, 'recurring', recurring)) {
        query.recurring = recurring;
      }
    }
    if (isShared === 'true') query.isShared = true;
    if (isShared === 'false') query.isShared = false;

    // Date range filter
    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = parseFilterDate(startDate);
      if (endDate) query.date.$lte = parseFilterDate(endDate, true);
    }

    // Disable date range filter
    if (disableStartDate || disableEndDate) {
      const range = {};
      if (disableStartDate) range.$gte = parseFilterDate(disableStartDate);
      if (disableEndDate) range.$lte = parseFilterDate(disableEndDate, true);

    // Default to deactive if caller didn't choose a status
      if (!status) {
        query.status = 'Deactive';
      }

    // Match entries with disabledAt in range OR (legacy) updatedAt in range if deactivated
      const disableClauses = [];
      disableClauses.push({ disabledAt: range });
      disableClauses.push({ $and: [{ status: 'Deactive' }, { updatedAt: range }] });
      query.$or = query.$or ? [...query.$or, ...disableClauses] : disableClauses;
    }

    // Amount range filter
    if (minAmount || maxAmount) {
      query.amountInINR = {};
      if (minAmount) query.amountInINR.$gte = parseFloat(minAmount);
      if (maxAmount) query.amountInINR.$lte = parseFloat(maxAmount);
    }

    // Search filter
    if (search) {
      const searchClause = [
        { particulars: { $regex: search, $options: 'i' } },
        { narration: { $regex: search, $options: 'i' } },
        { cardNumber: { $regex: search, $options: 'i' } },
        { serviceHandler: { $regex: search, $options: 'i' } },
        { cardAssignedTo: { $regex: search, $options: 'i' } },
      ];
      query.$or = query.$or ? [...query.$or, ...searchClause] : searchClause;
    }

    // Restrict visibility: only SPOC can see their pending/rejected; others see accepted entries only
    // Skip this restriction when explicitly filtering by disable date (we already force status Deactive)
    if (req.user.role !== 'spoc' && !(disableStartDate || disableEndDate)) {
      query.entryStatus = 'Accepted';
    }

    const expenseEntries = await ExpenseEntry.find(query)
      .populate('createdBy', 'name email role')
      .populate('cardAssignedToUser', 'name email role businessUnit')
      .sort({ date: -1 })
      .lean();

    const annotated = annotateDuplicates(expenseEntries);
    const filtered = filterByDuplicateStatus(annotated, duplicateStatus);
    const clubbedRows = buildClubbedExpenseRows(filtered);

    res.status(200).json({
      success: true,
      count: clubbedRows.length,
      data: clubbedRows,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get single expense entry
// @route   GET /api/expenses/:id
// @access  Private
export const getExpenseEntry = async (req, res) => {
  try {
    const expenseEntry = await ExpenseEntry.findById(req.params.id)
      .populate('createdBy', 'name email role')
      .populate('cardAssignedToUser', 'name email role businessUnit');

    if (!expenseEntry) {
      return res.status(404).json({
        success: false,
        message: 'Expense entry not found',
      });
    }

    res.status(200).json({
      success: true,
      data: expenseEntry,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Update expense entry
// @route   PUT /api/expenses/:id
// @access  Private (MIS, Super Admin)
export const updateExpenseEntry = async (req, res) => {
  try {
    let expenseEntry = await ExpenseEntry.findById(req.params.id);

    if (!expenseEntry) {
      return res.status(404).json({
        success: false,
        message: 'Expense entry not found',
      });
    }

    const previousStatus = expenseEntry.status;
    const previousAllocations = normalizeAllocationsForCompare(expenseEntry.sharedAllocations);
    const previousAmount = Number(expenseEntry.amount) || 0;
    const previousDuplicateStatus = expenseEntry.duplicateStatus || null;

    ['typeOfService', 'costCenter', 'approvedBy', 'serviceHandler', 'recurring', 'businessUnit'].forEach((field) => {
      if (req.body[field] === '') {
        delete req.body[field];
      }
    });

    if (req.body.recurring) {
      const recurringNormalized = req.body.recurring.toString().trim().toLowerCase();
      if (['quarterly', 'quaterly', 'qtr', 'qtrly', 'quarter'].includes(recurringNormalized)) {
        req.body.recurring = 'Quaterly';
      }
    }

    if (req.body.recurring || req.body.date) {
      const nextRecurring = req.body.recurring ?? expenseEntry.recurring;
      const baseDate = req.body.date ? new Date(req.body.date) : new Date(expenseEntry.date);
      if (nextRecurring === 'Monthly') {
        const nextDate = new Date(baseDate);
        nextDate.setMonth(nextDate.getMonth() + 1);
        req.body.nextRenewalDate = nextDate;
        req.body.renewalNotificationSent = false;
        req.body.autoCancellationNotificationSent = false;
      } else if (nextRecurring === 'Yearly') {
        const nextDate = new Date(baseDate);
        nextDate.setFullYear(nextDate.getFullYear() + 1);
        req.body.nextRenewalDate = nextDate;
        req.body.renewalNotificationSent = false;
        req.body.autoCancellationNotificationSent = false;
      } else if (nextRecurring === 'Quaterly') {
        const nextDate = new Date(baseDate);
        nextDate.setMonth(nextDate.getMonth() + 3);
        req.body.nextRenewalDate = nextDate;
        req.body.renewalNotificationSent = false;
        req.body.autoCancellationNotificationSent = false;
      } else {
        req.body.nextRenewalDate = null;
      }
    }

    if (req.body.duplicateStatus !== undefined) {
      if (!['mis_manager', 'super_admin'].includes(req.user.role)) {
        delete req.body.duplicateStatus;
      } else {
        const normalized = req.body.duplicateStatus?.toString().trim();
        if (!normalized || normalized.toLowerCase() === 'auto') {
          req.body.duplicateStatus = null;
        } else if (normalized !== 'Unique') {
          delete req.body.duplicateStatus;
        }
      }
    }

    if (req.body.amount !== undefined) {
      const parsedAmount = parseAmountValue(req.body.amount);
      if (!Number.isNaN(parsedAmount)) {
        req.body.amount = Math.abs(parsedAmount);
      }
    }

    // Shared allocation validation (if provided)
    if (req.body.isShared !== undefined || req.body.sharedAllocations !== undefined) {
      try {
        const validated = validateSharedAllocations(
          req.body.isShared ?? expenseEntry.isShared,
          req.body.sharedAllocations ?? expenseEntry.sharedAllocations,
          req.body.amount ?? expenseEntry.amount,
          req.body.businessUnit ?? expenseEntry.businessUnit
        );
        req.body.isShared = validated.isShared;
        req.body.sharedAllocations = validated.sharedAllocations;
        const sharedTotal = validated.sharedAllocations.reduce((sum, item) => sum + item.amount, 0);
        if (validated.isShared && sharedTotal > 0) {
          req.body.amount = sharedTotal;
        }
      } catch (err) {
        return res.status(400).json({
          success: false,
          message: err.message,
        });
      }
    }

    // If amount or currency changed, recalculate INR amount
    if (req.body.amount || req.body.currency) {
      const amount = req.body.amount || expenseEntry.amount;
      const currency = req.body.currency || expenseEntry.currency;
      const parsedAmount = parseAmountValue(amount);
      const normalizedAmount = Number.isNaN(parsedAmount)
        ? normalizePositiveAmount(expenseEntry.amount)
        : Math.abs(parsedAmount);
      const { rate, amountInINR } = await convertToINR(normalizedAmount, currency);
      req.body.amount = normalizedAmount;
      req.body.xeRate = Math.abs(rate);
      req.body.amountInINR = Math.abs(amountInINR);
    }

    // If status moved to Deactive, stamp disabledAt and log
    if (req.body.status === 'Deactive' && previousStatus !== 'Deactive') {
      req.body.disabledAt = new Date();
    }

    expenseEntry = await ExpenseEntry.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    const updatedAllocations = normalizeAllocationsForCompare(expenseEntry.sharedAllocations);
    const allocationsChanged = !allocationsEqual(previousAllocations, updatedAllocations);
    const amountChanged = previousAmount !== (Number(expenseEntry.amount) || 0);
    const nextDuplicateStatus = expenseEntry.duplicateStatus || null;
    const duplicateOverrideChanged = previousDuplicateStatus !== nextDuplicateStatus;

    // Create log when MIS/Super Admin disables a service
    if (
      req.body.status === 'Deactive' &&
      previousStatus !== 'Deactive' &&
      ['mis_manager', 'super_admin'].includes(req.user.role)
    ) {
      await RenewalLog.create({
        expenseEntry: expenseEntry._id,
        serviceHandler: expenseEntry.serviceHandler,
        action: 'DisableByMIS',
        reason: req.body.disableReason || 'Disabled by MIS',
        renewalDate: new Date(),
        });
    }

    if ((allocationsChanged || amountChanged) && expenseEntry.isShared) {
      const reasonParts = [`Shared allocation updated by ${req.user.name}.`];
      const updatedAmount = Number(expenseEntry.amount) || 0;
      if (previousAmount !== updatedAmount) {
        reasonParts.push(`Total ${previousAmount} -> ${updatedAmount}.`);
      }
      if (allocationsChanged) {
        const fromLabel = formatAllocations(previousAllocations) || 'none';
        const toLabel = formatAllocations(updatedAllocations) || 'none';
        reasonParts.push(`Allocations ${fromLabel} -> ${toLabel}.`);
      }
      await RenewalLog.create({
        expenseEntry: expenseEntry._id,
        serviceHandler: expenseEntry.serviceHandler,
        action: 'SharedEdit',
        reason: reasonParts.join(' '),
        renewalDate: new Date(),
      });
    }

    if (duplicateOverrideChanged && ['mis_manager', 'super_admin'].includes(req.user.role)) {
      const fromLabel = previousDuplicateStatus || 'Auto';
      const toLabel = nextDuplicateStatus || 'Auto';
      await RenewalLog.create({
        expenseEntry: expenseEntry._id,
        serviceHandler: expenseEntry.serviceHandler,
        action: 'DuplicateOverride',
        reason: `Duplicate status updated by ${req.user.name}: ${fromLabel} -> ${toLabel}.`,
        renewalDate: new Date(),
      });
    }

    res.status(200).json({
      success: true,
      message: 'Expense entry updated successfully',
      data: expenseEntry,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Delete expense entry
// @route   DELETE /api/expenses/:id
// @access  Private (Super Admin)
export const deleteExpenseEntry = async (req, res) => {
  try {
    const expenseEntry = await ExpenseEntry.findById(req.params.id);

    if (!expenseEntry) {
      return res.status(404).json({
        success: false,
        message: 'Expense entry not found',
      });
    }

    const actorLabel = req.user?.role === 'mis_manager' ? 'MIS Manager' : 'Super Admin';
    await RenewalLog.create({
      expenseEntry: expenseEntry._id,
      serviceHandler: expenseEntry.serviceHandler || expenseEntry.cardAssignedTo || 'Unknown',
      action: 'DeleteEntry',
      reason: `Entry deleted by ${actorLabel} (${req.user?.name || 'System'}): ${expenseEntry.particulars || 'Entry'} | Card ${expenseEntry.cardNumber || '-'} | Amount ${expenseEntry.amount || 0} ${expenseEntry.currency || ''}.`,
      renewalDate: new Date(),
    });

    const affectedGroupId = expenseEntry.clubGroupId || null;

    await ExpenseEntry.findByIdAndDelete(req.params.id);
    await ensureClubRepresentatives([affectedGroupId]);

    res.status(200).json({
      success: true,
      message: 'Expense entry deleted successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Bulk delete expense entries
// @route   POST /api/expenses/bulk-delete
// @access  Private (MIS, Super Admin)
export const bulkDeleteExpenseEntries = async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
    if (ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No expense entries selected for deletion',
      });
    }

    const entries = await ExpenseEntry.find({ _id: { $in: ids } });
    if (entries.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No matching expense entries found',
      });
    }

    const actorLabel = req.user?.role === 'mis_manager' ? 'MIS Manager' : 'Super Admin';
    const affectedGroupIds = [...new Set(entries.map((entry) => entry.clubGroupId).filter(Boolean))];
    const now = new Date();
    const logs = entries.map((entry) => ({
      expenseEntry: entry._id,
      serviceHandler: entry.serviceHandler || entry.cardAssignedTo || 'Unknown',
      action: 'DeleteEntry',
      reason: `Entry deleted by ${actorLabel} (${req.user?.name || 'System'}): ${entry.particulars || 'Entry'} | Card ${entry.cardNumber || '-'} | Amount ${entry.amount || 0} ${entry.currency || ''}.`,
      renewalDate: now,
    }));

    await RenewalLog.insertMany(logs);
    await ExpenseEntry.deleteMany({ _id: { $in: ids } });
    await ensureClubRepresentatives(affectedGroupIds);

    res.status(200).json({
      success: true,
      deleted: entries.length,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Club multiple expense entries into one grouped row
// @route   POST /api/expenses/club
// @access  Private (MIS, Super Admin)
export const clubExpenseEntries = async (req, res) => {
  try {
    const rawIds = Array.isArray(req.body?.ids) ? req.body.ids : [];
    const ids = [...new Set(rawIds.map((id) => id?.toString?.()).filter(Boolean))];

    if (ids.length < 2) {
      return res.status(400).json({
        success: false,
        message: 'Select at least 2 entries to create a club',
      });
    }

    if (!ids.every((id) => mongoose.Types.ObjectId.isValid(id))) {
      return res.status(400).json({
        success: false,
        message: 'One or more selected entry IDs are invalid',
      });
    }

    const entries = await ExpenseEntry.find({ _id: { $in: ids } }).lean();
    const entryMap = new Map(entries.map((entry) => [entry._id.toString(), entry]));
    const missingIds = ids.filter((id) => !entryMap.has(id));
    if (missingIds.length > 0) {
      return res.status(404).json({
        success: false,
        message: 'Some selected entries were not found',
        data: { missingIds },
      });
    }

    const alreadyClubbed = entries.filter((entry) => entry.clubGroupId).map((entry) => entry._id.toString());
    if (alreadyClubbed.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Some selected entries are already clubbed. Unclub them first.',
        data: { alreadyClubbed },
      });
    }

    const nonAccepted = entries
      .filter((entry) => entry.entryStatus !== 'Accepted')
      .map((entry) => entry._id.toString());
    if (nonAccepted.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Only accepted entries can be clubbed',
        data: { nonAccepted },
      });
    }

    const representativeId = ids[0];
    const clubGroupId = new mongoose.Types.ObjectId().toString();
    const now = new Date();

    await ExpenseEntry.bulkWrite(
      ids.map((id) => ({
        updateOne: {
          filter: { _id: id },
          update: {
            $set: {
              clubGroupId,
              isClubRepresentative: id === representativeId,
              clubbedBy: req.user?._id || null,
              clubbedAt: now,
            },
          },
        },
      }))
    );

    const clubbedEntries = await ExpenseEntry.find({ clubGroupId })
      .select('_id clubGroupId isClubRepresentative')
      .lean();

    res.status(200).json({
      success: true,
      message: 'Entries clubbed successfully',
      data: {
        clubGroupId,
        representativeId,
        clubbedEntryCount: clubbedEntries.length,
        entryIds: clubbedEntries.map((entry) => entry._id.toString()),
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Remove club grouping from a clubbed set of entries
// @route   POST /api/expenses/club/:clubGroupId/unclub
// @access  Private (MIS, Super Admin)
export const unclubExpenseEntries = async (req, res) => {
  try {
    const clubGroupId = req.params?.clubGroupId?.toString()?.trim();
    if (!clubGroupId) {
      return res.status(400).json({
        success: false,
        message: 'Club group ID is required',
      });
    }

    const entries = await ExpenseEntry.find({ clubGroupId }).select('_id').lean();
    if (entries.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Club group not found',
      });
    }

    await ExpenseEntry.updateMany(
      { clubGroupId },
      {
        $set: CLUB_CLEAR_FIELDS,
      }
    );

    res.status(200).json({
      success: true,
      message: 'Entries unclubbed successfully',
      data: {
        clubGroupId,
        unclubbedCount: entries.length,
        entryIds: entries.map((entry) => entry._id.toString()),
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Resend MIS notification email for a single entry
// @route   POST /api/expenses/:id/resend-mis
// @access  Private (MIS, Super Admin)
export const resendMISNotification = async (req, res) => {
  try {
    const expenseEntry = await ExpenseEntry.findById(req.params.id).populate(
      'createdBy',
      'name'
    );

    if (!expenseEntry) {
      return res.status(404).json({
        success: false,
        message: 'Expense entry not found',
      });
    }

    if (expenseEntry.entryStatus !== 'Accepted') {
      return res.status(400).json({
        success: false,
        message: 'Only accepted entries can be resent to MIS',
      });
    }

    const submittedBy = resolveSubmittedBy(expenseEntry, req.user);
    const summary = await sendMisNotificationsForEntry(expenseEntry, submittedBy);

    res.status(200).json({
      success: true,
      message: 'MIS notification resend completed',
      data: {
        entryId: expenseEntry._id,
        ...summary,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Resend MIS notification emails for multiple entries
// @route   POST /api/expenses/bulk-resend-mis
// @access  Private (MIS, Super Admin)
export const bulkResendMISNotifications = async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
    if (ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No expense entries selected for MIS resend',
      });
    }

    const entries = await ExpenseEntry.find({ _id: { $in: ids } }).populate(
      'createdBy',
      'name'
    );
    const entryMap = new Map(entries.map((entry) => [entry._id.toString(), entry]));
    const missingIds = ids.filter((id) => !entryMap.has(id.toString()));

    const misManagers = await User.find({ role: 'mis_manager', isActive: true }).lean();
    const results = [];
    let totalEmails = 0;
    let emailSuccess = 0;
    let emailFailed = 0;
    let entriesSent = 0;
    let entriesSkipped = 0;
    let entriesMissing = missingIds.length;

    for (const entry of entries) {
      const entryId = entry._id.toString();
      if (entry.entryStatus !== 'Accepted') {
        entriesSkipped += 1;
        results.push({
          entryId,
          status: 'skipped',
          reason: 'Entry not accepted',
        });
        continue;
      }

      const submittedBy = resolveSubmittedBy(entry, req.user);
      const summary = await sendMisNotificationsForEntry(entry, submittedBy, misManagers);
      entriesSent += 1;
      totalEmails += summary.total;
      emailSuccess += summary.success;
      emailFailed += summary.failed;
      results.push({
        entryId,
        status: 'sent',
        ...summary,
      });
    }

    missingIds.forEach((id) => {
      results.push({
        entryId: id,
        status: 'missing',
        reason: 'Entry not found',
      });
    });

    res.status(200).json({
      success: true,
      message: 'Bulk MIS resend completed',
      data: {
        totalRequested: ids.length,
        entriesSent,
        entriesSkipped,
        entriesMissing,
        totalEmails,
        emailSuccess,
        emailFailed,
        results,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Approve expense entry (via email link)
// @route   GET /api/expenses/approve/:token
// @access  Public
export const approveExpenseEntry = async (req, res) => {
  try {
    const { token } = req.params;

    const expenseEntry = await ExpenseEntry.findOne({ approvalToken: token });

    if (!expenseEntry) {
      return res.status(404).json({
        success: false,
        message: 'Invalid or expired approval link',
      });
    }

    if (expenseEntry.entryStatus !== 'Pending') {
      return res.status(400).json({
        success: false,
        message: 'This entry has already been processed',
      });
    }

    expenseEntry.entryStatus = 'Accepted';
    await expenseEntry.save();

    // Notify MIS Manager
    const misManager = await User.findOne({ role: 'mis_manager' });
    const spoc = await User.findById(expenseEntry.createdBy);

    if (misManager && spoc) {
      await sendMISNotificationEmail(misManager.email, expenseEntry, spoc.name);
    }

    res.status(200).json({
      success: true,
      message: 'Expense entry approved successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Reject expense entry (via email link)
// @route   GET /api/expenses/reject/:token
// @access  Public
export const rejectExpenseEntry = async (req, res) => {
  try {
    const { token } = req.params;

    const expenseEntry = await ExpenseEntry.findOne({ approvalToken: token });

    if (!expenseEntry) {
      return res.status(404).json({
        success: false,
        message: 'Invalid or expired approval link',
      });
    }

    if (expenseEntry.entryStatus !== 'Pending') {
      return res.status(400).json({
        success: false,
        message: 'This entry has already been processed',
      });
    }

    expenseEntry.entryStatus = 'Rejected';
    await expenseEntry.save();

    res.status(200).json({
      success: true,
      message: 'Expense entry rejected successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get expense statistics
// @route   GET /api/expenses/stats
// @access  Private
export const getExpenseStats = async (req, res) => {
  try {
    let matchQuery = {};

    // Align visibility with list endpoint: only SPOC can see non-accepted entries
    if (req.user.role !== 'spoc') {
      matchQuery.entryStatus = 'Accepted';
    }

    // Role-based filtering
    if (req.user.role === 'business_unit_admin' || req.user.role === 'spoc') {
      matchQuery.businessUnit = req.user.businessUnit;
    }

    if (req.user.role === 'service_handler') {
      matchQuery.businessUnit = req.user.businessUnit;
      const escapedName = req.user.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const tokens = req.user.name
        .split(' ')
        .map((t) => t.trim())
        .filter(Boolean)
        .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
      const patternParts = [escapedName, ...tokens];
      const pattern = patternParts.join('|');
      matchQuery.serviceHandler = { $regex: pattern, $options: 'i' };
    }

    const stats = await ExpenseEntry.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: null,
          totalExpenses: { $sum: '$amountInINR' },
          totalEntries: { $sum: 1 },
          avgExpense: { $avg: '$amountInINR' },
        },
      },
    ]);

    const byBusinessUnit = await ExpenseEntry.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: '$businessUnit',
          total: { $sum: '$amountInINR' },
          count: { $sum: 1 },
        },
      },
    ]);

    const byType = await ExpenseEntry.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: '$typeOfService',
          total: { $sum: '$amountInINR' },
          count: { $sum: 1 },
        },
      },
    ]);

    res.status(200).json({
      success: true,
      data: {
        overall: stats[0] || { totalExpenses: 0, totalEntries: 0, avgExpense: 0 },
        byBusinessUnit,
        byType,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export default {
  createExpenseEntry,
  getExpenseEntries,
  getExpenseEntry,
  updateExpenseEntry,
  deleteExpenseEntry,
  bulkDeleteExpenseEntries,
  clubExpenseEntries,
  unclubExpenseEntries,
  resendMISNotification,
  bulkResendMISNotifications,
  approveExpenseEntry,
  rejectExpenseEntry,
  getExpenseStats,
};
