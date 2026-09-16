import React from 'react';
import { useAuth } from '../lib/AuthContext';
import { motion } from 'motion/react';
import { BookOpen, AlertTriangle } from 'lucide-react';

export function Landing() {
  const { signIn, signingIn, authError } = useAuth();

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#f8fafc] to-[#f1f5f9] flex flex-col justify-center items-center p-6 relative overflow-hidden">
      {/* Decorative ambient elements */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-rail-blue/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-[-25%] right-[-10%] w-[60%] h-[60%] bg-rail-blue/5 rounded-full blur-3xl pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="max-w-md w-full bg-white p-8 rounded-3xl shadow-xl shadow-gray-200/50 border border-gray-100 relative z-10"
      >
        <div className="flex justify-center mb-6">
          <div className="bg-rail-blue p-4 rounded-2xl shadow-lg shadow-rail-blue/20">
            <BookOpen className="text-white w-9 h-9" />
          </div>
        </div>
        
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-rail-blue tracking-tight mb-2">Railway Signalling Logbook</h1>
          <p className="text-xs text-gray-400 font-mono uppercase tracking-widest font-bold">
            Professional Digital Signalling Record Keeping
          </p>
        </div>

        <button
          onClick={signIn}
          disabled={signingIn}
          className={`w-full text-white py-3.5 rounded-2xl font-semibold flex items-center justify-center gap-3 transition-all duration-300 shadow-md ${
            signingIn 
              ? 'bg-rail-blue/70 cursor-not-allowed shadow-none' 
              : 'bg-rail-blue hover:bg-rail-blue/95 hover:shadow-lg hover:shadow-rail-blue/15 hover:scale-[1.01] active:scale-[0.99] cursor-pointer'
          }`}
        >
          {signingIn ? (
            <span className="flex items-center gap-2">
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Connecting to Google Workspace...
            </span>
          ) : (
            <>
              <img referrerPolicy="no-referrer" src="https://www.google.com/favicon.ico" className="w-4 h-4 bg-white rounded-full shrink-0" alt="Google" />
              Sign in
            </>
          )}
        </button>

        {authError && (
          <div className="mt-4 p-4 bg-amber-50/70 border border-amber-100 rounded-2xl text-amber-800 text-xs leading-relaxed space-y-1 animate-in fade-in slide-in-from-top-2">
            <p className="font-bold flex items-center gap-1.5 uppercase tracking-wider text-[10px] text-amber-700">
              <AlertTriangle size={14} className="text-amber-500 shrink-0" />
              Authorisation Note
            </p>
            <p className="font-medium text-gray-600">{authError}</p>
          </div>
        )}
      </motion.div>
    </div>
  );
}
