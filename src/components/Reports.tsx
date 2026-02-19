
import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { FleetState, Tire } from '../types';

interface ReportsProps {
  state: FleetState;
}

const Reports: React.FC<ReportsProps> = ({ state }) => {
  const brandStats = useMemo(() => {
    // Consolidate all tires from trucks and spare/scrapped inventory
    const allTires: Tire[] = [
      ...state.trucks.flatMap(truck => truck.tires),
      ...state.tireInventory
    ];

    const statsMap: Record<string, { brand: string, scrappedCount: number, totalCount: number, totalMileageAtScrap: number, totalExpectedLifespan: number }> = {};

    allTires.forEach(tire => {
      if (!statsMap[tire.brand]) {
        statsMap[tire.brand] = {
          brand: tire.brand,
          scrappedCount: 0,
          totalCount: 0,
          totalMileageAtScrap: 0,
          totalExpectedLifespan: 0,
        };
      }

      const s = statsMap[tire.brand];
      s.totalCount += 1;
      s.totalExpectedLifespan += tire.expectedLifespan || 100000;

      if (tire.status === 'SCRAPPED') {
        s.scrappedCount += 1;
        s.totalMileageAtScrap += tire.mileage;
      }
    });

    return Object.values(statsMap).map(s => {
      const avgActual = s.scrappedCount > 0 ? s.totalMileageAtScrap / s.scrappedCount : 0;
      const avgExpected = s.totalCount > 0 ? s.totalExpectedLifespan / s.totalCount : 100000;
      const achievement = avgExpected > 0 ? (avgActual / avgExpected) * 100 : 0;

      return {
        brand: s.brand,
        avgMileageAtScrap: Math.round(avgActual),
        avgExpectedLifespan: Math.round(avgExpected),
        achievementRate: achievement.toFixed(1),
        scrappedTires: s.scrappedCount,
        totalManaged: s.totalCount
      };
    }).sort((a, b) => parseFloat(b.achievementRate) - parseFloat(a.achievementRate));
  }, [state]);

  const topBrand = brandStats[0];
  const lowBrand = brandStats[brandStats.length - 1];

  return (
    <div className="space-y-8 animate-fadeIn">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 px-1">
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-800 tracking-tight">Tire Performance Reports</h2>
          <p className="text-slate-500 text-sm font-medium">Comparing brand durability and lifespan targets</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className="bg-emerald-50 border border-emerald-100 p-6 rounded-2xl">
          <p className="text-xs font-bold text-emerald-600 uppercase tracking-widest mb-1">Top Performing Brand</p>
          <p className="text-3xl font-black text-emerald-900">{topBrand?.brand || 'N/A'}</p>
          <p className="text-xs text-emerald-500 mt-2 font-bold">{topBrand?.achievementRate}% Target Achievement</p>
        </div>
        <div className="bg-rose-50 border border-rose-100 p-6 rounded-2xl">
          <p className="text-xs font-bold text-rose-600 uppercase tracking-widest mb-1">Underperforming Brand</p>
          <p className="text-3xl font-black text-rose-900">{lowBrand?.brand || 'N/A'}</p>
          <p className="text-xs text-rose-500 mt-2 font-bold">{lowBrand?.achievementRate}% Achievement Rate</p>
        </div>
        <div className="bg-white border border-slate-100 p-6 rounded-2xl shadow-sm">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Global Target Lifespan</p>
          <p className="text-3xl font-black text-slate-900">
            {Math.round(brandStats.reduce((acc, b) => acc + b.avgExpectedLifespan, 0) / (brandStats.length || 1)).toLocaleString()} KM
          </p>
          <p className="text-xs text-slate-400 mt-2 font-medium">Weighted fleet average</p>
        </div>
      </div>

      <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100">
        <h3 className="text-lg font-bold mb-8">Brand Efficiency: Target vs. Actual Mileage</h3>
        <div className="h-[400px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={brandStats} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis 
                dataKey="brand" 
                axisLine={false} 
                tickLine={false} 
                tick={{ fill: '#64748b', fontWeight: 600 }}
              />
              <YAxis 
                axisLine={false} 
                tickLine={false} 
                tick={{ fill: '#94a3b8' }}
                label={{ value: 'Kilometers (KM)', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle', fill: '#94a3b8', fontSize: '12px' } }}
              />
              <Tooltip 
                cursor={{ fill: '#f8fafc' }}
                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
              />
              <Legend verticalAlign="top" height={36}/>
              <Bar name="Avg Lifespan Target" dataKey="avgExpectedLifespan" fill="#cbd5e1" radius={[4, 4, 0, 0]} />
              <Bar name="Avg Mileage at Retirement" dataKey="avgMileageAtScrap" fill="#f59e0b" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="text-center text-slate-400 text-xs mt-6 italic">
          *Actual mileage is calculated based on historical data from scrapped tires only.
        </p>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-6 border-b border-slate-100 bg-slate-50/50">
          <h3 className="font-bold text-slate-800 uppercase text-xs tracking-widest">Brand Performance Breakdown</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="text-xs font-semibold text-slate-400 uppercase border-b border-slate-100">
                <th className="px-6 py-4">Brand</th>
                <th className="px-6 py-4">Total Managed</th>
                <th className="px-6 py-4">Historical Scrap</th>
                <th className="px-6 py-4">Avg Target KM</th>
                <th className="px-6 py-4">Avg Actual KM</th>
                <th className="px-6 py-4 text-right">Lifespan Achievement</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {brandStats.map(stat => (
                <tr key={stat.brand} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4 font-bold text-slate-900">{stat.brand}</td>
                  <td className="px-6 py-4 text-slate-600">{stat.totalManaged} units</td>
                  <td className="px-6 py-4 text-slate-500">{stat.scrappedTires} units</td>
                  <td className="px-6 py-4 font-mono text-slate-500">{stat.avgExpectedLifespan.toLocaleString()}</td>
                  <td className="px-6 py-4 font-mono font-bold text-slate-900">{stat.avgMileageAtScrap.toLocaleString()}</td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex flex-col items-end">
                      <span className={`text-sm font-black ${parseFloat(stat.achievementRate) >= 95 ? 'text-emerald-600' : 'text-amber-600'}`}>
                        {stat.achievementRate}%
                      </span>
                      <div className="w-24 h-1.5 bg-slate-100 rounded-full mt-1 overflow-hidden">
                        <div 
                          className={`h-full ${parseFloat(stat.achievementRate) >= 95 ? 'bg-emerald-500' : 'bg-amber-500'}`} 
                          style={{ width: `${Math.min(100, parseFloat(stat.achievementRate))}%` }}
                        ></div>
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Reports;
