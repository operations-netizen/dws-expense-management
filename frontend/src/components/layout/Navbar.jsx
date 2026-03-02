import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bell, ChevronDown, LogOut, Menu, ShieldCheck, User, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { logout } from '../../services/authService';
import { getRoleName } from '../../utils/formatters';
import { getNavigationForRole } from '../../utils/navigation';
 
const Navbar = ({ sidebarCollapsed = false }) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [notificationCount] = useState(0);
  const profileMenuRef = useRef(null);
  const navigationItems = getNavigationForRole(user?.role);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  useEffect(() => {
    if (!showProfileMenu) return undefined;

    const handleClickOutside = (event) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target)) {
        setShowProfileMenu(false);
      }
    };

    const handleEsc = (event) => {
      if (event.key === 'Escape') {
        setShowProfileMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEsc);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [showProfileMenu]);

  const roleBadge = (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-700">
      <ShieldCheck size={14} />
      {getRoleName(user?.role)}
    </span>
  );

  return (
    <nav
      className={`fixed left-0 right-0 top-0 z-50 border-b border-slate-200 bg-white/95 backdrop-blur-lg ${
        sidebarCollapsed ? 'md:left-20' : 'md:left-72'
      }`}
    >
      <div className="flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <button
            onClick={() => setShowMobileMenu(!showMobileMenu)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700 md:hidden"
          >
            {showMobileMenu ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>

        <div className="ml-auto hidden items-center gap-4 md:flex">
          <Link
            to="/notifications"
            className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600 transition-colors hover:text-[#2f64df]"
          >
            <Bell size={18} />
            {notificationCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-rose-500 text-[0.65rem] font-bold text-white">
                {notificationCount > 99 ? '99+' : notificationCount}
              </span>
            )}
          </Link>

          <div className="relative" ref={profileMenuRef}>
            <button
              onClick={() => setShowProfileMenu(!showProfileMenu)}
              className="flex items-center gap-3 rounded-full px-1.5 py-1 transition-colors hover:bg-slate-100"
              aria-label="Open profile menu"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500 text-sm font-bold uppercase text-white">
                {user?.name?.split(' ')?.[0]?.[0] || 'S'}
              </div>
              <span className="text-[1.07rem] font-semibold text-slate-900">{user?.name?.split(' ')[0] || 'Profile'}</span>
              <ChevronDown size={16} className="text-slate-500" />
            </button>
            {showProfileMenu && (
              <div className="absolute right-0 mt-3 w-80 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.16)]">
                <div className="px-5 py-4">
                  <p className="text-[1.12rem] font-semibold text-slate-900">{user?.name || 'Workspace User'}</p>
                  <p className="mt-0.5 text-[1rem] text-slate-600">{user?.email || ''}</p>
                  <p className="mt-0.5 text-[1rem] font-semibold text-[#3b82f6]">{(getRoleName(user?.role) || '').toLowerCase()}</p>
                </div>
                <Link
                  to="/profile"
                  className="flex items-center gap-3 border-t border-slate-200 px-5 py-4 text-[1rem] text-slate-800 hover:bg-slate-50"
                  onClick={() => setShowProfileMenu(false)}
                >
                  <User size={18} /> Profile Settings
                </Link>
                <button
                  onClick={handleLogout}
                  className="flex w-full items-center gap-3 border-t border-slate-200 px-5 py-4 text-[1rem] text-rose-500 hover:bg-rose-50"
                >
                  <LogOut size={18} /> Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {showMobileMenu && (
        <div className="border-t border-slate-200 bg-white px-4 py-4 shadow-md md:hidden">
          <div className="space-y-2">
            {roleBadge}
            {navigationItems.map((item) => {
              const Icon = item.icon;
              return (
              <Link
                key={item.path}
                to={item.path}
                className="flex items-center gap-3 rounded-lg border border-slate-100 px-4 py-3 text-sm font-semibold text-slate-700"
                onClick={() => setShowMobileMenu(false)}
              >
                <Icon size={18} /> {item.label}
              </Link>
            )})}
            <Link
              to="/notifications"
              className="flex items-center gap-3 rounded-lg border border-slate-100 px-4 py-3 text-slate-700"
              onClick={() => setShowMobileMenu(false)}
            >
              <Bell size={18} /> Notifications
            </Link>
            <Link
              to="/profile"
              className="flex items-center gap-3 rounded-lg border border-slate-100 px-4 py-3 text-slate-700"
              onClick={() => setShowMobileMenu(false)}
            >
              <User size={18} /> Profile
            </Link>
            <button
              onClick={handleLogout}
              className="flex w-full items-center gap-3 rounded-lg bg-rose-50 px-4 py-3 text-rose-600"
            >
              <LogOut size={18} /> Logout
            </button>
          </div>
        </div>
      )}
    </nav>
  );
};

export default Navbar;
