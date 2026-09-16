import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  User,
  onAuthStateChanged,
  signInWithPopup,
  signInWithCredential,
  GoogleAuthProvider,
  signOut,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  sendEmailVerification,
  updateProfile as updateFirebaseAuthProfile,
} from 'firebase/auth';
import { Capacitor } from '@capacitor/core';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
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
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string, displayName: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  clearAuthError: () => void;
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
      if (Capacitor.isNativePlatform()) {
        // Native (iOS/Android): use the OS-native Google account chooser via
        // @capacitor-firebase/authentication, then mirror the resulting
        // credential into the Firebase JS SDK so the rest of the app (which
        // uses the JS SDK's onAuthStateChanged/Firestore) behaves identically
        // to Web. See docs: setup requires google-services.json (Android) /
        // GoogleService-Info.plist + URL scheme (iOS) to be configured first.
        const result = await FirebaseAuthentication.signInWithGoogle();
        const idToken = result.credential?.idToken;
        if (!idToken) {
          throw new Error('No ID token was returned by native Google Sign-In.');
        }
        const credential = GoogleAuthProvider.credential(idToken);
        await signInWithCredential(auth, credential);
      } else {
        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({
          prompt: 'select_account'
        });
        await signInWithPopup(auth, provider);
      }
    } catch (error: any) {
      console.error('Firebase Auth Sign-In Error:', error);
      let friendlyMessage = 'Authentication failed. Please try again.';

      if (error && typeof error === 'object') {
        const code = error.code;
        const message = error.message || '';
        const messageLower = message.toLowerCase();

        if (Capacitor.isNativePlatform()) {
          if (messageLower.includes('cancel')) {
            friendlyMessage = 'Sign-in was cancelled before completing. Please try again.';
          } else if (messageLower.includes('no id token')) {
            friendlyMessage = 'Google Sign-In did not return the expected credentials. Please try again, or contact support if this persists.';
          } else if (messageLower.includes('network')) {
            friendlyMessage = 'A network error occurred during sign-in. Please check your connection and try again.';
          } else {
            friendlyMessage = `Native Google Sign-In failed: ${message || 'Unknown error.'}`;
          }
        } else if (code === 'auth/cancelled-popup-request') {
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

  // Maps Firebase email/password auth error codes to user-facing messages.
  // Shared by signInWithEmail, signUpWithEmail, and resetPassword below.
  const getEmailAuthErrorMessage = (error: any): string => {
    const code = error?.code;
    switch (code) {
      case 'auth/invalid-email':
        return 'Please enter a valid email address.';
      case 'auth/missing-email':
        return "Please enter your email address first, then click 'Forgot password?' again.";
      case 'auth/missing-password':
        return 'Please enter a password.';
      case 'auth/email-already-in-use':
        return 'An account already exists with that email. Try signing in instead.';
      case 'auth/weak-password':
        return 'Password is too weak. Please use at least 6 characters.';
      case 'auth/user-not-found':
      case 'auth/wrong-password':
      case 'auth/invalid-credential':
        return 'Incorrect email or password. Please try again.';
      case 'auth/too-many-requests':
        return 'Too many attempts. Please wait a moment and try again.';
      case 'auth/operation-not-allowed':
        return 'Email/password sign-in is not yet enabled for this app. Please contact your administrator.';
      default:
        return error?.message || 'Authentication failed. Please try again.';
    }
  };

  const signInWithEmail = async (email: string, password: string) => {
    if (signingIn) return;
    setSigningIn(true);
    setAuthError(null);
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error: any) {
      console.error('Email Sign-In Error:', error);
      setAuthError(getEmailAuthErrorMessage(error));
    } finally {
      setSigningIn(false);
    }
  };

  const signUpWithEmail = async (email: string, password: string, displayName: string) => {
    if (signingIn) return;
    setSigningIn(true);
    setAuthError(null);
    try {
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      if (displayName) {
        // Best-effort: sets the Auth profile's display name so the
        // Firestore profile-creation logic above (onAuthStateChanged) picks
        // it up. If it's ever blank due to a race, the user can still set
        // it in their profile settings afterwards.
        try {
          await updateFirebaseAuthProfile(credential.user, { displayName });
        } catch (nameError) {
          console.warn('Failed to set display name on sign-up:', nameError);
        }
      }
      // Fire-and-forget: don't block account creation on the verification email.
      sendEmailVerification(credential.user).catch((verifyError) => {
        console.warn('Failed to send verification email:', verifyError);
      });
    } catch (error: any) {
      console.error('Email Sign-Up Error:', error);
      setAuthError(getEmailAuthErrorMessage(error));
    } finally {
      setSigningIn(false);
    }
  };

  const resetPassword = async (email: string) => {
    setAuthError(null);
    try {
      await sendPasswordResetEmail(auth, email);
    } catch (error: any) {
      console.error('Password Reset Error:', error);
      setAuthError(getEmailAuthErrorMessage(error));
      throw error;
    }
  };

  const clearAuthError = () => setAuthError(null);

  const logOut = async () => {
    setAuthError(null);
    if (Capacitor.isNativePlatform()) {
      // Sign out of the native layer too, otherwise the native Google/Firebase
      // session can silently persist and auto-resume on next native sign-in.
      try {
        await FirebaseAuthentication.signOut();
      } catch (error) {
        console.error('Native Firebase Auth Sign-Out Error:', error);
      }
    }
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
    <AuthContext.Provider value={{ user, profile, loading, signingIn, authError, signIn, signInWithEmail, signUpWithEmail, resetPassword, clearAuthError, logOut, updateProfile }}>
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
