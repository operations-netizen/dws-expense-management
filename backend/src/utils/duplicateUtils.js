const normalizeString = (value) => {
  if (value === undefined || value === null) return '';
  return value.toString().trim().toLowerCase();
};

const normalizeNumber = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return '';
  const rounded = Math.round(num * 100) / 100;
  return rounded.toFixed(2);
};
 
const normalizeDateKey = (value) => {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
};

export const buildDuplicateKey = (entry) => {
  const parts = [
    normalizeString(entry.cardNumber),
    normalizeDateKey(entry.date),
    normalizeString(entry.particulars),
    normalizeString(entry.businessUnit),
    normalizeNumber(entry.amount),
    normalizeString(entry.currency),
  ];
  return parts.join('|');
};

const sortGroupEntries = (a, b) => {
  const aTime = new Date(a.createdAt || a.date || 0).getTime();
  const bTime = new Date(b.createdAt || b.date || 0).getTime();
  if (aTime !== bTime) return aTime - bTime;
  const aId = a._id ? a._id.toString() : '';
  const bId = b._id ? b._id.toString() : '';
  return aId.localeCompare(bId);
};

export const annotateDuplicates = (entries = []) => {
  const result = entries.map((entry) => ({ ...entry }));
  const groups = new Map();

  result.forEach((entry) => {
    const overrideUnique = entry.duplicateStatus === 'Unique';
    const key = buildDuplicateKey(entry);
    entry.duplicateGroupKey = key;
    if (!overrideUnique && key) {
      const list = groups.get(key) || [];
      list.push(entry);
      groups.set(key, list);
    }
  });

  groups.forEach((group) => {
    if (group.length <= 1) return;
    group.sort(sortGroupEntries);
    group.forEach((entry, index) => {
      entry.duplicateFlag = 'duplicate';
      entry.duplicateIndex = index + 1;
      entry.duplicateLabel = `Duplicate ${index + 1}`;
    });
  });

  result.forEach((entry) => {
    if (!entry.duplicateLabel) {
      entry.duplicateFlag = 'unique';
      entry.duplicateIndex = 0;
      entry.duplicateLabel = 'Unique';
    }
  });

  return result;
};

export const filterByDuplicateStatus = (entries = [], rawStatus) => {
  if (!rawStatus) return entries;
  const normalized = rawStatus.toString().trim().toLowerCase();
  if (['duplicate', 'duplicated', 'merged'].includes(normalized)) {
    return entries.filter((entry) => entry.duplicateFlag === 'duplicate');
  }
  if (normalized === 'unique') {
    return entries.filter((entry) => entry.duplicateFlag === 'unique');
  }
  return entries;
};
