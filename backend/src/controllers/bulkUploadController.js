import ExcelJS from 'exceljs';
import csvParser from 'csv-parser';
import path from 'path';
import fs from 'fs';
import ExpenseEntry from '../models/ExpenseEntry.js';
import User from '../models/User.js';
import Notification from '../models/Notification.js';
import { convertToINR } from '../services/currencyService.js';
import { annotateDuplicates, filterByDuplicateStatus } from '../utils/duplicateUtils.js';
import { 
  sendMISNotificationEmail,
  sendBUEntryNoticeEmail,
  sendServiceHandlerEntryEmail,
  sendSpocEntryEmail,
} from '../services/emailService.js';

const parseFilterDate = (value, endOfDay = false) => {
  if (!value) return undefined;
  if (/^\d{2}-\d{2}-\d{4}$/.test(value)) {
    const [dd, mm, yyyy] = value.split('-');
    const iso = `${yyyy}-${mm}-${dd}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`;
    return new Date(iso);
  }
  return new Date(value);
};

const escapeRegex = (value = '') => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const parseMultiValues = (value) =>
  value
    ?.toString()
    .split(',')
    .map((val) => val.trim())
    .filter(Boolean) || [];

const buildRegexList = (values) => values.map((val) => new RegExp(escapeRegex(val), 'i'));

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

const normalizeNameKey = (value) => (value ? value.toString().trim().toLowerCase() : '');

const parseNameList = (value) =>
  value
    ?.toString()
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean) || [];

// @desc    Bulk upload expense entries
// @route   POST /api/expenses/bulk-upload
// @access  Private (MIS, Super Admin)
const parseExcelFile = async (filePath) => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const worksheet = workbook.worksheets[0];

  if (!worksheet) {
    return [];
  }

  const headers = [];
  worksheet.getRow(1).eachCell({ includeEmpty: true }, (cell, colNumber) => {
    headers[colNumber] = cell.text?.trim() || (typeof cell.value === 'string' ? cell.value.trim() : cell.value);
  });

  const rows = [];
  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const rowData = {};

    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const header = headers[colNumber];
      if (!header) return;

      let value = cell.value;
      if (value && typeof value === 'object') {
        if (value.text) {
          value = value.text;
        } else if (value.result) {
          value = value.result;
        } else if (value.richText) {
          value = value.richText.map((item) => item.text).join('');
        } else if (value instanceof Date) {
          value = value;
        }
      }

      rowData[header] = value;
    });

    if (Object.values(rowData).some((val) => val !== undefined && val !== null && `${val}`.trim() !== '')) {
      rows.push(rowData);
    }
  });

  return rows;
};

const parseCSVFile = (filePath) =>
  new Promise((resolve, reject) => {
    const rows = [];
    fs.createReadStream(filePath)
      .pipe(csvParser())
      .on('data', (data) => rows.push(data))
      .on('end', () => resolve(rows))
      .on('error', reject);
  });

const excelSerialToDate = (serial) => {
  if (typeof serial !== 'number') return null;
  const excelEpoch = new Date(Date.UTC(1899, 11, 30));
  const days = Math.floor(serial);
  const milliseconds = days * 86400000;
  const fractionalDay = serial - days;
  const seconds = Math.round(fractionalDay * 86400);
  const date = new Date(excelEpoch.getTime() + milliseconds + seconds * 1000);
  return date;
};

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_LABEL_TO_INDEX = MONTH_LABELS.reduce((acc, label, index) => {
  acc[label.toLowerCase()] = index;
  return acc;
}, {});

const formatMonthLabel = (date) => {
  if (!date || Number.isNaN(date.getTime())) return '';
  const monthIndex = date.getUTCMonth();
  const year = date.getUTCFullYear();
  if (monthIndex < 0 || monthIndex > 11 || !year) return '';
  return `${MONTH_LABELS[monthIndex]}-${year}`;
};

const formatMonthLabelFromParts = (monthIndex, year) => {
  if (monthIndex < 0 || monthIndex > 11 || !year) return '';
  return `${MONTH_LABELS[monthIndex]}-${year}`;
};

const extractMonthYearParts = (raw) => {
  if (!raw && raw !== 0) return null;

  if (raw instanceof Date) {
    return { monthIndex: raw.getUTCMonth(), year: raw.getUTCFullYear() };
  }

  if (typeof raw === 'number') {
    const parsed = parseDateValue(raw);
    if (parsed && !Number.isNaN(parsed.getTime())) {
      return { monthIndex: parsed.getUTCMonth(), year: parsed.getUTCFullYear() };
    }
    return null;
  }

  const text = raw.toString().trim();
  if (!text) return null;

  const monthMatch = text.match(/^([A-Za-z]{3})[-\s]?(\d{2,4})$/);
  if (monthMatch) {
    const monthLabel = monthMatch[1].toLowerCase();
    const monthIndex = MONTH_LABEL_TO_INDEX[monthLabel];
    if (monthIndex !== undefined) {
      const yearRaw = monthMatch[2];
      const year = yearRaw.length === 2 ? Number(`20${yearRaw}`) : Number(yearRaw);
      if (Number.isFinite(year)) {
        return { monthIndex, year };
      }
    }
  }

  const parsed = parseDateValue(text);
  if (parsed && !Number.isNaN(parsed.getTime())) {
    return { monthIndex: parsed.getUTCMonth(), year: parsed.getUTCFullYear() };
  }

  return null;
};

// Parse flexible date formats (Excel serial, mm-dd-yyyy, dd-mm-yyyy, dd-MMM-yy, etc.)
const parseDateValue = (value) => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'number') return excelSerialToDate(value);

  const str = value.toString().trim();
  if (!str) return null;

  // Try native parse first
  const native = new Date(str);
  if (!isNaN(native.getTime())) return native;

  // Normalize separators
  const normalized = str.replace(/\//g, '-');

  // Handle dd-MMM-yy or dd-MMM-yyyy (e.g., 05-Jan-25)
  if (/^\d{1,2}-[A-Za-z]{3}-\d{2,4}$/.test(normalized)) {
    const d = new Date(normalized);
    if (!isNaN(d.getTime())) return d;
  }

  // Handle numeric parts (mm-dd-yyyy or dd-mm-yyyy)
  const parts = normalized.split('-');
  if (parts.length === 3) {
    let [p1, p2, p3] = parts;
    if (p3.length === 2) p3 = `20${p3}`;

    const n1 = parseInt(p1, 10);
    const n2 = parseInt(p2, 10);
    const year = parseInt(p3, 10);

    if (!isNaN(n1) && !isNaN(n2) && !isNaN(year)) {
      let month;
      let day;
      if (n1 > 12) {
        // assume dd-mm-yyyy
        day = n1;
        month = n2;
      } else if (n2 > 12) {
        // assume mm-dd-yyyy
        month = n1;
        day = n2;
      } else {
        // default mm-dd-yyyy
        month = n1;
        day = n2;
      }
      const parsed = new Date(Date.UTC(year, month - 1, day));
      if (!isNaN(parsed.getTime())) return parsed;
    }
  }

  return null;
};

const normalizeMonthValue = (raw, fallbackDate) => {
  const fallbackLabel = fallbackDate ? formatMonthLabel(fallbackDate) : '';
  if (raw !== undefined && raw !== null) {
    const rawParts = extractMonthYearParts(raw);
    if (rawParts) {
      const rawLabel = formatMonthLabelFromParts(rawParts.monthIndex, rawParts.year);
      if (fallbackDate) {
        const fallbackMonth = fallbackDate.getUTCMonth();
        const fallbackYear = fallbackDate.getUTCFullYear();
        if (rawParts.monthIndex !== fallbackMonth || rawParts.year !== fallbackYear) {
          return fallbackLabel;
        }
      }
      return rawLabel || fallbackLabel;
    }

    const trimmed = raw.toString().trim();
    if (!trimmed) return fallbackLabel || '';
    return fallbackLabel || trimmed;
  }
  return fallbackLabel || '';
};

// Helper to fetch a field by multiple aliases (handles trim and lower-case match)
const getField = (row, aliases = []) => {
  const normalizedMap = Object.entries(row || {}).reduce((acc, [key, val]) => {
    const norm = key?.toString().trim().toLowerCase();
    if (norm) acc[norm] = val;
    return acc;
  }, {});

  for (const alias of aliases) {
    if (!alias) continue;
    const norm = alias.toString().trim().toLowerCase();
    if (norm && normalizedMap.hasOwnProperty(norm)) {
      return normalizedMap[norm];
    }
  }
  return undefined;
};

// Normalize enums to allowed values
const normalizeEnum = (value, map, allowedSet) => {
  if (!value) return null;
  const norm = value.toString().trim().toLowerCase();
  if (map[norm]) return map[norm];
  // direct match in allowed set (case-insensitive)
  for (const a of allowedSet) {
    if (a.toLowerCase() === norm) return a;
  }
  return null;
};

const EMPTY_FILTER_VALUE = '__empty__';

const applyEmptyFilter = (query, field, rawValue) => {
  if (rawValue !== EMPTY_FILTER_VALUE) return false;
  const clause = {
    $or: [{ [field]: { $exists: false } }, { [field]: null }, { [field]: '' }],
  };
  query.$and = query.$and ? [...query.$and, clause] : [clause];
  return true;
};

const parseBoolean = (value) => {
  if (value === undefined || value === null) return false;
  const norm = value.toString().trim().toLowerCase();
  if (!norm) return false;
  return ['true', 'yes', 'y', '1', 'shared', 'checked'].includes(norm);
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

const normalizeTextValue = (value) => {
  if (value === undefined || value === null) return '';
  const text = value.toString().trim();
  if (!text) return '';
  const collapsed = text.replace(/\s+/g, ' ');
  const lowered = collapsed.toLowerCase();
  if (['-', 'na', 'n/a', 'null', 'none'].includes(lowered)) return '';
  if (/^[-\u2014]+$/.test(collapsed)) return '';
  return collapsed;
};

const parseSharedAllocations = (raw, normalizeBusinessUnit) => {
  if (!raw) return [];

  // Handle JSON string or array
  if (Array.isArray(raw)) {
    return raw
      .map((item) => {
        const bu = normalizeBusinessUnit(item.businessUnit || item.bu || item.unit);
        const amountValue = parseAmountValue(item.amount ?? item.value ?? item.share);
        const amount = Number.isNaN(amountValue) ? 0 : Math.abs(amountValue);
        return bu && amount > 0 ? { businessUnit: bu, amount } : null;
      })
      .filter(Boolean);
  }

  let text = raw;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parseSharedAllocations(parsed, normalizeBusinessUnit);
    }
  } catch (err) {
    /* fall through to string parsing */
  }

  text = text?.toString?.() || '';
  if (!text.trim()) return [];

  const parts = text
    .split(/[,;|]/)
    .map((p) => p.trim())
    .filter(Boolean);

  const allocations = [];
  for (const part of parts) {
    const match = part.match(/(.+?)[\s:=\-]+([()\-.\d,]+)/);
    if (!match) continue;
    const bu = normalizeBusinessUnit(match[1]);
    const parsedAmount = parseAmountValue(match[2]);
    const amt = Number.isNaN(parsedAmount) ? NaN : Math.abs(parsedAmount);
    if (bu && !Number.isNaN(amt) && amt > 0) {
      allocations.push({ businessUnit: bu, amount: amt });
    }
  }

  return allocations;
};

export const bulkUploadExpenses = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Please upload a file',
      });
    }

    const filePath = req.file.path;
    const ext = path.extname(filePath).toLowerCase();
    let data = [];

    if (ext === '.csv') {
      data = await parseCSVFile(filePath);
    } else {
      data = await parseExcelFile(filePath);
    }

    if (data.length === 0) {
      // Clean up uploaded file
      fs.unlinkSync(filePath);
      return res.status(400).json({
        success: false,
        message: 'No data found in the uploaded file',
      });
    }

    const results = {
      total: data.length,
      success: 0,
      failed: 0,
      errors: [],
    };

    const misManagers = await User.find({ role: 'mis_manager', isActive: true }).lean();
    const misEmailSet = new Set(
      misManagers
        .map((mis) => mis.email?.toLowerCase())
        .filter((email) => email)
    );
    const serviceHandlerCache = new Map();
    const spocCache = new Map();
    const buAdminCache = new Map();
    const emailTasks = [];

    const getUsersByName = async (name, role, businessUnit, cache) => {
      const normalized = normalizeNameKey(name);
      if (!normalized) return [];
      const key = `${role}:${normalized}:${businessUnit || ''}`;
      if (cache.has(key)) return cache.get(key);

      const nameRegex = new RegExp(`^${escapeRegex(name.trim())}$`, 'i');
      let query = { role, isActive: true, name: nameRegex };
      if (businessUnit) {
        query.businessUnit = businessUnit;
      }

      let users = await User.find(query).lean();
      if (users.length === 0 && businessUnit) {
        users = await User.find({ role, isActive: true, name: nameRegex }).lean();
      }

      cache.set(key, users);
      return users;
    };

    const getBUAdmins = async (businessUnit) => {
      if (!businessUnit) return [];
      if (buAdminCache.has(businessUnit)) return buAdminCache.get(businessUnit);
      const admins = await User.find({
        role: 'business_unit_admin',
        businessUnit,
        isActive: true,
      }).lean();
      buAdminCache.set(businessUnit, admins);
      return admins;
    };

    const flushEmailTasks = async () => {
      if (emailTasks.length === 0) return;
      const batch = emailTasks.splice(0, emailTasks.length);
      await Promise.allSettled(batch);
    };

    const queueMISNotification = (misEmail, entryDetails, submittedBy) => {
      if (!misEmail) return;
      emailTasks.push(
        sendMISNotificationEmail(misEmail, entryDetails, submittedBy).then((sent) => {
          if (!sent) {
            console.warn('[Bulk Upload] MIS email failed', {
              email: misEmail,
              entryId: entryDetails?._id?.toString?.() || entryDetails?._id,
              particulars: entryDetails?.particulars,
              businessUnit: entryDetails?.businessUnit,
              cardNumber: entryDetails?.cardNumber,
            });
          }
          return sent;
        })
      );
    };

    for (let i = 0; i < data.length; i++) {
      try {
        const row = data[i];

        // Map column names (handle different naming conventions)
        const rawCardNumber = getField(row, [
          'Card Number/Payment from',
          'Card Number/Payment From',
          'Card Number/Pavment from',
          'Card Number',
          'cardNumber',
          'Card No',
        ]);
        const cardNumber = normalizeTextValue(rawCardNumber);

        const rawAssigned = getField(row, ['Card Assigned To', 'cardAssignedTo', 'Card assigned to']);
        const cardAssignedTo = normalizeTextValue(rawAssigned);
        const date = getField(row, ['Date', 'date']);
        const rawMonth = normalizeTextValue(getField(row, ['Month', 'month']));
        // Enum maps
        const typeMap = {
          'tool & service': 'Tools & Service',
          'tools & service': 'Tools & Service',
          'tool & services': 'Tools & Service',
          'tools & services': 'Tools & Service',
          'tool and service': 'Tools & Service',
          'tools and service': 'Tools & Service',
          'tool and services': 'Tools & Service',
          'tools and services': 'Tools & Service',
          'tools': 'Tool',
          'services': 'Service',
          'tool': 'Tool',
          'service': 'Service',
          'google adwords expenses': 'Google Adwords Expense',
          'google adwords expense': 'Google Adwords Expense',
          'staff & welfare': 'Staff & welfare',
          'staff and welfare': 'Staff & welfare',
          'staff welfare': 'Staff & welfare',
        };
        const allowedTypes = [
          'Domain',
          'Google',
          'Google Adwords Expense',
          'Hosting',
          'Proxy',
          'Server',
          'Service',
          'Tool',
          'Staff & welfare',
          'Tools & Service',
        ];

        const costCenterMap = {
          'ops': 'Ops',
          'op': 'Ops',
          'oh exps': 'OH Exps',
          'oh exps.': 'OH Exps',
          'oh eps': 'OH Exps',
          'oh eps.': 'OH Exps',
          'oh exp': 'OH Exps',
          'oh exp.': 'OH Exps',
          'oh expenses': 'OH Exps',
          'opex': 'OH Exps',
          'fe': 'FE',
          'support': 'Support',
          'management exps': 'Management EXPS',
          'management exps.': 'Management EXPS',
          'management exp': 'Management EXPS',
          'management expenses': 'Management EXPS',
        };
        const allowedCostCenters = ['Ops', 'FE', 'OH Exps', 'Support', 'Management EXPS'];

        const businessUnitMap = {
          'dws g': 'DWSG',
          'dwsg': 'DWSG',
          'dws': 'DWSG',
          'signature': 'Signature',
          'collabx': 'Collabx',
          'wytlabs': 'Wytlabs',
          'wyt labs': 'Wytlabs',
          'wyt-labs': 'Wytlabs',
          'wytlab': 'Wytlabs',
          'smegoweb': 'Smegoweb',
          'shared': 'Wytlabs',
          'excel forum': 'Wytlabs',
          'excel fourm': 'Wytlabs',
          'wytlabs and dws': 'Wytlabs',
        };
        const allowedBusinessUnits = ['DWSG', 'Signature', 'Collabx', 'Wytlabs', 'Smegoweb'];

        const statusMap = {
          'deactive-nextmonth': 'Deactive',
          'deactivate-nextmonth': 'Deactive',
          'inactive': 'Deactive',
          'deactivated': 'Deactive',
        };
        const allowedStatus = ['Active', 'Deactive', 'Declined'];

        const approvedByMap = {
          'vaibhav': 'Vaibhav',
          'marc': 'Marc',
          'dawood': 'Dawood',
          'raghav': 'Raghav',
          'tarun': 'Tarun',
          'yulia': 'Yulia',
          'sarthak': 'Sarthak',
          'harshit': 'Harshit',
          'suspense': 'Tarun',
        };
        const allowedApprovedBy = [
          'Vaibhav',
          'Marc',
          'Dawood',
          'Raghav',
          'Tarun',
          'Yulia',
          'Sarthak',
          'Harshit',
        ];

        const statusRaw = normalizeTextValue(getField(row, ['Status', 'status']));
        const status = statusRaw ? normalizeEnum(statusRaw, statusMap, allowedStatus) || undefined : undefined;
        const particulars = normalizeTextValue(
          getField(row, [
            'Particulars',
            'particulars',
            'Particulars - from cc statement',
            'Particulars - from the statement',
          ])
        );
        const narrationRaw = getField(row, [
          'Narration',
          'narration',
          'Narration - from statement',
          'Narration - from the statement',
        ]);
        const narration = normalizeTextValue(narrationRaw);
        const currencyRaw = normalizeTextValue(getField(row, ['Currency', 'currency'])) || 'USD';
        const allowedCurrencies = ['USD', 'EUR', 'GBP', 'INR', 'AUD', 'CAD'];
        const currencyCandidate = currencyRaw.toUpperCase();
        const currency = allowedCurrencies.includes(currencyCandidate) ? currencyCandidate : 'USD';
        const billStatus = normalizeTextValue(getField(row, ['Bill Status', 'billStatus']));
        const amountRaw = getField(row, [
          'Amount',
          'amount',
          'Amount (USD/Euro/Any)',
          'Amt',
          'Amt (USD/Euro/Any)',
        ]);
        const amountValue = parseAmountValue(amountRaw);
        const amount = Number.isNaN(amountValue) ? NaN : Math.abs(amountValue);
        const typeOfServiceRaw = normalizeTextValue(
          getField(row, [
            'Types of Tools or Service',
            'Type of Tool or Service',
            'typeOfService',
            'Type',
            'Type of Tool or Service*',
          ])
        );
        const typeOfService = normalizeEnum(typeOfServiceRaw, typeMap, allowedTypes) || undefined;

        const businessUnitRaw = normalizeTextValue(getField(row, ['Business Unit', 'businessUnit']));
        const businessUnit =
          normalizeEnum(businessUnitRaw, businessUnitMap, allowedBusinessUnits) ||
          normalizeEnum(req.user?.businessUnit, businessUnitMap, allowedBusinessUnits) ||
          undefined;

        const costCenterRaw = normalizeTextValue(getField(row, ['Cost Center', 'costCenter']));
        const costCenter = normalizeEnum(costCenterRaw, costCenterMap, allowedCostCenters) || undefined;

        const approvedByRaw = normalizeTextValue(getField(row, ['Approved By', 'approvedBy']));
        const approvedBy = normalizeEnum(approvedByRaw, approvedByMap, allowedApprovedBy) || undefined;
        const serviceHandler =
          normalizeTextValue(
            getField(row, [
              'Tool or Service Handler',
              'Tool or Service Handler (User Name)',
              'serviceHandler',
              'Service Handler',
            ])
          ) || undefined;
        // Normalize recurring values
        const recurringRaw = normalizeTextValue(
          getField(row, ['Recurring/One-time', 'Recurring/One time', 'recurring', 'Recurring'])
        );
        const recurringMap = {
          'recurring_m': 'Monthly',
          'recurring_y': 'Yearly',
          'one time': 'One-time',
          'one-time': 'One-time',
          'one_time': 'One-time',
          'onetime': 'One-time',
          'monthly': 'Monthly',
          'monthy': 'Monthly',
          'month': 'Monthly',
          'yearly': 'Yearly',
          'year': 'Yearly',
          'annual': 'Yearly',
          'annually': 'Yearly',
          'quarterly': 'Quaterly',
          'quaterly': 'Quaterly',
          'quarter': 'Quaterly',
          'qtr': 'Quaterly',
          'qtrly': 'Quaterly',
        };
        const allowedRecurring = ['Monthly', 'Yearly', 'One-time', 'Quaterly'];
        const recurring = normalizeEnum(recurringRaw, recurringMap, allowedRecurring) || undefined;
        // Shared fields (optional)
        const normalizeBU = (val) => normalizeEnum(val, businessUnitMap, allowedBusinessUnits);
        const isSharedRaw =
          getField(row, ['Is Shared', 'isShared', 'Shared', 'shared', 'Shared Bill?']) ?? false;
        const sharedAllocRaw =
          normalizeTextValue(
            getField(row, ['Shared Bill', 'Shared Bills', 'sharedBill', 'sharedAllocation', 'sharedAllocations'])
          ) ?? '';
        let sharedAllocations = parseSharedAllocations(sharedAllocRaw, normalizeBU);
        let isShared = parseBoolean(isSharedRaw) || sharedAllocations.length > 0;

        if (isShared) {
          // Ensure primary BU is present even if 0
          const hasPrimary = sharedAllocations.some((item) => item.businessUnit === businessUnit);
          if (!hasPrimary) {
            sharedAllocations.push({ businessUnit, amount: 0 });
          }
          const totalShared = sharedAllocations.reduce((sum, item) => sum + item.amount, 0);
          if (totalShared > amount) {
            results.failed++;
            const message = 'Shared allocations exceed total amount';
            results.errors.push({
              row: i + 2,
              error: message,
              data: row,
            });
            console.warn(`[Bulk Upload] Row ${i + 2} failed. ${message}`);
            continue;
          }
          sharedAllocations = sharedAllocations.filter(
            (item) => item.businessUnit && !Number.isNaN(item.amount) && item.amount >= 0
          );
          isShared = sharedAllocations.length > 0;
        } else {
          sharedAllocations = [];
        }

        // Validate required fields
        const missing = [];
        if (!cardNumber) missing.push('Card Number');
        if (!cardAssignedTo) missing.push('Card Assigned To');
        if (!date) missing.push('Date');
        if (!particulars) missing.push('Particulars');
        if (Number.isNaN(amount)) missing.push('Amount');

        if (missing.length) {
          results.failed++;
          const message = `Missing required fields: ${missing.join(', ')}`;
          results.errors.push({
            row: i + 2, // Excel row number (1-indexed + header)
            error: message,
            data: row,
          });
          console.warn(`[Bulk Upload] Row ${i + 2} failed. ${message}`);
          continue;
        }

        // Parse date
        const parsedDate = parseDateValue(date);

        if (!parsedDate || isNaN(parsedDate.getTime())) {
          results.failed++;
          const message = 'Invalid date';
          results.errors.push({
            row: i + 2,
            error: message,
            data: row,
          });
          console.warn(`[Bulk Upload] Row ${i + 2} failed. ${message}. Value: ${date}`);
          continue;
        }

        const monthLabel = normalizeMonthValue(rawMonth, parsedDate);

        // Exchange rate handling: always use current rate for consistency
        const converted = await convertToINR(amount, currency);
        const rate = Math.abs(converted.rate);
        const amountInINR = Math.abs(converted.amountInINR);

        // Calculate next renewal date
        let nextRenewalDate = null;
        if (recurring === 'Monthly') {
          nextRenewalDate = new Date(parsedDate);
          nextRenewalDate.setMonth(nextRenewalDate.getMonth() + 1);
        } else if (recurring === 'Yearly') {
          nextRenewalDate = new Date(parsedDate);
          nextRenewalDate.setFullYear(nextRenewalDate.getFullYear() + 1);
        } else if (recurring === 'Quaterly') {
          nextRenewalDate = new Date(parsedDate);
          nextRenewalDate.setMonth(nextRenewalDate.getMonth() + 3);
        }

        const createdEntry = await ExpenseEntry.create({
          cardNumber,
          cardAssignedTo,
          date: parsedDate,
          month: monthLabel || formatMonthLabel(parsedDate),
          status,
          particulars,
          narration: narration || particulars,
          currency,
          billStatus,
          amount,
          xeRate: rate,
          amountInINR,
          typeOfService,
          businessUnit,
          costCenter,
          approvedBy,
          serviceHandler,
          recurring,
          entryStatus: 'Accepted', // Bulk uploads are auto-approved
          duplicateStatus: null,
          createdBy: req.user._id,
          nextRenewalDate,
          isShared,
          sharedAllocations,
        });

        results.success++;

        const isActiveStatus = (status || '').toString().toLowerCase() === 'active';
        const uploaderName = req.user?.name || 'MIS';
        const submittedBy = cardAssignedTo || uploaderName;

        if (isActiveStatus && businessUnit) {
          const spocNames = parseNameList(cardAssignedTo);
          for (const spocName of spocNames) {
            const spocUsers = await getUsersByName(spocName, 'spoc', businessUnit, spocCache);
            spocUsers.forEach((user) => {
              const email = user.email?.toLowerCase();
              if (email && !misEmailSet.has(email)) {
                emailTasks.push(sendSpocEntryEmail(user.email, createdEntry, uploaderName));
              }
            });
          }

          const handlerNames = parseNameList(serviceHandler);
          for (const handlerName of handlerNames) {
            const handlerUsers = await getUsersByName(handlerName, 'service_handler', businessUnit, serviceHandlerCache);
            handlerUsers.forEach((user) => {
              const email = user.email?.toLowerCase();
              if (email && !misEmailSet.has(email)) {
                emailTasks.push(sendServiceHandlerEntryEmail(user.email, createdEntry, uploaderName));
              }
            });
          }

          const buAdmins = await getBUAdmins(businessUnit);
          for (const admin of buAdmins) {
            const adminEmail = admin.email?.toLowerCase();
            if (adminEmail && !misEmailSet.has(adminEmail)) {
              emailTasks.push(sendBUEntryNoticeEmail(admin.email, createdEntry, submittedBy));
            }
            await Notification.create({
              user: admin._id,
              type: 'entry_approved',
              title: 'New expense added via bulk upload',
              message: `${submittedBy} added ${createdEntry.particulars} (${createdEntry.currency} ${createdEntry.amount}) to ${createdEntry.businessUnit}.`,
              relatedEntry: createdEntry._id,
              actionRequired: false,
            });
          }

          if (emailTasks.length >= 25) {
            await flushEmailTasks();
          }
        }

        if (createdEntry.entryStatus === 'Accepted' && misManagers.length > 0) {
          misManagers.forEach((mis) => {
            if (mis.email) {
              queueMISNotification(mis.email, createdEntry, submittedBy);
            }
          });
        }

        if (emailTasks.length >= 25) {
          await flushEmailTasks();
        }
      } catch (error) {
        results.failed++;
        results.errors.push({
          row: i + 2,
          error: error.message,
          data: data[i],
        });
      }
    }

    await flushEmailTasks();

    // Clean up uploaded file
    fs.unlinkSync(filePath);

    res.status(200).json({
      success: true,
      message: 'Bulk upload completed',
      data: results,
    });
  } catch (error) {
    // Clean up uploaded file on error
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Download expense template
// @route   GET /api/expenses/template
// @access  Private (MIS, Super Admin)
export const downloadTemplate = async (req, res) => {
  try {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Expense Template');
        worksheet.columns = [
          { header: 'Card Number', key: 'cardNumber', width: 15 },
          { header: 'Card Assigned To', key: 'cardAssignedTo', width: 20 },
          { header: 'Date', key: 'date', width: 15 },
          { header: 'Month', key: 'month', width: 15 },
          { header: 'Status', key: 'status', width: 12 },
          { header: 'Particulars', key: 'particulars', width: 25 },
          { header: 'Narration', key: 'narration', width: 25 },
          { header: 'Currency', key: 'currency', width: 10 },
          { header: 'Bill Status', key: 'billStatus', width: 15 },
          { header: 'Amount', key: 'amount', width: 12 },
          { header: 'Types of Tools or Service', key: 'typeOfService', width: 25 },
          { header: 'Business Unit', key: 'businessUnit', width: 15 },
          { header: 'Cost Center', key: 'costCenter', width: 15 },
          { header: 'Approved By', key: 'approvedBy', width: 15 },
          { header: 'Tool or Service Handler', key: 'serviceHandler', width: 25 },
          { header: 'Recurring/One-time', key: 'recurring', width: 18 },
          { header: 'Is Shared (Yes/No)', key: 'isShared', width: 18 },
          { header: 'Shared Bill (BU:Amount, ...)', key: 'sharedBill', width: 35 },
        ];

        worksheet.addRow({
          cardNumber: 'M003',
          cardAssignedTo: 'John Doe',
          date: '2025-01-05',
          month: 'Jan-2025',
          status: 'Active',
          particulars: 'ChatGPT',
          narration: 'ChatGPT Subscription',
          currency: 'USD',
          billStatus: '',
          amount: 200,
          typeOfService: 'Tool',
          businessUnit: 'Wytlabs',
          costCenter: 'Ops',
          approvedBy: 'Raghav',
          serviceHandler: 'Raghav',
          recurring: 'Yearly',
          isShared: 'Yes',
          sharedBill: 'Wytlabs: 200, Collabx: 100',
        });

        const buffer = await workbook.xlsx.writeBuffer();

        res.setHeader('Content-Disposition', 'attachment; filename=expense-template.xlsx');
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(Buffer.from(buffer));
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Export expense entries
// @route   GET /api/expenses/export
// @access  Private
export const exportExpenses = async (req, res) => {
  try {
    const {
      businessUnit,
      cardNumber,
      cardAssignedTo,
      status,
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
      limit,
      duplicateStatus,
      includeDuplicateStatus,
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
    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = parseFilterDate(startDate);
      if (endDate) query.date.$lte = parseFilterDate(endDate, true);
    }

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

    if (minAmount || maxAmount) {
      query.amountInINR = {};
      if (minAmount) query.amountInINR.$gte = parseFloat(minAmount);
      if (maxAmount) query.amountInINR.$lte = parseFloat(maxAmount);
    }

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

    // Match the visibility rules used for on-screen tables
    if (req.user.role !== 'spoc' && !(disableStartDate || disableEndDate)) {
      query.entryStatus = 'Accepted';
    }

    let expenseQuery = ExpenseEntry.find(query).sort({ date: -1 }).lean();

    if (limit) {
      expenseQuery = expenseQuery.limit(parseInt(limit));
    }

    const expenses = await expenseQuery;
    const annotated = annotateDuplicates(expenses);
    const filtered = filterByDuplicateStatus(annotated, duplicateStatus);

    // Format data for export
    const shouldIncludeDuplicateColumn = includeDuplicateStatus === 'true';
    const formatShared = (expense) => {
      if (!expense.isShared || !expense.sharedAllocations || expense.sharedAllocations.length === 0) {
        return '';
      }
      return expense.sharedAllocations
        .filter((alloc) => alloc.businessUnit)
        .map((alloc) => `${alloc.businessUnit}: ${alloc.amount}`)
        .join(', ');
    };

    const exportData = filtered.map((expense) => ({
      cardNumber: expense.cardNumber,
      cardAssignedTo: expense.cardAssignedTo,
      date: expense.date ? new Date(expense.date).toLocaleDateString() : '',
      month: expense.month,
      status: expense.status,
      particulars: expense.particulars,
      narration: expense.narration,
      currency: expense.currency,
      billStatus: expense.billStatus,
      amount: expense.amount,
      xeRate: expense.xeRate,
      amountInINR: expense.amountInINR,
      typeOfService: expense.typeOfService,
      businessUnit: expense.businessUnit,
      costCenter: expense.costCenter,
      approvedBy: expense.approvedBy,
      serviceHandler: expense.serviceHandler,
      recurring: expense.recurring,
      disabledAt: expense.disabledAt ? new Date(expense.disabledAt).toLocaleDateString() : '',
      sharedBill: formatShared(expense),
      ...(shouldIncludeDuplicateColumn
        ? { duplicateStatus: expense.duplicateLabel || 'Unique' }
        : {}),
    }));

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Expenses');

    const columns = [
      { header: 'Card Number', key: 'cardNumber', width: 15 },
      { header: 'Card Assigned To', key: 'cardAssignedTo', width: 20 },
      { header: 'Date', key: 'date', width: 15 },
      { header: 'Month', key: 'month', width: 12 },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'Particulars', key: 'particulars', width: 25 },
      { header: 'Narration', key: 'narration', width: 25 },
      { header: 'Currency', key: 'currency', width: 10 },
      { header: 'Bill Status', key: 'billStatus', width: 15 },
      { header: 'Amount', key: 'amount', width: 12 },
      { header: 'XE Rate', key: 'xeRate', width: 12 },
      { header: 'Amount in INR', key: 'amountInINR', width: 18 },
      { header: 'Types of Tools or Service', key: 'typeOfService', width: 25 },
      { header: 'Business Unit', key: 'businessUnit', width: 15 },
      { header: 'Cost Center', key: 'costCenter', width: 15 },
      { header: 'Approved By', key: 'approvedBy', width: 15 },
      { header: 'Service Handler', key: 'serviceHandler', width: 20 },
      { header: 'Recurring', key: 'recurring', width: 15 },
      { header: 'Disable Date', key: 'disabledAt', width: 18 },
      { header: 'Shared Bill', key: 'sharedBill', width: 30 },
    ];

    if (shouldIncludeDuplicateColumn) {
      columns.push({ header: 'Duplicate Status', key: 'duplicateStatus', width: 18 });
    }

    worksheet.columns = columns;

    exportData.forEach((item) => {
      worksheet.addRow(item);
    });

    const buffer = await workbook.xlsx.writeBuffer();

    const filename = `expenses-${Date.now()}.xlsx`;
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(Buffer.from(buffer));
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export default {
  bulkUploadExpenses,
  downloadTemplate,
  exportExpenses,
};
