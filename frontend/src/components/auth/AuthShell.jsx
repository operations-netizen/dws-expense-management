const AuthShell = ({ helperCard, children, footer, leftFooter }) => {
  return (
    <div className="relative min-h-screen bg-white overflow-hidden">
      <div className="grid min-h-screen grid-cols-1 lg:grid-cols-2">
        <div className="relative bg-[#0b0f18] text-white px-8 py-12 md:px-12 lg:px-16">
          <div className="absolute inset-0">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_25%,rgba(255,255,255,0.16),transparent_42%),radial-gradient(circle_at_80%_0%,rgba(255,255,255,0.12),transparent_38%),radial-gradient(circle_at_80%_80%,rgba(255,255,255,0.08),transparent_45%)]" />
            <div className="absolute inset-0 opacity-35 relative before:content-[''] before:absolute before:inset-0 before:bg-[radial-gradient(rgba(255,255,255,0.18)_1px,transparent_1px)] before:[background-size:26px_26px]" />
            <div className="absolute -left-24 -top-24 h-72 w-72 rounded-full bg-white/5 blur-3xl" />
          </div>
          <div className="relative flex h-full flex-col justify-between gap-10">
            {helperCard}
            {leftFooter && (
              <div className="text-xs uppercase tracking-[0.35em] text-white/70">
                {leftFooter}
              </div>
            )}
          </div>
        </div>
        <div className="bg-white px-6 py-12 md:px-12 lg:px-20 flex flex-col justify-center">
          {children}
          {footer && (
            <div className="mt-10 text-center text-sm text-slate-500">
              {footer}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AuthShell;
