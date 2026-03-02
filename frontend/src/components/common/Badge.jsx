import { getStatusBadgeColor } from '../../utils/formatters';

const Badge = ({ children, variant = 'default', className = '' }) => {
  const variants = {
    default: 'border border-slate-200 bg-slate-100/90 text-slate-700',
    success: 'bg-emerald-100 text-emerald-800 border border-emerald-200',
    warning: 'bg-amber-100 text-amber-800 border border-amber-200',
    danger: 'bg-rose-100 text-rose-800 border border-rose-200',
    info: 'bg-sky-100 text-sky-800 border border-sky-200',
  }; 

  const normalizedChild = typeof children === 'string' ? children.trim() : '';
  const colorClass =
    normalizedChild && ['Active', 'Declined', 'Deactive', 'Pending', 'Accepted', 'Rejected', 'Merged', 'Unique'].includes(normalizedChild)
      ? getStatusBadgeColor(normalizedChild)
      : variants[variant];

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-[0.67rem] font-semibold uppercase tracking-wide ${colorClass} ${className}`}
    >
      {children}
    </span>
  );
};

export default Badge;
