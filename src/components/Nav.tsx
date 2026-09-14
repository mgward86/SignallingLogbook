import React from 'react';
import { useAuth } from '../lib/AuthContext';
import { LogOut, Settings, List, PlusSquare, BookOpen, Database } from 'lucide-react';

interface NavProps {
  currentView: 'list' | 'create' | 'profile' | 'config';
  setView: (view: 'list' | 'create' | 'profile' | 'config') => void;
}

export function Nav({ currentView, setView }: NavProps) {
  const { profile, logOut } = useAuth();

  // Get user initials for a beautiful avatar
  const getInitials = () => {
    if (profile?.displayName) {
      return profile.displayName
        .split(' ')
        .map((n: string) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);
    }
    return 'RG';
  };

  return (
    <nav id="app-navigation" className="bg-white/85 backdrop-blur-md border-b border-gray-100 sticky top-0 z-50 transition-all duration-300">
      <div className="container mx-auto px-6 h-16 flex items-center justify-between">
        {/* Brand Group */}
        <div 
          id="nav-logo-group"
          className="flex items-center gap-3 cursor-pointer group select-none"
          onClick={() => setView('list')}
        >
          <div className="bg-rail-blue p-2 rounded-xl group-hover:scale-105 group-hover:rotate-1 transition-all duration-300 shadow-sm shadow-rail-blue/20">
            <BookOpen className="text-white w-5 h-5" />
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-base leading-tight text-rail-blue tracking-tight">Railway</span>
            <span className="text-[9px] uppercase font-mono tracking-widest text-gray-400 font-bold">Signalling Logbook</span>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div id="nav-tabs-container" className="flex items-center gap-1 sm:gap-2">
          <button
            id="nav-tab-logbook"
            onClick={() => setView('list')}
            className={`flex items-center gap-2 text-xs font-semibold px-4 py-2 rounded-xl transition-all duration-300 ${
              currentView === 'list' 
                ? 'bg-rail-blue/5 text-rail-blue shadow-sm shadow-rail-blue/5' 
                : 'text-gray-500 hover:text-rail-blue hover:bg-gray-50'
            }`}
          >
            <List size={16} />
            <span className="hidden sm:inline">Logbook</span>
          </button>
          
          <button
            id="nav-tab-new-entry"
            onClick={() => setView('create')}
            className={`flex items-center gap-2 text-xs font-semibold px-4 py-2 rounded-xl transition-all duration-300 ${
              currentView === 'create' 
                ? 'bg-rail-blue/5 text-rail-blue shadow-sm shadow-rail-blue/5' 
                : 'text-gray-500 hover:text-rail-blue hover:bg-gray-50'
            }`}
          >
            <PlusSquare size={16} />
            <span className="hidden sm:inline">New Entry</span>
          </button>

          <button
            id="nav-tab-database"
            onClick={() => setView('config')}
            className={`flex items-center gap-2 text-xs font-semibold px-4 py-2 rounded-xl transition-all duration-300 ${
              currentView === 'config' 
                ? 'bg-rail-blue/5 text-rail-blue shadow-sm shadow-rail-blue/5' 
                : 'text-gray-500 hover:text-rail-blue hover:bg-gray-50'
            }`}
          >
            <Database size={16} />
            <span className="hidden sm:inline">Database</span>
          </button>
        </div>

        {/* Settings & Logout Controls */}
        <div id="nav-user-controls" className="flex items-center gap-4">
          <div className="h-5 w-[1px] bg-gray-200 hidden xs:block" />

          <div className="flex items-center gap-3">
            <button
              id="nav-tab-profile"
              onClick={() => setView('profile')}
              className={`flex items-center gap-2 p-1 pl-1 pr-3 rounded-full transition-all duration-300 border ${
                currentView === 'profile'
                  ? 'border-rail-blue bg-rail-blue/5 text-rail-blue'
                  : 'border-gray-200 bg-white hover:border-rail-blue/30 text-gray-600 hover:text-rail-blue'
              }`}
            >
              <div className="w-7 h-7 rounded-full bg-rail-blue/10 text-rail-blue text-xs font-bold font-mono flex items-center justify-center shrink-0 border border-rail-blue/15">
                {getInitials()}
              </div>
              <span className="hidden md:inline text-xs font-bold tracking-tight max-w-[100px] truncate">
                {profile?.displayName || 'Settings'}
              </span>
              <Settings size={14} className="opacity-70 group-hover:rotate-45 duration-300 ml-0.5" />
            </button>
            
            <button
              id="nav-logout-btn"
              onClick={logOut}
              className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50/50 rounded-xl transition-all duration-300"
              title="Sign Out"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}
