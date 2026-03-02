const Button = ({
  children,
  variant = 'primary',
  size = 'md',
  onClick,
  disabled = false,
  type = 'button',
  className = '',
  fullWidth = false,
  ...props
}) => { 
  const baseClasses =
    'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 active:translate-y-px';

  const variants = {
    primary:
      'bg-[#2f64df] text-white shadow-[0_10px_24px_rgba(47,100,223,0.35)] hover:bg-[#2858ca] focus-visible:ring-[#7ba8ff]',
    secondary:
      'border border-slate-200 bg-white text-slate-800 shadow-sm hover:border-slate-300 hover:bg-slate-50 focus-visible:ring-slate-300',
    outline:
      'border border-slate-300 bg-transparent text-slate-700 hover:bg-slate-100/80 focus-visible:ring-slate-300',
    danger:
      'bg-rose-600 text-white shadow-[0_10px_20px_rgba(225,29,72,0.25)] hover:bg-rose-700 focus-visible:ring-rose-300',
    ghost:
      'bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus-visible:ring-slate-200',
  };

  const sizes = {
    sm: 'px-3 py-2 text-xs',
    md: 'px-4 py-2.5 text-sm',
    lg: 'px-5 py-3 text-sm',
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${baseClasses} ${variants[variant]} ${sizes[size]} ${fullWidth ? 'w-full' : ''} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};

export default Button;
