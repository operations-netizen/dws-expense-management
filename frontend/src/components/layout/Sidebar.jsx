import { Link, useLocation } from 'react-router-dom';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getNavigationForRole } from '../../utils/navigation';
import dwsLogo from '../../assets/dws.png';

const Sidebar = ({ collapsed = false, onToggleCollapse }) => {
  const { user } = useAuth();
  const location = useLocation();
  const items = getNavigationForRole(user?.role);
  const isActive = (path) => location.pathname === path;
 
  return (
    <aside
      className={`fixed inset-y-0 left-0 z-40 hidden flex-shrink-0 flex-col border-r border-white/10 bg-[linear-gradient(180deg,#111d31_0%,#101c30_55%,#0d1729_100%)] text-slate-100 shadow-2xl transition-all duration-300 md:flex ${
        collapsed ? 'w-20' : 'w-72'
      }`}
    >
      <div className={`flex border-b border-white/10 px-3 py-4 ${collapsed ? 'justify-center' : 'items-center gap-3 px-4'}`}>
        <button
          type="button"
          onClick={onToggleCollapse}
          className="flex h-10 w-10 items-center justify-center rounded-md bg-[#0f1a2c] text-slate-300 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)] transition-colors hover:bg-[#13223a] hover:text-white"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
        </button>

        {!collapsed && (
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl bg-white/10 p-1">
              <img src={dwsLogo} alt="DWS" className="h-full w-full object-contain" />
            </div>
            <div>
              <p className="text-[1.35rem] font-semibold leading-none">DWS</p>
              <p className="text-sm text-slate-300">Expense Workspace</p>
            </div>
          </div>
        )}

      </div>

      <div className={`subtle-scrollbar flex-1 overflow-y-auto py-6 ${collapsed ? 'px-2' : 'px-3'}`}>
        {!collapsed && (
          <p className="px-2 text-[0.72rem] uppercase tracking-[0.34em] text-slate-400">Navigation</p>
        )}
        <nav className={`${collapsed ? 'mt-0 space-y-2.5' : 'mt-3 space-y-1.5'}`}>
          {items.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.path);
            return (
              <Link
                key={item.path}
                to={item.path}
                title={item.label}
                className={`group flex items-center rounded-2xl text-sm font-semibold transition-all ${
                  collapsed
                    ? `h-11 justify-center px-0 ${
                        active
                          ? 'bg-white/10 text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]'
                          : 'text-slate-300 hover:bg-white/6 hover:text-white'
                      }`
                    : `gap-3 px-4 py-3 ${
                        active
                          ? 'bg-white/10 text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]'
                          : 'text-slate-300 hover:bg-white/6 hover:text-white'
                      }`
                }`}
              >
                <Icon size={20} className={active ? 'text-[#63a7ff]' : 'text-slate-300 group-hover:text-slate-100'} />
                {!collapsed && <span className="text-[0.94rem]">{item.label}</span>}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="border-t border-white/10 p-4">
        {collapsed ? (
          <div className="flex justify-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#345ea8] text-sm font-semibold text-white">
              {user?.name?.[0]?.toUpperCase() || 'S'}
            </div>
          </div>
        ) : (
          <div className="rounded-2xl bg-white/8 px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#345ea8] text-sm font-semibold text-white">
                {user?.name?.[0]?.toUpperCase() || 'S'}
              </div>
              <div className="min-w-0">
                <p className="truncate text-base font-semibold text-white">{user?.name || 'Workspace User'}</p>
                <p className="truncate text-sm text-slate-300">{user?.email || ''}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};

export default Sidebar;
