
import React, { useState, useMemo } from 'react';
import { MiningLog, Truck, Driver, FuelLog, MasterData } from '../types';

interface MiningProps {
  logs: MiningLog[];
  trucks: Truck[];
  drivers: Driver[];
  fuelLogs: FuelLog[];
  masterData: MasterData;
  onEdit?: (log: MiningLog) => void;
  onDelete?: (id: string) => void;
  onBulkUploadTrigger?: () => void;
  onUpdateFuel?: (truckId: string, prodDate: string, liters: number) => void;
  onAddLogs?: (logs: MiningLog[]) => void;
  onAddTrigger?: () => void;
  onEditTrigger?: (log: MiningLog) => void;
  navParams?: { truckId?: string; date?: string } | null;
  onClearNav?: () => void;
  onLoadMore?: () => void;
  hasMore?: boolean;
  currentUser: any;
  role: string | null;
}

const MiningOperations: React.FC<MiningProps> = ({ 
  logs, trucks, drivers, fuelLogs, onDelete, onBulkUploadTrigger, onAddTrigger, onEdit: onEditProp, navParams, onClearNav, onLoadMore, hasMore, currentUser, role 
}) => {
  const [truckFilter, setTruckFilter] = useState('');
  const [dateFilter, setDateFilter] = useState(''); // NEW state for date filtering in mining
  const [selectedGroupKey, setSelectedGroupKey] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Handle Navigation Params (Deep Linking)
  React.useEffect(() => {
    if (navParams) {
      if (navParams.truckId) setTruckFilter(navParams.truckId);
      if (navParams.date) {
        setDateFilter(navParams.date);
      }
      // Clear after applying to avoid sticky filters
      onClearNav?.();
    }
  }, [navParams, onClearNav]);

  const aggregatedData = useMemo(() => {
    const groups: Record<string, any> = {};

    logs.forEach(log => {
      if (!log.date) return;
      
      const truck = trucks.find(t => t.id === log.truckId);
      const key = `${log.date}_${log.truckId}_${log.type}`;
      
      if (!groups[key]) {
        // FIX: Sync diesel by looking for fuel records attributed to this production day
        const recordedDieselLog = fuelLogs.find(f => f.truckId === log.truckId && f.attributionDate === log.date);
        
        groups[key] = {
          key, 
          date: log.date, 
          truckId: log.truckId, 
          plateNumber: truck?.plateNumber || 'Unknown', 
          entries: 0, 
          netWeight: 0,
          totalDiesel: recordedDieselLog ? (recordedDieselLog.fuelLiters || 0) : 0,
          logs: []
        };
      }
      groups[key].entries += 1;
      groups[key].netWeight += (log.net || 0);
      groups[key].logs.push(log);
    });

    const privacyFilteredGroups = Object.values(groups).filter((g: any) => {
      if (role === 'ADMIN') return true;
      return g.logs.some((l: any) => l.agentId === currentUser.username);
    });

    return privacyFilteredGroups
      .filter(g => {
        const matchesTruck = truckFilter ? g.truckId === truckFilter : true;
        const matchesDate = dateFilter ? g.date === dateFilter : true;
        return matchesTruck && matchesDate;
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [logs, truckFilter, dateFilter, trucks, fuelLogs]);

  const selectedGroup = aggregatedData.find(g => g.key === selectedGroupKey);

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 px-1">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 tracking-tight">Mining Summary</h2>
          <p className="text-slate-500 text-sm font-medium">Operation detail views and daily audit logs</p>
        </div>
        <div className="flex flex-col sm:flex-row w-full sm:w-auto gap-2">
          <button onClick={onAddTrigger} className="bg-amber-500 hover:bg-amber-600 text-white px-4 py-3 sm:py-2 rounded-xl font-black text-[10px] uppercase shadow-md transition-all active:scale-95">Add New Entry</button>
          <select className="px-4 py-3 sm:py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold shadow-sm outline-none focus:ring-2 focus:ring-amber-500" value={truckFilter} onChange={(e) => setTruckFilter(e.target.value)}>
            <option value="">All Vehicles</option>
            {trucks.filter(t => t.fleetType === 'MINING').map(t => <option key={t.id} value={t.id}>{t.plateNumber}</option>)}
          </select>
          <input type="date" className="px-4 py-3 sm:py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold shadow-sm outline-none focus:ring-2 focus:ring-amber-500" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} />
          <button onClick={onBulkUploadTrigger} className="px-6 py-3 sm:py-2 bg-slate-900 text-white rounded-xl font-black text-xs uppercase hover:bg-black transition-all shadow-lg active:scale-95">+ Bulk Import</button>
        </div>
      </div>

      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[11px]">
            <thead className="bg-slate-900 text-slate-300 font-black uppercase tracking-widest">
              <tr>
                <th className="px-5 py-5 whitespace-nowrap">Prod Date</th>
                <th className="px-5 py-5 whitespace-nowrap">Vehicle</th>
                <th className="px-5 py-5 text-center whitespace-nowrap">Trips</th>
                <th className="px-5 py-5 text-center whitespace-nowrap">Net Wt (MT)</th>
                <th className="px-5 py-5 text-center whitespace-nowrap">Diesel (Attributed)</th>
                <th className="px-5 py-5 text-right whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {aggregatedData.map((group) => (
                <tr key={group.key} className="hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-4 font-bold text-slate-600 whitespace-nowrap">{group.date}</td>
                  <td className="px-5 py-4 font-black text-slate-900 font-mono text-sm whitespace-nowrap">{group.plateNumber}</td>
                  <td className="px-5 py-4 text-center font-bold text-amber-700 whitespace-nowrap">{group.entries}</td>
                  <td className="px-5 py-4 text-center font-mono font-bold whitespace-nowrap">{(group.netWeight || 0).toFixed(3)}</td>
                  <td className="px-5 py-4 text-center text-emerald-600 font-black whitespace-nowrap">{(group.totalDiesel || 0).toFixed(3)} L</td>
                  <td className="px-5 py-4 text-right whitespace-nowrap">
                    <button onClick={() => setSelectedGroupKey(group.key)} className="bg-amber-50 text-amber-600 px-4 py-1.5 rounded-lg hover:bg-amber-100 font-black uppercase text-[9px] transition-all">Details</button>
                  </td>
                </tr>
              ))}
              {aggregatedData.length === 0 && (
                <tr>
                   <td colSpan={6} className="py-20 text-center font-black text-slate-300 uppercase tracking-widest">No mining records found</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {hasMore && (
          <div className="p-8 text-center bg-slate-50/30 border-t border-slate-50">
             <button 
                onClick={onLoadMore}
                className="px-8 py-3 bg-white border border-slate-200 text-slate-600 rounded-xl font-black uppercase text-[10px] tracking-widest shadow-sm hover:bg-slate-900 hover:text-white transition-all active:scale-95"
             >
                Load More Records
             </button>
          </div>
        )}
      </div>
      
      {selectedGroup && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[300] flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white rounded-t-[2.5rem] sm:rounded-[2.5rem] shadow-2xl w-full max-w-6xl h-[85vh] sm:h-auto sm:max-h-[90vh] overflow-hidden animate-slideUp sm:animate-scaleIn flex flex-col">
            <div className="bg-slate-900 p-6 sm:p-8 text-white flex justify-between items-center shrink-0">
              <div><h3 className="text-xl font-black font-mono tracking-tight">{selectedGroup.plateNumber} Production Details</h3><p className="text-xs text-slate-400 font-black uppercase tracking-widest mt-1">{selectedGroup.date}</p></div>
              <button onClick={() => { setSelectedGroupKey(null); setConfirmDeleteId(null); }} className="text-3xl font-light hover:text-amber-500 transition-colors">&times;</button>
            </div>
            <div className="p-4 sm:p-8 overflow-y-auto scrollbar-hide flex-1">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-100 font-black text-slate-400 uppercase tracking-widest">
                      <tr><th className="px-4 py-3 whitespace-nowrap">Time</th><th className="px-4 py-3 whitespace-nowrap">Chalan</th><th className="px-4 py-3 whitespace-nowrap">Material</th><th className="px-4 py-3 text-center whitespace-nowrap">Net</th><th className="px-4 py-3 text-right whitespace-nowrap">Action</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {selectedGroup.logs.map((log: any) => {
                        const isConfirmingDelete = confirmDeleteId === log.id;
                        return (
                          <tr key={log.id} className={`${isConfirmingDelete ? 'bg-rose-50' : 'hover:bg-slate-50'} transition-colors`}>
                            <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{log.time}</td>
                            <td className="px-4 py-3 font-black text-amber-600 font-mono whitespace-nowrap">{log.chalanNo}</td>
                            <td className="px-4 py-3 uppercase font-bold text-slate-600 whitespace-nowrap">{log.material}</td>
                            <td className="px-4 py-3 text-center font-black text-slate-900 whitespace-nowrap">{(log.net || 0).toFixed(3)}</td>
                            <td className="px-4 py-3 text-right whitespace-nowrap">
                              {isConfirmingDelete ? (
                                <div className="flex justify-end items-center gap-2">
                                  <span className="text-[8px] font-black text-rose-600 uppercase">Confirm?</span>
                                  <button onClick={() => { onDelete?.(log.id); setConfirmDeleteId(null); }} className="bg-rose-500 text-white px-2 py-1 rounded text-[8px] font-black uppercase">Yes</button>
                                  <button onClick={() => setConfirmDeleteId(null)} className="text-slate-400 text-[8px] font-black uppercase">No</button>
                                </div>
                              ) : (
                                <button onClick={() => setConfirmDeleteId(log.id)} className="text-rose-500 font-black text-[9px] uppercase tracking-widest">Delete</button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
            </div>
            <div className="p-6 sm:p-8 bg-slate-50 border-t flex justify-end shrink-0safe-pb">
               <button onClick={() => setSelectedGroupKey(null)} className="w-full sm:w-auto px-10 py-4 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl active:scale-95 transition-all">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MiningOperations;
