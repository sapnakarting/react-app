
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Truck, Driver, CoalLog, FuelLog, MasterData, User } from '../types';

interface CoalEntryFormProps {
  trucks: Truck[];
  drivers: Driver[];
  fuelLogs: FuelLog[];
  masterData: MasterData;
  onAddLog: (log: CoalLog | CoalLog[]) => void;
  currentUser: User;
  navParams?: { truckId?: string; date?: string } | null;
  onClearNav?: () => void;
}

interface TripEntry {
  id: string;
  passNo: string;
  grossWeight: string;
  tareWeight: string;
}

const CoalEntryForm: React.FC<CoalEntryFormProps> = ({ trucks, drivers, fuelLogs, masterData, onAddLog, currentUser, navParams, onClearNav }) => {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [truckId, setTruckId] = useState('');
  const [truckSearch, setTruckSearch] = useState('');
  const [showTruckDropdown, setShowTruckDropdown] = useState(false);
  const [fromSite, setFromSite] = useState('');
  const [toSite, setToSite] = useState('');
  const [numTripsInput, setNumTripsInput] = useState('1');
  const [trips, setTrips] = useState<TripEntry[]>([]);
  const [success, setSuccess] = useState(false);

  const truckDropdownRef = useRef<HTMLDivElement>(null);

  // Handle Navigation Params (Deep Linking)
  useEffect(() => {
    if (navParams) {
      if (navParams.date) setDate(navParams.date);
      if (navParams.truckId) {
        setTruckId(navParams.truckId);
        const truck = trucks.find(t => t.id === navParams.truckId);
        if (truck) setTruckSearch(truck.plateNumber);
      }
      onClearNav?.();
    }
  }, [navParams, trucks, onClearNav]);

  // Split Coal Sites for UI separation
  const loadingSites = useMemo(() => masterData.coalSites.filter(s => s.siteType === 'LOADING'), [masterData.coalSites]);
  const unloadingSites = useMemo(() => masterData.coalSites.filter(s => s.siteType === 'UNLOADING'), [masterData.coalSites]);

  // Set defaults
  useEffect(() => {
    if (loadingSites.length > 0 && !fromSite) setFromSite(loadingSites[0].name);
    if (unloadingSites.length > 0 && !toSite) setToSite(unloadingSites[0].name);
  }, [loadingSites, unloadingSites]);

  const filteredTrucks = trucks.filter(t => 
    t.fleetType === 'COAL' && 
    t.status === 'ACTIVE' &&
    t.plateNumber.toLowerCase().includes(truckSearch.toLowerCase())
  );

  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const focusNext = (e: React.KeyboardEvent, currentId: string, currentField: string) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const fields = ['passNo', 'grossWeight', 'tareWeight'];
      const currentIdx = fields.indexOf(currentField);
      
      if (currentIdx < fields.length - 1) {
        // Focus next field in same row
        const nextField = fields[currentIdx + 1];
        inputRefs.current[`${currentId}-${nextField}`]?.focus();
      } else {
        // Focus first field in next row
        const tripIdx = trips.findIndex(t => t.id === currentId);
        if (tripIdx < trips.length - 1) {
          const nextTripId = trips[tripIdx + 1].id;
          inputRefs.current[`${nextTripId}-passNo`]?.focus();
        } else {
          // Last field of last row, maybe trigger add more or submit?
          // For now just blur or stay
        }
      }
    }
  };

  const dieselInfo = useMemo(() => {
    if (!truckId || !date || isNaN(Date.parse(date))) return { liters: 0, date: '', rate: 90.55, driverId: null, driverName: 'PENDING SYNC' };
    
    // FIX: Look for fuel logs attributed to this production date
    const logs = fuelLogs.filter(f => f.truckId === truckId && f.attributionDate === date);
    
    // Sum total liters issued for this attributed production date
    const totalLiters = logs.reduce((acc, l) => acc + (l.fuelLiters || 0), 0);
    const firstLog = logs[0];
    const driver = firstLog ? drivers.find(d => d.id === firstLog.driverId) : null;

    return { 
      liters: totalLiters, 
      date: firstLog?.date || '', // The actual receipt/fueling date
      rate: firstLog?.dieselPrice || 90.55,
      driverId: firstLog?.driverId || null,
      driverName: driver?.name || 'PENDING SYNC'
    };
  }, [truckId, date, fuelLogs, drivers]);

  const totalNetTonnage = trips.reduce((acc, t) => {
    const gross = parseFloat(t.grossWeight) || 0;
    const tare = parseFloat(t.tareWeight) || 0;
    const net = Math.max(0, gross - tare); 
    return acc + net;
  }, 0);

  const totalTrips = trips.length;
  const staffWelfare = totalTrips > 0 ? 300 : 0;
  const rollAmount = Math.max(0, totalTrips - 4) * 100;
  const totalPayable = staffWelfare + rollAmount;

  const avgTonnagePerTrip = totalTrips > 0 ? totalNetTonnage / totalTrips : 0;
  const dieselAvgPerTrip = totalTrips > 0 ? dieselInfo.liters / totalTrips : 0;

  const handleAddTrips = () => {
    const count = parseInt(numTripsInput) || 0;
    if (count <= 0) return;
    const newTrips: TripEntry[] = Array.from({ length: count }).map(() => ({
      id: crypto.randomUUID(),
      passNo: '',
      grossWeight: '',
      tareWeight: ''
    }));
    setTrips([...trips, ...newTrips]);
  };

  const updateTrip = (id: string, field: keyof TripEntry, value: string) => {
    setTrips(prev => prev.map(t => t.id === id ? { ...t, [field]: value } : t));
  };

  const removeTrip = (id: string) => {
    setTrips(prev => prev.filter(t => t.id !== id));
  };

  const isFormComplete = useMemo(() => {
    if (!truckId || trips.length === 0) return false;
    return trips.every(t => 
      t.passNo.trim() !== '' && 
      !isNaN(parseFloat(t.grossWeight)) && 
      !isNaN(parseFloat(t.tareWeight)) &&
      parseFloat(t.grossWeight) >= parseFloat(t.tareWeight)
    );
  }, [truckId, trips]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (truckDropdownRef.current && !truckDropdownRef.current.contains(e.target as Node)) setShowTruckDropdown(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormComplete) {
      alert("Please ensure all trip entries have a Pass No and that Gross Weight >= Tare Weight.");
      return;
    }
    const logsToSubmit: CoalLog[] = trips.map((t, i) => {
      const gross = parseFloat(t.grossWeight) || 0;
      const tare = parseFloat(t.tareWeight) || 0;
      const net = gross - tare;
      return {
        id: crypto.randomUUID(),
        date,
        truckId,
        driverId: dieselInfo.driverId,
        passNo: t.passNo,
        grossWeight: gross,
        tareWeight: tare,
        netWeight: net,
        dieselLiters: dieselInfo.liters / (trips.length || 1),
        dieselAdjustment: 0,
        dieselRate: dieselInfo.rate,
        from: fromSite,
        to: toSite,
        staffWelfare: i === 0 ? staffWelfare : 0,
        rollAmount: i === 0 ? rollAmount : 0,
        agentId: currentUser.username
      };
    });
    onAddLog(logsToSubmit);
    setSuccess(true);
    setTimeout(() => {
      setSuccess(false);
      setTrips([]);
      setTruckSearch('');
      setTruckId('');
    }, 1500);
  };

  return (
    <div className="max-w-5xl mx-auto py-6 animate-fadeIn">
      {success && (
        <div className="fixed top-8 right-8 z-[500] bg-emerald-600 text-white px-8 py-4 rounded-2xl shadow-2xl font-black animate-slideInRight border-b-4 border-emerald-800">
          ✓ COAL LOGS SAVED SUCCESSFULLY
        </div>
      )}

      <div className="bg-white rounded-[2.5rem] shadow-2xl overflow-hidden border border-slate-100">
        <div className="bg-slate-900 p-8 text-white">
          <h2 className="text-2xl font-black uppercase tracking-tight">New Coal Pass Entry</h2>
          <p className="text-slate-400 text-sm font-bold opacity-60 uppercase tracking-widest">Individual trip logger with route details</p>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Date</label>
              <input type="date" required className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold focus:ring-2 focus:ring-amber-500 outline-none" value={date} onChange={e => setDate(e.target.value)} />
            </div>

            <div className="space-y-1 relative" ref={truckDropdownRef}>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Searchable Vehicle</label>
              <input 
                type="text" 
                placeholder="Search Plate..."
                className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-black font-mono focus:ring-2 focus:ring-amber-500 outline-none" 
                value={truckSearch}
                onFocus={() => setShowTruckDropdown(true)}
                onChange={e => setTruckSearch(e.target.value)}
              />
              {showTruckDropdown && (
                <div className="absolute z-50 top-full left-0 right-0 mt-2 bg-white border border-slate-200 rounded-xl shadow-2xl max-h-48 overflow-y-auto scrollbar-hide">
                  {filteredTrucks.map(t => (
                    <button key={t.id} type="button" className="w-full p-4 text-left font-black font-mono hover:bg-slate-50 border-b last:border-0 flex justify-between" onClick={() => { setTruckId(t.id); setTruckSearch(t.plateNumber); setShowTruckDropdown(false); }}>
                      <span>{t.plateNumber}</span>
                      <span className="text-[9px] font-black text-slate-300 uppercase">{t.status}</span>
                    </button>
                  ))}
                  {filteredTrucks.length === 0 && <div className="p-4 text-xs font-bold text-slate-400 text-center italic">Only ACTIVE COAL vehicles listed</div>}
                </div>
              )}
            </div>

            <div className="space-y-1">
               <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Operator (Auto-Sync)</label>
               <div className="w-full p-4 bg-slate-100 border border-slate-200 rounded-2xl font-black text-xs text-slate-500 flex items-center gap-2">
                 <span>👤</span> {dieselInfo.driverName}
               </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-50 p-4 md:p-6 rounded-[2rem] border border-slate-100 shadow-inner">
             <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Origin (Loading Point)</label>
                <select className="w-full p-4 bg-white border border-slate-200 rounded-2xl font-black uppercase text-xs outline-none focus:border-amber-500 shadow-sm" value={fromSite} onChange={e => setFromSite(e.target.value)}>
                   {loadingSites.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                   {loadingSites.length === 0 && <option>No loading sites defined</option>}
                </select>
             </div>
             <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Destination (Unloading Point)</label>
                <select className="w-full p-4 bg-white border border-slate-200 rounded-2xl font-black uppercase text-xs outline-none focus:border-amber-500 shadow-sm" value={toSite} onChange={e => setToSite(e.target.value)}>
                   {unloadingSites.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                   {unloadingSites.length === 0 && <option>No unloading sites defined</option>}
                </select>
             </div>
          </div>

          <div className="bg-slate-50 p-4 md:p-6 rounded-[2rem] border border-slate-100 flex flex-col md:flex-row items-end gap-6 shadow-inner">
            <div className="w-full md:flex-1 space-y-1">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">No. of Trips</label>
              <input type="number" className="w-full p-4 bg-white border border-slate-200 rounded-2xl font-black text-xl text-center outline-none focus:border-amber-500" value={numTripsInput} onChange={e => setNumTripsInput(e.target.value)} />
            </div>
            <button type="button" onClick={handleAddTrips} className="w-full md:w-auto px-14 py-5 bg-slate-900 text-white rounded-2xl font-black uppercase text-sm shadow-xl hover:bg-black transition-all active:scale-95">Add Trips</button>
          </div>

          {trips.length > 0 && (
            <div className="space-y-4">
              <div className="hidden md:grid grid-cols-12 gap-4 px-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                <div className="col-span-1 text-center">#</div>
                <div className="col-span-3">Pass No</div>
                <div className="col-span-3 text-center">Gross (MT)</div>
                <div className="col-span-3 text-center">Tare (MT)</div>
                <div className="col-span-1 text-center">Net</div>
                <div className="col-span-1 text-right">Actions</div>
              </div>
              <div className="space-y-2 max-h-[450px] overflow-y-auto pr-1 scrollbar-hide py-1">
                {trips.map((trip, idx) => {
                  const gross = parseFloat(trip.grossWeight) || 0;
                  const tare = parseFloat(trip.tareWeight) || 0;
                  const net = Math.max(0, gross - tare);
                  const hasError = gross < tare && trip.grossWeight !== '' && trip.tareWeight !== '';
                  return (
                    <div key={trip.id} className={`grid grid-cols-1 md:grid-cols-12 gap-2 items-center bg-white border ${hasError ? 'border-rose-300' : 'border-slate-100'} p-2 rounded-xl shadow-sm hover:shadow-md transition-all group`}>
                      <div className="col-span-1 text-left md:text-center font-black text-slate-200 flex justify-between md:block px-1">
                        <span className="md:hidden text-[10px]">TRIP #{idx + 1}</span>
                        <span className="text-[11px]">{(idx + 1).toString().padStart(2, '0')}</span>
                      </div>
                      <div className="col-span-1 md:col-span-3">
                        <input 
                          ref={el => inputRefs.current[`${trip.id}-passNo`] = el}
                          type="text" 
                          placeholder="Pass No" 
                          className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg font-black uppercase text-[11px] outline-none focus:ring-2 focus:ring-amber-500 transition-all" 
                          value={trip.passNo} 
                          onChange={e => updateTrip(trip.id, 'passNo', e.target.value)} 
                          onKeyDown={e => focusNext(e, trip.id, 'passNo')}
                        />
                      </div>
                      <div className="col-span-1 md:col-span-3">
                        <input 
                          ref={el => inputRefs.current[`${trip.id}-grossWeight`] = el}
                          type="number" 
                          step="0.001" 
                          placeholder="Gross" 
                          className={`w-full p-2.5 bg-slate-50 border ${hasError ? 'border-rose-400' : 'border-slate-200'} rounded-lg font-mono font-bold text-slate-900 text-center text-[11px] outline-none focus:ring-2 focus:ring-amber-500 transition-all`} 
                          value={trip.grossWeight} 
                          onChange={e => updateTrip(trip.id, 'grossWeight', e.target.value)} 
                          onKeyDown={e => focusNext(e, trip.id, 'grossWeight')}
                        />
                      </div>
                      <div className="col-span-1 md:col-span-3">
                        <input 
                          ref={el => inputRefs.current[`${trip.id}-tareWeight`] = el}
                          type="number" 
                          step="0.001" 
                          placeholder="Tare" 
                          className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg font-mono font-bold text-slate-500 text-center text-[11px] outline-none focus:ring-2 focus:ring-amber-500 transition-all" 
                          value={trip.tareWeight} 
                          onChange={e => updateTrip(trip.id, 'tareWeight', e.target.value)} 
                          onKeyDown={e => focusNext(e, trip.id, 'tareWeight')}
                        />
                      </div>
                      <div className={`col-span-1 text-center font-black font-mono text-[11px] ${hasError ? 'text-rose-500' : 'text-amber-600'} flex justify-between md:block px-2 md:px-0`}>
                        <span className="md:hidden text-slate-400">NET:</span>
                        {net.toFixed(3)}
                      </div>
                      <div className="col-span-1 text-right">
                        <button type="button" onClick={() => removeTrip(trip.id)} className="text-rose-300 hover:text-rose-600 font-black text-[9px] uppercase tracking-tighter w-full md:w-auto p-1.5 md:p-0">×</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="space-y-4 pt-6 border-t border-slate-100">
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
              <div className="bg-emerald-50 p-4 rounded-3xl border border-emerald-100 text-center flex flex-col items-center justify-center relative">
                <p className="text-[9px] font-black text-emerald-600 uppercase tracking-widest mb-1">Fuel Sync</p>
                <p className="text-xl font-black text-emerald-900 leading-none">{(dieselInfo.liters || 0).toFixed(3)} <span className="text-[10px]">L</span></p>
                {dieselInfo.date && <span className="absolute bottom-1 text-[7px] font-black text-emerald-300 uppercase tracking-tighter">Verified: {dieselInfo.date}</span>}
              </div>
              <div className="bg-amber-50 p-4 rounded-3xl border border-amber-100 text-center flex flex-col items-center justify-center">
                <p className="text-[9px] font-black text-amber-600 uppercase tracking-widest mb-1">Total Tonnage</p>
                <p className="text-xl font-black text-amber-900 leading-none">{(totalNetTonnage || 0).toFixed(3)} <span className="text-[10px]">MT</span></p>
              </div>
              <div className="bg-blue-50 p-4 rounded-3xl border border-blue-100 text-center flex flex-col items-center justify-center">
                <p className="text-[9px] font-black text-blue-600 uppercase tracking-widest mb-1">Trip Tonnage Avg</p>
                <p className="text-xl font-black text-blue-900 leading-none">{avgTonnagePerTrip.toFixed(3)} <span className="text-[10px]">MT/T</span></p>
              </div>
              <div className="bg-slate-900 p-4 rounded-3xl text-center flex flex-col items-center justify-center shadow-xl">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Staff Welfare</p>
                <p className="text-xl font-black text-white leading-none">₹{staffWelfare}</p>
              </div>
              <div className="bg-slate-900 p-4 rounded-3xl text-center flex flex-col items-center justify-center shadow-xl col-span-2 md:col-span-1">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Roll Amount</p>
                <p className="text-xl font-black text-amber-500 leading-none">₹{rollAmount}</p>
              </div>
            </div>
          </div>

          <button type="submit" disabled={!isFormComplete} className={`w-full py-6 rounded-[2.5rem] font-black text-xl shadow-2xl active:scale-95 transition-all border-b-8 uppercase tracking-[0.2em] ${isFormComplete ? 'bg-amber-500 hover:bg-amber-600 text-white border-amber-700' : 'bg-slate-200 text-slate-400 border-slate-300 cursor-not-allowed'}`}>Save Coal Log Entry</button>
        </form>
      </div>
    </div>
  );
};

export default CoalEntryForm;
