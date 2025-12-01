import React from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { 
  Home, 
  Calendar, 
  Car, 
  Users, 
  FileSpreadsheet, 
  LogOut, 
  Shield, 
  List,
  Map // <--- Added Icon for Zones
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import userLogo from '../assets/logo.png'; 

const SidebarItem = ({ to, icon: Icon, label }) => (
  <NavLink 
    to={to}
    className={({ isActive }) => 
      `flex items-center gap-3 px-6 py-4 transition-all duration-200 ${
        isActive ? 'bg-primary text-white' : 'text-gray-600 hover:bg-gray-100'
      }`
    }
  >
    <Icon size={20} />
    <span className="font-medium">{label}</span>
  </NavLink>
);

export default function MainLayout() {
  const { user, role, logout } = useAuth(); 
  const navigate = useNavigate();

  // --- ALLOW BOTH ADMIN AND MASTER ADMIN ---
  const isAdmin = role === 'admin' || role === 'master_admin';

  const handleLogout = async () => {
    if (logout) await logout(); 
    navigate('/login');
  };

  return (
    <div className="flex min-h-screen bg-[#F8F9FA] font-sans">
      
      {/* --- SIDEBAR --- */}
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col fixed h-full z-10 shadow-lg">
        {/* Header */}
        <div className="bg-secondary h-20 flex items-center px-6">
          <h1 className="text-xl font-bold text-white tracking-wide">Turbo Parking</h1>
        </div>
        
        {/* Navigation Links */}
        <nav className="flex-1 py-6 space-y-2 overflow-y-auto">
          
          {/* 1. PUBLIC ITEMS */}
          <SidebarItem to="/" icon={Home} label="Home" />
          <SidebarItem to="/booking" icon={Calendar} label="Booking" />

          {/* 2. ADMIN & MASTER ADMIN ITEMS */}
          {isAdmin && (
            <>
              {/* Report List */}
              <SidebarItem to="/booking-list" icon={List} label="Booking List" />
              
              {/* Asset Management */}
              <SidebarItem to="/car-park" icon={Car} label="Car Park" />
              <SidebarItem to="/zones" icon={Map} label="Zones" /> {/* <--- NEW ITEM */}
              
              {/* People Management */}
              <SidebarItem to="/employees" icon={Users} label="Employees" />
              <SidebarItem to="/bond-holder" icon={FileSpreadsheet} label="Bond Holder" />
              
              {/* Divider for System Menu */}
              <div className="my-4 mx-4 border-t border-gray-100"></div>
              
              {/* User Management */}
              <SidebarItem to="/users" icon={Shield} label="User Management" />
            </>
          )}
        </nav>

        {/* Footer: User Profile & Logout */}
        <div className="p-4 border-t border-gray-100 bg-gray-50">
           <div className="mb-4 flex items-center gap-3 p-3 rounded-lg bg-white border shadow-sm">
              
              <img 
                src={userLogo} 
                alt="User Logo" 
                className="w-10 h-10 rounded-full object-cover border border-gray-200" 
              />

              <div className="overflow-hidden">
                <p className="text-sm font-bold text-gray-700 truncate w-32" title={user?.email}>
                  {user?.email}
                </p>
                <p className="text-xs text-[#FA4786] capitalize font-medium">
                    {role === 'master_admin' ? 'Master Admin' : role}
                </p>
              </div>
           </div>
           
           <button 
             onClick={handleLogout}
             className="w-full flex items-center justify-center gap-2 px-3 py-2 text-red-500 hover:bg-red-50 border border-transparent hover:border-red-100 rounded-lg transition"
           >
             <LogOut size={18} />
             <span className="font-medium">Sign Out</span>
           </button>
        </div>
      </aside>

      {/* --- MAIN CONTENT AREA --- */}
      <main className="flex-1 ml-64 p-8">
        <Outlet />
      </main>
    </div>
  );
}