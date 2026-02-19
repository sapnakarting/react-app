
import React, { useState } from 'react';
import { FuelLog, Truck, Driver } from '../types';

interface FuelHistoryProps {
  logs: FuelLog[];
  trucks: Truck[];
  drivers: Driver[];
  role: string | null;
  currentUser: any;
  users: any[];
}

const FuelHistory: React.FC<FuelHistoryProps> = ({ logs, trucks, drivers, role, currentUser, users }) => {
  const [search, setSearch] = useState('');
  const [selectedProof, setSelectedProof] = useState<string | null>(null);

  const privacyFilteredLogs = logs.filter(log => role === 'ADMIN' || log.agentId === currentUser.username);
  const sortedLogs = [...privacyFilteredLogs].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  
  const filteredLogs = sortedLogs.filter(log => {
    const truck = trucks.find(t => t.id === log.truckId);
    const driver = drivers.find(d => d.id === log.driverId);
    return truck?.plateNumber.toLowerCase().includes(search.toLowerCase()) ||
           driver?.name.toLowerCase().includes(search.toLowerCase()) ||
           log.agentId?.toLowerCase().includes(search.toLowerCase());
  });

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Fuel Records</h2>
          <p className="text-slate-500">Detailed logs including driver assignments and photo proof</p>
        </div>
        <div className="relative w-full md:w-auto">
          <input
            type="text"
            placeholder="Search by Truck Plate # or Driver..."
            className="w-full md:min-w-[300px] pl-10 pr-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500 outline-none"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <span className="absolute left-3 top-2.5 opacity-40">🔍</span>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-widest">Date</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-widest">Plate #</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-widest">Driver</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-widest">Agent</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-widest">Odometer Reading</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-widest text-center">Proof</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-widest text-right">Fuel (L)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
            {filteredLogs.map(log => {
              const truck = trucks.find(t => t.id === log.truckId);
              const driver = drivers.find(d => d.id === log.driverId);
              const diff = log.previousOdometer ? log.odometer - log.previousOdometer : 0;
              return (
                <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4 text-slate-600 whitespace-nowrap font-medium">{log.date}</td>
                  {/* Fixed: Replace unitNumber with plateNumber */}
                  <td className="px-6 py-4 font-bold text-slate-900">{truck?.plateNumber || 'N/A'}</td>
                  <td className="px-6 py-4 font-medium text-slate-700">{driver?.name || 'Unknown'}</td>
                  <td className="px-6 py-4 font-black text-slate-400 text-[10px] uppercase">{log.agentId || 'System'}</td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <span className="text-slate-900 font-mono font-bold">{log.odometer.toLocaleString()} KM</span>
                      {diff > 0 && <span className="text-[10px] text-emerald-600 font-bold">+{diff.toLocaleString()} KM today</span>}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-center">
                    {log.photoProof ? (
                      <button 
                        onClick={() => setSelectedProof(log.photoProof!)}
                        className="w-10 h-10 rounded-lg overflow-hidden border border-slate-200 hover:scale-110 transition-transform bg-slate-100"
                      >
                        <img src={log.photoProof} className="w-full h-full object-cover" alt="Odo Proof" />
                      </button>
                    ) : (
                      <span className="text-slate-300 text-xs italic">No Proof</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right font-black text-amber-600">{log.fuelLiters.toFixed(3)}</td>
                </tr>
              );
            })}
          </tbody>
          </table>
        </div>
      </div>

      {selectedProof && (
        <div className="fixed inset-0 bg-slate-900/90 z-50 flex items-center justify-center p-8" onClick={() => setSelectedProof(null)}>
          <div className="relative max-w-4xl max-h-full">
             <img src={selectedProof} alt="Full Proof" className="rounded-2xl shadow-2xl max-w-full max-h-[90vh]" />
             <button className="absolute -top-4 -right-4 bg-white text-slate-900 w-10 h-10 rounded-full font-bold shadow-xl">×</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default FuelHistory;
