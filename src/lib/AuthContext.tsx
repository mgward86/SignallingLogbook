import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth';
import { auth, db, removeUndefinedProperties } from './firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';

export interface UserProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
  employeeId?: string;
  jobTitle?: string;
  location?: string;
  isLocationNA?: boolean;
  numberingSystem?: {
    prefix: string;
    nextNumber: number;
    enabled: boolean;
  };
  quarterFormat?: 'Q1-Q4' | 'Months';
  // Mobile app fields (see MOBILE_DEPLOYMENT_PLAN.md)
  oneSignalPlayerId?: string;
  biometricLockEnabled?: boolean;
  pdfConfig?: {
    title?: string;
    subtitle?: string;
    accentColor?: string;
    showSupervisor?: boolean;
    supervisorTitle?: string;
    supervisorDeclaration?: string;
    showEquipment?: boolean;
    showCertificationDetails?: boolean;
    pageOrientation?: 'portrait' | 'landscape';
    marginSize?: 'narrow' | 'standard' | 'wide';
    fontFamily?: 'helvetica' | 'times' | 'courier';
    fontSizeModifier?: 'sm' | 'md' | 'lg';
    headerStyle?: 'accent-lines' | 'solid-banner' | 'bold-left' | 'jmdr-grid' | 'executive-pro';
    layoutSpacing?: 'relaxed' | 'compressed';
    showOwnerSignature?: boolean;
    showPageNumbers?: boolean;
    customFooterNote?: string;
    showSupervisorComments?: boolean;
  };
}

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  signingIn: boolean;
  authError: string | null;
  signIn: () => Promise<void>;
  logOut: () => Promise<void>;
  updateProfile: (data: Partial<UserProfile>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    return onAuthStateChanged(auth, async (user) => {
      setUser(user);
      if (user) {
        try {
          const profileDoc = await getDoc(doc(db, 'users', user.uid));
          if (profileDoc.exists()) {
            const data = profileDoc.data();
            const userProfile: UserProfile = {
              ...data,
              numberingSystem: data.numberingSystem || { prefix: 'LOG-', nextNumber: 1, enabled: true },
              quarterFormat: data.quarterFormat || 'Q1-Q4',
            } as UserProfile;
            setProfile(userProfile);
          } else {
            const newProfile = {
              uid: user.uid,
              email: user.email,
              displayName: user.displayName,
              numberingSystem: { prefix: 'LOG-', nextNumber: 1, enabled: true },
              quarterFormat: 'Q1-Q4',
              createdAt: serverTimestamp(),
            };
            await setDoc(doc(db, 'users', user.uid), removeUndefinedProperties(newProfile));
            setProfile(newProfile as unknown as UserProfile);
          }
        } catch (error) {
          console.error('Error fetching/creating profile:', error);
          // Don't throw here to avoid blocking app boot if Firestore is temporarily offline
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });
  }, []);

  const signIn = async () => {
    if (signingIn) {
      console.warn("Sign-in already in progress, ignoring duplicate call.");
      return;
    }
    setSigningIn(true);
    setAuthError(null);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({
        prompt: 'select_account'
      });
      await signInWithPopup(auth, provider);
    } catch (error: any) {
      console.error('Firebase Auth Sign-In Error:', error);
      let friendlyMessage = 'Authentication failed. Please try again.';
      
      if (error && typeof error === 'object') {
        const code = error.code;
        const message = error.message || '';
        
        if (code === 'auth/cancelled-popup-request') {
          friendlyMessage = 'A sign-in window was closed or overridden by a new sign-in attempt. Please click below to try again.';
        } else if (code === 'auth/popup-blocked') {
          friendlyMessage = 'The Google sign-in window was blocked by your browser. Please allow popups for this site, or try opening application in a new tab.';
        } else if (code === 'auth/popup-closed-by-user') {
          friendlyMessage = 'The sign-in window was closed before completing the process. Please try again.';
        } else if (message.includes('INTERNAL ASSERTION FAILED') || message.includes('Pending promise')) {
          friendlyMessage = 'An internal credential synchronisation error occurred. Since this app is running in an iframe preview, please open the application in a new tab (click the "Open in new tab" icon at the upper-right corner of the preview) to authenticate successfully.';
        } else if (message.includes('popup')) {
          friendlyMessage = 'The sign-in window could not complete. If you are viewing this app in an iframe/preview, please try opening the app in a new tab.';
        } else if (error.toString().includes('cancelled-popup-request')) {
          friendlyMessage = 'The sign-in attempt was interrupted or cancelled. Page reload may be helpful, or open the app in a new tab.';
        }
      }
      setAuthError(friendlyMessage);
    } finally {
      setSigningIn(false);
    }
  };

  const logOut = async () => {
    setAuthError(null);
    await signOut(auth);
  };

  const updateProfile = async (data: Partial<UserProfile>) => {
    if (!user) return;
    const updatedProfile = { ...profile, ...data } as UserProfile;
    await setDoc(doc(db, 'users', user.uid), removeUndefinedProperties({
      ...updatedProfile,
      updatedAt: serverTimestamp(),
    }), { merge: true });
    setProfile(updatedProfile);
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, signingIn, authError, signIn, logOut, updateProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
