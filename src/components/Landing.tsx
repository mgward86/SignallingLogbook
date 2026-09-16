import React, { useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { motion } from 'motion/react';
import { BookOpen, AlertTriangle, CheckCircle2, Eye, EyeOff } from 'lucide-react';

type Mode = 'signin' | 'signup';

const inputClass = 'w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-rail-blue/10 focus:border-rail-blue outline-none transition placeholder:text-gray-400';

export function Landing() {
  const { signIn, signInWithEmail, signUpWithEmail, resetPassword, signingIn, authError, clearAuthError } = useAuth();

  const [mode, setMode] = useState<Mode>('signin');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [resettingPassword, setResettingPassword] = useState(false);

  const toggleMode = () => {
    setMode(mode === 'signin' ? 'signup' : 'signin');
    setResetSent(false);
    clearAuthError();
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetSent(false);
    if (mode === 'signup') {
      await signUpWithEmail(email, password, displayName.trim());
    } else {
      await signInWithEmail(email, password);
    }
  };

  const handleForgotPassword = async () => {
    setResetSent(false);
    setResettingPassword(true);
    try {
      await resetPassword(email);
      setResetSent(true);
    } catch {
      // authError is already set by resetPassword; nothing else to do here.
    } finally {
      setResettingPassword(false);
    }
  };

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
            Professional Digital Signalling Experience Record Keeping
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
              Connecting...
            </span>
          ) : (
            <>
              <img referrerPolicy="no-referrer" src="https://www.google.com/favicon.ico" className="w-4 h-4 bg-white rounded-full shrink-0" alt="Google" />
              Continue with Google
            </>
          )}
        </button>

        <div className="flex items-center gap-3 my-6">
          <div className="flex-1 h-px bg-gray-200" />
          <span className="text-[10px] uppercase tracking-widest text-gray-400 font-bold">or</span>
          <div className="flex-1 h-px bg-gray-200" />
        </div>

        <form onSubmit={handleEmailSubmit} className="space-y-3">
          {mode === 'signup' && (
            <input
              type="text"
              placeholder="Full name"
              value={displayName}
              onChange={(e) => { setDisplayName(e.target.value); clearAuthError(); }}
              className={inputClass}
              autoComplete="name"
            />
          )}
          <input
            type="email"
            placeholder="Email address"
            value={email}
            onChange={(e) => { setEmail(e.target.value); clearAuthError(); setResetSent(false); }}
            className={inputClass}
            autoComplete="email"
            required
          />
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="Password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); clearAuthError(); }}
              className={`${inputClass} pr-11`}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              minLength={6}
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition"
              tabIndex={-1}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>

          <button
            type="submit"
            disabled={signingIn}
            className={`w-full py-3 rounded-2xl font-semibold text-sm transition-all duration-300 ${
              signingIn
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'bg-gray-900 text-white hover:bg-gray-800 cursor-pointer'
            }`}
          >
            {signingIn ? 'Please wait…' : mode === 'signup' ? 'Create account' : 'Sign in'}
          </button>
        </form>

        <div className="flex items-center justify-between mt-4 text-xs">
          <button onClick={toggleMode} className="text-rail-blue font-semibold hover:underline">
            {mode === 'signup' ? 'Already have an account? Sign in' : 'Create an account'}
          </button>
          {mode === 'signin' && (
            <button
              onClick={handleForgotPassword}
              disabled={resettingPassword}
              className="text-gray-400 font-medium hover:text-gray-600 hover:underline disabled:opacity-50"
            >
              Forgot password?
            </button>
          )}
        </div>

        {resetSent && !authError && (
          <div className="mt-4 p-4 bg-emerald-50/70 border border-emerald-100 rounded-2xl text-emerald-800 text-xs leading-relaxed flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
            <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
            <span className="font-medium">Password reset email sent. Check your inbox.</span>
          </div>
        )}

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
