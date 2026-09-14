import { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType, removeUndefinedProperties } from '../lib/firebase';
import { doc, onSnapshot, setDoc, updateDoc, arrayUnion } from 'firebase/firestore';
import { EQUIPMENT_CATEGORIES, WORK_TYPES, DEFAULT_QUICK_PARTS, DEFAULT_SUPERVISORS, QuickPart } from '../constants';

export interface ApprovingSupervisor {
  id: string;
  name: string;
  riwNumber: string;
  email?: string;
  title?: string;
}

export interface ConfigData {
  categories: { id: string; name: string; subCategories: string[] }[];
  workTypes: string[];
  clients: string[];
  employers: string[];
  infrastructureOwners: string[];
  roles: string[];
  locations: string[];
  projects: string[];
  quickParts?: QuickPart[];
  approvingSupervisors?: ApprovingSupervisor[];
  numberingSystem?: {
    prefix: string;
    nextNumber: number;
    enabled: boolean;
  };
  quarterFormat?: 'Q1-Q4' | 'Months';
}

export function useConfig() {
  const [config, setConfig] = useState<ConfigData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, 'config', 'main'), 
      (snap) => {
        try {
          if (snap.exists()) {
            const data = snap.data();
            setConfig({
              categories: data.categories || EQUIPMENT_CATEGORIES,
              workTypes: data.workTypes || WORK_TYPES,
              clients: data.clients || [],
              employers: data.employers || [],
              infrastructureOwners: data.infrastructureOwners || [],
              roles: data.roles || [],
              locations: data.locations || [],
              projects: data.projects || [],
              quickParts: data.quickParts || DEFAULT_QUICK_PARTS,
              approvingSupervisors: (data.approvingSupervisors && data.approvingSupervisors.length > 0) ? data.approvingSupervisors : DEFAULT_SUPERVISORS,
              numberingSystem: data.numberingSystem || {
                prefix: 'LOG-',
                nextNumber: 1,
                enabled: true
              },
              quarterFormat: data.quarterFormat || 'Q1-Q4'
            });
          } else {
            // Initialize with constants if empty
            const initialConfig: ConfigData = {
              categories: EQUIPMENT_CATEGORIES,
              workTypes: WORK_TYPES,
              clients: ['Network Rail', 'UGL', 'Rhomberg'],
              employers: [],
              infrastructureOwners: [],
              roles: [],
              locations: [],
              projects: [],
              quickParts: DEFAULT_QUICK_PARTS,
              approvingSupervisors: DEFAULT_SUPERVISORS,
              numberingSystem: {
                prefix: 'LOG-',
                nextNumber: 1,
                enabled: true
              },
              quarterFormat: 'Q1-Q4'
            };
            setDoc(doc(db, 'config', 'main'), removeUndefinedProperties(initialConfig)).catch(e => console.error('Failed to init config:', e));
            setConfig(initialConfig);
          }
          setLoading(false);
          setError(null);
        } catch (e) {
          console.error('Error processing config snap:', e);
          setError('Failed to process database response');
          setLoading(false);
        }
      },
      (err) => {
        console.error('Firestore Snapshot Error:', err);
        setError(`Database connection failed: ${err.message}`);
        setLoading(false);
        // If we have an error but no config, maybe use constants as fallback
        if (!config) {
            setConfig({
              categories: EQUIPMENT_CATEGORIES,
              workTypes: WORK_TYPES,
              clients: [],
              employers: [],
              infrastructureOwners: [],
              roles: [],
              locations: [],
              projects: [],
              quickParts: DEFAULT_QUICK_PARTS,
              numberingSystem: { prefix: 'LOG-', nextNumber: 1, enabled: true },
              quarterFormat: 'Q1-Q4'
            });
        }
      }
    );

    return unsub;
  }, []);

  const addToConfig = async (listKey: keyof ConfigData, value: string) => {
    if (!config || !value) return;
    const list = config[listKey] as string[];
    if (Array.isArray(list) && !list.includes(value)) {
      try {
        await updateDoc(doc(db, 'config', 'main'), {
          [listKey]: arrayUnion(value)
        });
      } catch (e) {
        console.error('Failed to add to config:', e);
      }
    }
  };

  const updateFullConfig = async (newConfig: ConfigData) => {
    const sanitized = removeUndefinedProperties(newConfig);
    await setDoc(doc(db, 'config', 'main'), sanitized);
  };

  return { config, loading, error, addToConfig, updateFullConfig };
}
