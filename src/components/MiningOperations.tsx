import React, { useState, useMemo } from 'react';
import { MiningLog, MachineLog, MachineFuelEntry, Machine, Truck, Driver, FuelLog, MasterData } from '../types';

/* ─── Types ─────────────────────────────────────────────────────────── */
interface MiningProps {
  logs: MiningLog[];
  machines: Machine[];
  machineLogs: MachineLog[];
  machineFuelEntries: MachineFuelEntry[];
  trucks: Truck[];
  drivers: Driver[];
  fuelLogs: FuelLog[];
  masterData: MasterData;
  onEdit?: (log: MiningLog) => void;
  onDelete?: (id: string) => void;
  onAddTrigger?: (truckId?: string, date?: string) => void;
  onBulkUploadTrigger?: () => void;
  onReportTrigger?: () => void;
  onLoadMore?: () => void;
  hasMore?: boolean;
  navParams?: { truckId?: string; date?: string } | null;
  onClearNav?: () => void;
  onAddMachineLog?: (log: MachineLog) => void;
  onAddMachineFuelEntry?: (entry: MachineFuelEntry) => void;
  onUpdateLogs?: (logs: MiningLog[]) => Promise<void>;
  onAddLogs?: (logs: MiningLog[]) => Promise<void>;
  currentUser: any;
  role: string | null;
}

/* ─── MACHINE LOGS TAB ───────────────────────────────────────────────── */
const MachineLogsTab: React.FC<{
  machines: Machine[];
  machineLogs: MachineLog[];
  machineFuelEntries: MachineFuelEntry[];
  masterData: MasterData;
  onAddMachineLog?: (log: MachineLog) => void;
  onAddMachineFuelEntry?: (entry: MachineFuelEntry) => void;
}> = ({ machines, machineLogs, machineFuelEntries, masterData, onAddMachineLog, onAddMachineFuelEntry }) => {
  const [selectedMachineId, setSelectedMachineId] = useState('');
  const [activeForm, setActiveForm] = useState<'activity' | 'fuel' | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [actForm, setActForm] = useState({
    date: new Date().toISOString().split('T')[0],
    openingHours: '', closingHours: '', openingKm: '', closingKm: '',
    activity: 'LOADING' as any, actHours: '', actKm: '', actRemarks: '', remarks: ''
  });

  const [fuelForm, setFuelForm] = useState({
    date: new Date().toISOString().split('T')[0],
    fuelLiters: '', dieselPrice: '', currentHours: '', currentKm: '', remarks: '',
    fuelSourceType: 'STATION' as 'STATION' | 'INTERNAL_TANKER' | 'DIESEL_PARTY',
    fuelSourceId: ''
  });

  const selectedMachine = machines.find(m => m.id === selectedMachineId);
  const mLogs = machineLogs.filter(l => l.machineId === selectedMachineId).sort((a, b) => b.date.localeCompare(a.date));
  const mFuel = machineFuelEntries.filter(f => f.machineId === selectedMachineId).sort((a, b) => b.date.localeCompare(a.date));

  const totalFuelLiters = machineFuelEntries.filter(f => f.machineId === selectedMachineId).reduce((s, f) => s + f.fuelLiters, 0);
  const totalFuelAmount = machineFuelEntries.filter(f => f.machineId === selectedMachineId).reduce((s, f) => s + f.amount, 0);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  const submitActivityLog = () => {
    if (!selectedMachineId || !actForm.date) { showToast('Please select a machine and date'); return; }
    const log: MachineLog = {
      id: crypto.randomUUID(),
      machineId: selectedMachineId,
      date: actForm.date,
      openingHours: actForm.openingHours ? parseFloat(actForm.openingHours) : undefined,
      closingHours: actForm.closingHours ? parseFloat(actForm.closingHours) : undefined,
      openingKm: actForm.openingKm ? parseFloat(actForm.openingKm) : undefined,
      closingKm: actForm.closingKm ? parseFloat(actForm.closingKm) : undefined,
      activities: [{
        activity: actForm.activity,
        durationHours: actForm.actHours ? parseFloat(actForm.actHours) : undefined,
        distanceKm: actForm.actKm ? parseFloat(actForm.actKm) : undefined,
        remarks: actForm.actRemarks || undefined
      }],
      remarks: actForm.remarks || undefined
    };
    onAddMachineLog?.(log);
    setActForm(prev => ({ ...prev, actHours: '', actKm: '', actRemarks: '', openingHours: '', closingHours: '' }));
    showToast('Activity log saved!');
    setActiveForm(null);
  };

  const submitFuelEntry = () => {
    if (!selectedMachineId || !fuelForm.fuelLiters || !fuelForm.dieselPrice || !fuelForm.fuelSourceId) {
      showToast('Machine, liters, price, and source are required'); return;
    }
    const liters = parseFloat(fuelForm.fuelLiters);
    const price = parseFloat(fuelForm.dieselPrice);
    const entry: MachineFuelEntry = {
      id: crypto.randomUUID(),
      machineId: selectedMachineId,
      fuelSourceType: fuelForm.fuelSourceType,
      fuelSourceId: fuelForm.fuelSourceId,
      date: fuelForm.date,
      fuelLiters: liters,
      dieselPrice: price,
      amount: liters * price,
      currentHours: fuelForm.currentHours ? parseFloat(fuelForm.currentHours) : undefined,
      currentKm: fuelForm.currentKm ? parseFloat(fuelForm.currentKm) : undefined,
      remarks: fuelForm.remarks || undefined
    };
    onAddMachineFuelEntry?.(entry);
    setFuelForm(prev => ({ ...prev, fuelLiters: '', remarks: '', fuelSourceId: '' }));
    showToast('Fuel entry saved!');
    setActiveForm(null);
  };

  const cls = "w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-amber-500 font-bold text-sm";
  const Label: React.FC<{ t: string; children: React.ReactNode }> = ({ t, children }) => (
    <div className="space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{t}</label>{children}</div>
  );

  return (
    <div className="space-y-6 animate-fadeIn">
      {toast && (
        <div className="fixed top-8 right-8 z-[400] px-6 py-3 bg-emerald-600 text-white rounded-2xl shadow-xl font-black animate-slideInRight">✓ {toast}</div>
      )}

      {/* Machine Selector */}
      <div className="bg-white rounded-3xl border border-slate-100 p-6 shadow-sm">
        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">Select Machine</h3>
        {machines.length === 0 ? (
          <div className="text-center py-8 text-slate-400 font-bold text-sm">No machines registered yet. Add loaders/machines in Settings → Loaders.</div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {machines.map(m => (
              <button key={m.id} onClick={() => setSelectedMachineId(m.id === selectedMachineId ? '' : m.id)}
                className={`p-4 rounded-2xl border-2 text-left transition-all ${m.id === selectedMachineId ? 'border-amber-500 bg-amber-50' : 'border-slate-100 hover:border-slate-300'}`}>
                <div className="flex items-center gap-2 mb-2">
                  <span className={`w-2 h-2 rounded-full ${m.status === 'ACTIVE' ? 'bg-emerald-500' : m.status === 'MAINTENANCE' ? 'bg-amber-500' : 'bg-slate-300'}`} />
                  <span className="text-[8px] font-black uppercase text-slate-400">{m.machineType}</span>
                </div>
                <p className="font-black text-slate-900 text-sm leading-tight">{m.name}</p>
                <p className="text-[9px] text-slate-400 font-bold mt-1">{m.model || 'No model'}</p>
              </button>
            ))}
          </div>
        )}
      </div>

      {selectedMachine && (
        <>
          {/* Machine Summary Bar */}
          <div className="bg-slate-900 rounded-3xl p-6 text-white">
            <div className="flex flex-col md:flex-row justify-between gap-4">
              <div>
                <p className="text-xs text-amber-500 font-black uppercase tracking-widest">Selected Machine</p>
                <h3 className="text-xl font-black mt-1">{selectedMachine.name}</h3>
                <p className="text-slate-400 text-xs font-bold">{selectedMachine.machineType} · {selectedMachine.trackingMode} tracking · {selectedMachine.status}</p>
              </div>
              <div className="flex gap-6">
                <div className="text-center">
                  <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest">Total Diesel</p>
                  <p className="text-2xl font-black text-emerald-400">{totalFuelLiters.toFixed(1)} L</p>
                </div>
                <div className="text-center">
                  <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest">Total Spent</p>
                  <p className="text-2xl font-black text-amber-400">₹{totalFuelAmount.toFixed(0)}</p>
                </div>
                <div className="text-center">
                  <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest">Entries</p>
                  <p className="text-2xl font-black text-white">{mFuel.length}</p>
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-4">
              <button onClick={() => setActiveForm(activeForm === 'activity' ? null : 'activity')}
                className={`px-5 py-2.5 rounded-xl font-black text-xs uppercase transition-all ${activeForm === 'activity' ? 'bg-amber-500 text-slate-900' : 'bg-white/10 text-white hover:bg-white/20'}`}>
                + Log Activity
              </button>
              <button onClick={() => setActiveForm(activeForm === 'fuel' ? null : 'fuel')}
                className={`px-5 py-2.5 rounded-xl font-black text-xs uppercase transition-all ${activeForm === 'fuel' ? 'bg-emerald-500 text-slate-900' : 'bg-white/10 text-white hover:bg-white/20'}`}>
                + Fuel Entry
              </button>
            </div>
          </div>

          {/* Activity Form */}
          {activeForm === 'activity' && (
            <div className="bg-white rounded-3xl border border-amber-100 p-6 shadow-sm space-y-4">
              <h4 className="text-xs font-black text-amber-700 uppercase tracking-widest">Log Activity — {selectedMachine.name}</h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <Label t="Date"><input type="date" className={cls} value={actForm.date} onChange={e => setActForm(p => ({ ...p, date: e.target.value }))} /></Label>
                <Label t="Activity Type">
                  <select className={cls} value={actForm.activity} onChange={e => setActForm(p => ({ ...p, activity: e.target.value as any }))}>
                    {['LOADING', 'BLASTING', 'PATH_MAKING', 'STOCKPILING', 'CRUSHING_SUPPORT', 'OTHER'].map(a => (
                      <option key={a} value={a}>{a.replace('_', ' ')}</option>
                    ))}
                  </select>
                </Label>
                {selectedMachine.trackingMode === 'HOURS' ? (
                  <>
                    <Label t="Opening Hours"><input type="number" step="0.1" className={cls} value={actForm.openingHours} onChange={e => setActForm(p => ({ ...p, openingHours: e.target.value }))} /></Label>
                    <Label t="Closing Hours"><input type="number" step="0.1" className={cls} value={actForm.closingHours} onChange={e => setActForm(p => ({ ...p, closingHours: e.target.value }))} /></Label>
                  </>
                ) : (
                  <>
                    <Label t="Opening KM"><input type="number" className={cls} value={actForm.openingKm} onChange={e => setActForm(p => ({ ...p, openingKm: e.target.value }))} /></Label>
                    <Label t="Closing KM"><input type="number" className={cls} value={actForm.closingKm} onChange={e => setActForm(p => ({ ...p, closingKm: e.target.value }))} /></Label>
                  </>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Label t="Remarks"><input type="text" className={cls} value={actForm.remarks} placeholder="Optional remarks…" onChange={e => setActForm(p => ({ ...p, remarks: e.target.value }))} /></Label>
              </div>
              <button onClick={submitActivityLog} className="w-full py-4 bg-amber-500 text-slate-900 rounded-2xl font-black uppercase hover:bg-amber-400 transition-all active:scale-95">
                Save Activity Log
              </button>
            </div>
          )}

          {/* Fuel Form */}
          {activeForm === 'fuel' && (
            <div className="bg-white rounded-3xl border border-emerald-100 p-6 shadow-sm space-y-4">
              <div className="flex justify-between items-center">
                <h4 className="text-xs font-black text-emerald-700 uppercase tracking-widest">Fuel Entry — {selectedMachine.name}</h4>
                <div className="flex bg-slate-100 p-1 rounded-xl">
                  {(['STATION', 'INTERNAL_TANKER', 'DIESEL_PARTY'] as const).map(t => (
                    <button key={t} type="button" onClick={() => setFuelForm(p => ({ ...p, fuelSourceType: t, fuelSourceId: '' }))}
                      className={`px-3 py-1.5 rounded-lg text-[9px] font-black transition-all ${fuelForm.fuelSourceType === t ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-slate-600'}`}>
                      {t === 'STATION' ? 'Petrol Pump' : t === 'INTERNAL_TANKER' ? 'Internal Tanker' : 'Supplier'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <Label t="Date"><input type="date" className={cls} value={fuelForm.date} onChange={e => setFuelForm(p => ({ ...p, date: e.target.value }))} /></Label>
                
                {fuelForm.fuelSourceType === 'STATION' && (
                  <Label t="Petrol Pump">
                    <select className={cls} value={fuelForm.fuelSourceId} onChange={e => setFuelForm(p => ({ ...p, fuelSourceId: e.target.value }))}>
                      <option value="">— Select Pump —</option>
                      {masterData.fuelStations.filter(s => !s.isInternal).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </Label>
                )}

                {fuelForm.fuelSourceType === 'INTERNAL_TANKER' && (
                  <Label t="Internal Tanker">
                    <select className={cls} value={fuelForm.fuelSourceId} onChange={e => setFuelForm(p => ({ ...p, fuelSourceId: e.target.value }))}>
                      <option value="">— Select Tanker —</option>
                      {masterData.fuelStations.filter(s => s.isInternal).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </Label>
                )}

                {fuelForm.fuelSourceType === 'DIESEL_PARTY' && (
                  <Label t="Supplier / Party">
                    <select className={cls} value={fuelForm.fuelSourceId} onChange={e => setFuelForm(p => ({ ...p, fuelSourceId: e.target.value }))}>
                      <option value="">— Select Party —</option>
                      {masterData.dieselParties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </Label>
                )}

                <Label t="Fuel Liters *">
                  <input type="number" step="0.01" required className={`${cls} border-emerald-300`} value={fuelForm.fuelLiters}
                    onChange={e => setFuelForm(p => ({ ...p, fuelLiters: e.target.value }))} />
                </Label>
                <Label t="Diesel Price ₹ *">
                  <input type="number" step="0.01" required className={`${cls} border-emerald-300`} value={fuelForm.dieselPrice}
                    placeholder="Price per litre" onChange={e => setFuelForm(p => ({ ...p, dieselPrice: e.target.value }))} />
                </Label>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {selectedMachine.trackingMode === 'HOURS'
                  ? <Label t="Current Hours"><input type="number" step="0.1" className={cls} value={fuelForm.currentHours} onChange={e => setFuelForm(p => ({ ...p, currentHours: e.target.value }))} /></Label>
                  : <Label t="Current KM"><input type="number" className={cls} value={fuelForm.currentKm} onChange={e => setFuelForm(p => ({ ...p, currentKm: e.target.value }))} /></Label>
                }
                <div className="flex flex-col justify-end">
                  <div className="p-3 bg-emerald-50 rounded-2xl flex items-center justify-between">
                    <span className="text-[10px] font-black text-emerald-700 uppercase tracking-widest">Total:</span>
                    <span className="text-xl font-black text-emerald-700">₹{(parseFloat(fuelForm.fuelLiters || '0') * parseFloat(fuelForm.dieselPrice || '0')).toFixed(2)}</span>
                  </div>
                </div>
                <Label t="Remarks"><input type="text" className={cls} value={fuelForm.remarks} placeholder="Optional…" onChange={e => setFuelForm(p => ({ ...p, remarks: e.target.value }))} /></Label>
              </div>
              <button onClick={submitFuelEntry} className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-black uppercase hover:bg-emerald-500 transition-all active:scale-95">
                Save Fuel Entry
              </button>
            </div>
          )}

          {/* Activity History */}
          {mLogs.length > 0 && (
            <div className="bg-white rounded-3xl border border-slate-100 overflow-hidden shadow-sm">
              <div className="px-6 py-4 border-b border-slate-100">
                <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest">Activity History — {selectedMachine.name}</h4>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-slate-400 font-black uppercase tracking-widest">
                    <tr>
                      <th className="px-5 py-3 text-left">Date</th>
                      <th className="px-5 py-3 text-left">Activities</th>
                      <th className="px-5 py-3 text-center">Opening</th>
                      <th className="px-5 py-3 text-center">Closing</th>
                      <th className="px-5 py-3 text-left">Remarks</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {mLogs.slice(0, 20).map(l => (
                      <tr key={l.id} className="hover:bg-slate-50">
                        <td className="px-5 py-3 font-bold text-slate-700">{l.date}</td>
                        <td className="px-5 py-3">
                          {l.activities.map((a, i) => (
                            <span key={i} className="inline-block px-2 py-0.5 bg-amber-100 text-amber-700 rounded-lg text-[9px] font-black uppercase mr-1">
                              {a.activity.replace('_', ' ')} {a.durationHours ? `${a.durationHours}h` : a.distanceKm ? `${a.distanceKm}km` : ''}
                            </span>
                          ))}
                        </td>
                        <td className="px-5 py-3 text-center font-mono">{l.openingHours ?? l.openingKm ?? '—'}</td>
                        <td className="px-5 py-3 text-center font-mono">{l.closingHours ?? l.closingKm ?? '—'}</td>
                        <td className="px-5 py-3 text-slate-500">{l.remarks || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Fuel History */}
          {mFuel.length > 0 && (
            <div className="bg-white rounded-3xl border border-slate-100 overflow-hidden shadow-sm">
              <div className="px-6 py-4 border-b border-slate-100">
                <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest">Fuel History — {selectedMachine.name}</h4>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-slate-400 font-black uppercase tracking-widest">
                    <tr>
                      <th className="px-5 py-3 text-left">Date</th>
                      <th className="px-5 py-3 text-center">Liters</th>
                      <th className="px-5 py-3 text-center">Rate ₹</th>
                      <th className="px-5 py-3 text-center">Amount ₹</th>
                      <th className="px-5 py-3 text-center">Hrs/KM</th>
                      <th className="px-5 py-3 text-left">Remarks</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {mFuel.slice(0, 20).map(f => (
                      <tr key={f.id} className="hover:bg-slate-50">
                        <td className="px-5 py-3 font-bold text-slate-700">{f.date}</td>
                        <td className="px-5 py-3 text-center font-black text-emerald-600 font-mono">{f.fuelLiters.toFixed(2)} L</td>
                        <td className="px-5 py-3 text-center font-mono text-slate-500">₹{f.dieselPrice.toFixed(2)}</td>
                        <td className="px-5 py-3 text-center font-black text-amber-700 font-mono">₹{f.amount.toFixed(2)}</td>
                        <td className="px-5 py-3 text-center font-mono text-slate-500">{f.currentHours ?? f.currentKm ?? '—'}</td>
                        <td className="px-5 py-3 text-slate-500">{f.remarks || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-900 text-white">
                    <tr>
                      <td className="px-5 py-3 font-black text-[10px] uppercase tracking-widest">TOTAL</td>
                      <td className="px-5 py-3 text-center font-black text-emerald-400 font-mono">{totalFuelLiters.toFixed(2)} L</td>
                      <td className="px-5 py-3" />
                      <td className="px-5 py-3 text-center font-black text-amber-400 font-mono">₹{totalFuelAmount.toFixed(2)}</td>
                      <td colSpan={2} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {mLogs.length === 0 && mFuel.length === 0 && (
            <div className="py-12 text-center text-slate-300 font-black uppercase tracking-widest text-sm">No logs for this machine yet</div>
          )}
        </>
      )}
    </div>
  );
};

/* ─── TRANSPORT LOGS TAB (main table) ───────────────────────────────── */
const TransportLogsTab: React.FC<{
  logs: MiningLog[];
  trucks: Truck[];
  drivers: Driver[];
  fuelLogs: FuelLog[];
  onAddTrigger?: () => void;
  onBulkUploadTrigger?: () => void;
  onReportTrigger?: () => void;
  onEdit?: (log: MiningLog) => void;
  onDelete?: (id: string) => void;
  onLoadMore?: () => void;
  hasMore?: boolean;
  navParams?: { truckId?: string; date?: string } | null;
  onClearNav?: () => void;
  onUpdateLogs?: (logs: MiningLog[]) => Promise<void>;
  onAddLogs?: (logs: MiningLog[]) => Promise<void>;
  currentUser: any;
  role: string | null;
  masterData: MasterData;
}> = ({ logs, trucks, drivers, fuelLogs, onAddTrigger, onBulkUploadTrigger, onReportTrigger, onEdit, onDelete, onLoadMore, hasMore, navParams, onClearNav, onUpdateLogs, onAddLogs, currentUser, role, masterData }) => {
  const [truckFilter, setTruckFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [materialFilter, setMaterialFilter] = useState('');
  const [supplierFilter, setSupplierFilter] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedGroupKey, setSelectedGroupKey] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // --- BATCH EDIT STATES ---
  const [editingLogId, setEditingLogId] = useState<string | null>(null);
  const [editBuffer, setEditBuffer] = useState<any>({});
  const [isEditingAdjustment, setIsEditingAdjustment] = useState(false);
  const [adjEditValue, setAdjEditValue] = useState('');
  const [isEditingDieselAdj, setIsEditingDieselAdj] = useState(false);
  const [dieselAdjValue, setDieselAdjValue] = useState('0');
  const [dieselAdjType, setDieselAdjType] = useState<'STOCK' | 'OTHER'>('OTHER');
  const [remarksBuffer, setRemarksBuffer] = useState('');
  const [batchEditKey, setBatchEditKey] = useState<string | null>(null);
  const [batchEditBuffer, setBatchEditBuffer] = useState<any>({});
  const [bulkAddCount, setBulkAddCount] = useState<string>('1');
  const [includeExtriInRoll, setIncludeExtriInRoll] = useState(false);

  const calculateBatchFinancials = (trips: number, tripAdj: number) => {
    const adjustedTrips = Math.max(0, trips + tripAdj);
    let welfare = 300; // Always 300 if trips > 0
    let roll = 0;
    
    // As per user request: "300 fixed, plus 100 rs for every trip made"
    // Example: 2 trips = 300 + (2 * 100) = 500 total
    if (adjustedTrips > 0) {
      roll = adjustedTrips * 100;
    } else {
      welfare = 0;
    }
    
    return { welfare, roll };
  };

  React.useEffect(() => {
    if (navParams) {
      if (navParams.truckId) setTruckFilter(navParams.truckId);
      if (navParams.date) setDateFilter(navParams.date);
      onClearNav?.();
    }
  }, [navParams, onClearNav]);

  const aggregatedData = useMemo(() => {
    // 1. Build a fast lookup for dates a truck worked and its stock adjustment for that day.
    const truckWorkingDates: Record<string, Set<string>> = {};
    const truckStockAdjs: Record<string, number> = {};
    
    logs.forEach(l => {
        if (!l.date || !l.truckId) return;
        if (!truckWorkingDates[l.truckId]) truckWorkingDates[l.truckId] = new Set();
        truckWorkingDates[l.truckId].add(l.date);
        
        if (l.dieselAdjType === 'STOCK' && l.dieselAdjustment) {
           truckStockAdjs[`${l.truckId}_${l.date}`] = l.dieselAdjustment;
        }
    });
    
    // 2. Helper to find previous working day stock
    const getPreviousStock = (truckId: string, currentDate: string) => {
        const dates = Array.from(truckWorkingDates[truckId] || []).filter(d => d < currentDate).sort((a, b) => b.localeCompare(a));
        if (dates.length > 0) {
            const prevDate = dates[0];
            return truckStockAdjs[`${truckId}_${prevDate}`] || 0;
        }
        return 0;
    };

    const groups: Record<string, any> = {};
    logs.forEach(log => {
      if (!log.date) return;

      // Search term filtering
      const searchStr = `${log.chalanNo} ${log.customerName} ${log.supplier || ''} ${trucks.find(t => t.id === log.truckId)?.plateNumber || ''}`.toLowerCase();
      if (searchTerm && !searchStr.includes(searchTerm.toLowerCase())) return;

      // Dropdown filters
      if (materialFilter && log.material !== materialFilter) return;
      if (supplierFilter && log.supplier !== supplierFilter) return;
      if (truckFilter && log.truckId !== truckFilter) return;
      if (dateFilter && log.date !== dateFilter) return;

      const truck = trucks.find(t => t.id === log.truckId);
      const key = `${log.date}_${log.truckId}_${log.type}`;
      if (!groups[key]) {
        const recordedDieselLog = fuelLogs.find(f => f.truckId === log.truckId && f.attributionDate === log.date);
        const driver = drivers.find(d => d.id === log.driverId);
        groups[key] = {
          key, date: log.date, truckId: log.truckId,
          plateNumber: truck?.plateNumber || 'Unknown',
          wheelConfig: truck?.wheelConfig || '',
          type: log.type,
          entries: 0, netWeight: 0,
          totalDiesel: recordedDieselLog ? (recordedDieselLog.fuelLiters || 0) : 0,
          diesel: recordedDieselLog ? (recordedDieselLog.fuelLiters || 0) : 0,
          syncedDriver: driver?.name || null,
          syncedDriverId: driver?.id || null,
          syncedRate: recordedDieselLog?.dieselPrice || 90.55,
          fillingTypes: recordedDieselLog?.entryType?.toLowerCase() || 'per trip',
          actualFuelDate: recordedDieselLog?.date || null,
          advanceFromYesterday: getPreviousStock(log.truckId, log.date),
          tripAdjustment: 0,
          dieselAdjustment: 0,
          airAdjustment: 0,
          tripRemarks: '', dieselRemarks: '', airRemarks: '',
          staffWelfare: 0, rollAmount: 0, totalPayable: 0,
          totalShortage: 0,
          logs: []
        };
      }
      groups[key].entries += 1;
      groups[key].netWeight += (log.net || (log.gross - log.tare) || 0);

      if (log.adjustment) groups[key].tripAdjustment = log.adjustment;
      if (log.dieselAdjustment) groups[key].dieselAdjustment = log.dieselAdjustment;
      if (log.airAdjustment) groups[key].airAdjustment = log.airAdjustment;
      if (log.tripRemarks) groups[key].tripRemarks = log.tripRemarks;
      if (log.dieselRemarks) groups[key].dieselRemarks = log.dieselRemarks;
      if (log.airRemarks) groups[key].airRemarks = log.airRemarks;

      groups[key].staffWelfare += (log.staffWelfare || 0);
      groups[key].rollAmount += (log.rollAmount || 0);
      groups[key].totalPayable += ((log.staffWelfare || 0) + (log.rollAmount || 0));
      groups[key].totalShortage += (log.shortageWt || 0);

      groups[key].logs.push(log);
    });

    return Object.values(groups)
      .filter(g => {
        if (role !== 'ADMIN') return g.logs.some((l: any) => l.agentId === currentUser?.username);
        return true;
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [logs, truckFilter, dateFilter, materialFilter, supplierFilter, searchTerm, trucks, fuelLogs, role, currentUser]);

  const selectedGroup = aggregatedData.find(g => g.key === selectedGroupKey);

  const startBatchEdit = (group: any) => {
    setBatchEditKey(group.key);
    setBatchEditBuffer({
      date: group.date,
      driverId: group.syncedDriverId || ''
    });
  };

  const handleSaveBatchEdit = async () => {
    const group = aggregatedData.find((g: any) => g.key === batchEditKey);
    if (group && onUpdateLogs) {
      const { welfare, roll } = calculateBatchFinancials(group.logs.length, group.tripAdjustment);
      
      const updatedLogs = group.logs.map((log: any, i: number) => ({
        ...log,
        date: batchEditBuffer.date,
        driverId: batchEditBuffer.driverId || null,
        staffWelfare: i === 0 ? welfare : 0,
        rollAmount: i === 0 ? roll : 0
      }));

      await onUpdateLogs(updatedLogs);
      setBatchEditKey(null);
    }
  };

  const handleUpdateAdjustment = async (field: 'trip' | 'stock' | 'air') => {
    if (!selectedGroup || !onUpdateLogs) return;
    if (!remarksBuffer.trim()) {
      alert("Remarks are mandatory.");
      return;
    }

    const newTripAdj = field === 'trip' ? (parseFloat(adjEditValue) || 0) : selectedGroup.tripAdjustment;
    const { welfare, roll } = calculateBatchFinancials(selectedGroup.logs.length, newTripAdj);

    const updatedLogs = selectedGroup.logs.map((log: any, i: number) => {
      let updates: any = {};
      if (field === 'trip') updates = { adjustment: newTripAdj, tripRemarks: remarksBuffer };
      if (field === 'stock') updates = { dieselAdjustment: parseFloat(dieselAdjValue) || 0, dieselAdjType: 'STOCK', dieselRemarks: remarksBuffer };
      if (field === 'air') updates = { airAdjustment: parseFloat(dieselAdjValue) || 0, airRemarks: remarksBuffer };
      
      updates.staffWelfare = i === 0 ? welfare : 0;
      updates.rollAmount = i === 0 ? roll : 0;
      
      return { ...log, ...updates };
    });

    if (onUpdateLogs) {
      await onUpdateLogs(updatedLogs);
    }

    setIsEditingAdjustment(false);
    setIsEditingDieselAdj(false);
    setRemarksBuffer('');
  };

  const startInlineEdit = (log: MiningLog) => {
    setEditingLogId(log.id);
    setEditBuffer({ ...log });
  };

  const saveInlineEdit = async () => {
    if (editingLogId && onUpdateLogs && editBuffer.id && selectedGroup) {
      const updatePayload = { ...(editBuffer as MiningLog) };
      
      // Calculate net from loading/unloading
      updatePayload.net = Number(editBuffer.unloadingNetWt) || Number(editBuffer.loadingNetWt) || Number(editBuffer.net) || (Math.max(0, (Number(editBuffer.gross) || 0) - (Number(editBuffer.tare) || 0)));
      
      // Calculate shortage
      if (editBuffer.loadingNetWt && editBuffer.unloadingNetWt) {
         updatePayload.shortageWt = Number(editBuffer.loadingNetWt) - Number(editBuffer.unloadingNetWt);
      }

      const { welfare, roll } = calculateBatchFinancials(selectedGroup.logs.length, selectedGroup.tripAdjustment);
      
      const updatedLogs = selectedGroup.logs.map((l: MiningLog, i: number) => {
        let base = l.id === editingLogId ? updatePayload : l;
        return { 
          ...base, 
          staffWelfare: i === 0 ? welfare : 0, 
          rollAmount: i === 0 ? roll : 0 
        };
      });
      
      await onUpdateLogs(updatedLogs);
      setEditingLogId(null);
    }
  };

  const handleBulkAddRows = async () => {
    const count = parseInt(bulkAddCount);
    if (isNaN(count) || count <= 0 || !selectedGroup || !onAddLogs) return;
    
    const { welfare, roll } = calculateBatchFinancials(selectedGroup.logs.length + count, selectedGroup.tripAdjustment);
    
    const newLogs: MiningLog[] = Array.from({ length: count }).map((_, i) => ({
      id: crypto.randomUUID(),
      type: selectedGroup.type,
      date: selectedGroup.date,
      time: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
      chalanNo: selectedGroup.logs[0]?.chalanNo || '',
      customerName: selectedGroup.logs[0]?.customerName || '',
      royaltyPassNo: '',
      truckId: selectedGroup.truckId,
      driverId: selectedGroup.syncedDriverId || null,
      cartingAgent: selectedGroup.logs[0]?.cartingAgent || '',
      loader: selectedGroup.logs[0]?.loader || '',
      material: selectedGroup.logs[0]?.material || '',
      gross: 0, tare: 0, net: 0,
      dieselLiters: 0,
      dieselAdjustment: selectedGroup.dieselAdjustment,
      dieselAdjType: selectedGroup.dieselAdjType,
      dieselRate: selectedGroup.syncedRate,
      tripRemarks: selectedGroup.tripRemarks,
      dieselRemarks: selectedGroup.dieselRemarks,
      airRemarks: selectedGroup.airRemarks,
      adjustment: selectedGroup.tripAdjustment,
      airAdjustment: selectedGroup.airAdjustment,
      staffWelfare: 0, rollAmount: 0 
    }));

    const updatedFirstLog = { ...selectedGroup.logs[0], staffWelfare: welfare, rollAmount: roll };
    const cleanedOtherExistingLogs = selectedGroup.logs.slice(1).map((l: any) => ({ ...l, staffWelfare: 0, rollAmount: 0 }));
    
    if (selectedGroup.logs.length === 0) {
      newLogs[0].staffWelfare = welfare;
      newLogs[0].rollAmount = roll;
      await onAddLogs(newLogs);
    } else if (onUpdateLogs) {
      await onUpdateLogs([updatedFirstLog, ...cleanedOtherExistingLogs]);
      await onAddLogs(newLogs);
    }
    setBulkAddCount('1');
  };

  return (
    <div className="space-y-6">
      {/* Enhanced Toolbar */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-4 rounded-3xl border border-slate-100 shadow-sm">
          <div className="flex-1 w-full relative">
            <input 
              type="text" 
              placeholder="Search by Chalan, Customer, Vehicle..." 
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold shadow-sm outline-none focus:ring-2 focus:ring-amber-500 transition-all"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">🔍</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={onAddTrigger} className="bg-amber-500 hover:bg-amber-600 text-white px-5 py-2.5 rounded-xl font-black text-xs uppercase shadow-md transition-all active:scale-95">
              + New Entry
            </button>
            <button onClick={onReportTrigger} className="bg-slate-900 hover:bg-black text-white px-5 py-2.5 rounded-xl font-black text-xs uppercase shadow-md transition-all active:scale-95 flex items-center gap-2">
              📊 Generate Reports
            </button>
            <button onClick={onBulkUploadTrigger} className="px-5 py-2.5 bg-slate-100 text-slate-600 border border-slate-200 rounded-xl font-black text-xs uppercase hover:bg-slate-200 transition-all active:scale-95">
              + Bulk Import
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-2xl border border-slate-100 shadow-sm">
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Filters:</span>
            <select className="bg-transparent text-xs font-black outline-none border-none"
              value={truckFilter} onChange={e => setTruckFilter(e.target.value)}>
              <option value="">All Vehicles</option>
              {trucks.filter(t => t.fleetType === 'MINING').map(t => <option key={t.id} value={t.id}>{t.plateNumber}</option>)}
            </select>
            <div className="w-px h-4 bg-slate-200" />
            <select className="bg-transparent text-xs font-black outline-none border-none"
              value={materialFilter} onChange={e => setMaterialFilter(e.target.value)}>
              <option value="">All Materials</option>
              {masterData.materials.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            <div className="w-px h-4 bg-slate-200" />
            <select className="bg-transparent text-xs font-black outline-none border-none"
              value={supplierFilter} onChange={e => setSupplierFilter(e.target.value)}>
              <option value="">All Suppliers</option>
              {masterData.suppliers.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <div className="w-px h-4 bg-slate-200" />
            <input type="date" className="bg-transparent text-xs font-black outline-none border-none"
              value={dateFilter} onChange={e => setDateFilter(e.target.value)} />
            {(truckFilter || dateFilter || materialFilter || supplierFilter || searchTerm) && (
              <button onClick={() => { setTruckFilter(''); setDateFilter(''); setMaterialFilter(''); setSupplierFilter(''); setSearchTerm(''); }}
                className="ml-2 text-[9px] font-black text-amber-600 hover:text-amber-700 uppercase">
                Reset
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[11px]">
            <thead className="bg-slate-900 text-slate-300 font-black uppercase tracking-widest">
              <tr>
                <th className="px-5 py-4">Date</th>
                <th className="px-5 py-4">Vehicle</th>
                <th className="px-5 py-4 text-center">Type</th>
                <th className="px-5 py-4 text-center">Trips</th>
                <th className="px-5 py-4 text-center">Net Wt (MT)</th>
                <th className="px-5 py-4 text-center">Diesel</th>
                <th className="px-5 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {aggregatedData.map(group => (
                <tr key={group.key} className="hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-4 font-bold text-slate-600">{group.date}</td>
                  <td className="px-5 py-4 font-black text-slate-900 font-mono text-sm">{group.plateNumber}</td>
                  <td className="px-5 py-4 text-center">
                    <span className={`text-[9px] font-black px-2 py-1 rounded-lg ${group.type === 'DISPATCH' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                      {group.type}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-center font-bold text-amber-700">{group.entries}</td>
                  <td className="px-5 py-4 text-center font-mono font-bold">{(group.netWeight || 0).toFixed(3)}</td>
                  <td className="px-5 py-4 text-center text-emerald-600 font-black">{(group.totalDiesel || 0).toFixed(2)} L</td>
                  <td className="px-5 py-4 text-right">
                    <button onClick={() => setSelectedGroupKey(group.key)}
                      className="bg-amber-50 text-amber-600 px-3 py-1.5 rounded-lg hover:bg-amber-100 font-black uppercase text-[9px] transition-all">
                      Details
                    </button>
                  </td>
                </tr>
              ))}
              {aggregatedData.length === 0 && (
                <tr><td colSpan={7} className="py-16 text-center font-black text-slate-300 uppercase tracking-widest">No mining records found</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {hasMore && (
          <div className="p-6 text-center border-t border-slate-50">
            <button onClick={onLoadMore} className="px-8 py-3 bg-white border border-slate-200 text-slate-600 rounded-xl font-black uppercase text-[10px] tracking-widest shadow-sm hover:bg-slate-900 hover:text-white transition-all">
              Load More Records
            </button>
          </div>
        )}
      </div>

      {/* Batch Edit Header Modal */}
      {batchEditKey && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[400] flex items-center justify-center p-4 animate-fadeIn no-print">
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-md overflow-hidden animate-scaleIn">
            <div className="bg-slate-900 p-8 text-white flex justify-between items-center">
              <h3 className="text-xl font-black uppercase tracking-tight">Batch Header Update</h3>
              <button onClick={() => setBatchEditKey(null)} className="text-white hover:text-amber-500 text-2xl font-light">&times;</button>
            </div>
            <div className="p-8 space-y-6">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Production Date</label>
                <input type="date" className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none" value={batchEditBuffer.date} onChange={e => setBatchEditBuffer({...batchEditBuffer, date: e.target.value})} />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Operator</label>
                <select className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none" value={batchEditBuffer.driverId} onChange={e => setBatchEditBuffer({...batchEditBuffer, driverId: e.target.value})}>
                  <option value="">Select Operator...</option>
                  {drivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <button onClick={handleSaveBatchEdit} className="w-full py-5 bg-amber-500 text-white rounded-2xl font-black uppercase shadow-xl hover:bg-amber-600 transition-all border-b-4 border-amber-700">Apply to All Trips</button>
            </div>
          </div>
        </div>
      )}

      {/* Batch Detail Modal (Advanced View) */}
      {selectedGroup && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[300] flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fadeIn no-print overflow-y-auto" onClick={(e) => { if (e.target === e.currentTarget) setSelectedGroupKey(null); }}>
          <div className="bg-white rounded-t-[2.5rem] sm:rounded-[2.5rem] shadow-2xl w-full max-w-7xl max-h-[90vh] sm:max-h-[95vh] flex flex-col animate-slideUp sm:animate-scaleIn sm:my-8 overflow-hidden">
            <div className="bg-slate-900 p-6 sm:p-8 text-white flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shrink-0">
              <div className="flex flex-col sm:flex-row sm:items-center gap-4 w-full sm:w-auto">
                <div>
                  <h3 className="text-xl font-black font-mono tracking-tight">
                    {selectedGroup.plateNumber} Batch Detail 
                    <span className={`ml-4 text-[10px] font-black px-2 py-1 rounded-md uppercase tracking-widest ${selectedGroup.type === 'DISPATCH' ? 'bg-amber-500/20 text-amber-400' : 'bg-emerald-500/20 text-emerald-400'}`}>{selectedGroup.type}</span>
                    <span className="ml-0 sm:ml-4 block sm:inline text-amber-500 opacity-60 text-sm">[{selectedGroup.date}]</span>
                  </h3>
                  <p className="text-xs text-rose-400 font-black uppercase tracking-[0.2em] mt-1 italic">diesel filling type: {selectedGroup.fillingTypes || 'per trip'}</p>
                </div>
                <div className={`px-4 py-1.5 rounded-xl border flex items-center gap-2 self-start ${selectedGroup.syncedDriver ? 'bg-emerald-500/10 border-emerald-500 text-emerald-400' : 'bg-rose-500/10 border-rose-500 text-rose-400 animate-pulse'}`}>
                    <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Operator:</span>
                    <span className="text-[10px] font-black uppercase tracking-tight">{selectedGroup.syncedDriver || 'SYNC PENDING'}</span>
                </div>
              </div>
              <div className="flex items-center justify-between w-full sm:w-auto gap-4">
                 <div className="flex bg-white/10 p-1.5 rounded-2xl border border-white/10 shadow-inner">
                    <input type="number" placeholder="Qty" className="bg-transparent text-white px-3 py-1 text-xs outline-none w-12 sm:w-16 font-bold" value={bulkAddCount} onChange={e => setBulkAddCount(e.target.value)} />
                    <button onClick={handleBulkAddRows} className="bg-white text-slate-900 px-4 sm:px-6 py-2 rounded-xl text-[10px] font-black uppercase hover:bg-amber-400 transition-colors">ADD TRIPS</button>
                 </div>
                  <button onClick={() => { onAddTrigger?.(selectedGroup.truckId, selectedGroup.date, selectedGroup.logs[0]?.driverId); }} className="px-5 py-2.5 bg-slate-100 text-slate-600 border border-slate-200 rounded-xl font-black text-[10px] uppercase hover:bg-slate-200 transition-all active:scale-95">
                    + NEW TRIP
                  </button>
                 <button onClick={() => { setSelectedGroupKey(null); setEditingLogId(null); setIsEditingAdjustment(false); setIsEditingDieselAdj(false); setConfirmDeleteId(null); }} className="text-white hover:text-amber-500 text-3xl font-light px-2 transition-colors">&times;</button>
              </div>
            </div>
            
            <div className="p-4 sm:p-8 overflow-y-auto border-b border-slate-100 flex-1">
              <div className="overflow-x-auto">
              <table className="w-full text-left text-xs min-w-[800px]">
                <thead className="bg-slate-50 border-b border-slate-100 font-black text-slate-400 uppercase tracking-widest">
                  <tr>
                    <th className="px-5 py-4 w-12">#</th>
                    <th className="px-5 py-4">Chalan / Material</th>
                    <th className="px-5 py-4">Customer</th>
                    <th className="px-5 py-4 text-center">Gross (MT)</th>
                    <th className="px-5 py-4 text-center">Tare (MT)</th>
                    <th className="px-5 py-4 text-center">Net (MT)</th>
                    <th className="px-5 py-4 text-center">Shortage</th>
                    <th className="px-5 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                   {selectedGroup.logs.map((log: MiningLog, idx: number) => {
                    const isEditing = editingLogId === log.id;
                    const isConfirmingDelete = confirmDeleteId === log.id;
                    const logGross = log.unloadingGrossWt || log.loadingGrossWt || log.gross || 0;
                    const logTare = log.unloadingTareWt || log.loadingTareWt || log.tare || 0;
                    const logNet = log.unloadingNetWt || log.loadingNetWt || log.net || 0;
                    
                    return (
                      <tr key={log.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                        <td className="px-5 py-4 text-center text-[10px] font-black text-slate-300">{idx + 1}.</td>
                        <td className="px-5 py-4">
                           <div className="flex flex-col gap-0.5">
                              <span className="font-black text-amber-600 uppercase tracking-wider font-mono">{log.chalanNo}</span>
                              <span className="text-[10px] font-bold text-slate-500 uppercase">{log.material}</span>
                           </div>
                        </td>
                        <td className="px-5 py-4 text-slate-600 font-bold whitespace-nowrap overflow-hidden text-ellipsis max-w-[150px]" title={log.customerName}>{log.customerName}</td>
                        <td className="px-5 py-4 text-center">
                           <span className="font-mono font-bold text-slate-700">{logGross.toFixed(3)}</span>
                        </td>
                        <td className="px-5 py-4 text-center">
                           <span className="font-mono font-bold text-slate-400">{logTare.toFixed(3)}</span>
                        </td>
                        <td className="px-5 py-4 text-center font-black text-slate-900 font-mono text-sm">
                          {logNet.toFixed(3)}
                        </td>
                        <td className="px-5 py-4 text-center">
                          {log.shortageWt != null ? (
                            <span className={`font-black font-mono ${log.shortageWt > 0.01 ? 'text-rose-600' : 'text-emerald-600'}`}>
                              {log.shortageWt.toFixed(3)}
                            </span>
                          ) : '—'}
                        </td>
                        <td className="px-5 py-4 text-right">
                           {isConfirmingDelete ? (
                             <div className="flex justify-end items-center gap-2">
                               <span className="text-[8px] font-black text-rose-600 uppercase">Confirm?</span>
                               <button onClick={() => { onDelete?.(log.id); setConfirmDeleteId(null); }} className="bg-rose-500 text-white px-2 py-1 rounded text-[8px] font-black uppercase">Yes</button>
                               <button onClick={() => setConfirmDeleteId(null)} className="text-slate-400 text-[8px] font-black uppercase">No</button>
                             </div>
                           ) : (
                             <div className="flex justify-end gap-3 items-center">
                                <button onClick={() => startInlineEdit(log)} className="text-blue-500 font-black text-[9px] uppercase tracking-widest">Edit</button>
                                <button onClick={() => setConfirmDeleteId(log.id)} className="text-rose-500 font-black text-[9px] uppercase tracking-widest">Delete</button>
                             </div>
                           )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
            </div>

            <div className="p-4 bg-slate-50 flex flex-col gap-4 shrink-0 safe-pb">
               <div className="flex flex-col xl:flex-row justify-between items-center gap-2">
                 <div className="grid grid-cols-2 lg:grid-cols-6 gap-2 w-full items-stretch">
                    <div className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-sm flex flex-col items-center justify-center">
                        <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-0.5 font-mono">NET (MT)</span>
                        <span className="text-xl font-black text-slate-900">{(selectedGroup.netWeight || 0).toFixed(3)}</span>
                        <span className="text-[7px] font-black text-slate-400 uppercase tracking-tighter mt-1">TOTAL</span>
                    </div>

                    <div className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-sm flex flex-col items-center justify-center relative group">
                      <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-0.5 font-mono">TRIPS</span>
                      <div className="flex items-baseline gap-1">
                        <span className="text-xl font-black text-amber-600">{selectedGroup.entries}</span>
                        {selectedGroup.tripAdjustment !== 0 && (
                          <span className="text-[10px] font-bold text-slate-400">({selectedGroup.tripAdjustment > 0 ? '+' : ''}{selectedGroup.tripAdjustment})</span>
                        )}
                      </div>
                      <span className="text-[7px] font-black text-slate-400 uppercase tracking-tighter mt-1">TOTAL: {selectedGroup.entries + selectedGroup.tripAdjustment}</span>
                    </div>
                    
                    <div className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-sm flex flex-col items-center justify-center">
                        <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-0.5 font-mono">PER TRIP TONNAGE AVG (MT)</span>
                        <span className="text-xl font-black text-slate-900">{(selectedGroup.netWeight / Math.max(1, selectedGroup.entries)).toFixed(3)}</span>
                        <span className="text-[7px] font-black text-slate-400 uppercase tracking-tighter mt-1">AVG: {(selectedGroup.netWeight / Math.max(1, selectedGroup.entries)).toFixed(3)}</span>
                    </div>

                    <div className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-sm flex flex-col items-center justify-center">
                        <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-0.5 font-mono text-center">SHORTAGE (MT)</span>
                        <span className={`text-xl font-black ${selectedGroup.totalShortage > 0.05 ? 'text-rose-600' : 'text-slate-400'}`}>{selectedGroup.totalShortage.toFixed(3)}</span>
                        <span className="text-[7px] font-black text-slate-400 uppercase mt-1 tracking-tighter">TOTAL SHORTAGE</span>
                    </div>

                    <div className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-sm flex flex-col items-center justify-center">
                        <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-0.5 font-mono text-center">PER TRIP DIESEL AVG</span>
                        <span className="text-xl font-black text-emerald-600">{( (selectedGroup.diesel + selectedGroup.advanceFromYesterday - selectedGroup.dieselAdjustment - selectedGroup.airAdjustment) / Math.max(1, selectedGroup.entries) ).toFixed(3)} L</span>
                        <span className="text-[7px] font-black text-slate-400 uppercase mt-1 tracking-tighter">PER TRIP</span>
                    </div>

                    <div className={`p-3 rounded-xl border transition-all flex flex-col ${isEditingAdjustment ? 'bg-amber-50 border-amber-400 ring-2 ring-amber-200' : 'bg-white border-slate-200 shadow-sm'}`}>
                      <div className="flex justify-between w-full items-center mb-2">
                          <span className="text-[9px] font-black text-amber-600 uppercase tracking-widest">TRIP ADJ</span>
                          {!isEditingAdjustment && <button onClick={() => { setIsEditingAdjustment(true); setAdjEditValue(selectedGroup.tripAdjustment.toString()); setRemarksBuffer(selectedGroup.tripRemarks); }} className="text-[8px] font-black text-blue-600 uppercase hover:underline bg-blue-50 px-2 py-1 rounded-md">EDIT</button>}
                      </div>
                      {isEditingAdjustment ? (
                        <div className="space-y-3 animate-fadeIn w-full">
                          <div className="space-y-1">
                            <label className="text-[8px] font-black text-amber-700 uppercase ml-1">Adjustment Value</label>
                            <input type="number" autoFocus className="w-full bg-white border border-amber-300 rounded-xl px-3 py-2 text-sm font-black outline-none focus:ring-2 focus:ring-amber-500 shadow-sm" value={adjEditValue} onChange={e => setAdjEditValue(e.target.value)} />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[8px] font-black text-amber-700 uppercase ml-1">Reason / Remarks</label>
                            <input type="text" className="w-full bg-white border border-amber-200 rounded-xl px-3 py-2 text-[11px] font-bold outline-none focus:ring-2 focus:ring-amber-500 shadow-sm" value={remarksBuffer} onChange={e => setRemarksBuffer(e.target.value)} placeholder="Why is this change needed?" />
                          </div>
                          <div className="flex gap-2 pt-1">
                            <button onClick={() => handleUpdateAdjustment('trip')} disabled={!remarksBuffer.trim()} className="flex-1 bg-amber-600 text-white py-2.5 rounded-xl text-[10px] font-black uppercase shadow-md hover:bg-amber-700 transition-all disabled:opacity-50">SAVE</button>
                            <button onClick={() => setIsEditingAdjustment(false)} className="px-4 bg-white border border-slate-200 text-slate-500 py-2.5 rounded-xl text-[10px] font-black uppercase hover:bg-slate-50 transition-all">CANCEL</button>
                          </div>
                        </div>
                      ) : (
                          <div className="h-full flex items-center justify-center py-2">
                            <span className={`${selectedGroup.tripAdjustment !== 0 ? 'text-amber-600' : 'text-slate-300'} text-3xl font-black`}>
                              {selectedGroup.tripAdjustment > 0 ? `+${selectedGroup.tripAdjustment}` : selectedGroup.tripAdjustment}
                            </span>
                          </div>
                      )}
                    </div>

                    <div className={`p-3 rounded-xl border transition-all flex flex-col ${isEditingDieselAdj ? 'bg-emerald-50 border-emerald-400 ring-2 ring-emerald-200' : 'bg-white border-slate-200 shadow-sm'}`}>
                      <div className="flex justify-between w-full items-center mb-2">
                          <span className="text-[9px] font-black text-emerald-600 uppercase tracking-widest font-mono">NET DIESEL</span>
                          {!isEditingDieselAdj && <button onClick={() => { setIsEditingDieselAdj(true); setDieselAdjValue('0'); setRemarksBuffer(''); setDieselAdjType('OTHER'); }} className="text-[8px] font-black text-blue-600 uppercase hover:underline bg-blue-50 px-2 py-1 rounded-md">ADJ</button>}
                      </div>
                      {isEditingDieselAdj ? (
                        <div className="space-y-3 animate-fadeIn w-full">
                           <div className="grid grid-cols-2 gap-2">
                             <div className="space-y-1">
                               <label className="text-[8px] font-black text-emerald-700 uppercase ml-1">Type</label>
                               <select className="w-full bg-white border border-emerald-300 rounded-xl px-2 py-2 text-[10px] font-black outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm" value={dieselAdjType} onChange={e => setDieselAdjType(e.target.value as any)}>
                                  <option value="STOCK">Stock</option>
                                  <option value="OTHER">Correction</option>
                               </select>
                             </div>
                             <div className="space-y-1">
                               <label className="text-[8px] font-black text-emerald-700 uppercase ml-1">Liters</label>
                               <input type="number" step="0.001" autoFocus className="w-full bg-white border border-emerald-300 rounded-xl px-3 py-2 text-sm font-black outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm" value={dieselAdjValue} onChange={e => setDieselAdjValue(e.target.value)} />
                             </div>
                           </div>
                           <div className="space-y-1">
                             <label className="text-[8px] font-black text-emerald-700 uppercase ml-1">Reason / Remarks</label>
                             <input type="text" className="w-full bg-white border border-emerald-200 rounded-xl px-3 py-2 text-[10px] font-bold outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm" value={remarksBuffer} onChange={e => setRemarksBuffer(e.target.value)} placeholder="Describe the adjustment..." />
                           </div>
                           <div className="flex gap-2 pt-1">
                             <button onClick={() => handleUpdateAdjustment(dieselAdjType === 'STOCK' ? 'stock' : 'air')} disabled={!remarksBuffer.trim()} className="flex-1 bg-emerald-600 text-white py-2.5 rounded-xl text-[10px] font-black uppercase shadow-md hover:bg-emerald-700 transition-all disabled:opacity-50">SAVE</button>
                             <button onClick={() => setIsEditingDieselAdj(false)} className="px-4 bg-white border border-slate-200 text-slate-500 py-2.5 rounded-xl text-[10px] font-black uppercase hover:bg-slate-50 transition-all">CANCEL</button>
                           </div>
                        </div>
                      ) : (
                          <div className="h-full flex items-center justify-center py-2">
                            <span className="text-3xl font-black text-emerald-600">{(selectedGroup.diesel + selectedGroup.advanceFromYesterday - selectedGroup.dieselAdjustment - selectedGroup.airAdjustment).toFixed(3)}<span className="text-sm font-bold ml-1 opacity-60 text-emerald-500">L</span></span>
                          </div>
                      )}
                    </div>
                  </div>

                  <button 
                    onClick={async () => {
                      // Final save before close to ensure consistency
                      if (selectedGroup && selectedGroup.logs.length > 0 && onUpdateLogs) {
                        const { welfare, roll } = calculateBatchFinancials(selectedGroup.logs.length, selectedGroup.tripAdjustment);
                        const updatedFirstLog = { ...selectedGroup.logs[0], staffWelfare: welfare, rollAmount: roll };
                        const cleanedOtherLogs = selectedGroup.logs.slice(1).map((l: any) => ({ ...l, staffWelfare: 0, rollAmount: 0 }));
                        
                        await onUpdateLogs([updatedFirstLog, ...cleanedOtherLogs]);
                      }
                      setSelectedGroupKey(null);
                    }} 
                    className="bg-slate-900 text-white rounded-xl font-black uppercase shadow-xl hover:bg-black transition-all min-h-[60px] flex items-center justify-center p-2.5"
                  >
                    <div className="flex flex-col items-center leading-tight tracking-[0.2em]">
                       <span className="text-[10px] font-black">SAVE AND CLOSE</span>
                    </div>
                  </button>
                </div>
              </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-2">
                  <div className="bg-white border border-slate-200 rounded-xl p-3 flex flex-col gap-2 shadow-sm">
                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-[0.2em] border-b border-slate-50 pb-1">DIESEL MOVEMENT TRIAL</p>
                    <div className="space-y-1.5 font-mono">
                       <div className="flex justify-between items-center text-[10px] font-bold">
                          <span className="text-slate-500 uppercase">Opening Stock</span>
                          <span className="text-slate-900">(+) {selectedGroup.advanceFromYesterday.toFixed(3)} L</span>
                       </div>
                       <div className="flex justify-between items-center text-[10px] font-bold">
                          <span className="text-slate-500 uppercase">Today's Pump</span>
                          <span className="text-slate-900">(+) {selectedGroup.diesel.toFixed(3)} L</span>
                       </div>
                       {(selectedGroup.dieselAdjustment > 0 || selectedGroup.airAdjustment > 0) && (
                         <div className="flex justify-between items-center text-[10px] font-bold">
                            <span className="text-rose-500 uppercase">Adjustments</span>
                            <span className="text-rose-500">(-) {(selectedGroup.dieselAdjustment + selectedGroup.airAdjustment).toFixed(3)} L</span>
                         </div>
                       )}
                       <div className="pt-1.5 border-t border-slate-100 flex justify-between items-center">
                          <span className="text-[9px] font-black text-emerald-600 uppercase">Net Consumed</span>
                          <span className="text-sm font-black text-emerald-600">{(selectedGroup.diesel + selectedGroup.advanceFromYesterday - selectedGroup.dieselAdjustment - selectedGroup.airAdjustment).toFixed(3)} L</span>
                       </div>
                    </div>
                  </div>

                  <div className="bg-white border border-slate-200 rounded-xl p-3 flex flex-col gap-2 shadow-sm lg:col-span-2">
                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-[0.2em] border-b border-slate-50 pb-1">PAYABLE & AUDIT TRAIL</p>
                    <div className="flex flex-col gap-2">
                        {/* Role-based Visibility for Financials */}
                        {(role === 'ADMIN' || (currentUser && currentUser.username === 'admin')) && (
                          <div className="flex items-center gap-6">
                              <div className="flex flex-col">
                                  <span className="text-[8px] font-black text-slate-400 uppercase">Staff Welfare</span>
                                  <span className="text-xs font-black text-slate-700">₹{selectedGroup.staffWelfare}</span>
                              </div>
                              <div className="flex flex-col">
                                  <span className="text-[8px] font-black text-slate-400 uppercase">Roll Amount</span>
                                  <span className="text-xs font-black text-slate-700">₹{selectedGroup.rollAmount}</span>
                              </div>
                              <div className="flex flex-col bg-slate-900 px-3 py-1 rounded-lg">
                                  <span className="text-[8px] font-black text-slate-400 uppercase">Total Payable</span>
                                  <span className="text-xs font-black text-white">₹{selectedGroup.totalPayable}</span>
                              </div>
                          </div>
                        )}
                        <div className="flex flex-wrap gap-x-6 gap-y-1">
                           {selectedGroup.advanceFromYesterday !== 0 && (
                             <span className={`text-[8px] font-black uppercase italic ${selectedGroup.advanceFromYesterday > 0 ? 'text-blue-600' : 'text-rose-600'}`}>
                               • STOCK {selectedGroup.advanceFromYesterday > 0 ? 'ADVANCE' : 'DEDUCTION'}: "{Math.abs(selectedGroup.advanceFromYesterday)}L from previous working day"
                             </span>
                           )}
                           {selectedGroup.tripRemarks && (
                             <span className="text-[8px] font-black text-amber-600 uppercase italic">• TRIP BALANCING: "{selectedGroup.tripRemarks}"</span>
                           )}
                           {selectedGroup.dieselRemarks && (
                             <span className="text-[8px] font-black text-emerald-600 uppercase italic">• DIESEL ADJUSTMENT: "{selectedGroup.dieselRemarks}"</span>
                           )}
                           {selectedGroup.airRemarks && (
                             <span className="text-[8px] font-black text-rose-600 uppercase italic">• AIR ADJUSTMENT: "{selectedGroup.airRemarks}"</span>
                           )}
                           {!(selectedGroup.advanceFromYesterday > 0 || selectedGroup.tripRemarks || selectedGroup.dieselRemarks || selectedGroup.airRemarks) && (
                             <p className="text-[8px] font-black text-slate-300 italic uppercase tracking-wider">Zero operational adjustments logged.</p>
                           )}
                        </div>
                    </div>
                  </div>
                </div>
          </div>
        </div>
      )}

      {/* Inline Trip Edit Modal */}
      {editingLogId && editBuffer && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[400] flex items-center justify-center p-4 animate-fadeIn no-print">
          <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-lg overflow-hidden animate-scaleIn flex flex-col max-h-[90vh]">
            <div className="bg-slate-900 p-6 text-white flex justify-between items-center shrink-0">
              <h3 className="text-lg font-black uppercase tracking-widest">Edit Trip Log</h3>
              <button onClick={() => setEditingLogId(null)} className="text-white hover:text-amber-500 text-2xl font-light">&times;</button>
            </div>
            
            <div className="p-6 overflow-y-auto space-y-4">
               {/* Core Identifiers */}
               <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                     <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Chalan No</label>
                     <input type="text" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold outline-none uppercase" value={editBuffer.chalanNo || ''} onChange={e => setEditBuffer({...editBuffer, chalanNo: e.target.value})} />
                  </div>
                  <div className="space-y-1">
                     <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Material</label>
                     <select className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold outline-none uppercase" value={editBuffer.material || ''} onChange={e => setEditBuffer({...editBuffer, material: e.target.value})}>
                        {masterData.materials.map(m => <option key={m} value={m}>{m}</option>)}
                     </select>
                  </div>
               </div>
               
               {/* Parties */}
               <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                     <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Customer</label>
                     <select className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold outline-none" value={editBuffer.customerName || ''} onChange={e => setEditBuffer({...editBuffer, customerName: e.target.value})}>
                        {masterData.customers.map(c => <option key={c} value={c}>{c}</option>)}
                     </select>
                  </div>
                  <div className="space-y-1">
                     <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Customer Site</label>
                     <select className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold outline-none" value={editBuffer.customerSite || ''} onChange={e => setEditBuffer({...editBuffer, customerSite: e.target.value})}>
                        {masterData.sites.map(s => <option key={s} value={s}>{s}</option>)}
                     </select>
                  </div>
               </div>

               {/* Standard Weights */}
               <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-3">
                  <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Base Weights (Final)</h4>
                  <div className="grid grid-cols-3 gap-3">
                     <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Gross</label>
                        <input type="number" step="0.001" className="w-full bg-white border border-slate-200 rounded-xl px-2 py-2 text-sm text-center font-bold outline-none" value={editBuffer.gross || ''} onChange={e => setEditBuffer({...editBuffer, gross: e.target.value})} />
                     </div>
                     <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Tare</label>
                        <input type="number" step="0.001" className="w-full bg-white border border-slate-200 rounded-xl px-2 py-2 text-sm text-center font-bold outline-none" value={editBuffer.tare || ''} onChange={e => setEditBuffer({...editBuffer, tare: e.target.value})} />
                     </div>
                     <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Net</label>
                        <input type="number" step="0.001" className="w-full bg-white border border-slate-200 rounded-xl px-2 py-2 text-sm text-center font-black text-blue-600 outline-none" value={editBuffer.net || ''} onChange={e => setEditBuffer({...editBuffer, net: e.target.value})} />
                     </div>
                  </div>
               </div>

               {/* Advanced Weights (Loading/Unloading specific) */}
               <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-100 space-y-2">
                     <h4 className="text-[9px] font-black text-emerald-600 uppercase tracking-widest text-center">Load Net</h4>
                     <input type="number" step="0.001" className="w-full bg-white border border-emerald-200 rounded-lg px-2 py-1.5 text-sm text-center font-bold outline-none text-emerald-700" value={editBuffer.loadingNetWt || ''} onChange={e => setEditBuffer({...editBuffer, loadingNetWt: e.target.value})} />
                  </div>
                  <div className="p-3 bg-rose-50 rounded-xl border border-rose-100 space-y-2">
                     <h4 className="text-[9px] font-black text-rose-600 uppercase tracking-widest text-center">Unload Net</h4>
                     <input type="number" step="0.001" className="w-full bg-white border border-rose-200 rounded-lg px-2 py-1.5 text-sm text-center font-bold outline-none text-rose-700" value={editBuffer.unloadingNetWt || ''} onChange={e => setEditBuffer({...editBuffer, unloadingNetWt: e.target.value})} />
                  </div>
               </div>
            </div>

            <div className="p-6 bg-slate-50 border-t shrink-0 flex gap-4">
               <button onClick={saveInlineEdit} className="flex-1 py-4 bg-emerald-500 text-white rounded-2xl font-black uppercase tracking-widest shadow-xl hover:bg-emerald-600 active:scale-95 transition-all">Save Changes</button>
               <button onClick={() => setEditingLogId(null)} className="px-8 py-4 bg-white border border-slate-200 text-slate-500 rounded-2xl font-black uppercase tracking-widest hover:bg-slate-100 active:scale-95 transition-all">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/* ─── MAIN COMPONENT ─────────────────────────────────────────────────── */
const MiningOperations: React.FC<MiningProps> = (props) => {
  const [activeTab, setActiveTab] = useState<'transport' | 'machines'>('transport');

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header + Tab Bar */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 px-1">
        <div>
          <h2 className="text-2xl font-black text-slate-800 tracking-tight">Mining Operations</h2>
          <p className="text-slate-500 text-sm font-medium">Transport logs and machinery activity tracking</p>
        </div>
        <div className="flex bg-white border border-slate-200 p-1 rounded-2xl shadow-sm">
          <button onClick={() => setActiveTab('transport')}
            className={`px-5 py-2.5 rounded-xl text-xs font-black uppercase transition-all ${activeTab === 'transport' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-900'}`}>
            🚚 Transport Logs
          </button>
          <button onClick={() => setActiveTab('machines')}
            className={`px-5 py-2.5 rounded-xl text-xs font-black uppercase transition-all ${activeTab === 'machines' ? 'bg-amber-500 text-slate-900' : 'text-slate-500 hover:text-slate-900'}`}>
            ⚙️ Machine Logs
          </button>
        </div>
      </div>

      {activeTab === 'transport' ? (
        <TransportLogsTab
          logs={props.logs}
          trucks={props.trucks}
          drivers={props.drivers}
          fuelLogs={props.fuelLogs}
          onAddTrigger={props.onAddTrigger}
          onBulkUploadTrigger={props.onBulkUploadTrigger}
          onReportTrigger={props.onReportTrigger}
          onEdit={props.onEdit}
          onDelete={props.onDelete}
          onLoadMore={props.onLoadMore}
          hasMore={props.hasMore}
          navParams={props.navParams}
          onClearNav={props.onClearNav}
          onUpdateLogs={props.onUpdateLogs}
          onAddLogs={props.onAddLogs}
          currentUser={props.currentUser}
          role={props.role}
          masterData={props.masterData}
        />
      ) : (
        <MachineLogsTab
          machines={props.machines}
          machineLogs={props.machineLogs}
          machineFuelEntries={props.machineFuelEntries}
          masterData={props.masterData}
          onAddMachineLog={props.onAddMachineLog}
          onAddMachineFuelEntry={props.onAddMachineFuelEntry}
        />
      )}
    </div>
  );
};

export default MiningOperations;
