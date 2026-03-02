const PageHeader = ({ eyebrow, title, description, actions }) => {
  return (
    <div className="surface-card flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-start sm:justify-between sm:px-6">
      <div>
        {eyebrow && <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">{eyebrow}</p>}
        <h1 className="mt-1 text-2xl font-bold text-slate-900 sm:text-3xl">{title}</h1>
        {description && <p className="mt-2 max-w-3xl text-sm text-slate-600">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
};

export default PageHeader;
