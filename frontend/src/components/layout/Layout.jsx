import { useEffect, useState } from 'react';
import Navbar from './Navbar';
import Sidebar from './Sidebar';

const Layout = ({ children }) => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      const stored = window.localStorage.getItem('sidebarCollapsed');
      if (stored === null) return true;
      return stored === 'true';
    } catch (_error) {
      return true;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem('sidebarCollapsed', String(sidebarCollapsed));
    } catch (_error) {
      // Ignore storage errors and keep runtime state.
    }
  }, [sidebarCollapsed]);

  return (
    <div className="page-shell min-h-screen w-full overflow-x-hidden">
      <Navbar sidebarCollapsed={sidebarCollapsed} />
      <div className="flex min-h-screen">
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed((prev) => !prev)}
        />
        <main
          className={`min-h-screen w-full px-4 pb-10 pt-24 sm:px-6 md:px-8 lg:px-10 ${
            sidebarCollapsed ? 'md:ml-20 md:w-[calc(100%-5rem)]' : 'md:ml-72 md:w-[calc(100%-18rem)]'
          }`}
        >
          <div className="mx-auto max-w-[1840px] space-y-6">{children}</div>
        </main>
      </div> 
    </div>
  );
};

export default Layout;
