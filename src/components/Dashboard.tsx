
import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { FleetState } from '../types';

const COLORS = ['#f59e0b', '#3b82f6', '#10b981', '#ef4444'];

const Dashboard: React.FC<{ state: FleetState }> = ({ state }) => {
  const stats = useMemo(() => {
    const totalWeight = state.tripLogs.reduce((acc, l) => acc + (l.weightMT || 0), 0);
    const totalTrips = state.tripLogs.reduce((acc, l) => acc + l.tripCount, 0);
    const activeTrucks = state.trucks.filter(t => t.status === 'ACTIVE').length;
    
    const materialData = state.tripLogs.reduce((acc: any[], log) => {
      const existing = acc.find(item => item.name === log.material);
      if (existing) existing.value += (log.weightMT || 0);
      else acc.push({ name: log.material, value: (log.weightMT || 0) });
      return acc;
    }, []);

    const truckTrips = state.trucks.slice(0, 10).map(t => ({
      name: t.plateNumber,
      trips: state.tripLogs.filter(l => l.truckId === t.id).reduce((acc, l) => acc + l.tripCount, 0)
    }));

    return { totalWeight, totalTrips, activeTrucks, materialData, truckTrips };
  }, [state]);

  return (
    <div className="space-y-6 md:space-y-8 animate-fadeIn w-full overflow-hidden">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-800 tracking-tight">Fleet Analytics</h2>
          <p className="text-slate-500 text-sm font-medium uppercase tracking-widest opacity-60">Real-time performance metrics</p>
        </div>
        <div className="bg-white px-4 py-2 rounded-xl shadow-sm border border-slate-100 hidden sm:block">
          <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Live Syncing</span>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        {[
          { label: 'Total Material (MT)', value: stats.totalWeight.toFixed(3), icon: '⛰️', color: 'bg-blue-500' },
          { label: 'Total Trips', value: stats.totalTrips, icon: '🔄', color: 'bg-amber-500' },
          { label: 'Active Fleet', value: `${stats.activeTrucks}/${state.trucks.length}`, icon: '🚛', color: 'bg-emerald-500' },
          { label: 'Pending Docs', value: '12', icon: '📋', color: 'bg-rose-500' },
        ].map((card, idx) => (
          <div key={idx} className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 flex items-center space-x-6 hover:shadow-md transition-shadow">
            <div className={`${card.color} text-white p-4 rounded-2xl text-2xl shrink-0 shadow-lg shadow-${card.color.split('-')[1]}-200`}>{card.icon}</div>
            <div className="min-w-0">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 truncate">{card.label}</p>
              <p className="text-2xl font-black text-slate-900 tracking-tighter">{card.value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8">
        {/* Charts */}
        <div className="bg-white p-6 md:p-8 rounded-[2.5rem] shadow-sm border border-slate-100">
          <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight mb-8">Material Mix (MT)</h3>
          <div className="h-64 sm:h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={stats.materialData.length ? stats.materialData : [{name: 'No Data', value: 1}]} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius="80%" innerRadius="40%" stroke="none">
                  {stats.materialData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                  {stats.materialData.length === 0 && <Cell fill="#f1f5f9" />}
                </Pie>
                <Tooltip 
                   contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontWeight: 'bold' }}
                />
                <Legend layout="horizontal" verticalAlign="bottom" align="center" wrapperStyle={{ fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-6 md:p-8 rounded-[2.5rem] shadow-sm border border-slate-100">
          <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight mb-8">Top 10 Vehicle Utilisation</h3>
          <div className="h-64 sm:h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.truckTrips}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 9, fontWeight: 700, fill: '#94a3b8'}} />
                <YAxis axisLine={false} tickLine={false} tick={{fontSize: 9, fontWeight: 700, fill: '#94a3b8'}} />
                <Tooltip 
                  cursor={{ fill: '#f8fafc' }}
                  contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontWeight: 'bold' }}
                />
                <Bar dataKey="trips" fill="#3b82f6" radius={[6, 6, 0, 0]} barSize={24} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
