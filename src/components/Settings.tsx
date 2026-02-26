
import React, { useState } from 'react';
import { MasterData, FuelBenchmarks, CoalSite } from '../types';
import { isUsingEnvVars } from '../services/supabaseClient';
import { getStorageMode } from '../services/storageService';

interface SettingsProps {
  masterData: MasterData;
  onUpdate: (key: keyof MasterData, list: any[]) => void;
}

const Settings: React.FC<SettingsProps> = ({ masterData, onUpdate }) => {
  const [activeTab, setActiveTab] = useState<keyof MasterData | 'benchmarks'>('benchmarks');
  const [newItem, setNewItem] = useState('');
  const [newLocation, setNewLocation] = useState('');
  const [newIsInternal, setNewIsInternal] = useState(false);
  const [newSiteType, setNewSiteType] = useState<'LOADING' | 'UNLOADING'>('LOADING');
  const [newPartyType, setNewPartyType] = useState<'SUPPLIER' | 'CUSTOMER'>('SUPPLIER');
  const [success, setSuccess] = useState(false);
  const [benchmarkBuffer, setBenchmarkBuffer] = useState<FuelBenchmarks>(masterData.benchmarks || {
    coalLitersPerTrip: [40, 60],
    miningKmPerLiter: [1.5, 3.0],
    miningLitersPerTrip: [30, 45],
    globalLitersPerTon: [0.5, 1.5]
  });

  const tabs: { id: keyof MasterData | 'benchmarks', label: string }[] = [
    { id: 'benchmarks', label: '⛽ Performance Benchmarks' },
    { id: 'coalSites', label: '🌋 Coal Transport Sites' },
    { id: 'fuelStations', label: '⛽ Fueling Stations' },
    { id: 'dieselParties', label: '🤝 Diesel Parties' },
    { id: 'tireBrands', label: '🛞 Tire Brands' },
    { id: 'materials', label: 'Material Types' },
    { id: 'sites', label: 'Operational Sites' },
    { id: 'agents', label: 'Carting Agents' },
    { id: 'loaders', label: 'Loaders' },
    { id: 'customers', label: 'Customers' },
    { id: 'suppliers', label: 'Suppliers' },
    { id: 'tireSuppliers', label: 'Tire Suppliers' },
    { id: 'royaltyNames', label: 'Royalty Names' },
  ];

  const handleAdd = () => {
    if (activeTab === 'benchmarks') {
      onUpdate('benchmarks' as any, benchmarkBuffer as any);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2000);
      return;
    }

    if (!newItem.trim()) return;

    if (activeTab === 'coalSites') {
      const currentList = masterData.coalSites || [];
      if (currentList.find(s => s.name === newItem.trim())) {
        alert("Site already exists.");
        return;
      }
      const newSite: CoalSite = { id: crypto.randomUUID(), name: newItem.trim(), siteType: newSiteType };
      onUpdate('coalSites', [...currentList, newSite]);
    } else if (activeTab === 'fuelStations') {
      const currentList = masterData.fuelStations || [];
      if (currentList.find(s => s.name === newItem.trim())) {
        alert("Station already exists.");
        return;
      }
      const newStation = { id: crypto.randomUUID(), name: newItem.trim(), location: newLocation.trim() || 'Main Site', isInternal: newIsInternal };
      onUpdate('fuelStations', [...currentList, newStation]);
      setNewIsInternal(false);
    } else if (activeTab === 'dieselParties') {
      const currentList = masterData.dieselParties || [];
      if (currentList.find(p => p.name === newItem.trim())) {
        alert("Party already exists.");
        return;
      }
      const newParty = { id: crypto.randomUUID(), name: newItem.trim(), type: newPartyType, contact: '', phone: '', notes: '' };
      onUpdate('dieselParties', [...currentList, newParty]);
    } else {
      const currentList = (masterData[activeTab as keyof MasterData] as string[]) || [];
      if (currentList.includes(newItem.trim())) {
        alert("Item already exists in the list.");
        return;
      }
      onUpdate(activeTab as keyof MasterData, [...currentList, newItem.trim()]);
    }

    setNewItem('');
    setSuccess(true);
    setTimeout(() => setSuccess(false), 2000);
  };

  const handleRemove = (e: React.MouseEvent, item: any) => {
    e.preventDefault();
    e.stopPropagation();
    if (activeTab === 'coalSites') {
      const updatedList = (masterData.coalSites || []).filter(s => s.id !== item.id);
      onUpdate('coalSites', updatedList);
    } else if (activeTab === 'fuelStations') {
      const updatedList = (masterData.fuelStations || []).filter(s => s.id !== item.id);
      onUpdate('fuelStations', updatedList);
    } else if (activeTab === 'dieselParties') {
      const updatedList = (masterData.dieselParties || []).filter(p => p.id !== item.id);
      onUpdate('dieselParties', updatedList);
    } else {
      const currentList = (masterData[activeTab as keyof MasterData] as string[]) || [];
      const updatedList = currentList.filter(i => i !== item);
      onUpdate(activeTab as keyof MasterData, updatedList);
    }
    setSuccess(true);
    setTimeout(() => setSuccess(false), 1500);
  };

  return (
    <div className="max-w-5xl mx-auto py-6 px-4 animate-fadeIn">
      {success && (
        <div className="fixed top-8 right-8 z-[300] bg-emerald-500 text-white px-8 py-4 rounded-2xl shadow-2xl font-black">
          ✓ SYSTEM CONFIGURATION UPDATED
        </div>
      )}

      <div className="bg-white rounded-[2.5rem] shadow-xl border border-slate-100 overflow-hidden">
        <div className="bg-slate-900 p-8 text-white">
          <h2 className="text-2xl font-black uppercase tracking-tight">System Master Configuration</h2>
          <p className="text-slate-400 text-[10px] mt-1 uppercase tracking-widest font-bold">Performance Ranges & Operational Limits</p>
        </div>

        <div className="flex flex-col md:flex-row">
          <div className="w-full md:w-72 bg-slate-50 border-r border-slate-100 p-4 space-y-1 overflow-y-auto max-h-[80vh]">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full text-left px-5 py-4 rounded-2xl font-bold text-[11px] uppercase tracking-widest transition-all ${
                  activeTab === tab.id ? 'bg-amber-500 text-white shadow-lg' : 'text-slate-500 hover:bg-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex-1 p-8">
            {activeTab === 'benchmarks' ? (
              <div className="space-y-8 animate-fadeIn">
                <div className="grid grid-cols-1 gap-6">
                   <div className="p-6 bg-slate-50 rounded-[2rem] border border-slate-100 space-y-4">
                      <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest">Coal Fleet: Liters Per Trip Range</p>
                      <div className="flex items-center gap-4">
                        <input type="number" className="flex-1 p-4 rounded-xl border bg-white font-black" value={benchmarkBuffer.coalLitersPerTrip[0]} onChange={e => setBenchmarkBuffer({...benchmarkBuffer, coalLitersPerTrip: [parseFloat(e.target.value), benchmarkBuffer.coalLitersPerTrip[1]]})} />
                        <span className="text-slate-300 font-black">TO</span>
                        <input type="number" className="flex-1 p-4 rounded-xl border bg-white font-black" value={benchmarkBuffer.coalLitersPerTrip[1]} onChange={e => setBenchmarkBuffer({...benchmarkBuffer, coalLitersPerTrip: [benchmarkBuffer.coalLitersPerTrip[0], parseFloat(e.target.value)]})} />
                      </div>
                   </div>
                   {/* ... Other benchmarks ... */}
                   <div className="p-6 bg-slate-50 rounded-[2rem] border border-slate-100 space-y-4">
                      <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest">Mining Fleet: KM Per Liter Range</p>
                      <div className="flex items-center gap-4">
                        <input type="number" step="0.1" className="flex-1 p-4 rounded-xl border bg-white font-black" value={benchmarkBuffer.miningKmPerLiter[0]} onChange={e => setBenchmarkBuffer({...benchmarkBuffer, miningKmPerLiter: [parseFloat(e.target.value), benchmarkBuffer.miningKmPerLiter[1]]})} />
                        <span className="text-slate-300 font-black">TO</span>
                        <input type="number" step="0.1" className="flex-1 p-4 rounded-xl border bg-white font-black" value={benchmarkBuffer.miningKmPerLiter[1]} onChange={e => setBenchmarkBuffer({...benchmarkBuffer, miningKmPerLiter: [benchmarkBuffer.miningKmPerLiter[0], parseFloat(e.target.value)]})} />
                      </div>
                   </div>

                   <div className="p-6 bg-slate-50 rounded-[2rem] border border-slate-100 space-y-4">
                      <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest">Mining Fleet: Liters Per Trip Range</p>
                      <div className="flex items-center gap-4">
                        <input type="number" className="flex-1 p-4 rounded-xl border bg-white font-black" value={benchmarkBuffer.miningLitersPerTrip?.[0] || 0} onChange={e => setBenchmarkBuffer({...benchmarkBuffer, miningLitersPerTrip: [parseFloat(e.target.value), benchmarkBuffer.miningLitersPerTrip?.[1] || 0]})} />
                        <span className="text-slate-300 font-black">TO</span>
                        <input type="number" className="flex-1 p-4 rounded-xl border bg-white font-black" value={benchmarkBuffer.miningLitersPerTrip?.[1] || 0} onChange={e => setBenchmarkBuffer({...benchmarkBuffer, miningLitersPerTrip: [benchmarkBuffer.miningLitersPerTrip?.[0] || 0, parseFloat(e.target.value)]})} />
                      </div>
                   </div>

                   <div className="p-6 bg-slate-50 rounded-[2rem] border border-slate-100 space-y-4">
                      <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Global: Liters Per Ton Range</p>
                      <div className="flex items-center gap-4">
                        <input type="number" step="0.01" className="flex-1 p-4 rounded-xl border bg-white font-black" value={benchmarkBuffer.globalLitersPerTon[0]} onChange={e => setBenchmarkBuffer({...benchmarkBuffer, globalLitersPerTon: [parseFloat(e.target.value), benchmarkBuffer.globalLitersPerTon[1]]})} />
                        <span className="text-slate-300 font-black">TO</span>
                        <input type="number" step="0.01" className="flex-1 p-4 rounded-xl border bg-white font-black" value={benchmarkBuffer.globalLitersPerTon[1]} onChange={e => setBenchmarkBuffer({...benchmarkBuffer, globalLitersPerTon: [benchmarkBuffer.globalLitersPerTon[0], parseFloat(e.target.value)]})} />
                      </div>
                   </div>
                </div>
                <button onClick={handleAdd} className="w-full py-5 bg-slate-900 text-white rounded-[2rem] font-black uppercase tracking-widest shadow-xl border-b-4 border-black hover:bg-black">Apply Global Benchmarks</button>
              </div>
            ) : activeTab === 'coalSites' ? (
              <>
                <div className="mb-8">
                  <h3 className="text-xl font-black text-slate-800 mb-1 capitalize">Coal Route Points</h3>
                  <p className="text-[9px] font-bold text-slate-400 uppercase">Manage Loading and Unloading Locations</p>
                </div>

                <div className="flex flex-col gap-4 mb-8">
                  <div className="flex gap-4">
                    <input type="text" className="flex-1 p-5 bg-slate-50 border border-slate-200 rounded-2xl font-bold" placeholder="Site Name..." value={newItem} onChange={e => setNewItem(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAdd()} />
                    <select className="w-48 p-5 bg-slate-50 border border-slate-200 rounded-2xl font-black text-[10px] uppercase" value={newSiteType} onChange={e => setNewSiteType(e.target.value as any)}>
                      <option value="LOADING">LOADING POINT</option>
                      <option value="UNLOADING">UNLOADING POINT</option>
                    </select>
                  </div>
                  <button onClick={handleAdd} className="bg-slate-900 text-white py-5 rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl">REGISTER ROUTE POINT</button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {(masterData.coalSites || []).map(site => (
                    <div key={site.id} className="flex items-center justify-between p-4 bg-white border border-slate-100 rounded-2xl shadow-sm">
                      <div className="flex flex-col">
                         <span className="font-bold text-slate-700 text-sm">{site.name}</span>
                         <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-full w-fit ${site.siteType === 'LOADING' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>{site.siteType}</span>
                      </div>
                      <button onClick={(e) => handleRemove(e, site)} className="text-rose-400 hover:text-rose-600 font-black text-xl w-8 h-8 rounded-full hover:bg-rose-50 flex items-center justify-center transition-all">&times;</button>
                    </div>
                  ))}
                </div>
              </>
            ) : activeTab === 'fuelStations' ? (
              <>
                <div className="mb-8">
                  <h3 className="text-xl font-black text-slate-800 mb-1 capitalize">Fueling Station Registry</h3>
                  <p className="text-[9px] font-bold text-slate-400 uppercase">Manage Registered Petrol Pumps</p>
                </div>

                <div className="flex flex-col gap-4 mb-8">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <input 
                      type="text" 
                      className="p-5 bg-slate-50 border border-slate-200 rounded-2xl font-bold" 
                      placeholder="Station Name (e.g., HPCL Center)..." 
                      value={newItem} 
                      onChange={e => setNewItem(e.target.value)} 
                    />
                    <input 
                      type="text" 
                      className="p-5 bg-slate-50 border border-slate-200 rounded-2xl font-bold" 
                      placeholder="Location (e.g., NH-44, Bypass)..." 
                      value={newLocation} 
                      onChange={e => setNewLocation(e.target.value)} 
                      onKeyDown={e => e.key === 'Enter' && handleAdd()} 
                    />
                  </div>
                  <label className="flex items-center gap-3 p-4 bg-slate-50 border border-slate-200 rounded-2xl cursor-pointer hover:bg-slate-100 transition-colors">
                    <input
                      type="checkbox"
                      className="w-5 h-5 accent-amber-500 rounded cursor-pointer"
                      checked={newIsInternal}
                      onChange={(e) => setNewIsInternal(e.target.checked)}
                    />
                    <div>
                      <span className="block font-bold text-slate-700 text-sm">Internal Tanker / Stock Location</span>
                      <span className="block text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Check this if it is a company-owned fuel tanker acting as a pump</span>
                    </div>
                  </label>
                  <button onClick={handleAdd} className="bg-slate-900 text-white py-5 rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl">REGISTER NEW STATION</button>
                </div>
              </>
            ) : activeTab === 'dieselParties' ? (
              <>
                <div className="mb-8">
                  <h3 className="text-xl font-black text-slate-800 mb-1 capitalize">Diesel Party Registry</h3>
                  <p className="text-[9px] font-bold text-slate-400 uppercase">Manage External Borrow/Lend Accounts</p>
                </div>

                <div className="flex flex-col sm:flex-row gap-4 mb-8">
                  <input 
                    type="text" 
                    className="flex-1 p-5 bg-slate-50 border border-slate-200 rounded-2xl font-bold" 
                    placeholder="Party Name (e.g., Sy Motara)..." 
                    value={newItem} 
                    onChange={e => setNewItem(e.target.value)} 
                    onKeyDown={e => e.key === 'Enter' && handleAdd()} 
                  />
                  <select 
                    className="w-full sm:w-48 p-5 bg-slate-50 border border-slate-200 rounded-2xl font-black text-[10px] uppercase"
                    value={newPartyType}
                    onChange={e => setNewPartyType(e.target.value as any)}
                  >
                    <option value="SUPPLIER">SUPPLIER</option>
                    <option value="CUSTOMER">CUSTOMER</option>
                  </select>
                  <button onClick={handleAdd} className="bg-slate-900 text-white px-8 py-5 rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl">REGISTER</button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {(masterData.dieselParties || []).map(party => (
                    <div key={party.id} className="flex items-center justify-between p-4 bg-white border border-slate-100 rounded-2xl shadow-sm">
                      <div className="flex flex-col">
                         <div className="flex items-center gap-2">
                           <span className="font-bold text-slate-700 text-sm">{party.name}</span>
                           <span className={`text-[8px] font-black tracking-widest uppercase px-2 py-0.5 rounded-full ${
                             party.type === 'CUSTOMER' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'
                           }`}>{party.type}</span>
                         </div>
                         <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{party.contact || 'No Contact Info'}</span>
                      </div>
                      <button onClick={(e) => handleRemove(e, party)} className="text-rose-400 hover:text-rose-600 font-black text-xl w-8 h-8 rounded-full hover:bg-rose-50 flex items-center justify-center transition-all">&times;</button>
                    </div>
                  ))}
                  {(masterData.dieselParties?.length === 0) && (
                    <div className="col-span-full py-8 text-center bg-slate-50 border border-slate-100 border-dashed rounded-2xl">
                      <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">No Parties Configured</p>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="mb-8">
                  <h3 className="text-xl font-black text-slate-800 mb-1 capitalize">{activeTab.replace(/([A-Z])/g, ' $1')} Registry</h3>
                </div>

                <div className="flex gap-4 mb-8">
                  <input type="text" className="flex-1 p-5 bg-slate-50 border border-slate-200 rounded-2xl font-bold" placeholder={`New entry for ${activeTab}...`} value={newItem} onChange={e => setNewItem(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAdd()} />
                  <button onClick={handleAdd} className="bg-slate-900 text-white px-10 py-5 rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl">ADD</button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {(masterData[activeTab as keyof MasterData] as string[])?.map(item => (
                    <div key={item} className="flex items-center justify-between p-4 bg-white border border-slate-100 rounded-2xl shadow-sm">
                      <span className="font-bold text-slate-700 text-sm">{item}</span>
                      <button onClick={(e) => handleRemove(e, item)} className="text-rose-400 hover:text-rose-600 font-black text-xl w-8 h-8 rounded-full hover:bg-rose-50 flex items-center justify-center transition-all">&times;</button>
                    </div>
                  ))}
                </div>
              </>
            )}
            </div>
        </div>
      </div>
      
      {/* CONFIGURATION STATUS PANEL */}
      <div className="mt-8 p-6 bg-slate-100 rounded-[2rem] border border-slate-200">
          <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-4">Infrastructure Health Check</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-center justify-between bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
                  <div>
                    <span className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Database Credentials</span>
                    <span className="text-xs font-bold text-slate-600">Source of Keys</span>
                  </div>
                  <span className={`text-[10px] font-black px-3 py-1.5 rounded-lg border ${isUsingEnvVars ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-amber-50 text-amber-600 border-amber-100'}`}>
                      {isUsingEnvVars ? '.ENV VARS ACTIVE' : '⚠️ USING FALLBACK'}
                  </span>
              </div>
              <div className="flex items-center justify-between bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
                  <div>
                    <span className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Image Storage</span>
                    <span className="text-xs font-bold text-slate-600">Upload Provider</span>
                  </div>
                  <span className={`text-[10px] font-black px-3 py-1.5 rounded-lg border ${getStorageMode().includes('CLOUDFLARE') ? 'bg-blue-50 text-blue-600 border-blue-100' : 'bg-purple-50 text-purple-600 border-purple-100'}`}>
                      {getStorageMode()}
                  </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;
