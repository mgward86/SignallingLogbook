import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './lib/AuthContext';
import { LogEntryForm } from './components/LogEntryForm';
import { LogList } from './components/LogList';
import { Landing } from './components/Landing';
import { UserProfileForm } from './components/UserProfileForm';
import { ConfigManager } from './components/ConfigManager';
import { SupervisorPortalModal } from './components/SupervisorPortalModal';
import { Nav } from './components/Nav';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, List, User as UserIcon, BookOpen, Database, Wifi, WifiOff, ShieldCheck } from 'lucide-react';
import { useOnlineStatus } from './hooks/useOnlineStatus';

function AppContent() {
  const { user, profile, loading } = useAuth();
  const isOnline = useOnlineStatus();
  const [view, setView] = useState<'list' | 'create' | 'profile' | 'config'>('list');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [duplicateId, setDuplicateId] = useState<string | null>(null);
  const [supervisorPortalOpen, setSupervisorPortalOpen] = useState(false);
  const [urlToken, setUrlToken] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const verifyToken = params.get('verifyToken');
    if (verifyToken) {
      setUrlToken(verifyToken);
      setSupervisorPortalOpen(true);
    }
  }, []);

  if (loading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-rail-bg">
        <motion.div
          animate={{ scale: [1, 1.1, 1], opacity: [0.5, 1, 0.5] }}
          transition={{ repeat: Infinity, duration: 2 }}
          className="flex flex-col items-center gap-4"
        >
          <BookOpen className="w-12 h-12 text-rail-blue" />
          <p className="font-mono text-xs uppercase tracking-widest">Initialising Logbook...</p>
        </motion.div>
      </div>
    );
  }

  if (!user) {
    return <Landing />;
  }

  const handleEdit = (id: string) => {
    setEditingId(id);
    setDuplicateId(null);
    setView('create');
  };

  const handleDuplicate = (id: string) => {
    setDuplicateId(id);
    setEditingId(null);
    setView('create');
  };

  const handleCloseForm = () => {
    setEditingId(null);
    setDuplicateId(null);
    setView('list');
  };

  return (
    <div className="min-h-screen bg-rail-bg flex flex-col">
      <Nav currentView={view} setView={setView} />
      
      <main className="flex-1 container mx-auto px-4 py-8 max-w-7xl">
        <AnimatePresence mode="wait">
          {view === 'list' && (
            <motion.div
              key="list"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
                <div id="log-list-header-title" className="flex items-center gap-4">
                  <div>
                    <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-rail-blue">Active Logbook</h1>
                    <p className="text-xs text-gray-400 font-mono uppercase tracking-widest font-semibold mt-1">Digital Signalling Record</p>
                  </div>
                  {!isOnline && (
                    <div id="offline-badge" className="flex items-center gap-1.5 px-3 py-1 bg-amber-50 border border-amber-100 rounded-full animate-pulse">
                      <WifiOff size={12} className="text-amber-600" />
                      <span className="text-[9px] font-bold text-amber-700 uppercase tracking-wider">Offline</span>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <button
                    id="btn-supervisor-portal"
                    onClick={() => setSupervisorPortalOpen(true)}
                    className="bg-slate-900 text-white px-4 py-2.5 rounded-xl flex items-center gap-2 hover:bg-slate-800 active:scale-98 transition-all duration-300 shadow-sm text-xs font-bold cursor-pointer"
                  >
                    <ShieldCheck size={16} className="text-emerald-400" />
                    <span>Supervisor Portal</span>
                  </button>
                  <button
                    id="btn-create-new-entry"
                    onClick={() => {
                      setEditingId(null);
                      setDuplicateId(null);
                      setView('create');
                    }}
                    className="bg-rail-blue text-white px-5 py-2.5 rounded-xl flex items-center gap-2 hover:bg-rail-blue/95 active:scale-98 transition-all duration-300 shadow-md shadow-rail-blue/15 font-semibold text-sm cursor-pointer"
                  >
                    <Plus size={16} />
                    <span>New Entry</span>
                  </button>
                </div>
              </div>
              <LogList onEdit={handleEdit} onDuplicate={handleDuplicate} />
            </motion.div>
          )}

          {view === 'create' && (
            <motion.div
              key="create"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <LogEntryForm entryId={editingId} duplicateId={duplicateId} onClose={handleCloseForm} />
            </motion.div>
          )}

          {view === 'profile' && (
            <motion.div
              key="profile"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
            >
              <UserProfileForm />
            </motion.div>
          )}

          {view === 'config' && (
            <motion.div
              key="config"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
            >
              <ConfigManager />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <footer className="py-8 border-t border-gray-200 mt-auto">
        <div className="container mx-auto px-4 text-center">
          <p className="text-xs text-gray-400 font-mono uppercase tracking-widest">
            Digital Railway Signalling Logbook - Developed by M.Ward
          </p>
        </div>
      </footer>

      {/* Supervisor Portal Modal */}
      <AnimatePresence>
        {supervisorPortalOpen && (
          <SupervisorPortalModal
            initialToken={urlToken}
            onClose={() => {
              setSupervisorPortalOpen(false);
              setUrlToken(null);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
