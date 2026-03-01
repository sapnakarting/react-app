import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Truck, MiningLog, MaterialType, MasterData, Driver, FuelLog, User } from '../types';

interface MiningEntryFormProps {
  trucks: Truck[];
  drivers: Driver[];
  fuelLogs: FuelLog[];
  miningLogs: MiningLog[];
  masterData: MasterData;
  onAddLog: (log: MiningLog) => void;
  onUpdateLog?: (log: MiningLog) => void;
  editLog?: MiningLog | null;
  onAddMasterDataItem?: (key: keyof MasterData, list: string[]) => void;
  navParams?: { truckId?: string; date?: string } | null;
  onClearNav?: () => void;
  currentUser: User;
  onSuccess?: () => void;
}

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="space-y-1">
    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{label}</label>
    {children}
  </div>
);

const cls = "w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-amber-500 font-bold transition-all text-sm";

const SearchableSelect: React.FC<{
  label: string;
  value: string;
  options: string[];
  placeholder: string;
  onChange: (val: string) => void;
  onAddNew?: (val: string) => void;
  tabIndex?: number;
}> = ({ label, value, options, placeholder, onChange, onAddNew, tabIndex }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filtered = useMemo(() => options.filter(o => o.toLowerCase().includes(search.toLowerCase())), [options, search]);
  const showAddNew = onAddNew && search.trim() && !options.some(o => o.toLowerCase() === search.trim().toLowerCase());

  // Auto-scroll logic
  useEffect(() => {
    if (isOpen && listRef.current) {
      const activeItem = listRef.current.children[highlightedIndex] as HTMLElement;
      if (activeItem) {
        activeItem.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }, [highlightedIndex, isOpen]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Tab') {
      setIsOpen(false);
      return;
    }

    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter') {
        setIsOpen(true);
        setHighlightedIndex(0);
      }
      return;
    }

    const totalItems = filtered.length + (showAddNew ? 1 : 0);

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex(prev => (prev + 1) % totalItems);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex(prev => (prev - 1 + totalItems) % totalItems);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedIndex < filtered.length) {
        onChange(filtered[highlightedIndex]);
      } else if (showAddNew) {
        onAddNew!(search.trim());
      }
      setIsOpen(false);
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    } else if (e.key === 'Backspace' && !search) {
      onChange(''); // Allow clearing via backspace if empty
    }
  };

  useEffect(() => {
    setHighlightedIndex(0);
  }, [search]);

  return (
    <div className="space-y-1 relative" ref={wrapperRef} style={{ zIndex: isOpen ? 1000 : 10 }}>
      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{label}</label>
      <div className="relative">
        <input
          type="text"
          placeholder={placeholder}
          value={isOpen ? search : value}
          onFocus={() => { 
            setIsOpen(true); 
            setSearch(''); 
            setHighlightedIndex(0);
          }}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={handleKeyDown}
          tabIndex={tabIndex}
          className={`${cls} ${isOpen ? 'ring-2 ring-amber-500 border-amber-500 bg-white shadow-lg' : ''} ${!value ? 'bg-slate-100/50' : ''}`}
        />
        <div className={`absolute right-3 top-1/2 -translate-y-1/2 transition-all duration-300 ${isOpen ? 'rotate-180 text-amber-500' : 'text-slate-400'}`}>
          ▼
        </div>
        {!isOpen && value && (
          <button 
            type="button"
            onClick={(e) => { e.stopPropagation(); onChange(''); }}
            className="absolute right-8 top-1/2 -translate-y-1/2 text-slate-300 hover:text-rose-500 transition-colors p-1"
          >
            &times;
          </button>
        )}
      </div>
      {isOpen && (
        <div 
          className="absolute z-[2000] w-full mt-2 bg-white border border-slate-200 shadow-[0_20px_50px_rgba(0,0,0,0.15)] rounded-2xl max-h-60 overflow-y-auto p-1.5 animate-slideUp"
          ref={listRef}
        >
          {filtered.length === 0 && !showAddNew && (
            <div className="p-4 text-center text-slate-400 text-xs font-bold bg-slate-50 rounded-xl m-1 border-2 border-dashed border-slate-100">
              🔍 No matches found
            </div>
          )}
          {filtered.map((o, idx) => (
            <button
              key={o}
              type="button"
              onMouseEnter={() => setHighlightedIndex(idx)}
              className={`w-full text-left px-4 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center justify-between ${
                idx === highlightedIndex ? 'bg-slate-500 text-white shadow-md scale-[1.01]' : 'hover:bg-slate-50 text-slate-700'
              }`}
              onMouseDown={() => { onChange(o); setIsOpen(false); }}
            >
              <span>{o}</span>
              {idx === highlightedIndex}
            </button>
          ))}
          {showAddNew && (
            <button
              type="button"
              onMouseEnter={() => setHighlightedIndex(filtered.length)}
              className={`w-full text-left px-4 py-2.5 rounded-xl text-sm font-black transition-all flex items-center justify-between border-t border-slate-100 mt-2 ${
                highlightedIndex === filtered.length ? 'bg-amber-600 text-white shadow-md scale-[1.01]' : 'text-amber-600 hover:bg-amber-50'
              }`}
              onMouseDown={() => { onAddNew!(search.trim()); setIsOpen(false); }}
            >
              <span className="flex items-center gap-2">✨ Add "{search}"</span>
              <span className="text-[9px] bg-white/20 px-2 py-0.5 rounded uppercase tracking-tighter">Enter to Save</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};

const MiningEntryForm: React.FC<MiningEntryFormProps> = ({
  trucks, drivers, fuelLogs, miningLogs, masterData, onAddLog, onUpdateLog, editLog,
  onAddMasterDataItem, navParams, onClearNav, currentUser, onSuccess
}) => {
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  const [formData, setFormData] = useState({
    type: 'DISPATCH' as 'DISPATCH' | 'PURCHASE',
    date: new Date().toISOString().split('T')[0],
    time: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
    supplier: '',
    chalanNo: '',
    customerName: '',
    customerSite: '',
    royaltyNo: '',
    truckId: '',
    driverId: '',
    cartingAgent: '',
    loader: '',
    material: '' as MaterialType,
    royaltyName: '',
    royaltyPassNo: '',
    // Loading weighbridge
    loadingGross: '',
    loadingTare: '',
    loadingNet: '',
    // Unloading weighbridge
    unloadingGross: '',
    unloadingTare: '',
    unloadingNet: '',
  });


  useEffect(() => {
    const g = parseFloat(formData.loadingGross);
    const t = parseFloat(formData.loadingTare);
    if (!isNaN(g) && !isNaN(t)) {
      setFormData(prev => ({ ...prev, loadingNet: (g - t).toFixed(3) }));
    }
  }, [formData.loadingGross, formData.loadingTare]);

  useEffect(() => {
    const g = parseFloat(formData.unloadingGross);
    const t = parseFloat(formData.unloadingTare);
    if (!isNaN(g) && !isNaN(t)) {
      setFormData(prev => ({ ...prev, unloadingNet: (g - t).toFixed(3) }));
    }
  }, [formData.unloadingGross, formData.unloadingTare]);

  // AUTO-FILL FROM NAV PARAMS
  useEffect(() => {
    if (navParams && !editLog) {
      setFormData(prev => ({
        ...prev,
        truckId: navParams.truckId || prev.truckId,
        date: navParams.date || prev.date,
        driverId: navParams.driverId || prev.driverId
      }));
      // Clear nav params immediately after consumption to prevent form retention issues
      setTimeout(() => {
        onClearNav?.();
      }, 500);
    }
  }, [navParams, editLog]);

  const shortage = useMemo(() => {
    const ln = parseFloat(formData.loadingNet);
    const un = parseFloat(formData.unloadingNet);
    if (!isNaN(ln) && !isNaN(un)) return un - ln;
    return null;
  }, [formData.loadingNet, formData.unloadingNet]);

  // Check existing trips to determine Roll Amount, Staff Welfare, and Diesel Assignment
  const existingTrips = useMemo(() => {
    if (!formData.truckId || !formData.date) return 0;
    return miningLogs.filter(l => l.truckId === formData.truckId && l.date === formData.date && l.id !== editLog?.id).length;
  }, [formData.truckId, formData.date, miningLogs, editLog]);

  const dieselInfo = useMemo(() => {
    if (!formData.truckId || !formData.date) return { liters: 0, date: '', rate: 90.55 };
    const logs = fuelLogs.filter(f => f.truckId === formData.truckId && f.attributionDate === formData.date);
    const totalLiters = logs.reduce((acc, l) => acc + (l.fuelLiters || 0), 0);
    const firstLog = logs[0];
    return {
      liters: totalLiters,
      date: firstLog?.date || '',
      rate: firstLog?.dieselPrice || 90.55
    };
  }, [formData.truckId, formData.date, fuelLogs]);

  // If existingTrips == 0 (this is the 1st trip), assign staff welfare
  const staffWelfare = existingTrips === 0 ? 300 : 0;
  // Roll amount is 100 rs per every trip made
  const rollAmount = 100;
  // Diesel is only assigned to the first trip of the day
  const assignedDieselLiters = existingTrips === 0 ? dieselInfo.liters : 0;

  // Auto-sync driver from fuel log
  useEffect(() => {
    if (!formData.truckId || !formData.date) return;
    const src = fuelLogs
      .filter(f => f.truckId === formData.truckId && f.attributionDate === formData.date)[0]
      || fuelLogs
      .filter(f => f.truckId === formData.truckId)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
    
    if (src) {
      setFormData(prev => ({ ...prev, driverId: src.driverId }));
    }
  }, [formData.truckId, formData.date, fuelLogs]);

  // Removed intrusive defaults from master data to avoid form feeling "cluttered"
  // Users prefer a clean slate for fresh entries.
  // useEffect(() => {
  //   if (!editLog && masterData && !navParams) {
  //      // Only default the type-based customer if it's empty
  //      if (!formData.customerName) {
  //        setFormData(prev => ({
  //          ...prev,
  //          customerName: (formData.type === 'DISPATCH' ? (masterData.customers[0] || '') : (masterData.suppliers[0] || ''))
  //        }));
  //      }
  //   }
  // }, [masterData, formData.type, editLog, navParams]);

  // Load edit log
  useEffect(() => {
    if (editLog) {
      setFormData({
        type: editLog.type,
        date: editLog.date,
        time: editLog.time,
        supplier: editLog.supplier || '',
        chalanNo: editLog.chalanNo,
        customerName: editLog.customerName,
        customerSite: editLog.customerSite || '',
        royaltyNo: editLog.royaltyNo || '',
        truckId: editLog.truckId,
        driverId: editLog.driverId || '',
        cartingAgent: editLog.cartingAgent,
        loader: editLog.loader,
        material: editLog.material,
        royaltyName: editLog.royaltyName || '',
        royaltyPassNo: editLog.royaltyPassNo || '',
        loadingGross: editLog.loadingGrossWt?.toString() || '',
        loadingTare: editLog.loadingTareWt?.toString() || '',
        loadingNet: editLog.loadingNetWt?.toString() || '',
        unloadingGross: editLog.unloadingGrossWt?.toString() || '',
        unloadingTare: editLog.unloadingTareWt?.toString() || '',
        unloadingNet: editLog.unloadingNetWt?.toString() || '',
      });
    }
  }, [editLog]);

  useEffect(() => {
    if (navParams && !editLog) {
      setFormData(prev => ({
        ...prev,
        date: navParams.date || prev.date,
        truckId: navParams.truckId || prev.truckId
      }));
      onClearNav?.();
    }
  }, [navParams, editLog, onClearNav]);

  const showToast = (type: 'success' | 'error', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3000);
  };

  const set = (key: string, val: string) => setFormData(prev => ({ ...prev, [key]: val }));

  const handleAddNewItem = (key: keyof MasterData, val: string, fieldName: string) => {
    if (onAddMasterDataItem && key !== 'benchmarks') {
      const currentList = masterData[key] as string[];
      if (currentList.includes(val)) {
        setFormData(prev => ({ ...prev, [fieldName]: val }));
        return;
      }
      onAddMasterDataItem(key, [...currentList, val]);
      setFormData(prev => ({ ...prev, [fieldName]: val }));
      showToast('success', `Added "${val}" to ${key}`);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.truckId || (!formData.loadingNet && !formData.unloadingNet)) {
      showToast('error', 'Missing required fields: Vehicle and at least one Weight reading are required.');
      return;
    }
    const logData: MiningLog = {
      id: editLog ? editLog.id : crypto.randomUUID(),
      type: formData.type,
      date: formData.date,
      time: formData.time,
      supplier: formData.supplier || undefined,
      chalanNo: formData.chalanNo,
      customerName: formData.customerName,
      customerSite: formData.customerSite || undefined,
      royaltyName: formData.royaltyName || '',
      royaltyPassNo: formData.royaltyPassNo || '',
      royaltyNo: formData.royaltyNo || undefined,
      truckId: formData.truckId,
      driverId: formData.driverId || null,
      cartingAgent: formData.cartingAgent,
      loader: formData.loader,
      material: formData.material,
      gross: 0, 
      tare: 0,
      net: parseFloat(formData.unloadingNet || formData.loadingNet || '0'),
      loadingGrossWt: formData.loadingGross ? parseFloat(formData.loadingGross) : undefined,
      loadingTareWt: formData.loadingTare ? parseFloat(formData.loadingTare) : undefined,
      loadingNetWt: formData.loadingNet ? parseFloat(formData.loadingNet) : undefined,
      unloadingGrossWt: formData.unloadingGross ? parseFloat(formData.unloadingGross) : undefined,
      unloadingTareWt: formData.unloadingTare ? parseFloat(formData.unloadingTare) : undefined,
      unloadingNetWt: formData.unloadingNet ? parseFloat(formData.unloadingNet) : undefined,
      shortageWt: shortage ?? undefined,
      agentId: currentUser.username,
      dieselLiters: assignedDieselLiters,
      dieselAdjustment: 0,
      dieselRate: dieselInfo.rate,
      staffWelfare: staffWelfare,
      rollAmount: rollAmount
    };

    try {
      if (editLog && onUpdateLog) onUpdateLog(logData);
      else onAddLog(logData);
      showToast('success', editLog ? 'Entry updated!' : 'Mining record saved!');
      onSuccess?.();
      if (!editLog) {
        setFormData(prev => ({ 
          ...prev, 
          chalanNo: '', 
          royaltyPassNo: '', royaltyNo: '', 
          customerName: '', // Reset customer too for fresh entry
          driverId: '', // Reset driver as well
          loadingGross: '', loadingTare: '', loadingNet: '',
          unloadingGross: '', unloadingTare: '', unloadingNet: '' 
        }));
        onClearNav?.(); // Ensure nav params are definitely cleared after success
      }
    } catch {
      showToast('error', 'Failed to save entry.');
    }
  };

  const isDispatch = formData.type === 'DISPATCH';
  const miningTrucks = trucks.filter(t => t.fleetType === 'MINING' && t.status === 'ACTIVE');

  const handleKeyDown = (e: React.KeyboardEvent<HTMLFormElement>) => {
    if (e.key === 'Enter') {
      const target = e.target as HTMLElement;
      if (target.tagName.toLowerCase() === 'button' || target.tagName.toLowerCase() === 'textarea') return;
      
      e.preventDefault();
      const form = e.currentTarget;
      const elements = Array.from(form.elements) as HTMLElement[];
      const focusable = elements.filter(el => 
        !el.hasAttribute('disabled') && 
        el.tabIndex >= 0 && 
        el.tagName.toLowerCase() !== 'fieldset'
      ).sort((a, b) => (a.tabIndex || 0) - (b.tabIndex || 0));

      const index = focusable.indexOf(target);
      if (index > -1 && index < focusable.length - 1) {
        focusable[index + 1].focus();
      }
    }
  };

  return (
    <div className="max-w-5xl mx-auto py-4 px-2 animate-fadeIn">
      {toast && (
        <div className={`fixed top-4 right-4 z-[1000] px-6 py-3 rounded-xl shadow-2xl font-black text-white ${
          toast.type === 'success' ? 'bg-emerald-600' : 'bg-rose-600'
        }`}>
          {toast.msg}
        </div>
      )}

      <div className="bg-white rounded-[2rem] shadow-xl border border-slate-100 overflow-hidden">
        {/* Header - Compact */}
        <div className="bg-slate-900 px-6 py-4 text-white flex justify-between items-center">
          <div>
            <h2 className="text-xl font-black">{editLog ? 'Update Entry' : 'New Entry'}</h2>
            <p className="text-slate-400 text-[9px] uppercase tracking-widest font-black">Mining Operations</p>
          </div>
          <div className="flex bg-white/10 p-1 rounded-xl">
            {(['DISPATCH', 'PURCHASE'] as const).map(t => (
              <button key={t} type="button" onClick={() => set('type', t)}
                className={`px-4 py-1.5 rounded-lg text-[10px] font-black transition-all ${
                  formData.type === t ? (t === 'DISPATCH' ? 'bg-amber-500 text-slate-900' : 'bg-emerald-500 text-slate-900') : 'text-slate-400 hover:text-white'
                }`}>
                {t}
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={handleSubmit} onKeyDown={handleKeyDown} className="p-5 grid grid-cols-1 md:grid-cols-12 gap-5">
          {/* Main Info Section (Left) */}
          <div className="md:col-span-7 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <SearchableSelect label="Supplier" value={formData.supplier} options={masterData.suppliers} placeholder="Search Supplier..."
                onChange={v => set('supplier', v)} onAddNew={v => handleAddNewItem('suppliers', v, 'supplier')} tabIndex={1} />
              <Field label="Entry Date">
                <input type="date" required className={cls} value={formData.date} onChange={e => set('date', e.target.value)} tabIndex={2} />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Chalan No.">
                <input type="text" className={`${cls} font-black text-amber-600`} value={formData.chalanNo} onChange={e => set('chalanNo', e.target.value)} tabIndex={3} placeholder="CH-..." />
              </Field>
              <Field label="Royalty No.">
                <input type="text" className={cls} value={formData.royaltyNo} onChange={e => set('royaltyNo', e.target.value)} tabIndex={4} placeholder="RY-..." />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <SearchableSelect label={isDispatch ? "Customer" : "Purchased From"}  value={formData.customerName} options={isDispatch ? masterData.customers : masterData.suppliers}
                onChange={v => set('customerName', v)} onAddNew={v => handleAddNewItem(isDispatch ? 'customers' : 'suppliers', v, 'customerName')} tabIndex={5} placeholder={isDispatch ? "Select Customer..." : "Select Supplier..."} />
              <SearchableSelect label="Site Location" value={formData.customerSite} options={masterData.sites} placeholder="Select Site..."
                onChange={v => set('customerSite', v)} onAddNew={v => handleAddNewItem('sites', v, 'customerSite')} tabIndex={6} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <SearchableSelect
                label="Vehicle No"
                placeholder="Search vehicle..."
                value={trucks.find(t => t.id === formData.truckId)?.plateNumber || ''}
                options={miningTrucks.map(t => t.plateNumber)}
                onChange={(val) => {
                  const t = miningTrucks.find(truck => truck.plateNumber === val);
                  set('truckId', t ? t.id : '');
                }}
                tabIndex={7}
              />
              <SearchableSelect label="Material" value={formData.material} options={masterData.materials} placeholder="Search Material..."
                onChange={v => set('material', v as MaterialType)} onAddNew={v => handleAddNewItem('materials', v, 'material')} tabIndex={8} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <SearchableSelect label="Carting Agent" value={formData.cartingAgent} options={masterData.agents} placeholder="Select Agent..."
                onChange={v => set('cartingAgent', v)} onAddNew={v => handleAddNewItem('agents', v, 'cartingAgent')} tabIndex={9} />
              <SearchableSelect label="Assigned Driver" value={drivers.find(d => d.id === formData.driverId)?.name || ''} 
                options={drivers.filter(d => d.status === 'ON Duty').map(d => d.name)} placeholder="Search Driver..."
                onChange={v => {
                  const d = drivers.find(driver => driver.name === v);
                  if (d) set('driverId', d.id);
                }} tabIndex={10} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <SearchableSelect label="Loader / Machine" value={formData.loader} options={masterData.loaders.map(m => m.name)} placeholder="Select Machine..."
                onChange={v => set('loader', v)} tabIndex={11} />
              <SearchableSelect label="Royalty Type" value={formData.royaltyName} options={masterData.royaltyNames} placeholder="Search..."
                onChange={v => set('royaltyName', v)} onAddNew={v => handleAddNewItem('royaltyNames', v, 'royaltyName')} tabIndex={12} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Royalty Pass No.">
                <input type="text" className={cls} value={formData.royaltyPassNo} onChange={e => set('royaltyPassNo', e.target.value)} tabIndex={13} />
              </Field>
              <div />
            </div>
          </div>

          {/* Weights Section (Right) */}
          <div className="md:col-span-5 space-y-4">

            {/* Loading/Unloading */}
            <div className="grid grid-cols-1 gap-3">
              {/* Loading */}
              <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100 space-y-3">
                <h3 className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Loading</h3>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Gross">
                    <input type="number" step="0.001" className={`${cls} border-emerald-200`} value={formData.loadingGross} onChange={e => set('loadingGross', e.target.value)} tabIndex={16} />
                  </Field>
                  <Field label="Tare">
                    <input type="number" step="0.001" className={`${cls} border-emerald-200`} value={formData.loadingTare} onChange={e => set('loadingTare', e.target.value)} tabIndex={17} />
                  </Field>
                </div>
                <Field label="Loading Net (MT)">
                  <input type="number" step="0.001" className={`${cls} bg-emerald-100 text-emerald-900 border-emerald-300 font-black`} value={formData.loadingNet} onChange={e => set('loadingNet', e.target.value)} tabIndex={18} />
                </Field>
              </div>

              {/* Unloading */}
              <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100 space-y-3">
                <h3 className="text-[10px] font-black text-blue-600 uppercase tracking-widest">Unloading</h3>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Gross">
                    <input type="number" step="0.001" className={`${cls} border-blue-200`} value={formData.unloadingGross} onChange={e => set('unloadingGross', e.target.value)} tabIndex={19} />
                  </Field>
                  <Field label="Tare">
                    <input type="number" step="0.001" className={`${cls} border-blue-200`} value={formData.unloadingTare} onChange={e => set('unloadingTare', e.target.value)} tabIndex={20} />
                  </Field>
                </div>
                <Field label="Unloading Net (MT)">
                  <input type="number" step="0.001" className={`${cls} bg-blue-100 text-blue-900 border-blue-300 font-black`} value={formData.unloadingNet} onChange={e => set('unloadingNet', e.target.value)} tabIndex={21} />
                </Field>
              </div>
            </div>

            {shortage !== null && (
              <div className={`p-4 rounded-2xl border flex items-center justify-between ${shortage < -0.01 ? 'bg-rose-50 border-rose-200' : 'bg-emerald-50 border-emerald-200'}`}>
                <div>
                  <p className="text-[8px] font-bold text-slate-500 uppercase tracking-tighter">Shortage</p>
                  <p className={`text-xl font-black ${shortage < -0.01 ? 'text-rose-600' : 'text-emerald-600'}`}>{shortage.toFixed(3)} MT</p>
                </div>
                <div className={`px-2 py-1 rounded-lg text-[10px] font-black ${shortage < -0.01 ? 'bg-rose-600 text-white' : 'bg-emerald-600 text-white'}`}>
                  {shortage < -0.01 ? '⚠ LOSS' : '✓ GAIN/STABLE'}
                </div>
              </div>
            )}
            
            {/* Financial Summary Rendering */}
            {formData.truckId && (
              <div className="grid grid-cols-1 gap-3">
                <div className="p-3 bg-slate-900 rounded-2xl flex flex-col items-center justify-center text-center shadow-md">
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Fuel Sync</span>
                  <span className="text-xl font-black text-emerald-400 leading-none">{assignedDieselLiters.toFixed(1)} <span className="text-[10px]">L</span></span>
                  {assignedDieselLiters > 0 && <span className="text-[7px] text-emerald-600 font-black mt-1 uppercase">Trip #1 Assgn</span>}
                </div>
              </div>
            )}

            <button type="submit" tabIndex={22} className="w-full py-4 rounded-2xl bg-slate-900 text-white font-black text-lg shadow-xl hover:bg-black transition-all active:scale-[0.98]">
              {editLog ? '✓ Save Changes' : `⊕ Save Trip #${existingTrips + 1}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default MiningEntryForm;
