import React, { useState } from 'react';
import { Role } from '../types';

interface SidebarProps {
  role: Role;
  activeView: string;
  setActiveView: (view: string) => void;
  onLogout: () => void;
  isOpen: boolean;        // Controlled from parent
  onClose: () => void;    // Callback to close
}

const Sidebar: React.FC<SidebarProps> = ({ role, activeView, setActiveView, onLogout, isOpen, onClose }) => {
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Define strictly filtered sections based on role
  const getSections = () => {
    switch (role) {
      case 'ADMIN':
        return [
          {
            title: 'Analytics',
            links: [
              { id: 'dashboard', label: 'Dashboard', icon: '📊' },
              { id: 'fuel-analytics', label: 'Diesel Audit', icon: '⛽' },
              { id: 'station-ledgers', label: 'Station Ledgers', icon: '🏛️' },
              { id: 'reports', label: 'Asset Reports', icon: '📋' },
            ]
          },
          {
            title: 'Operations',
            links: [
              { id: 'coal-transport', label: 'Coal Transport', icon: '🔥' },
              { id: 'mining-ops', label: 'Mining Ops', icon: '⛏️' },
              { id: 'fuel-agent', label: 'Agent Desk', icon: '⛽' },
            ]
          },
          {
            title: 'Asset Management',
            links: [
              { id: 'fleet', label: 'Truck Registry', icon: '🚚' },
              { id: 'drivers', label: 'Operators', icon: '👤' },
              { id: 'tires', label: 'Tire Pool', icon: '🛞' },
            ]
          },
          {
            title: 'System',
            links: [
              { id: 'settings', label: 'Master Data', icon: '⚙️' },
              { id: 'user-management', label: 'User Management', icon: '👥' },
            ]
          }
        ];
      case 'FUEL_AGENT':
        return [
          {
            title: 'Fuel Station',
            links: [
              { id: 'fuel-agent', label: 'Fueling Entry', icon: '⛽' },
              { id: 'fuel-history', label: 'Fuel History', icon: '📜' },
            ]
          }
        ];
      case 'COAL_ENTRY':
        return [
          {
            title: 'Coal Operations',
            links: [
              { id: 'coal-transport', label: 'Coal Logs', icon: '🔥' },
              { id: 'coal-entry', label: 'New Entry', icon: '➕' },
            ]
          }
        ];
      case 'MINING_ENTRY':
        return [
          {
            title: 'Mining Operations',
            links: [
              { id: 'mining-ops', label: 'Mining Logs', icon: '⛏️' },
              { id: 'mining-entry', label: 'New Entry', icon: '➕' },
              { id: 'mining-bulk', label: 'Bulk Upload', icon: '📤' },
            ]
          }
        ];
      default:
        return [];
    }
  };

  const sections = getSections();

  const handleLinkClick = (id: string) => {
    setActiveView(id);
    onClose(); // Close mobile menu on navigate
  };

  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && (
        <div 
          className="lg:hidden fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[100] animate-fadeIn" 
          onClick={onClose} 
        />
      )}

      {/* Sidebar Container */}
      <div className={`fixed left-0 top-0 h-screen bg-slate-900 text-white flex flex-col z-[105] transition-transform duration-300 ease-in-out border-r border-slate-800 ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'} ${isCollapsed ? 'w-20' : 'w-64'}`}>
        
        {/* Header */}
        <div className={`p-6 flex items-center ${isCollapsed ? 'justify-center' : 'justify-between'}`}>
          {!isCollapsed && (
            <div>
              <h1 className="text-xl font-black tracking-tighter text-white italic">SAPNA <span className="text-amber-500">CARTING</span></h1>
              <p className="text-[10px] text-slate-500 mt-1 uppercase tracking-[0.2em] font-bold">{role} PORTAL</p>
            </div>
          )}
          {isCollapsed && <span className="text-2xl font-black text-white italic">S<span className="text-amber-500">C</span></span>}
          
          {/* Collapse Toggle (Desktop Only) */}
          <button onClick={() => setIsCollapsed(!isCollapsed)} className="hidden lg:block text-slate-500 hover:text-white">
            {isCollapsed ? '»' : '«'}
          </button>

          {/* Close Button (Mobile Only) */}
          <button onClick={onClose} className="lg:hidden text-slate-400 hover:text-white text-xl">
             ✕
          </button>
        </div>

        <nav className="flex-1 px-4 py-2 space-y-6 overflow-y-auto scrollbar-hide">
          {sections.map(section => (
            <div key={section.title}>
              {!isCollapsed && (
                <p className="px-4 text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">{section.title}</p>
              )}
              <div className="space-y-1">
                {section.links.map(link => (
                  <button
                    key={link.id}
                    onClick={() => handleLinkClick(link.id)}
                    title={isCollapsed ? link.label : ''}
                    className={`w-full flex items-center px-4 py-3 rounded-xl transition-all duration-200 group ${
                      isCollapsed ? 'justify-center' : 'space-x-3'
                    } ${
                      activeView === link.id ? 'bg-amber-600 text-white shadow-lg scale-[1.02]' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                    }`}
                  >
                    <span className="text-xl">{link.icon}</span>
                    {!isCollapsed && <span className="font-bold text-sm">{link.label}</span>}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="p-4 border-t border-slate-800">
          <button 
            onClick={onLogout} 
            className={`w-full flex items-center px-4 py-3 rounded-xl text-slate-400 hover:bg-rose-500/10 hover:text-rose-400 transition-all font-black text-sm uppercase tracking-widest ${isCollapsed ? 'justify-center' : 'space-x-3'}`}
          >
            <span className="text-xl">🚪</span>
            {!isCollapsed && <span>Sign Out</span>}
          </button>
        </div>
      </div>
    </>
  );
};

export default Sidebar;
