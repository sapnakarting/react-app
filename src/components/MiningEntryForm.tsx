
import React, { useState, useEffect, useMemo } from 'react';
import { Truck, MiningLog, MaterialType, MasterData, Driver, FuelLog, User } from '../types';

interface MiningEntryFormProps {
  trucks: Truck[];
  drivers: Driver[];
  fuelLogs: FuelLog[];
  masterData: MasterData;
  onAddLog: (log: MiningLog) => void;
  onUpdateLog?: (log: MiningLog) => void;
  editLog?: MiningLog | null;
  onAddMasterDataItem?: (key: keyof MasterData, list: string[]) => void;
  navParams?: { truckId?: string; date?: string } | null;
  onClearNav?: () => void;
  currentUser: User;
}

const MiningEntryForm: React.FC<MiningEntryFormProps> = ({ 
  trucks, drivers, fuelLogs, masterData, onAddLog, onUpdateLog, editLog, onAddMasterDataItem, navParams, onClearNav, currentUser 
}) => {
  const [success, setSuccess] = useState(false);
  const [formData, setFormData] = useState({
    type: 'DISPATCH' as 'DISPATCH' | 'PURCHASE',
    date: new Date().toISOString().split('T')[0],
    time: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
    chalanNo: '',
    customerName: '',
    site: '',
    royaltyName: '',
    royaltyPassNo: '',
    truckId: '',
    driverId: '',
    cartingAgent: '',
    loader: '',
    material: '' as MaterialType,
    gross: '',
    tare: ''
  });

  const [driverSearch, setDriverSearch] = useState('');

  // FIX: Lookup driver from fuel logs based on attributionDate (the production date)
  const assignedFromFuel = useMemo(() => {
    if (!formData.truckId || !formData.date) return null;
    return fuelLogs.find(f => f.truckId === formData.truckId && f.attributionDate === formData.date);
  }, [formData.truckId, formData.date, fuelLogs]);

  useEffect(() => {
    if (assignedFromFuel) {
      setFormData(prev => ({ ...prev, driverId: assignedFromFuel.driverId }));
      const d = drivers.find(v => v.id === assignedFromFuel.driverId);
      if (d) setDriverSearch(d.name);
    } else if (formData.truckId && formData.date) {
      // Find latest fuel log if current date log doesn't exist
      const lastFuelLog = fuelLogs
        .filter(f => f.truckId === formData.truckId)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
      
      if (lastFuelLog) {
         setFormData(prev => ({ ...prev, driverId: lastFuelLog.driverId }));
         const d = drivers.find(v => v.id === lastFuelLog.driverId);
         if (d) setDriverSearch(d.name);
      }
    }
  }, [assignedFromFuel, formData.truckId, formData.date, fuelLogs, drivers]);

  // Set defaults from master data
  useEffect(() => {
    if (!editLog && masterData) {
      setFormData(prev => ({
        ...prev,
        site: prev.site || masterData.sites[0] || '',
        royaltyName: prev.royaltyName || masterData.royaltyNames[0] || '',
        cartingAgent: prev.cartingAgent || masterData.agents[0] || '',
        loader: prev.loader || masterData.loaders[0] || '',
        material: prev.material || masterData.materials[0] || '',
        customerName: prev.customerName || (formData.type === 'DISPATCH' ? (masterData.customers[0] || '') : (masterData.suppliers[0] || ''))
      }));
    }
  }, [masterData, formData.type, editLog]);

  useEffect(() => {
    if (editLog) {
      setFormData({
        type: editLog.type,
        date: editLog.date,
        time: editLog.time,
        chalanNo: editLog.chalanNo,
        customerName: editLog.customerName,
        site: editLog.site,
        royaltyName: editLog.royaltyName || '',
        royaltyPassNo: editLog.royaltyPassNo,
        truckId: editLog.truckId,
        driverId: editLog.driverId,
        cartingAgent: editLog.cartingAgent,
        loader: editLog.loader,
        material: editLog.material,
        gross: editLog.gross.toString(),
        tare: editLog.tare.toString()
      });
      const d = drivers.find(v => v.id === editLog.driverId);
      if (d) setDriverSearch(d.name);
    }
  }, [editLog, drivers]);

  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>, key: keyof MasterData, fieldName: string) => {
    const val = e.target.value;
    if (val === 'ADD_NEW') {
      const newItem = prompt(`Enter new ${key.slice(0, -1).replace(/([A-Z])/g, ' $1').toLowerCase()}:`);
      if (newItem && newItem.trim() && onAddMasterDataItem) {
        if (key !== 'benchmarks') {
          const currentList = masterData[key] as string[];
          if (currentList.includes(newItem.trim())) return;
          onAddMasterDataItem(key, [...currentList, newItem.trim()]);
          setFormData(prev => ({ ...prev, [fieldName]: newItem.trim() }));
        }
      }
    } else {
      setFormData(prev => ({ ...prev, [fieldName]: val }));
    }
  };

  // Handle Navigation Params (Deep Linking)
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.chalanNo || !formData.truckId || !formData.driverId || !formData.gross || !formData.tare) {
      alert("Missing required fields: Plate No, Operator (auto-synced), Chalan, and Weights.");
      return;
    }

    const netValue = parseFloat(formData.gross) - parseFloat(formData.tare);

    const logData: MiningLog = {
      id: editLog ? editLog.id : crypto.randomUUID(),
      type: formData.type,
      date: formData.date,
      time: formData.time,
      chalanNo: formData.chalanNo,
      customerName: formData.customerName,
      site: formData.site,
      royaltyName: formData.royaltyName,
      royaltyPassNo: formData.royaltyPassNo,
      truckId: formData.truckId,
      driverId: formData.driverId,
      cartingAgent: formData.cartingAgent,
      loader: formData.loader,
      material: formData.material,
      gross: parseFloat(formData.gross),
      tare: parseFloat(formData.tare),
      net: netValue,
      agentId: currentUser.username
    };

    if (editLog && onUpdateLog) onUpdateLog(logData);
    else onAddLog(logData);

    setSuccess(true);
    setTimeout(() => setSuccess(false), 3000);

    if (!editLog) {
      setFormData({
        ...formData,
        chalanNo: '',
        gross: '',
        tare: ''
      });
    }
  };

  return (
    <div className="max-w-4xl mx-auto py-6 px-4 animate-fadeIn">
      {success && (
        <div className="fixed top-8 right-8 z-[300] bg-emerald-600 text-white px-8 py-4 rounded-2xl shadow-2xl font-black animate-slideInRight border-b-4 border-emerald-800">
          ✓ {editLog ? 'UPDATE SUCCESSFUL' : 'MINING RECORD SAVED'}
        </div>
      )}
      
      <div className="bg-white rounded-[2.5rem] shadow-2xl border border-slate-100 overflow-hidden">
        <div className="bg-slate-900 p-8 text-white flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold">{editLog ? 'Update Entry' : 'New Production Entry'}</h2>
            <p className="text-slate-400 text-sm mt-1 uppercase tracking-widest font-bold">Mining Ops - dispatch logs</p>
          </div>
          <div className="flex bg-white/10 p-1 rounded-xl">
            <button type="button" onClick={() => setFormData({...formData, type: 'DISPATCH'})} className={`px-4 py-2 rounded-lg text-xs font-black transition-all ${formData.type === 'DISPATCH' ? 'bg-amber-500 text-slate-900' : 'text-slate-400 hover:text-white'}`}>DISPATCH</button>
            <button type="button" onClick={() => setFormData({...formData, type: 'PURCHASE'})} className={`px-4 py-2 rounded-lg text-xs font-black transition-all ${formData.type === 'PURCHASE' ? 'bg-emerald-500 text-slate-900' : 'text-slate-400 hover:text-white'}`}>PURCHASE</button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-4 md:p-8 space-y-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="space-y-6">
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest border-b pb-2">Operational Data</h3>
              
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Entry Date</label>
                <input 
                  type="date" 
                  required 
                  className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-amber-500 font-bold" 
                  value={formData.date} 
                  onChange={e => setFormData({...formData, date: e.target.value})}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Chalan No.</label>
                  <input type="text" required className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-amber-500 font-black text-amber-600" value={formData.chalanNo} onChange={e => setFormData({...formData, chalanNo: e.target.value})}/>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Material</label>
                  <select className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold" value={formData.material} onChange={e => handleSelectChange(e, 'materials', 'material')}>
                    {masterData.materials.map(m => <option key={m} value={m}>{m}</option>)}
                    <option value="ADD_NEW" className="text-amber-500 font-bold">✨ Add New Material...</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">{formData.type === 'DISPATCH' ? 'Customer' : 'Supplier'}</label>
                <select className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold" value={formData.customerName} onChange={e => handleSelectChange(e, formData.type === 'DISPATCH' ? 'customers' : 'suppliers', 'customerName')}>
                  {(formData.type === 'DISPATCH' ? masterData.customers : masterData.suppliers).map(item => <option key={item} value={item}>{item}</option>)}
                  <option value="ADD_NEW" className="text-amber-500 font-bold">✨ Add New {formData.type === 'DISPATCH' ? 'Customer' : 'Supplier'}...</option>
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Site</label>
                  <select className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold" value={formData.site} onChange={e => handleSelectChange(e, 'sites', 'site')}>
                    {masterData.sites.map(s => <option key={s} value={s}>{s}</option>)}
                    <option value="ADD_NEW" className="text-amber-500 font-bold">✨ Add New Site...</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Loader Unit</label>
                  <select className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold" value={formData.loader} onChange={e => handleSelectChange(e, 'loaders', 'loader')}>
                    {masterData.loaders.map(l => <option key={l} value={l}>{l}</option>)}
                    <option value="ADD_NEW" className="text-amber-500 font-bold">✨ Add New Loader...</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Royalty Record</label>
                <select className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold" value={formData.royaltyName} onChange={e => handleSelectChange(e, 'royaltyNames', 'royaltyName')}>
                  {masterData.royaltyNames.map(r => <option key={r} value={r}>{r}</option>)}
                  <option value="ADD_NEW" className="text-amber-500 font-bold">✨ Add New Royalty...</option>
                </select>
              </div>
            </div>

            <div className="space-y-6">
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest border-b pb-2">Vehicle & Log</h3>
              
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Truck (Plate No.)</label>
                <select required className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-black font-mono tracking-tight text-lg" value={formData.truckId} onChange={e => setFormData({...formData, truckId: e.target.value})}>
                  <option value="">Choose Vehicle...</option>
                  {trucks.filter(t => t.fleetType === 'MINING').map(t => <option key={t.id} value={t.id}>{t.plateNumber}</option>)}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Operator</label>
                <div className="relative">
                  <input 
                    type="text" 
                    readOnly
                    placeholder="Auto-synced from Fuel Entry..."
                    className="w-full p-4 bg-slate-100 border border-slate-200 rounded-2xl outline-none font-bold text-slate-500 cursor-not-allowed" 
                    value={driverSearch}
                  />
                  {!assignedFromFuel && formData.truckId && formData.date && (
                    <p className="text-[9px] text-amber-600 font-bold mt-1 ml-1 uppercase">Warning: No Fuel Entry found for this day. Using last known operator.</p>
                  )}
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Carting Agent</label>
                <select className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold" value={formData.cartingAgent} onChange={e => handleSelectChange(e, 'agents', 'cartingAgent')}>
                  {masterData.agents.map(a => <option key={a} value={a}>{a}</option>)}
                  <option value="ADD_NEW" className="text-amber-500 font-bold">✨ Add New Agent...</option>
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Gross (MT)</label>
                  <input type="number" step="0.001" required className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-mono font-bold" value={formData.gross} onChange={e => setFormData({...formData, gross: e.target.value})}/>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Tare (MT)</label>
                  <input type="number" step="0.001" required className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-mono font-bold" value={formData.tare} onChange={e => setFormData({...formData, tare: e.target.value})}/>
                </div>
              </div>

              <div className="p-4 md:p-8 bg-slate-900 rounded-[2.5rem] text-white text-center shadow-2xl border-b-8 border-slate-800">
                 <p className="text-[10px] font-black text-amber-500 uppercase tracking-widest mb-1">Net Tonnage Calculation</p>
                 <p className="text-4xl md:text-5xl font-black">{(parseFloat(formData.gross) - parseFloat(formData.tare) || 0).toFixed(3)} MT</p>
              </div>
            </div>
          </div>

          <button type="submit" className={`w-full py-6 rounded-[2.5rem] font-black text-xl shadow-2xl transition-all active:scale-95 ${formData.type === 'DISPATCH' ? 'bg-slate-900 text-white hover:bg-black' : 'bg-emerald-600 text-white hover:bg-emerald-700'}`}>
            {editLog ? 'Update Entry' : `Finalize ${formData.type} Record`}
          </button>
        </form>
      </div>
    </div>
  );
};

export default MiningEntryForm;
