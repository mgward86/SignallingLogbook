import React, { useState, useEffect, useMemo } from 'react';
import { useConfig, ConfigData, ApprovingSupervisor } from '../hooks/useConfig';
import { useAuth } from '../lib/AuthContext';
import { removeUndefinedProperties } from '../lib/firebase';
import { Save, Plus, Trash2, Loader2, Database, Wrench, MapPin, Briefcase, BriefcaseBusiness, ChevronRight, Settings2, ShieldCheck, Info, ChevronDown, ChevronUp, GripVertical, RotateCcw, ShieldAlert, Sparkles, FileText, Edit3, Copy, Search, Check, Tag, UserCheck, BadgeCheck, UserPlus, CreditCard, User, Mail } from 'lucide-react';
import { EQUIPMENT_CATEGORIES, WORK_TYPES, DEFAULT_QUICK_PARTS, QuickPart } from '../constants';
import { motion, AnimatePresence, Reorder, useDragControls } from 'motion/react';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';

// Help helper for ID generation
const generateId = () => Math.random().toString(36).substring(2, 9);

interface ListItem {
  id: string;
  value: string;
}

interface LocalConfigData extends Omit<ConfigData, 'locations' | 'employers' | 'clients' | 'infrastructureOwners' | 'projects' | 'roles' | 'workTypes'> {
  locations: ListItem[];
  employers: ListItem[];
  clients: ListItem[];
  infrastructureOwners: ListItem[];
  projects: ListItem[];
  roles: ListItem[];
  workTypes: ListItem[];
  quickParts: QuickPart[];
  approvingSupervisors: ApprovingSupervisor[];
}

export function ConfigManager() {
  const { user } = useAuth();
  const { config: remoteConfig, loading, error: configError, updateFullConfig } = useConfig();
  const [localConfig, setLocalConfig] = useState<LocalConfigData | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'logistics' | 'technical' | 'quickParts'>('logistics');

  // Initialize local config from remote config
  useEffect(() => {
    if (remoteConfig && !localConfig) {
      const transformToLocal = (data: any): LocalConfigData => {
        return {
          ...data,
          locations: (data.locations || []).map((v: any) => ({ id: generateId(), value: String(v || '') })),
          employers: (data.employers || []).map((v: any) => ({ id: generateId(), value: String(v || '') })),
          clients: (data.clients || []).map((v: any) => ({ id: generateId(), value: String(v || '') })),
          infrastructureOwners: (data.infrastructureOwners || []).map((v: any) => ({ id: generateId(), value: String(v || '') })),
          projects: (data.projects || []).map((v: any) => ({ id: generateId(), value: String(v || '') })),
          roles: (data.roles || []).map((v: any) => ({ id: generateId(), value: String(v || '') })),
          workTypes: (data.workTypes || []).map((v: any) => ({ id: generateId(), value: String(v || '') })),
          quickParts: Array.isArray(data.quickParts) && data.quickParts.length > 0 ? data.quickParts : DEFAULT_QUICK_PARTS,
          approvingSupervisors: Array.isArray(data.approvingSupervisors) ? data.approvingSupervisors : [],
          categories: (data.categories || []).map((cat: any) => ({
            ...cat,
            id: cat.id || `cat_${generateId()}`,
            name: cat.name || '',
            subCategories: Array.isArray(cat.subCategories) ? cat.subCategories : []
          }))
        };
      };
      setLocalConfig(transformToLocal(remoteConfig));
    }
  }, [remoteConfig, localConfig]);

  const hasChanges = useMemo(() => {
    if (!remoteConfig || !localConfig) return false;
    try {
      const current = {
        ...localConfig,
        locations: (localConfig.locations || []).map(item => item.value),
        employers: (localConfig.employers || []).map(item => item.value),
        clients: (localConfig.clients || []).map(item => item.value),
        infrastructureOwners: (localConfig.infrastructureOwners || []).map(item => item.value),
        projects: (localConfig.projects || []).map(item => item.value),
        roles: (localConfig.roles || []).map(item => item.value),
        workTypes: (localConfig.workTypes || []).map(item => item.value),
        quickParts: localConfig.quickParts || [],
        approvingSupervisors: localConfig.approvingSupervisors || [],
      };
      return JSON.stringify(remoteConfig) !== JSON.stringify(current);
    } catch (e) {
      console.error('Error in hasChanges:', e);
      return false;
    }
  }, [remoteConfig, localConfig]);

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center space-y-4">
        <div className="p-3 bg-red-50 text-red-600 rounded-2xl border border-red-100">
          <ShieldAlert size={40} />
        </div>
        <h2 className="text-xl font-bold text-gray-900">Access Denied</h2>
        <p className="text-sm text-gray-500 max-w-sm leading-relaxed">
          Please sign in to manage the application's configuration database.
        </p>
      </div>
    );
  }

  if (loading || !localConfig) {
    return (
      <div className="flex justify-center py-24">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="animate-spin text-rail-blue w-10 h-10" />
          <p className="font-mono text-xs uppercase tracking-widest text-gray-400">Synchronising Database...</p>
        </div>
      </div>
    );
  }

  const handleUpdateList = (key: keyof LocalConfigData, index: number, value: string) => {
    setLocalConfig(prev => {
      if (!prev) return prev;
      const list = [...(prev[key] as ListItem[])];
      list[index] = { ...list[index], value };
      return { ...prev, [key]: list };
    });
  };

  const addItem = (key: keyof LocalConfigData) => {
    setLocalConfig(prev => {
      if (!prev) return prev;
      if (key !== 'categories') {
        const list = [...(prev[key] as ListItem[])];
        list.push({ id: generateId(), value: '' });
        return { ...prev, [key]: list };
      } else {
        const categories = [...prev.categories];
        categories.push({ id: `cat_${generateId()}`, name: '', subCategories: [] });
        return { ...prev, categories };
      }
    });
  };

  const removeItem = (key: keyof LocalConfigData, index: number) => {
    setLocalConfig(prev => {
      if (!prev) return prev;
      if (key === 'categories') {
        const categories = [...prev.categories];
        categories.splice(index, 1);
        return { ...prev, categories };
      } else {
        const list = [...(prev[key] as ListItem[])];
        list.splice(index, 1);
        return { ...prev, [key]: list };
      }
    });
  };

  const updateCategory = (index: number, updates: any) => {
    setLocalConfig(prev => {
      if (!prev) return prev;
      const categories = [...prev.categories];
      categories[index] = { ...categories[index], ...updates };
      return { ...prev, categories };
    });
  };

  const handleReorderList = (key: keyof LocalConfigData, newOrder: ListItem[]) => {
    setLocalConfig(prev => {
      if (!prev) return prev;
      return { ...prev, [key]: newOrder };
    });
  };

  const saveAll = async () => {
    if (!localConfig) return;
    setIsSaving(true);
    try {
      const transformToRemote = (data: LocalConfigData): ConfigData => {
        return removeUndefinedProperties({
          ...data,
          locations: data.locations.map(item => item.value),
          employers: data.employers.map(item => item.value),
          clients: data.clients.map(item => item.value),
          infrastructureOwners: data.infrastructureOwners.map(item => item.value),
          projects: data.projects.map(item => item.value),
          roles: data.roles.map(item => item.value),
          workTypes: data.workTypes.map(item => item.value),
          quickParts: data.quickParts || [],
          approvingSupervisors: data.approvingSupervisors || [],
        });
      };
      await updateFullConfig(transformToRemote(localConfig));
    } catch (error) {
      console.error('Failed to save config:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddSupervisor = (sup: ApprovingSupervisor) => {
    setLocalConfig(prev => {
      if (!prev) return prev;
      const list = [...(prev.approvingSupervisors || [])];
      list.push(sup);
      return { ...prev, approvingSupervisors: list };
    });
  };

  const handleUpdateSupervisor = (id: string, updated: Partial<ApprovingSupervisor>) => {
    setLocalConfig(prev => {
      if (!prev) return prev;
      const list = (prev.approvingSupervisors || []).map(s => s.id === id ? { ...s, ...updated } : s);
      return { ...prev, approvingSupervisors: list };
    });
  };

  const handleRemoveSupervisor = (id: string) => {
    setLocalConfig(prev => {
      if (!prev) return prev;
      const list = (prev.approvingSupervisors || []).filter(s => s.id !== id);
      return { ...prev, approvingSupervisors: list };
    });
  };

  const handleLoadSydneyStandards = () => {
    setLocalConfig(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        workTypes: WORK_TYPES.map(val => ({ id: generateId(), value: val })),
        categories: EQUIPMENT_CATEGORIES.map(cat => ({
          id: cat.id || `cat_${generateId()}`,
          name: cat.name,
          subCategories: [...cat.subCategories]
        }))
      };
    });
  };

  const handleUpdateQuickParts = (updatedQuickParts: QuickPart[]) => {
    setLocalConfig(prev => prev ? { ...prev, quickParts: updatedQuickParts } : prev);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-700">
      {/* Header Space */}
      <div className="flex flex-col md:flex-row justify-between items-center bg-white p-8 rounded-3xl shadow-sm border border-gray-100 gap-6">
        <div className="flex items-center gap-5">
          <div className="w-14 h-14 bg-rail-blue rounded-2xl flex items-center justify-center text-white shadow-lg shadow-rail-blue/20">
            <Database size={28} />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Database Management</h2>
            <div className="flex items-center gap-2 mt-1">
              <span className={`flex h-2 w-2 rounded-full ${configError ? 'bg-red-500' : 'bg-green-500 animate-pulse'}`}></span>
              <p className="text-xs text-gray-500 font-medium whitespace-nowrap overflow-hidden text-ellipsis max-w-[200px]">
                {configError ? `Connection Issue: ${configError}` : 'Production Database Connected'}
              </p>
            </div>
          </div>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
          {hasChanges && (
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-3 text-gray-500 hover:text-rail-blue font-bold transition-colors cursor-pointer"
            >
              Discard Changes
            </button>
          )}
          <button
            onClick={saveAll}
            disabled={isSaving || !hasChanges}
            className="px-8 py-3 bg-rail-blue text-white rounded-xl font-bold flex items-center justify-center gap-3 hover:bg-opacity-90 active:scale-95 transition-all shadow-xl shadow-rail-blue/10 disabled:opacity-50 cursor-pointer"
          >
            {isSaving ? <Loader2 size={18} className="animate-spin" /> : <ShieldCheck size={18} />}
            {isSaving ? 'Saving Changes...' : 'Save All Changes'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex bg-gray-100 p-1.5 rounded-2xl w-full max-w-md mx-auto gap-1">
        <TabButton 
          active={activeTab === 'logistics'} 
          onClick={() => setActiveTab('logistics')} 
          icon={<Settings2 size={16} />}
          label="Logistics"
        />
        <TabButton 
          active={activeTab === 'technical'} 
          onClick={() => setActiveTab('technical')} 
          icon={<Wrench size={16} />}
          label="Technical"
        />
        <TabButton 
          active={activeTab === 'quickParts'} 
          onClick={() => setActiveTab('quickParts')} 
          icon={<Sparkles size={16} />}
          label="Quick Parts"
        />
      </div>

      {/* Content Area */}
      <AnimatePresence mode="wait">
        {activeTab === 'logistics' ? (
          <motion.div 
            key="logistics"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
          >
            <ListEditor 
              title="Locations" 
              icon={<MapPin size={16} />} 
              items={localConfig.locations} 
              onAdd={() => addItem('locations')}
              onRemove={(i: number) => removeItem('locations', i)}
              onChange={(i: number, v: string) => handleUpdateList('locations', i, v)}
              onReorder={(newOrder: ListItem[]) => handleReorderList('locations', newOrder)}
              placeholder="e.g. Km 123.456"
            />
            <ListEditor 
              title="Employers" 
              icon={<BriefcaseBusiness size={16} />} 
              items={localConfig.employers} 
              onAdd={() => addItem('employers')}
              onRemove={(i: number) => removeItem('employers', i)}
              onChange={(i: number, v: string) => handleUpdateList('employers', i, v)}
              onReorder={(newOrder: ListItem[]) => handleReorderList('employers', newOrder)}
              placeholder="e.g. Rhomberg Sersa"
            />
            <ListEditor 
              title="Clients" 
              icon={<Briefcase size={16} />} 
              items={localConfig.clients} 
              onAdd={() => addItem('clients')}
              onRemove={(i: number) => removeItem('clients', i)}
              onChange={(i: number, v: string) => handleUpdateList('clients', i, v)}
              onReorder={(newOrder: ListItem[]) => handleReorderList('clients', newOrder)}
              placeholder="e.g. UGL"
            />
            <ListEditor 
              title="Infrastructure Owners" 
              icon={<Database size={16} />} 
              items={localConfig.infrastructureOwners} 
              onAdd={() => addItem('infrastructureOwners')}
              onRemove={(i: number) => removeItem('infrastructureOwners', i)}
              onChange={(i: number, v: string) => handleUpdateList('infrastructureOwners', i, v)}
              onReorder={(newOrder: ListItem[]) => handleReorderList('infrastructureOwners', newOrder)}
              placeholder="e.g. Rail Owner"
            />
             <ListEditor 
              title="Projects" 
              icon={<Briefcase size={16} />} 
              items={localConfig.projects} 
              onAdd={() => addItem('projects')}
              onRemove={(i: number) => removeItem('projects', i)}
              onChange={(i: number, v: string) => handleUpdateList('projects', i, v)}
              onReorder={(newOrder: ListItem[]) => handleReorderList('projects', newOrder)}
              placeholder="e.g. South Upgrade"
            />
            <ListEditor 
              title="Roles" 
              icon={<ShieldCheck size={16} />} 
              items={localConfig.roles} 
              onAdd={() => addItem('roles')}
              onRemove={(i: number) => removeItem('roles', i)}
              onChange={(i: number, v: string) => handleUpdateList('roles', i, v)}
              onReorder={(newOrder: ListItem[]) => handleReorderList('roles', newOrder)}
              placeholder="e.g. Signal Certifier"
            />
            <SupervisorListEditor
              supervisors={localConfig.approvingSupervisors || []}
              onAdd={handleAddSupervisor}
              onUpdate={handleUpdateSupervisor}
              onRemove={handleRemoveSupervisor}
            />
          </motion.div>
        ) : activeTab === 'technical' ? (
          <motion.div 
            key="technical"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-6"
          >
            <div className="bg-gradient-to-r from-blue-50/60 to-indigo-50/60 border border-blue-100/70 rounded-3xl p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm shadow-blue-100/10">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-rail-blue">
                  <ShieldCheck size={18} className="text-rail-blue animate-pulse" />
                  <h4 className="font-bold text-sm tracking-tight text-gray-900">Sydney Trains (TfNSW) Standard Assets</h4>
                </div>
                <p className="text-xs text-gray-600 max-w-2xl leading-relaxed">
                  Reset your work types and equipment categories to Sydney Trains railway signalling standards. This implements TfNSW-compliant classifications (e.g. TI21 track circuits, EP machines, and CTC/interlocking systems).
                </p>
              </div>
              <button
                onClick={handleLoadSydneyStandards}
                className="shrink-0 px-5 py-2.5 bg-white hover:bg-rail-blue hover:text-white text-rail-blue border border-rail-blue/20 hover:border-transparent rounded-xl font-bold text-xs flex items-center gap-2 shadow-sm shadow-gray-100 transition-all duration-300 cursor-pointer"
              >
                <RotateCcw size={14} />
                Load Sydney Standards
              </button>
            </div>

            <div className="space-y-6 w-full">
              {/* Work Types - Expandable full-width section at top */}
              <ExpandableListEditor 
                title="Work Types" 
                icon={<Wrench size={18} />} 
                items={localConfig.workTypes} 
                onAdd={() => addItem('workTypes')}
                onRemove={(i: number) => removeItem('workTypes', i)}
                onChange={(i: number, v: string) => handleUpdateList('workTypes', i, v)}
                onReorder={(newOrder: ListItem[]) => handleReorderList('workTypes', newOrder)}
                placeholder="e.g. Corrective"
                defaultExpanded={false}
              />

              {/* Equipment Categories - Full width, non-expandable main section */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4 w-full">
                <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                  <div className="flex items-center gap-2 text-rail-blue">
                    <Database size={18} />
                    <h3 className="font-bold text-xs uppercase tracking-[0.2em] text-gray-900">Equipment Categories</h3>
                    <span className="text-[10px] font-mono text-gray-500 bg-gray-100 px-2.5 py-0.5 rounded-full font-bold">
                      {(localConfig.categories || []).length} Categories
                    </span>
                  </div>
                  <button 
                    type="button"
                    onClick={() => addItem('categories')}
                    className="p-1.5 bg-rail-blue/10 text-rail-blue hover:bg-rail-blue hover:text-white rounded-xl transition cursor-pointer flex items-center gap-1.5 text-xs font-bold px-3 py-1.5"
                  >
                    <Plus size={16} />
                    <span>Add Category</span>
                  </button>
                </div>
                
                <div className="space-y-4 pt-1">
                  {(localConfig.categories || []).map((cat, idx) => (
                    <CategoryCard 
                      key={cat.id || idx}
                      category={cat}
                      onUpdate={(updates: any) => updateCategory(idx, updates)}
                      onRemove={() => removeItem('categories', idx)}
                    />
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="quickParts"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <QuickPartsManager
              quickParts={localConfig.quickParts || []}
              workTypes={localConfig.workTypes.map(w => w.value)}
              onUpdateQuickParts={handleUpdateQuickParts}
            />
          </motion.div>
        )}
      </AnimatePresence>
      
      <div className="p-5 bg-blue-50 border border-blue-100 rounded-2xl flex items-start gap-4">
        <div className="p-2 bg-blue-500 text-white rounded-lg">
          <Info size={16} />
        </div>
        <p className="text-xs text-blue-700 leading-relaxed font-medium">
          Dropdown suggestions are automatically updated when you save new log entries. Use this management interface to consolidate duplicates, fix typos, or define technical equipment standards for the entire team.
        </p>
      </div>
    </div>
  );
}

function TabButton({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${
        active 
        ? 'bg-white text-rail-blue shadow-sm' 
        : 'text-gray-500 hover:text-gray-700'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function ExpandableListEditor({ title, icon, items, onAdd, onRemove, onChange, onReorder, placeholder, defaultExpanded = false }: any) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [confirmDeleteIdx, setConfirmDeleteIdx] = useState<number | null>(null);

  const handleAdd = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsExpanded(true);
    onAdd();
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden w-full min-w-0 transition-all">
      <div 
        onClick={() => setIsExpanded(!isExpanded)}
        className="p-4 bg-gray-50/50 hover:bg-gray-100/60 transition flex justify-between items-center gap-3 cursor-pointer select-none"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-1 text-gray-500 hover:text-rail-blue transition shrink-0">
            {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
          </div>
          <div className="flex items-center gap-2 text-rail-blue shrink-0">
            {icon}
          </div>
          <h3 className="font-bold text-xs uppercase tracking-[0.2em] text-gray-900 truncate">{title}</h3>
          <span className="text-[10px] font-mono text-gray-500 bg-gray-100 px-2.5 py-0.5 rounded-full font-bold shrink-0">
            {(items || []).length} {title}
          </span>
        </div>

        <button 
          type="button"
          onClick={handleAdd}
          className="p-1.5 bg-rail-blue/10 text-rail-blue hover:bg-rail-blue hover:text-white rounded-xl transition shrink-0 cursor-pointer flex items-center gap-1.5 text-xs font-bold px-3 py-1.5"
        >
          <Plus size={16} />
          <span>Add Item</span>
        </button>
      </div>
      
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-gray-100"
          >
            <Reorder.Group 
              axis="y" 
              values={items || []} 
              onReorder={onReorder} 
              className="p-4 space-y-3 max-h-[500px] overflow-y-auto overflow-x-hidden custom-scrollbar w-full min-w-0"
            >
              {(items || []).map((item: ListItem, index: number) => (
                <ReorderItem 
                  key={item.id}
                  item={item}
                  index={index}
                  onChange={onChange}
                  onRemove={onRemove}
                  confirmDeleteIdx={confirmDeleteIdx}
                  setConfirmDeleteIdx={setConfirmDeleteIdx}
                  placeholder={placeholder}
                />
              ))}
              {(!items || items.length === 0) && (
                <div className="py-8 flex flex-col items-center justify-center text-gray-400 gap-2 italic">
                  <Plus size={24} className="opacity-20" />
                  <p className="text-xs">Add your first item</p>
                </div>
              )}
            </Reorder.Group>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ListEditor({ title, icon, items, onAdd, onRemove, onChange, onReorder, placeholder }: any) {
  const [confirmDeleteIdx, setConfirmDeleteIdx] = useState<number | null>(null);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex flex-col h-[500px] w-full min-w-0">
      <div className="p-4 bg-gray-50/50 border-b border-gray-100 flex justify-between items-center gap-2">
        <div className="flex items-center gap-2 text-rail-blue min-w-0">
          {icon}
          <h3 className="font-bold text-[10px] uppercase tracking-[0.2em] truncate">{title}</h3>
        </div>
        <button onClick={onAdd} className="p-1.5 bg-rail-blue/10 text-rail-blue rounded-lg hover:bg-rail-blue hover:text-white transition shrink-0 cursor-pointer">
          <Plus size={16} />
        </button>
      </div>
      
      <Reorder.Group 
        axis="y" 
        values={items || []} 
        onReorder={onReorder} 
        className="flex-1 overflow-y-auto overflow-x-hidden p-4 space-y-3 custom-scrollbar w-full min-w-0"
      >
        {(items || []).map((item: ListItem, index: number) => (
          <ReorderItem 
            key={item.id}
            item={item}
            index={index}
            onChange={onChange}
            onRemove={onRemove}
            confirmDeleteIdx={confirmDeleteIdx}
            setConfirmDeleteIdx={setConfirmDeleteIdx}
            placeholder={placeholder}
          />
        ))}
        {items.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-gray-400 gap-2 italic">
            <Plus size={24} className="opacity-20" />
            <p className="text-xs">Add your first item</p>
          </div>
        )}
      </Reorder.Group>
    </div>
  );
}

function ReorderItem({ item, index, onChange, onRemove, confirmDeleteIdx, setConfirmDeleteIdx, placeholder }: any) {
  const dragControls = useDragControls();

  return (
    <Reorder.Item
      value={item}
      dragListener={false}
      dragControls={dragControls}
      className="flex gap-2 group items-center bg-white select-none w-full min-w-0 overflow-hidden"
    >
      <div 
        className="p-1.5 text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing transition shrink-0"
        onPointerDown={(e) => {
          e.preventDefault();
          dragControls.start(e);
        }}
        style={{ touchAction: 'none' }}
      >
        <GripVertical size={16} />
      </div>
      
      <input
        type="text"
        value={item.value}
        onChange={(e) => onChange(index, e.target.value)}
        placeholder={placeholder}
        className="flex-1 min-w-0 bg-gray-50/80 border border-transparent group-hover:border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:bg-white focus:border-rail-blue focus:ring-4 focus:ring-rail-blue/5 transition select-text"
      />
      
      {confirmDeleteIdx === index ? (
        <div className="flex items-center gap-1 shrink-0 animate-in slide-in-from-right-2">
          <button 
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onRemove(index);
              setConfirmDeleteIdx(null);
            }}
            className="text-[10px] font-bold uppercase bg-red-500 hover:bg-red-600 text-white px-2.5 py-1.5 rounded-lg transition shadow-2xs cursor-pointer shrink-0"
          >
            Delete
          </button>
          <button 
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setConfirmDeleteIdx(null);
            }}
            className="text-[10px] font-bold uppercase bg-gray-200 hover:bg-gray-300 text-gray-700 px-2 py-1.5 rounded-lg transition cursor-pointer shrink-0"
          >
            No
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setConfirmDeleteIdx(index);
          }}
          className="p-2 text-red-300 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all shrink-0 cursor-pointer"
          title="Delete item"
        >
          <Trash2 size={16} />
        </button>
      )}
    </Reorder.Item>
  );
}

function CategoryCard({ category, onUpdate, onRemove }: any) {
  const [newSub, setNewSub] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  const [confirmDeleteCat, setConfirmDeleteCat] = useState<boolean>(false);
  const [editingSubIdx, setEditingSubIdx] = useState<number | null>(null);
  const [editingSubVal, setEditingSubVal] = useState<string>('');

  const addSub = () => {
    if (!newSub.trim()) return;
    const subCategories = Array.isArray(category.subCategories) ? category.subCategories : [];
    onUpdate({ subCategories: [...subCategories, newSub.trim()] });
    setNewSub('');
    setIsExpanded(true);
  };

  const removeSub = (idx: number) => {
    const subCategories = Array.isArray(category.subCategories) ? category.subCategories : [];
    const next = [...subCategories];
    next.splice(idx, 1);
    onUpdate({ subCategories: next });
    if (editingSubIdx === idx) {
      setEditingSubIdx(null);
    }
  };

  const startEditSub = (idx: number, currentVal: string) => {
    setEditingSubIdx(idx);
    setEditingSubVal(currentVal);
  };

  const saveEditSub = (idx: number) => {
    if (editingSubIdx === null) return;
    const trimmed = editingSubVal.trim();
    const subCategories = Array.isArray(category.subCategories) ? category.subCategories : [];
    const next = [...subCategories];
    if (trimmed) {
      next[idx] = trimmed;
    } else {
      next.splice(idx, 1);
    }
    onUpdate({ subCategories: next });
    setEditingSubIdx(null);
    setEditingSubVal('');
  };

  return (
    <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden group hover:border-rail-blue/30 transition-all w-full min-w-0">
      <div className="p-4 bg-gray-50/50 border-b border-gray-100 flex items-center gap-2 sm:gap-3 min-w-0">
        <button 
          onClick={() => setIsExpanded(!isExpanded)}
          className="p-1 text-gray-400 hover:text-rail-blue transition shrink-0 cursor-pointer"
        >
          {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </button>
        <div className="flex-1 min-w-0">
          <input 
            type="text" 
            value={category.name || ''}
            onChange={(e) => onUpdate({ name: e.target.value })}
            className="w-full bg-transparent font-bold text-gray-900 outline-none focus:text-rail-blue transition min-w-0 truncate"
            placeholder="Category Name"
          />
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {confirmDeleteCat ? (
            <div className="flex items-center gap-1 shrink-0 animate-in slide-in-from-right-2">
              <button 
                type="button"
                onClick={() => {
                  onRemove();
                  setConfirmDeleteCat(false);
                }}
                className="text-[10px] font-bold uppercase bg-red-500 hover:bg-red-600 text-white px-2 py-1 rounded-lg transition cursor-pointer shrink-0"
              >
                Delete
              </button>
              <button 
                type="button"
                onClick={() => setConfirmDeleteCat(false)}
                className="text-[10px] font-bold uppercase bg-gray-200 hover:bg-gray-300 text-gray-700 px-2 py-1 rounded-lg transition cursor-pointer shrink-0"
              >
                No
              </button>
            </div>
          ) : (
            <>
              <span className="text-[10px] font-mono text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full shrink-0">
                {(category.subCategories || []).length}
              </span>
              <button 
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setConfirmDeleteCat(true);
                }} 
                className="p-1.5 text-red-300 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all shrink-0 cursor-pointer"
                title="Delete category"
              >
                <Trash2 size={14} />
              </button>
            </>
          )}
        </div>
      </div>
      
      <AnimatePresence>
        {isExpanded && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="p-5 space-y-4 border-t border-gray-50">
              <div className="flex flex-wrap gap-2">
                {(!category.subCategories || category.subCategories.length === 0) && (
                  <span className="text-[10px] text-gray-400 italic">No sub-categories defined</span>
                )}
                {(category.subCategories || []).map((sub: string, i: number) => {
                  const isEditing = editingSubIdx === i;

                  if (isEditing) {
                    return (
                      <div 
                        key={i} 
                        className="flex items-center gap-1.5 bg-white text-rail-blue px-2.5 py-1 rounded-lg border-2 border-rail-blue shadow-sm max-w-full"
                      >
                        <input
                          type="text"
                          value={editingSubVal}
                          onChange={(e) => setEditingSubVal(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              saveEditSub(i);
                            } else if (e.key === 'Escape') {
                              setEditingSubIdx(null);
                            }
                          }}
                          onBlur={() => saveEditSub(i)}
                          autoFocus
                          className="text-[10px] font-bold uppercase tracking-wider bg-transparent outline-none text-gray-900 min-w-[140px] max-w-full"
                        />
                        <button
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            saveEditSub(i);
                          }}
                          className="text-emerald-600 hover:text-emerald-700 p-0.5 cursor-pointer shrink-0"
                          title="Save sub-category"
                        >
                          <Check size={12} />
                        </button>
                      </div>
                    );
                  }

                  return (
                    <div 
                      key={i} 
                      className="flex items-center gap-1.5 bg-gray-100 hover:bg-gray-200/80 hover:border-rail-blue/40 text-gray-700 px-3 py-1.5 rounded-lg border border-gray-200 max-w-full transition-all group/sub"
                    >
                      <span 
                        onClick={() => startEditSub(i, sub)}
                        className="text-[10px] font-bold uppercase tracking-wider cursor-pointer hover:text-rail-blue transition flex items-center gap-1 text-gray-800"
                        title="Click to edit sub-category"
                      >
                        <span>{sub}</span>
                        <Edit3 size={10} className="text-gray-400 opacity-60 group-hover/sub:opacity-100 group-hover/sub:text-rail-blue transition shrink-0 ml-0.5" />
                      </span>
                      <button 
                        type="button"
                        onClick={() => removeSub(i)}
                        className="hover:text-red-500 text-gray-400 transition shrink-0 cursor-pointer ml-1"
                        title="Remove sub-category"
                      >
                        <Plus size={10} className="rotate-45" />
                      </button>
                    </div>
                  );
                })}
              </div>
              
              <div className="flex gap-2 mt-2">
                <input 
                  type="text"
                  value={newSub}
                  onChange={(e) => setNewSub(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addSub())}
                  placeholder="Add sub-category..."
                  className="flex-1 min-w-0 bg-gray-50 border border-gray-100 rounded-xl px-4 py-2 text-xs outline-none focus:bg-white focus:border-rail-blue transition"
                />
                <button 
                  type="button" 
                  onClick={addSub}
                  className="p-2 bg-rail-blue text-white rounded-xl hover:bg-opacity-90 active:scale-95 transition shrink-0 cursor-pointer"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface QuickPartsManagerProps {
  quickParts: QuickPart[];
  workTypes: string[];
  onUpdateQuickParts: (updated: QuickPart[]) => void;
}

function QuickPartsManager({ quickParts, workTypes, onUpdateQuickParts }: QuickPartsManagerProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [editingPart, setEditingPart] = useState<QuickPart | null>(null);
  const [isCreating, setIsCreating] = useState<boolean>(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Form states
  const [formTitle, setFormTitle] = useState('');
  const [formShortLabel, setFormShortLabel] = useState('');
  const [formCategory, setFormCategory] = useState('');
  const [formSuggestedWorkType, setFormSuggestedWorkType] = useState('');
  const [formDescriptionHtml, setFormDescriptionHtml] = useState('');

  const categories = useMemo(() => {
    const set = new Set<string>();
    quickParts.forEach(qp => {
      if (qp.category) set.add(qp.category);
    });
    return Array.from(set);
  }, [quickParts]);

  const filteredQuickParts = useMemo(() => {
    return quickParts.filter(qp => {
      const matchesCat = selectedCategory === 'All' || qp.category === selectedCategory;
      const matchesQuery = !searchQuery.trim() || 
        qp.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        qp.shortLabel.toLowerCase().includes(searchQuery.toLowerCase()) ||
        qp.descriptionHtml.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCat && matchesQuery;
    });
  }, [quickParts, selectedCategory, searchQuery]);

  const openCreateModal = () => {
    setEditingPart(null);
    setFormTitle('');
    setFormShortLabel('');
    setFormCategory(categories[0] || 'Testing & Commissioning');
    setFormSuggestedWorkType(workTypes[0] || '');
    setFormDescriptionHtml('<p><strong>Scope:</strong> </p><ul><li>Task 1</li><li>Task 2</li></ul>');
    setIsCreating(true);
  };

  const openEditModal = (part: QuickPart) => {
    setEditingPart(part);
    setFormTitle(part.title || '');
    setFormShortLabel(part.shortLabel || '');
    setFormCategory(part.category || 'General');
    setFormSuggestedWorkType(part.suggestedWorkType || '');
    setFormDescriptionHtml(part.descriptionHtml || '');
    setIsCreating(true);
  };

  const handleSavePart = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim() || !formShortLabel.trim()) {
      alert('Please enter a Title and Short Label for this Quick Part.');
      return;
    }

    const newPart: QuickPart = {
      id: editingPart ? editingPart.id : `qp_${Date.now()}`,
      title: formTitle.trim(),
      shortLabel: formShortLabel.trim(),
      category: formCategory.trim() || 'General',
      suggestedWorkType: formSuggestedWorkType || undefined,
      descriptionHtml: formDescriptionHtml.trim()
    };

    if (editingPart) {
      const updated = quickParts.map(qp => qp.id === editingPart.id ? newPart : qp);
      onUpdateQuickParts(updated);
    } else {
      onUpdateQuickParts([...quickParts, newPart]);
    }

    setIsCreating(false);
    setEditingPart(null);
  };

  const handleDuplicatePart = (part: QuickPart) => {
    const dup: QuickPart = {
      ...part,
      id: `qp_${Date.now()}`,
      title: `${part.title} (Copy)`,
      shortLabel: `${part.shortLabel} (Copy)`
    };
    onUpdateQuickParts([...quickParts, dup]);
  };

  const handleDeletePart = (id: string) => {
    onUpdateQuickParts(quickParts.filter(qp => qp.id !== id));
    setDeleteConfirmId(null);
  };

  return (
    <div className="space-y-6">
      {/* Quick Parts Header Card */}
      <div className="bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border border-amber-500/20 rounded-3xl p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-amber-600 font-bold">
            <Sparkles size={20} className="animate-bounce" />
            <h3 className="text-lg font-bold text-gray-900">Database Quick Parts Library</h3>
          </div>
          <p className="text-xs text-gray-600 max-w-2xl leading-relaxed">
            Manage pre-formatted scope descriptions for 1-click access when creating log entries.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto shrink-0">
          <button
            onClick={openCreateModal}
            className="px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-bold text-xs flex items-center gap-2 shadow-md shadow-amber-500/20 transition cursor-pointer"
          >
            <Plus size={16} /> Create Quick Part
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl shadow-xs border border-gray-100 flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4">
        <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
          <button
            onClick={() => setSelectedCategory('All')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
              selectedCategory === 'All'
                ? 'bg-rail-blue text-white shadow-xs'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            All ({quickParts.length})
          </button>
          {categories.map(cat => {
            const count = quickParts.filter(qp => qp.category === cat).length;
            return (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                  selectedCategory === cat
                    ? 'bg-rail-blue text-white shadow-xs'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {cat} ({count})
              </button>
            );
          })}
        </div>

        <div className="relative min-w-[220px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search Quick Parts..."
            className="w-full pl-9 pr-3 py-1.5 bg-gray-50 border border-gray-200 rounded-xl text-xs outline-none focus:bg-white focus:border-rail-blue transition"
          />
        </div>
      </div>

      {/* Quick Part Items Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredQuickParts.map((part) => (
          <div
            key={part.id}
            className="bg-white border border-gray-200/80 hover:border-amber-400/60 rounded-2xl p-5 shadow-xs transition-all flex flex-col justify-between space-y-4 group"
          >
            <div className="space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-bold uppercase tracking-wider bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded-md">
                      {part.shortLabel}
                    </span>
                    <span className="text-[10px] font-semibold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-md flex items-center gap-1">
                      <Tag size={10} /> {part.category}
                    </span>
                  </div>
                  <h4 className="font-bold text-sm text-gray-900 group-hover:text-rail-blue transition">
                    {part.title}
                  </h4>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => openEditModal(part)}
                    className="p-1.5 text-gray-400 hover:text-rail-blue hover:bg-rail-blue/5 rounded-lg transition cursor-pointer"
                    title="Edit Quick Part"
                  >
                    <Edit3 size={15} />
                  </button>
                  <button
                    onClick={() => handleDuplicatePart(part)}
                    className="p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition cursor-pointer"
                    title="Duplicate Quick Part"
                  >
                    <Copy size={15} />
                  </button>
                  {deleteConfirmId === part.id ? (
                    <div className="flex items-center gap-1 bg-red-50 p-1 rounded-lg border border-red-200">
                      <button
                        onClick={() => handleDeletePart(part.id)}
                        className="text-[9px] font-bold text-white bg-red-600 px-2 py-0.5 rounded cursor-pointer"
                      >
                        Confirm
                      </button>
                      <button
                        onClick={() => setDeleteConfirmId(null)}
                        className="text-[9px] font-bold text-gray-600 bg-gray-200 px-1.5 py-0.5 rounded cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setDeleteConfirmId(part.id)}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition cursor-pointer"
                      title="Delete Quick Part"
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              </div>

              {part.suggestedWorkType && (
                <div className="text-[11px] text-gray-500 font-medium">
                  <span className="font-bold text-gray-600">Work Type:</span> {part.suggestedWorkType}
                </div>
              )}

              {/* Preview Box */}
              <div className="bg-gray-50/80 p-3 rounded-xl border border-gray-100 text-xs text-gray-700 max-h-36 overflow-y-auto custom-scrollbar leading-relaxed">
                <div
                  className="prose prose-xs max-w-none text-gray-700 font-sans"
                  dangerouslySetInnerHTML={{ __html: part.descriptionHtml }}
                />
              </div>
            </div>
          </div>
        ))}

        {filteredQuickParts.length === 0 && (
          <div className="col-span-full py-12 text-center bg-gray-50 rounded-2xl border border-dashed border-gray-200 space-y-2">
            <Sparkles size={28} className="mx-auto text-gray-300" />
            <p className="text-sm font-semibold text-gray-600">No Quick Parts found</p>
            <p className="text-xs text-gray-400">Try adjusting your search query or category filter.</p>
          </div>
        )}
      </div>

      {/* Create / Edit Modal */}
      <AnimatePresence>
        {isCreating && (
          <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl shadow-2xl border border-gray-100 w-full max-w-2xl overflow-hidden my-8"
            >
              <div className="p-6 bg-amber-500 text-white flex items-center justify-between">
                <div className="flex items-center gap-2 font-bold text-base">
                  <Sparkles size={20} />
                  <span>{editingPart ? 'Edit Quick Part' : 'Create New Quick Part'}</span>
                </div>
                <button
                  onClick={() => setIsCreating(false)}
                  className="text-white/80 hover:text-white text-sm font-bold bg-white/10 hover:bg-white/20 px-3 py-1 rounded-xl transition cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleSavePart} className="p-6 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                      Quick Part Title *
                    </label>
                    <input
                      type="text"
                      value={formTitle}
                      onChange={(e) => setFormTitle(e.target.value)}
                      placeholder="e.g. Points Machine 3.5mm Obstruction Check"
                      required
                      className="w-full px-3.5 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:bg-white focus:border-rail-blue transition"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                      Button Badge Label *
                    </label>
                    <input
                      type="text"
                      value={formShortLabel}
                      onChange={(e) => setFormShortLabel(e.target.value)}
                      placeholder="e.g. Points Check"
                      maxLength={24}
                      required
                      className="w-full px-3.5 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:bg-white focus:border-rail-blue transition"
                    />
                  </div>
                </div>



                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                    Pre-formatted Scope Description *
                  </label>
                  <div className="quill-container border border-gray-200 rounded-xl overflow-hidden bg-white">
                    <ReactQuill
                      theme="snow"
                      value={formDescriptionHtml}
                      onChange={setFormDescriptionHtml}
                      placeholder="Provide pre-formatted description or activity checklist..."
                      modules={{
                        toolbar: [
                          ['bold', 'italic', 'underline'],
                          [{ 'list': 'ordered' }, { 'list': 'bullet' }],
                          ['clean']
                        ],
                      }}
                    />
                  </div>
                  <p className="text-[10px] text-gray-400">
                    Use formatting tools above (bold, italic, lists) to format your Quick Part description directly without writing raw HTML.
                  </p>
                </div>

                {/* Form Footer */}
                <div className="pt-3 flex justify-end gap-3 border-t border-gray-100">
                  <button
                    type="button"
                    onClick={() => setIsCreating(false)}
                    className="px-5 py-2.5 text-gray-600 hover:text-gray-900 font-bold text-xs transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-6 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-bold text-xs flex items-center gap-2 shadow-md shadow-amber-500/20 transition cursor-pointer"
                  >
                    <Check size={16} /> Save Quick Part
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SupervisorListEditor({
  supervisors,
  onAdd,
  onUpdate,
  onRemove
}: {
  supervisors: ApprovingSupervisor[];
  onAdd: (sup: ApprovingSupervisor) => void;
  onUpdate: (id: string, sup: Partial<ApprovingSupervisor>) => void;
  onRemove: (id: string) => void;
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDeleteSupId, setConfirmDeleteSupId] = useState<string | null>(null);

  // Form states
  const [name, setName] = useState('');
  const [riwNumber, setRiwNumber] = useState('');
  const [title, setTitle] = useState('');
  const [email, setEmail] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const startAdd = () => {
    setName('');
    setRiwNumber('');
    setTitle('');
    setEmail('');
    setFormError(null);
    setEditingId(null);
    setIsAdding(true);
  };

  const startEdit = (sup: ApprovingSupervisor) => {
    setName(sup.name);
    setRiwNumber(sup.riwNumber);
    setTitle(sup.title || '');
    setEmail(sup.email || '');
    setFormError(null);
    setIsAdding(false);
    setEditingId(sup.id);
  };

  const resetForm = () => {
    setIsAdding(false);
    setEditingId(null);
    setName('');
    setRiwNumber('');
    setTitle('');
    setEmail('');
    setFormError(null);
  };

  const handleSaveForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setFormError('Supervisor name is required');
      return;
    }
    if (!riwNumber.trim()) {
      setFormError('RIW Number is required');
      return;
    }

    if (isAdding) {
      const newSup: ApprovingSupervisor = {
        id: `sup_${generateId()}`,
        name: name.trim(),
        riwNumber: riwNumber.trim(),
        title: title.trim() || undefined,
        email: email.trim() || undefined,
      };
      onAdd(newSup);
    } else if (editingId) {
      onUpdate(editingId, {
        name: name.trim(),
        riwNumber: riwNumber.trim(),
        title: title.trim() || undefined,
        email: email.trim() || undefined,
      });
    }

    resetForm();
  };

  const filtered = useMemo(() => {
    if (!searchTerm.trim()) return supervisors;
    const term = searchTerm.toLowerCase();
    return supervisors.filter(s => 
      s.name.toLowerCase().includes(term) || 
      s.riwNumber.toLowerCase().includes(term) ||
      (s.title && s.title.toLowerCase().includes(term))
    );
  }, [supervisors, searchTerm]);

  return (
    <div className="bg-white rounded-3xl p-6 border border-gray-200/80 shadow-sm space-y-6 md:col-span-2 lg:col-span-3">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-rail-blue/10 text-rail-blue rounded-2xl">
            <UserCheck size={22} />
          </div>
          <div>
            <h3 className="font-bold text-gray-900 tracking-tight text-base flex items-center gap-2">
              Approving Supervisors Database
              <span className="text-xs bg-rail-blue/10 text-rail-blue px-2.5 py-0.5 rounded-full font-bold">
                {supervisors.length} Registered
              </span>
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Manage authorised supervisors and their Rail Industry Worker (RIW) numbers for log verification.
            </p>
          </div>
        </div>

        {!isAdding && !editingId && (
          <button
            type="button"
            onClick={startAdd}
            className="px-4 py-2.5 bg-rail-blue text-white rounded-xl text-xs font-bold flex items-center gap-2 hover:bg-opacity-90 transition shadow-sm self-start sm:self-auto cursor-pointer"
          >
            <UserPlus size={16} />
            <span>Add Supervisor</span>
          </button>
        )}
      </div>

      {/* Add / Edit Form Modal / Card */}
      <AnimatePresence>
        {(isAdding || editingId) && (
          <motion.form
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            onSubmit={handleSaveForm}
            className="bg-gray-50 p-5 rounded-2xl border border-rail-blue/20 space-y-4"
          >
            <div className="flex justify-between items-center pb-2 border-b border-gray-200/60">
              <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wider flex items-center gap-2">
                <BadgeCheck size={16} className="text-rail-blue" />
                {isAdding ? 'Register New Approving Supervisor' : 'Edit Supervisor Details'}
              </h4>
              <button
                type="button"
                onClick={resetForm}
                className="text-gray-400 hover:text-gray-600 text-xs font-bold cursor-pointer"
              >
                Cancel
              </button>
            </div>

            {formError && (
              <p className="text-xs text-red-500 font-bold bg-red-50 p-2.5 rounded-lg border border-red-100">
                × {formError}
              </p>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1">
                  Full Name *
                </label>
                <div className="relative">
                  <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. David Miller"
                    className="w-full bg-white border border-gray-200 rounded-xl pl-9 pr-3 py-2 text-sm outline-none focus:border-rail-blue focus:ring-1 focus:ring-rail-blue"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1">
                  RIW Number *
                </label>
                <div className="relative">
                  <CreditCard size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={riwNumber}
                    onChange={(e) => setRiwNumber(e.target.value)}
                    placeholder="e.g. RIW-8839210 or 8839210"
                    className="w-full bg-white border border-gray-200 rounded-xl pl-9 pr-3 py-2 text-sm outline-none focus:border-rail-blue focus:ring-1 focus:ring-rail-blue font-mono font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1">
                  Title / Role (Optional)
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Senior Signal Engineer"
                  className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-rail-blue focus:ring-1 focus:ring-rail-blue"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1">
                  Email Address (Optional)
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="e.g. supervisor@railways.gov.au"
                  className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-rail-blue focus:ring-1 focus:ring-rail-blue"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={resetForm}
                className="px-4 py-2 border border-gray-300 text-gray-600 rounded-xl text-xs font-bold hover:bg-gray-100 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-6 py-2 bg-rail-blue text-white rounded-xl text-xs font-bold hover:bg-opacity-90 transition shadow-sm cursor-pointer"
              >
                {isAdding ? 'Add to Database' : 'Update Supervisor'}
              </button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      {/* Filter / Search Bar & Table */}
      {supervisors.length > 0 ? (
        <div className="space-y-4">
          <div className="relative max-w-sm">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by name or RIW number..."
              className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-9 pr-3 py-2 text-xs outline-none focus:bg-white focus:border-rail-blue transition"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtered.map((sup) => (
              <div
                key={sup.id}
                className="p-4 rounded-2xl border border-gray-100 bg-gray-50/50 hover:bg-white hover:border-rail-blue/30 transition-all shadow-2xs space-y-2 group min-w-0 overflow-hidden"
              >
                <div className="flex justify-between items-start gap-2 min-w-0">
                  <div className="space-y-1 min-w-0 flex-1">
                    <p className="font-bold text-sm text-gray-900 truncate">{sup.name}</p>
                    <span className="inline-flex items-center gap-1 font-mono text-[11px] font-bold text-rail-blue bg-rail-blue/10 px-2 py-0.5 rounded-md border border-rail-blue/20">
                      <CreditCard size={12} />
                      {sup.riwNumber}
                    </span>
                  </div>

                  <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition shrink-0">
                    <button
                      type="button"
                      onClick={() => startEdit(sup)}
                      className="p-1.5 text-gray-400 hover:text-rail-blue hover:bg-rail-blue/10 rounded-lg transition cursor-pointer"
                      title="Edit supervisor"
                    >
                      <Edit3 size={14} />
                    </button>
                    {confirmDeleteSupId === sup.id ? (
                      <div className="flex items-center gap-1 bg-red-50 p-1 rounded-lg border border-red-200 shrink-0 animate-in slide-in-from-right-2">
                        <button
                          type="button"
                          onClick={() => {
                            onRemove(sup.id);
                            setConfirmDeleteSupId(null);
                          }}
                          className="text-[9px] font-bold text-white bg-red-600 hover:bg-red-700 px-2 py-0.5 rounded cursor-pointer shrink-0"
                        >
                          Confirm
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteSupId(null)}
                          className="text-[9px] font-bold text-gray-600 bg-gray-200 hover:bg-gray-300 px-1.5 py-0.5 rounded cursor-pointer shrink-0"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteSupId(sup.id)}
                        className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition cursor-pointer"
                        title="Remove supervisor"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>

                {(sup.title || sup.email) && (
                  <div className="pt-2 border-t border-gray-100 flex flex-col gap-0.5 text-[10px] text-gray-500">
                    {sup.title && <p className="truncate font-medium">{sup.title}</p>}
                    {sup.email && <p className="truncate font-mono text-gray-400">{sup.email}</p>}
                  </div>
                )}
              </div>
            ))}

            {filtered.length === 0 && (
              <div className="col-span-full py-8 text-center text-xs text-gray-400 italic">
                No supervisors matching "{searchTerm}"
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="py-10 text-center border-2 border-dashed border-gray-200 rounded-2xl space-y-3 bg-gray-50/50">
          <BadgeCheck size={36} className="mx-auto text-gray-300" />
          <div className="space-y-1">
            <p className="text-sm font-bold text-gray-700">No Approving Supervisors in Database</p>
            <p className="text-xs text-gray-400 max-w-sm mx-auto">
              Add line managers, verifiers, or certifiers and their RIW numbers so you can quickly attach them to your signalling log entries.
            </p>
          </div>
          {!isAdding && (
            <button
              type="button"
              onClick={startAdd}
              className="px-4 py-2 bg-rail-blue text-white rounded-xl text-xs font-bold inline-flex items-center gap-2 hover:bg-opacity-90 transition cursor-pointer"
            >
              <UserPlus size={14} />
              Add First Supervisor
            </button>
          )}
        </div>
      )}
    </div>
  );
}
