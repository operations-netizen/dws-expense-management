const Card = ({ title, subtitle, children, className = '', headerAction }) => {
  return (
    <div className={`surface-card p-5 sm:p-6 ${className}`}>
      {title && (
        <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
          <div>
            <h3 className="text-lg font-semibold text-slate-900 leading-tight">{title}</h3>
            {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
          </div>
          {headerAction && <div className="flex-shrink-0">{headerAction}</div>}
        </div>
      )}
      {children} 
    </div>
  );
};

export default Card;
