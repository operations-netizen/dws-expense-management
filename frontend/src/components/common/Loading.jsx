const Loading = ({ size = 'md', fullScreen = false, label = 'Loading data' }) => {
  const sizes = {
    sm: 'w-6 h-6',
    md: 'w-12 h-12',
    lg: 'w-16 h-16',
  };

  const spinner = (
    <div className="flex flex-col items-center space-y-3">
      <div className={`relative ${sizes[size]}`}>
        <div className="absolute inset-0 animate-spin rounded-full border-4 border-[#d5e4ff] border-t-[#2f64df]"></div>
      </div> 
      <p className="text-xs uppercase tracking-[0.24em] text-slate-500">{label}</p>
    </div>
  );

  if (fullScreen) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-100/80 backdrop-blur-sm">
        {spinner}
      </div>
    );
  }

  return <div className="flex justify-center items-center py-10">{spinner}</div>;
};

export default Loading;
