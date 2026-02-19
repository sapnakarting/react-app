
import React, { useState } from 'react';
import { TripLog, Truck, Driver } from '../types';

interface TripLogProps {
  logs: TripLog[];
  trucks: Truck[];
  drivers: Driver[];
}

const TripLogHistory: React.FC<TripLogProps> = ({ logs, trucks, drivers }) => {
  const [filter, setFilter] = useState('');

  const sortedLogs = [...logs].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  
  const filteredLogs = sortedLogs.filter(log => {
    const truck = trucks.find(t => t.id === log.truckId);
    const driver = drivers.find(d => d.id === log.driverId);
    // Fixed: Replace unitNumber with plateNumber
    return truck?.plateNumber.toLowerCase().includes(filter.toLowerCase()) || 
           (log.material && log.material.toLowerCase().includes(filter.toLowerCase())) ||
           driver?.name.toLowerCase().includes(filter.toLowerCase());
  });

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Trip History</h2>
          <p className="text-slate-500">Material transport and tonnage logs</p>
        </div>
        <div className="relative">
          <input
            type="text"
            placeholder="Filter by Truck, Driver or Material..."
            className="pl-10 pr-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500 outline-none min-w-[300px]"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <span className="absolute left-3 top-2.5 opacity-40">🔍</span>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-slate-50 border-b border-slate-100">
            <tr>
              <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-widest">Date</th>
              <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-widest">Plate #</th>
              <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-widest">Driver</th>
              <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-widest">Material</th>
              <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-widest">Trips</th>
              <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-widest text-right">Tonnage (MT)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredLogs.map(log => {
              const truck = trucks.find(t => t.id === log.truckId);
              const driver = drivers.find(d => d.id === log.driverId);
              return (
                <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4 text-slate-600 font-medium whitespace-nowrap">{log.date}</td>
                  {/* Fixed: Replace unitNumber with plateNumber */}
                  <td className="px-6 py-4 font-bold text-slate-900">{truck?.plateNumber || 'N/A'}</td>
                  <td className="px-6 py-4 font-medium text-slate-700">{driver?.name || 'Unknown'}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider ${
                      log.material === 'Dust' ? 'bg-slate-100 text-slate-600' : 'bg-blue-50 text-blue-700'
                    }`}>
                      {log.material}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-slate-600">{log.tripCount}</td>
                  <td className="px-6 py-4 text-right font-black text-slate-900">{log.weightMT?.toFixed(3) || '0.00'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default TripLogHistory;
