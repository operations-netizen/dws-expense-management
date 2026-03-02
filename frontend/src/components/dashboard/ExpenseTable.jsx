import { Fragment, useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Edit, Send, Trash2 } from 'lucide-react';
import Badge from '../common/Badge';
import { formatCurrency, formatDate, getMonthYear } from '../../utils/formatters';
import { useAuth } from '../../context/AuthContext';

const ExpenseTable = ({
  expenses,
  onEdit, 
  onDelete,
  loading,
  showDuplicateColumn = true,
  bulkDeleteEnabled = false,
  selectedIds = [],
  onToggleSelect,
  onToggleSelectAll,
  onResendMis,
  onUnclubGroup,
}) => {
  const { user } = useAuth();
  const tableScrollRef = useRef(null);
  const [sortField, setSortField] = useState('date');
  const [sortOrder, setSortOrder] = useState('desc');
  const [expandedClubGroups, setExpandedClubGroups] = useState(() => new Set());

  const canEdit = ['mis_manager', 'super_admin'].includes(user?.role);
  const canDelete = ['mis_manager', 'super_admin'].includes(user?.role);
  const canResendMis =
    ['mis_manager', 'super_admin'].includes(user?.role) && typeof onResendMis === 'function';
  const canViewDuplicateStatus = user?.role === 'mis_manager';
  const displayDuplicateColumn = canViewDuplicateStatus && showDuplicateColumn;
  const selectedSet = new Set(selectedIds);
  const allVisibleSelected =
    bulkDeleteEnabled && expenses.length > 0 && expenses.every((expense) => selectedSet.has(expense._id));
  const hasActionColumn = canEdit || canDelete || canResendMis;
  const totalColumnCount =
    21 +
    (displayDuplicateColumn ? 1 : 0) +
    (hasActionColumn ? 1 : 0) +
    (bulkDeleteEnabled ? 1 : 0);

  const resolveDuplicateMeta = (expense) => {
    const label = expense.duplicateLabel || expense.duplicateStatus || 'Unique';
    const flag =
      expense.duplicateFlag ||
      (typeof label === 'string' && label.toLowerCase().startsWith('duplicate') ? 'duplicate' : 'unique');
    return { label, flag };
  };

  const formatMonthCell = (value, fallbackDate) => {
    if (value instanceof Date) return getMonthYear(value);
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) return fallbackDate ? getMonthYear(fallbackDate) : '-';
      if (/^[A-Za-z]{3}[- ]\d{4}$/.test(trimmed)) {
        return trimmed.replace(' ', '-');
      }
      const parsed = new Date(trimmed);
      if (!Number.isNaN(parsed.getTime())) return getMonthYear(parsed);
      return trimmed;
    }
    return fallbackDate ? getMonthYear(fallbackDate) : '-';
  };

  const formatSharedCell = (entry) => {
    if (!entry?.isShared) return '-';
    const details = (entry.sharedAllocations || [])
      .filter((item) => item.businessUnit)
      .map((item) => `${item.businessUnit}: ${item.amount}`)
      .join(', ');
    return details || 'Shared';
  };

  const formatAmountCell = (entry) => (entry?.amount ? `${entry.amount} ${entry.currency || ''}` : '-');

  const handleSort = (field) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const toggleClubDetails = (clubGroupId) => {
    if (!clubGroupId) return;
    setExpandedClubGroups((prev) => {
      const next = new Set(prev);
      if (next.has(clubGroupId)) {
        next.delete(clubGroupId);
      } else {
        next.add(clubGroupId);
      }
      return next;
    });
  };

  const handleClubSummaryClick = (event, clubGroupId) => {
    if (!clubGroupId) return;
    const target = event?.target;
    if (target?.closest?.('button, input, a, select, textarea, label')) {
      return;
    }
    toggleClubDetails(clubGroupId);
  };

  const compareDuplicateGroup = (a, b) => {
    const aGroup = a.duplicateGroupKey || '';
    const bGroup = b.duplicateGroupKey || '';
    if (aGroup !== bGroup) return aGroup.localeCompare(bGroup);
    const aIndex = Number(a.duplicateIndex || 0);
    const bIndex = Number(b.duplicateIndex || 0);
    return aIndex - bIndex;
  };

  const sortedExpenses = [...expenses].sort((a, b) => {
    let aVal = a[sortField];
    let bVal = b[sortField];

    if (sortField === 'date') {
      const aDate = new Date(aVal);
      const bDate = new Date(bVal);
      const diff = sortOrder === 'asc' ? aDate - bDate : bDate - aDate;
      if (diff !== 0) return diff;
      return compareDuplicateGroup(a, b);
    }

    if (sortOrder === 'asc') {
      return aVal > bVal ? 1 : -1;
    }
    return aVal < bVal ? 1 : -1;
  });

  useEffect(() => {
    if (tableScrollRef.current) {
      tableScrollRef.current.scrollLeft = 0;
    }
  }, [expenses.length]);

  if (loading) {
    return (
      <div className="text-center py-8">
        <div className="inline-block w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (expenses.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">No expense entries found</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="hidden md:block">
        <div className="mb-2 flex items-center justify-between text-xs text-slate-500">
          <span>Expense sheet view</span>
          <span>Scroll horizontally to view all columns</span>
        </div>
        <div ref={tableScrollRef} className="subtle-scrollbar overflow-x-auto pb-2">
          <table className="min-w-[1800px] border-separate border-spacing-y-3 text-sm">
          <thead>
            <tr>
              <th
                onClick={() => handleSort('date')}
                className="px-4 py-3 text-left text-[0.7rem] font-semibold uppercase tracking-[0.3em] text-slate-400 cursor-pointer"
              >
                Date
              </th>
              <th className="px-4 py-3 text-left text-[0.7rem] font-semibold uppercase tracking-[0.3em] text-slate-400">Card No</th>
              <th className="px-4 py-3 text-left text-[0.7rem] font-semibold uppercase tracking-[0.3em] text-slate-400">Card Assigned To</th>
              <th className="px-4 py-3 text-left text-[0.7rem] font-semibold uppercase tracking-[0.3em] text-slate-400">Month</th>
              <th className="px-4 py-3 text-left text-[0.7rem] font-semibold uppercase tracking-[0.3em] text-slate-400">Status</th>
              <th className="px-4 py-3 text-left text-[0.7rem] font-semibold uppercase tracking-[0.3em] text-slate-400">Entry Status</th>
              <th className="px-4 py-3 text-left text-[0.7rem] font-semibold uppercase tracking-[0.3em] text-slate-400">Particulars</th>
              <th className="px-4 py-3 text-left text-[0.7rem] font-semibold uppercase tracking-[0.3em] text-slate-400">Narration</th>
              <th className="px-4 py-3 text-left text-[0.7rem] font-semibold uppercase tracking-[0.3em] text-slate-400">Currency</th>
              <th className="px-4 py-3 text-left text-[0.7rem] font-semibold uppercase tracking-[0.3em] text-slate-400">Bill Status</th>
              <th className="px-4 py-3 text-left text-[0.7rem] font-semibold uppercase tracking-[0.3em] text-slate-400">Amount</th>
              <th className="px-4 py-3 text-left text-[0.7rem] font-semibold uppercase tracking-[0.3em] text-slate-400">XE Rate</th>
              <th className="px-4 py-3 text-left text-[0.7rem] font-semibold uppercase tracking-[0.3em] text-slate-400">Amount (INR)</th>
              <th className="px-4 py-3 text-left text-[0.7rem] font-semibold uppercase tracking-[0.3em] text-slate-400">Type of Service</th>
              <th className="px-4 py-3 text-left text-[0.7rem] font-semibold uppercase tracking-[0.3em] text-slate-400">Business Unit</th>
              <th className="px-4 py-3 text-left text-[0.7rem] font-semibold uppercase tracking-[0.3em] text-slate-400">Cost Center</th>
              <th className="px-4 py-3 text-left text-[0.7rem] font-semibold uppercase tracking-[0.3em] text-slate-400">Approved By</th>
              <th className="px-4 py-3 text-left text-[0.7rem] font-semibold uppercase tracking-[0.3em] text-slate-400">Service Handler</th>
              <th className="px-4 py-3 text-left text-[0.7rem] font-semibold uppercase tracking-[0.3em] text-slate-400">Recurring</th>
              <th className="px-4 py-3 text-left text-[0.7rem] font-semibold uppercase tracking-[0.3em] text-slate-400">Shared</th>
              <th className="px-4 py-3 text-left text-[0.7rem] font-semibold uppercase tracking-[0.3em] text-slate-400">Clubbed</th>
              {displayDuplicateColumn && (
                <th className="px-4 py-3 text-left text-[0.7rem] font-semibold uppercase tracking-[0.3em] text-slate-400">
                  Duplicate
                </th>
              )}
              {hasActionColumn && (
                <th className="px-4 py-3 text-left text-[0.7rem] font-semibold uppercase tracking-[0.3em] text-slate-400">
                  Actions
                </th>
              )}
              {bulkDeleteEnabled && (
                <th className="px-4 py-3 text-left text-[0.7rem] font-semibold uppercase tracking-[0.3em] text-slate-400">
                  <div className="flex items-center gap-2">
                    <span>Select</span>
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={() => onToggleSelectAll && onToggleSelectAll()}
                    />
                  </div>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {sortedExpenses.map((expense) => {
              const isClubbed = Boolean(expense.isClubbed && expense.clubGroupId);
              const isExpanded = isClubbed && expandedClubGroups.has(expense.clubGroupId);
              const clubEntries = Array.isArray(expense.clubbedEntries) ? expense.clubbedEntries : [];

              return (
                <Fragment key={expense._id}>
                  <tr
                    onClick={(event) => isClubbed && handleClubSummaryClick(event, expense.clubGroupId)}
                    className={`rounded-2xl shadow-sm ${
                      isClubbed ? 'bg-slate-200 hover:bg-slate-300 cursor-pointer' : 'bg-white/90 hover:bg-white'
                    }`}
                  >
                    <td className="px-4 py-3 whitespace-nowrap text-sm font-semibold text-slate-900">
                      {formatDate(expense.date)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                      {expense.cardNumber || '-'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                      {expense.cardAssignedTo || '-'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                      {formatMonthCell(expense.month, expense.date)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                      <Badge>{expense.status || '-'}</Badge>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                      <Badge variant={expense.entryStatus === 'Accepted' ? 'success' : expense.entryStatus === 'Rejected' ? 'danger' : 'warning'}>
                        {expense.entryStatus || 'Accepted'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      <div className="font-medium">{expense.particulars || '-'}</div>
                      <div className="text-xs text-gray-500">
                        {isClubbed ? `${expense.clubbedEntryCount || clubEntries.length} entries clubbed` : expense.typeOfService || '-'}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap max-w-xs">
                      <div className="truncate">{expense.narration || '-'}</div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                      {expense.currency || '-'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                      {expense.billStatus || '-'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                      {expense.amount ? `${expense.amount} ${expense.currency || ''}` : '-'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                      {expense.xeRate || '-'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 font-semibold">
                      {expense.amountInINR ? formatCurrency(expense.amountInINR) : '-'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                      {expense.typeOfService || '-'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                      {expense.businessUnit || '-'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                      {expense.costCenter || '-'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                      {expense.approvedBy || '-'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                      {expense.serviceHandler || '-'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                      {expense.recurring || '-'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                      {expense.isShared ? (
                        <div>
                          <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">Shared</span>
                          <span className="block text-[11px] text-slate-500">
                            {(expense.sharedAllocations || [])
                              .filter((s) => s.businessUnit)
                              .map((s) => `${s.businessUnit}: ${s.amount}`)
                              .join(', ')}
                          </span>
                        </div>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm">
                      {isClubbed ? (
                        <button
                          type="button"
                          onClick={() => toggleClubDetails(expense.clubGroupId)}
                          className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                        >
                          <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-bold">
                            {expense.clubbedEntryCount || clubEntries.length}
                          </span>
                          {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    {displayDuplicateColumn && (
                      <td className="px-4 py-3 whitespace-nowrap text-sm">
                        {(() => {
                          const { label, flag } = resolveDuplicateMeta(expense);
                          return (
                            <Badge variant={flag === 'unique' ? 'success' : 'warning'}>
                              {label}
                            </Badge>
                          );
                        })()}
                      </td>
                    )}
                    {hasActionColumn && (
                      <td className="px-4 py-3 whitespace-nowrap text-sm">
                        <div className="flex space-x-2">
                          {canResendMis && expense.entryStatus === 'Accepted' && (
                            <button
                              onClick={() => onResendMis(expense)}
                              className="rounded-full bg-sky-50 p-2 text-sky-600 hover:bg-sky-100"
                              title="Resend MIS email"
                            >
                              <Send size={16} />
                            </button>
                          )}
                          {canEdit && (
                            <button
                              onClick={() => onEdit(expense)}
                              className="rounded-full bg-indigo-50 p-2 text-indigo-600 hover:bg-indigo-100"
                            >
                              <Edit size={16} />
                            </button>
                          )}
                          {canDelete && (
                            <button
                              onClick={() => onDelete(expense._id)}
                              className="rounded-full bg-rose-50 p-2 text-rose-600 hover:bg-rose-100"
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                    {bulkDeleteEnabled && (
                      <td className="px-4 py-3 whitespace-nowrap text-sm">
                        <input
                          type="checkbox"
                          checked={selectedSet.has(expense._id)}
                          onChange={() => onToggleSelect && onToggleSelect(expense._id)}
                        />
                      </td>
                    )}
                  </tr>

                  {isClubbed && isExpanded && (
                    <tr className="bg-slate-100">
                      <td colSpan={totalColumnCount} className="px-4 pb-4 pt-1">
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Club details</p>
                          <div className="overflow-x-auto">
                            <table className="min-w-[2200px] text-xs">
                              <thead>
                                <tr className="text-left text-slate-500">
                                  <th className="px-2 py-2">#</th>
                                  <th className="px-2 py-2">Date</th>
                                  <th className="px-2 py-2">Card No</th>
                                  <th className="px-2 py-2">Assigned To</th>
                                  <th className="px-2 py-2">Month</th>
                                  <th className="px-2 py-2">Status</th>
                                  <th className="px-2 py-2">Entry Status</th>
                                  <th className="px-2 py-2">Particulars</th>
                                  <th className="px-2 py-2">Narration</th>
                                  <th className="px-2 py-2">Currency</th>
                                  <th className="px-2 py-2">Bill Status</th>
                                  <th className="px-2 py-2">Amount</th>
                                  <th className="px-2 py-2">XE Rate</th>
                                  <th className="px-2 py-2">Amount (INR)</th>
                                  <th className="px-2 py-2">Type</th>
                                  <th className="px-2 py-2">Business Unit</th>
                                  <th className="px-2 py-2">CC</th>
                                  <th className="px-2 py-2">Approved By</th>
                                  <th className="px-2 py-2">Service Handler</th>
                                  <th className="px-2 py-2">Recurring</th>
                                  <th className="px-2 py-2">Shared</th>
                                  {displayDuplicateColumn && <th className="px-2 py-2">Duplicate</th>}
                                  {hasActionColumn && <th className="px-2 py-2">Actions</th>}
                                </tr>
                              </thead>
                              <tbody>
                                {clubEntries.map((member, idx) => (
                                  <tr key={member._id || idx} className="border-t border-slate-200 text-slate-700">
                                    <td className="px-2 py-2">{member.clubMemberIndex || idx + 1}</td>
                                    <td className="px-2 py-2">{formatDate(member.date)}</td>
                                    <td className="px-2 py-2">{member.cardNumber || '-'}</td>
                                    <td className="px-2 py-2">{member.cardAssignedTo || '-'}</td>
                                    <td className="px-2 py-2">{formatMonthCell(member.month, member.date)}</td>
                                    <td className="px-2 py-2">
                                      <Badge>{member.status || '-'}</Badge>
                                    </td>
                                    <td className="px-2 py-2">
                                      <Badge
                                        variant={
                                          member.entryStatus === 'Accepted'
                                            ? 'success'
                                            : member.entryStatus === 'Rejected'
                                            ? 'danger'
                                            : 'warning'
                                        }
                                      >
                                        {member.entryStatus || 'Accepted'}
                                      </Badge>
                                    </td>
                                    <td className="px-2 py-2">{member.particulars || '-'}</td>
                                    <td className="px-2 py-2">{member.narration || '-'}</td>
                                    <td className="px-2 py-2">{member.currency || '-'}</td>
                                    <td className="px-2 py-2">{member.billStatus || '-'}</td>
                                    <td className="px-2 py-2">{formatAmountCell(member)}</td>
                                    <td className="px-2 py-2">{member.xeRate || '-'}</td>
                                    <td className="px-2 py-2">{member.amountInINR ? formatCurrency(member.amountInINR) : '-'}</td>
                                    <td className="px-2 py-2">{member.typeOfService || '-'}</td>
                                    <td className="px-2 py-2">{member.businessUnit || '-'}</td>
                                    <td className="px-2 py-2">{member.costCenter || '-'}</td>
                                    <td className="px-2 py-2">{member.approvedBy || '-'}</td>
                                    <td className="px-2 py-2">{member.serviceHandler || '-'}</td>
                                    <td className="px-2 py-2">{member.recurring || '-'}</td>
                                    <td className="px-2 py-2">{formatSharedCell(member)}</td>
                                    {displayDuplicateColumn && (
                                      <td className="px-2 py-2">
                                        {(() => {
                                          const { label, flag } = resolveDuplicateMeta(member);
                                          return (
                                            <Badge variant={flag === 'unique' ? 'success' : 'warning'}>
                                              {label}
                                            </Badge>
                                          );
                                        })()}
                                      </td>
                                    )}
                                    {hasActionColumn && (
                                      <td className="px-2 py-2">
                                        <div className="flex items-center gap-1">
                                          {canResendMis && member.entryStatus === 'Accepted' && (
                                            <button
                                              type="button"
                                              onClick={() => onResendMis(member)}
                                              className="rounded-full bg-sky-50 p-1.5 text-sky-600 hover:bg-sky-100"
                                              title="Resend MIS email"
                                            >
                                              <Send size={13} />
                                            </button>
                                          )}
                                          {canEdit && (
                                            <button
                                              type="button"
                                              onClick={() => onEdit(member)}
                                              className="rounded-full bg-indigo-50 p-1.5 text-indigo-600 hover:bg-indigo-100"
                                              title="Edit entry"
                                            >
                                              <Edit size={13} />
                                            </button>
                                          )}
                                          {canDelete && (
                                            <button
                                              type="button"
                                              onClick={() => onDelete(member._id)}
                                              className="rounded-full bg-rose-50 p-1.5 text-rose-600 hover:bg-rose-100"
                                              title="Delete entry"
                                            >
                                              <Trash2 size={13} />
                                            </button>
                                          )}
                                        </div>
                                      </td>
                                    )}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => onUnclubGroup && onUnclubGroup(expense.clubGroupId)}
                              disabled={!onUnclubGroup}
                              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              Unclub
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
        </div>
      </div>

      {/* Mobile / tablet cards */}
      <div className="grid gap-3 md:hidden">
        {sortedExpenses.map((expense) => {
          const isClubbed = Boolean(expense.isClubbed && expense.clubGroupId);
          const isExpanded = isClubbed && expandedClubGroups.has(expense.clubGroupId);
          const clubEntries = Array.isArray(expense.clubbedEntries) ? expense.clubbedEntries : [];

          return (
            <div
              key={expense._id}
              onClick={(event) => isClubbed && handleClubSummaryClick(event, expense.clubGroupId)}
              className={`rounded-2xl border p-4 shadow-sm ${
                isClubbed ? 'border-slate-300 bg-slate-100 cursor-pointer' : 'border-slate-200 bg-white'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Date</p>
                  <p className="text-base font-semibold text-slate-900">{formatDate(expense.date)}</p>
                  <p className="text-sm text-slate-600 mt-1">{expense.cardNumber || '-'}</p>
                </div>
                <div className="flex flex-wrap gap-2 justify-end items-start">
                  {bulkDeleteEnabled && (
                    <input
                      type="checkbox"
                      checked={selectedSet.has(expense._id)}
                      onChange={() => onToggleSelect && onToggleSelect(expense._id)}
                    />
                  )}
                  {expense.status && <Badge>{expense.status}</Badge>}
                  {expense.entryStatus && (
                    <Badge variant={expense.entryStatus === 'Accepted' ? 'success' : expense.entryStatus === 'Rejected' ? 'danger' : 'warning'}>
                      {expense.entryStatus}
                    </Badge>
                  )}
                  {displayDuplicateColumn && (
                    <Badge
                      variant={resolveDuplicateMeta(expense).flag === 'unique' ? 'success' : 'warning'}
                    >
                      {resolveDuplicateMeta(expense).label}
                    </Badge>
                  )}
                </div>
              </div>

              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-slate-700">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Particulars</p>
                  <p className="font-semibold text-slate-900">{expense.particulars || '-'}</p>
                  <p className="text-slate-500">
                    {isClubbed ? `${expense.clubbedEntryCount || clubEntries.length} entries clubbed` : expense.typeOfService || '-'}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Narration</p>
                  <p className="text-slate-700">{expense.narration || '-'}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Amount</p>
                  <p className="font-semibold text-slate-900">
                    {expense.amount ? `${expense.amount} ${expense.currency || ''}` : '-'}
                  </p>
                  <p className="text-slate-500">{expense.amountInINR ? formatCurrency(expense.amountInINR) : '-'}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Bill Status</p>
                  <p className="text-slate-700">{expense.billStatus || '-'}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Business Unit</p>
                  <p className="text-slate-700">{expense.businessUnit || '-'}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Cost Center</p>
                  <p className="text-slate-700">{expense.costCenter || '-'}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Handler</p>
                  <p className="text-slate-700">{expense.serviceHandler || '-'}</p>
                  <p className="text-slate-500">{expense.cardAssignedTo || '-'}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Recurring</p>
                  <p className="text-slate-700">{expense.recurring || 'One-time'}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Shared</p>
                  <p className="text-slate-700">
                    {expense.isShared
                      ? (expense.sharedAllocations || [])
                          .filter((s) => s.businessUnit)
                          .map((s) => `${s.businessUnit}: ${s.amount}`)
                          .join(', ')
                      : '-'}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Clubbed</p>
                  {isClubbed ? (
                    <button
                      type="button"
                      onClick={() => toggleClubDetails(expense.clubGroupId)}
                      className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700"
                    >
                      <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-bold">
                        {expense.clubbedEntryCount || clubEntries.length}
                      </span>
                      {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                  ) : (
                    <p className="text-slate-400">-</p>
                  )}
                </div>
              </div>

              {isClubbed && isExpanded && (
                <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Club details</p>
                  <div className="overflow-x-auto">
                    <table className="min-w-[2200px] text-xs">
                      <thead>
                        <tr className="text-left text-slate-500">
                          <th className="px-2 py-2">#</th>
                          <th className="px-2 py-2">Date</th>
                          <th className="px-2 py-2">Card No</th>
                          <th className="px-2 py-2">Assigned To</th>
                          <th className="px-2 py-2">Month</th>
                          <th className="px-2 py-2">Status</th>
                          <th className="px-2 py-2">Entry Status</th>
                          <th className="px-2 py-2">Particulars</th>
                          <th className="px-2 py-2">Narration</th>
                          <th className="px-2 py-2">Currency</th>
                          <th className="px-2 py-2">Bill Status</th>
                          <th className="px-2 py-2">Amount</th>
                          <th className="px-2 py-2">XE Rate</th>
                          <th className="px-2 py-2">Amount (INR)</th>
                          <th className="px-2 py-2">Type</th>
                          <th className="px-2 py-2">Business Unit</th>
                          <th className="px-2 py-2">CC</th>
                          <th className="px-2 py-2">Approved By</th>
                          <th className="px-2 py-2">Service Handler</th>
                          <th className="px-2 py-2">Recurring</th>
                          <th className="px-2 py-2">Shared</th>
                          {displayDuplicateColumn && <th className="px-2 py-2">Duplicate</th>}
                          {hasActionColumn && <th className="px-2 py-2">Actions</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {clubEntries.map((member, idx) => (
                          <tr key={member._id || idx} className="border-t border-slate-200 text-slate-700">
                            <td className="px-2 py-2">{member.clubMemberIndex || idx + 1}</td>
                            <td className="px-2 py-2">{formatDate(member.date)}</td>
                            <td className="px-2 py-2">{member.cardNumber || '-'}</td>
                            <td className="px-2 py-2">{member.cardAssignedTo || '-'}</td>
                            <td className="px-2 py-2">{formatMonthCell(member.month, member.date)}</td>
                            <td className="px-2 py-2">
                              <Badge>{member.status || '-'}</Badge>
                            </td>
                            <td className="px-2 py-2">
                              <Badge
                                variant={
                                  member.entryStatus === 'Accepted'
                                    ? 'success'
                                    : member.entryStatus === 'Rejected'
                                    ? 'danger'
                                    : 'warning'
                                }
                              >
                                {member.entryStatus || 'Accepted'}
                              </Badge>
                            </td>
                            <td className="px-2 py-2">{member.particulars || '-'}</td>
                            <td className="px-2 py-2">{member.narration || '-'}</td>
                            <td className="px-2 py-2">{member.currency || '-'}</td>
                            <td className="px-2 py-2">{member.billStatus || '-'}</td>
                            <td className="px-2 py-2">{formatAmountCell(member)}</td>
                            <td className="px-2 py-2">{member.xeRate || '-'}</td>
                            <td className="px-2 py-2">{member.amountInINR ? formatCurrency(member.amountInINR) : '-'}</td>
                            <td className="px-2 py-2">{member.typeOfService || '-'}</td>
                            <td className="px-2 py-2">{member.businessUnit || '-'}</td>
                            <td className="px-2 py-2">{member.costCenter || '-'}</td>
                            <td className="px-2 py-2">{member.approvedBy || '-'}</td>
                            <td className="px-2 py-2">{member.serviceHandler || '-'}</td>
                            <td className="px-2 py-2">{member.recurring || '-'}</td>
                            <td className="px-2 py-2">{formatSharedCell(member)}</td>
                            {displayDuplicateColumn && (
                              <td className="px-2 py-2">
                                {(() => {
                                  const { label, flag } = resolveDuplicateMeta(member);
                                  return (
                                    <Badge variant={flag === 'unique' ? 'success' : 'warning'}>
                                      {label}
                                    </Badge>
                                  );
                                })()}
                              </td>
                            )}
                            {hasActionColumn && (
                              <td className="px-2 py-2">
                                <div className="flex items-center gap-1">
                                  {canResendMis && member.entryStatus === 'Accepted' && (
                                    <button
                                      type="button"
                                      onClick={() => onResendMis(member)}
                                      className="rounded-full bg-sky-50 p-1.5 text-sky-600 hover:bg-sky-100"
                                      title="Resend MIS email"
                                    >
                                      <Send size={13} />
                                    </button>
                                  )}
                                  {canEdit && (
                                    <button
                                      type="button"
                                      onClick={() => onEdit(member)}
                                      className="rounded-full bg-indigo-50 p-1.5 text-indigo-600 hover:bg-indigo-100"
                                      title="Edit entry"
                                    >
                                      <Edit size={13} />
                                    </button>
                                  )}
                                  {canDelete && (
                                    <button
                                      type="button"
                                      onClick={() => onDelete(member._id)}
                                      className="rounded-full bg-rose-50 p-1.5 text-rose-600 hover:bg-rose-100"
                                      title="Delete entry"
                                    >
                                      <Trash2 size={13} />
                                    </button>
                                  )}
                                </div>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => onUnclubGroup && onUnclubGroup(expense.clubGroupId)}
                      disabled={!onUnclubGroup}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Unclub
                    </button>
                  </div>
                </div>
              )}

              {hasActionColumn && (
                <div className="mt-4 flex items-center justify-end gap-2">
                  {canResendMis && expense.entryStatus === 'Accepted' && (
                    <button
                      onClick={() => onResendMis(expense)}
                      className="rounded-full bg-sky-50 px-3 py-2 text-sky-700 text-sm font-semibold hover:bg-sky-100"
                    >
                      Resend MIS
                    </button>
                  )}
                  {canEdit && (
                    <button
                      onClick={() => onEdit(expense)}
                      className="rounded-full bg-indigo-50 px-3 py-2 text-indigo-600 text-sm font-semibold hover:bg-indigo-100"
                    >
                      Edit
                    </button>
                  )}
                  {canDelete && (
                    <button
                      onClick={() => onDelete(expense._id)}
                      className="rounded-full bg-rose-50 px-3 py-2 text-rose-600 text-sm font-semibold hover:bg-rose-100"
                    >
                      Delete
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ExpenseTable;
