import { X } from 'lucide-react';

const Modal = ({ isOpen, onClose, title, children, size = 'md' }) => {
  if (!isOpen) return null;

  const sizes = {
    sm: 'max-w-md',
    md: 'max-w-2xl',
    lg: 'max-w-4xl',
    xl: 'max-w-6xl',
  };
 
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center px-4 py-8 sm:py-10">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose}></div>
      <div
        className={`relative w-full ${sizes[size]} glass-panel overflow-hidden animate-[fadeIn_0.2s_ease-out] max-h-[90vh] flex flex-col`}
      >
        <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4 sm:px-6">
          <div>
            <p className="text-xs uppercase tracking-[0.26em] text-slate-400 mb-1">Workspace Action</p>
            <h3 className="text-lg sm:text-xl font-semibold text-slate-900">{title}</h3>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
          >
            <X size={20} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6 sm:py-6">{children}</div>
      </div>
    </div>
  );
};

export default Modal;
