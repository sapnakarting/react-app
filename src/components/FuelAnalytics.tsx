import React, { useMemo, useState } from 'react';
import { FleetState, FuelLog, CoalLog, MiningLog } from '../types';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx-js-style';
import { dbService } from '../services/dbService';

const FuelAnalytics: React.FC<{ 
  state: FleetState, 
  onNavigate?: (view: string, params?: any) => void 
}> = ({ state, onNavigate }) => {
  const [filter, setFilter] = useState<'ALL' | 'MINING' | 'COAL'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedStation, setSelectedStation] = useState<string>('ALL');
  const [leaderboardMetric, setLeaderboardMetric] = useState<'L/TON' | 'L/TRIP' | 'KM/L'>('L/TON');
  const [selectedTruckTimeline, setSelectedTruckTimeline] = useState<string | null>(null);
  const [viewingSpecificLog, setViewingSpecificLog] = useState<FuelLog | null>(null);
  const [showTransactionList, setShowTransactionList] = useState(true);
  const [taggingWorstTruck, setTaggingWorstTruck] = useState<string | null>(null);
  const [reasonDraft, setReasonDraft] = useState('');
  const [isSavingReason, setIsSavingReason] = useState(false);
  
  const b = state.masterData.benchmarks;

  // Filter logs by date range
  const filteredFuelLogs = useMemo(() => {
    return state.fuelLogs.filter(l => {
      const d = new Date(l.date);
      const s = startDate ? new Date(startDate) : null;
      const e = endDate ? new Date(endDate) : null;
      const matchesDate = (!s || d >= s) && (!e || d <= e);
      const matchesStation = selectedStation === 'ALL' || l.stationId === selectedStation;
      
      const truck = state.trucks.find(t => t.id === l.truckId);
      const matchesSearch = truck?.plateNumber.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesFleet = filter === 'ALL' || truck?.fleetType === filter;
      
      return matchesDate && matchesStation && matchesSearch && matchesFleet;
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [state.fuelLogs, state.trucks, startDate, endDate, selectedStation, searchQuery, filter]);

  const filteredCoalLogs = useMemo(() => {
    return state.coalLogs.filter(l => {
      if (!startDate && !endDate) return true;
      const d = new Date(l.date);
      const s = startDate ? new Date(startDate) : null;
      const e = endDate ? new Date(endDate) : null;
      return (!s || d >= s) && (!e || d <= e);
    });
  }, [state.coalLogs, startDate, endDate]);

  const filteredMiningLogs = useMemo(() => {
    return state.miningLogs.filter(l => {
      if (!startDate && !endDate) return true;
      const d = new Date(l.date);
      const s = startDate ? new Date(startDate) : null;
      const e = endDate ? new Date(endDate) : null;
      return (!s || d >= s) && (!e || d <= e);
    });
  }, [state.miningLogs, startDate, endDate]);

  const truckStats = useMemo(() => {
    return state.trucks.map(truck => {
      const logs = filteredFuelLogs.filter(l => l.truckId === truck.id);
      const totalLiters = logs.reduce((acc, l) => acc + (l.fuelLiters || 0), 0);
      const totalCost = logs.reduce((acc, l) => acc + ((l.fuelLiters || 0) * (l.dieselPrice || 0)), 0);
      
      const sortedLogs = [...logs].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      const totalKm = sortedLogs.length > 0 ? 
        (sortedLogs[sortedLogs.length - 1].odometer - sortedLogs[0].previousOdometer) : 0;
      
      const avgKml = totalLiters > 0 ? totalKm / totalLiters : 0;

      let trips = 0;
      let tonnage = 0;
      if (truck.fleetType === 'COAL') {
        const cLogs = filteredCoalLogs.filter(l => l.truckId === truck.id);
        trips = cLogs.length;
        tonnage = cLogs.reduce((acc, l) => acc + l.netWeight, 0);
      } else {
        const mLogs = filteredMiningLogs.filter(l => l.truckId === truck.id);
        trips = mLogs.length;
        tonnage = mLogs.reduce((acc, l) => acc + l.net, 0);
      }

      const lPerTrip = trips > 0 ? totalLiters / trips : 0;
      const lPerTon = tonnage > 0 ? totalLiters / tonnage : 0;

      const isCoal = truck.fleetType === 'COAL';
      const kmlStatus = !isCoal ? (avgKml >= b.miningKmPerLiter[0] ? 'GOOD' : 'POOR') : 'N/A';
      const tripLimit = isCoal ? b.coalLitersPerTrip[1] : (b.miningLitersPerTrip ? b.miningLitersPerTrip[1] : 999);
      const tripStatus = lPerTrip > 0 ? (lPerTrip <= tripLimit ? 'GOOD' : 'POOR') : 'N/A';
      const tonStatus = lPerTon > 0 ? (lPerTon <= b.globalLitersPerTon[1] ? 'GOOD' : 'POOR') : 'N/A';

      return {
        ...truck,
        totalLiters,
        totalCost,
        avgKml,
        lPerTrip,
        lPerTon,
        trips,
        tonnage,
        performance: { kmlStatus, tripStatus, tonStatus }
      };
    }).filter(t => {
      const matchesSearch = t.plateNumber.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesFleet = filter === 'ALL' || t.fleetType === filter;
      return matchesSearch && matchesFleet;
    });
  }, [state.trucks, filteredFuelLogs, filteredCoalLogs, filteredMiningLogs, filter, searchQuery, b]);

  const aggregate = useMemo(() => {
    const liters = truckStats.reduce((acc, t) => acc + t.totalLiters, 0);
    const cost = truckStats.reduce((acc, t) => acc + t.totalCost, 0);
    const validKml = truckStats.filter(t => t.avgKml > 0);
    const avgKml = validKml.length > 0 ? validKml.reduce((acc, t) => acc + t.avgKml, 0) / validKml.length : 0;
    return { liters, cost, avgKml };
  }, [truckStats]);

  // Station Liability Analytics
  const stationStats = useMemo(() => {
    const stats: Record<string, { liters: number, cost: number }> = {};
    // 1. Fleet fuel logs
    filteredFuelLogs.forEach(log => {
      const sid = log.stationId || 'UNKNOWN';
      if (!stats[sid]) stats[sid] = { liters: 0, cost: 0 };
      stats[sid].liters += (log.fuelLiters || 0);
      stats[sid].cost += ((log.fuelLiters || 0) * (log.dieselPrice || 0));
    });
    // 2. Misc fuel entries — these are also real debts owed to the external pump
    state.miscFuelEntries.forEach(m => {
      // Apply the same date-range filter as fuelLogs
      const d = new Date(m.date);
      const s = startDate ? new Date(startDate) : null;
      const e = endDate ? new Date(endDate) : null;
      if ((s && d < s) || (e && d > e)) return;
      const sid = m.stationId;
      if (!stats[sid]) stats[sid] = { liters: 0, cost: 0 };
      stats[sid].liters += m.fuelLiters;
      stats[sid].cost += m.amount;
    });
    return Object.entries(stats)
      .filter(([id]) => {
        // Exclude internal tankers — they are assets, not creditors
        const station = state.masterData.fuelStations.find(s => s.id === id || s.name === id);
        return !station?.isInternal;
      })
      .map(([id, data]) => ({
        id,
        name: state.masterData.fuelStations.find(s => s.id === id || s.name === id)?.name || 'Unknown/Self',
        ...data
      })).sort((a, b) => b.cost - a.cost);
  }, [filteredFuelLogs, state.miscFuelEntries, state.masterData.fuelStations, startDate, endDate]);

  const { bestPerformers, worstPerformers } = useMemo(() => {
    const valid = truckStats.filter(t => t.totalLiters > 0);
    
    let sorted = [...valid];
    let statusKey: 'kmlStatus' | 'tripStatus' | 'tonStatus' = 'kmlStatus';
    let sortDir: 'asc' | 'desc' = 'desc';

    if (leaderboardMetric === 'L/TON') {
      sorted.sort((a, b) => a.lPerTon - b.lPerTon);
      statusKey = 'tonStatus';
      sortDir = 'asc';
    } else if (leaderboardMetric === 'L/TRIP') {
      sorted.sort((a, b) => a.lPerTrip - b.lPerTrip);
      statusKey = 'tripStatus';
      sortDir = 'asc';
    } else {
      sorted.sort((a, b) => b.avgKml - a.avgKml);
      statusKey = 'kmlStatus';
      sortDir = 'desc';
    }

    const best = sorted.filter(t => t.performance[statusKey] === 'GOOD').slice(0, 5);
    const worst = [...sorted].reverse().filter(t => t.performance[statusKey] === 'POOR').slice(0, 5);

    return { bestPerformers: best, worstPerformers: worst };
  }, [truckStats, leaderboardMetric]);

  const getColor = (status: string) => status === 'GOOD' ? 'text-emerald-600' : status === 'POOR' ? 'text-rose-600' : 'text-slate-400';

  const exportAnalytics = () => {
    const wb = XLSX.utils.book_new();

    // ── Sheet 1: Fleet Fuel Logs ──
    const fleetData: any[][] = [
       ["SAPNA CARTING - STRATEGIC DIESEL AUDIT"],
       [`Report Generated: ${new Date().toLocaleDateString()}`],
       [`Period: ${startDate || 'Start'} to ${endDate || 'End'}`],
       [],
       ["DATE", "VEHICLE", "FLEET", "STATION", "LITERS", "RATE (₹)", "TOTAL (₹)", "DISTANCE", "EFFICIENCY"]
    ];

    filteredFuelLogs.forEach(l => {
       const truck = state.trucks.find(t => t.id === l.truckId);
       const station = state.masterData.fuelStations.find(s => s.id === l.stationId || s.name === l.stationId);
       const distance = (l.odometer || 0) - (l.previousOdometer || 0);
       const efficiency = l.fuelLiters > 0 ? (distance / l.fuelLiters).toFixed(3) : "0.00";
       fleetData.push([
          l.date,
          truck?.plateNumber || "N/A",
          truck?.fleetType || "N/A",
          station?.name || "N/A",
          l.fuelLiters,
          l.dieselPrice || 0,
          (l.fuelLiters * (l.dieselPrice || 0)).toFixed(3),
          distance,
          `${efficiency} KM/L`
       ]);
    });

    const fleetTotalLiters = filteredFuelLogs.reduce((acc, l) => acc + l.fuelLiters, 0);
    const fleetTotalAmount = filteredFuelLogs.reduce((acc, l) => acc + (l.fuelLiters * (l.dieselPrice || 0)), 0);
    fleetData.push([]);
    fleetData.push(["FLEET TOTALS", "", "", "", fleetTotalLiters, "", fleetTotalAmount.toFixed(3)]);

    // ── Misc Entries section ──
    const filteredMisc = state.miscFuelEntries.filter(m => {
      const d = new Date(m.date);
      const s = startDate ? new Date(startDate) : null;
      const e = endDate ? new Date(endDate) : null;
      return (!s || d >= s) && (!e || d <= e);
    });

    if (filteredMisc.length > 0) {
      fleetData.push([]);
      fleetData.push(["--- MISCELLANEOUS ENTRIES ---"]);
      fleetData.push(["DATE", "DESCRIPTION", "TYPE", "STATION", "LITERS", "RATE (₹)", "AMOUNT (₹)"]);
      filteredMisc.forEach(m => {
        const srcStation = state.masterData.fuelStations.find(s => s.id === m.stationId);
        fleetData.push([
          m.date,
          m.vehicleDescription,
          m.usageType,
          srcStation?.name || 'N/A',
          m.fuelLiters,
          m.dieselPrice,
          m.amount.toFixed(2)
        ]);
      });
      const miscTotalLiters = filteredMisc.reduce((acc, m) => acc + m.fuelLiters, 0);
      const miscTotalAmount = filteredMisc.reduce((acc, m) => acc + m.amount, 0);
      fleetData.push([]);
      fleetData.push(["MISC TOTALS", "", "", "", miscTotalLiters, "", miscTotalAmount.toFixed(2)]);
      fleetData.push([]);
      fleetData.push(["GRAND TOTAL (Fleet + Misc)", "", "", "", fleetTotalLiters + miscTotalLiters, "", (fleetTotalAmount + miscTotalAmount).toFixed(2)]);
    }

    const ws = XLSX.utils.aoa_to_sheet(fleetData);
    ws['!cols'] = [{ wch: 12 }, { wch: 25 }, { wch: 15 }, { wch: 25 }, { wch: 10 }, { wch: 10 }, { wch: 14 }, { wch: 10 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, ws, "Diesel Audit");
    XLSX.writeFile(wb, `Fleet_Diesel_Audit_${new Date().getTime()}.xlsx`);
  };

  const exportPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(22); doc.setTextColor(15, 23, 42); doc.setFont("helvetica", "bold");
    doc.text("SAPNA CARTING Audit", 14, 20);
    doc.setFontSize(10); doc.setTextColor(100);
    doc.text(`Strategic Fuel Intelligence Report • ${new Date().toLocaleDateString()}`, 14, 26);

    // ── Section 1: Fleet Fuel Logs ──
    const tableData = filteredFuelLogs.slice(0, 50).map(l => {
      const truck = state.trucks.find(t => t.id === l.truckId);
      return [
        l.date,
        truck?.plateNumber || '--',
        state.masterData.fuelStations.find(s => s.id === l.stationId || s.name === l.stationId)?.name || '--',
        `${l.fuelLiters.toFixed(3)} L`,
        `INR ${(l.fuelLiters * (l.dieselPrice || 0)).toLocaleString()}`
      ];
    });
    const totalL = filteredFuelLogs.reduce((acc, l) => acc + l.fuelLiters, 0);
    const totalA = filteredFuelLogs.reduce((acc, l) => acc + (l.fuelLiters * (l.dieselPrice || 0)), 0);

    autoTable(doc, {
      startY: 36,
      head: [['Date', 'Vehicle', 'Station', 'Liters', 'Amount (₹)']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [15, 23, 42], fontSize: 8 },
      bodyStyles: { fontSize: 8 },
      foot: [['FLEET TOTALS', '', '', `${totalL.toFixed(3)} L`, `INR ${totalA.toLocaleString()}`]],
      footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold', fontSize: 8 }
    });

    // ── Section 2: Miscellaneous Entries ──
    const filteredMisc = state.miscFuelEntries.filter(m => {
      const d = new Date(m.date);
      const s = startDate ? new Date(startDate) : null;
      const e = endDate ? new Date(endDate) : null;
      return (!s || d >= s) && (!e || d <= e);
    });

    if (filteredMisc.length > 0) {
      const miscY = (doc as any).lastAutoTable.finalY + 10;
      doc.setFontSize(11); doc.setTextColor(15, 23, 42); doc.setFont('helvetica', 'bold');
      doc.text('Miscellaneous Fuel Entries', 14, miscY);

      const miscData = filteredMisc.map(m => {
        const srcStation = state.masterData.fuelStations.find(s => s.id === m.stationId);
        return [
          m.date,
          m.vehicleDescription,
          m.usageType,
          srcStation?.name || 'N/A',
          `${m.fuelLiters.toFixed(3)} L`,
          `INR ${m.amount.toLocaleString()}`
        ];
      });
      const miscTotalL = filteredMisc.reduce((acc, m) => acc + m.fuelLiters, 0);
      const miscTotalA = filteredMisc.reduce((acc, m) => acc + m.amount, 0);

      autoTable(doc, {
        startY: miscY + 5,
        head: [['Date', 'Description', 'Type', 'Station', 'Liters', 'Amount (₹)']],
        body: miscData,
        theme: 'grid',
        headStyles: { fillColor: [5, 150, 105], fontSize: 8 },
        bodyStyles: { fontSize: 8 },
        foot: [['MISC TOTALS', '', '', '', `${miscTotalL.toFixed(3)} L`, `INR ${miscTotalA.toLocaleString()}`],
               ['GRAND TOTAL', '', '', '', `${(totalL + miscTotalL).toFixed(3)} L`, `INR ${(totalA + miscTotalA).toLocaleString()}`]],
        footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold', fontSize: 8 }
      });
    }

    doc.save(`Diesel_Audit_Express_${new Date().getTime()}.pdf`);
  };

  const handleSaveReason = async () => {
    if (!taggingWorstTruck || !reasonDraft.trim()) return;
    setIsSavingReason(true);
    try {
      const latestLog = filteredFuelLogs.find(l => l.truckId === taggingWorstTruck);
      if (latestLog) {
         await dbService.updateFuelLog({
            ...latestLog,
            performanceRemarks: reasonDraft
         });
         // Alert user or refresh would be nice, but for now we follow persistence pattern
         alert("Performance reason logged successfully.");
      }
      setTaggingWorstTruck(null);
      setReasonDraft('');
    } catch (err) {
      console.error("Failed to save reason:", err);
      alert("Error saving reason. Check database connection.");
    } finally {
      setIsSavingReason(false);
    }
  };

  const timelineTruck = state.trucks.find(t => t.id === selectedTruckTimeline);
  const timelineLogs = filteredFuelLogs.filter(l => l.truckId === selectedTruckTimeline).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <div className="space-y-6 pb-20 animate-fadeIn">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 px-1">
        <div className="space-y-0.5">
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tighter uppercase leading-none">Diesel Command Center</h2>
          <p className="text-slate-400 text-[7px] font-black uppercase tracking-[0.3em] opacity-80">Strategic Fleet Analytics • Sapna Carting</p>
        </div>
        
        <div className="flex items-center gap-2 w-full md:w-auto">
          <div className="bg-slate-100 p-0.5 rounded-xl flex w-full md:w-auto">
            {(['ALL', 'COAL', 'MINING'] as const).map(f => (
              <button 
                key={f}
                onClick={() => setFilter(f)}
                className={`flex-1 px-3 py-1.5 rounded-lg text-[8px] font-black uppercase transition-all ${filter === f ? 'bg-slate-900 text-white shadow-md' : 'text-slate-400 hover:text-slate-600'}`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-3xl border border-slate-100 shadow-lg shadow-slate-200/50 relative overflow-hidden group">
           <div className="absolute top-0 left-0 w-1 h-full bg-slate-900"></div>
           <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Diesel Spend</p>
           <p className="text-2xl font-black text-slate-900 tracking-tighter">₹{aggregate.cost.toLocaleString()}</p>
           <div className="mt-2 flex items-center gap-1.5">
              <span className="w-1 h-1 rounded-full bg-slate-400 animate-pulse"></span>
              <p className="text-[7px] font-bold text-slate-400 uppercase tracking-tighter">Active Financial Period</p>
           </div>
        </div>

        <div className="bg-white p-4 rounded-3xl border border-slate-100 shadow-lg shadow-slate-200/50 relative overflow-hidden">
           <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500"></div>
           <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Aggregate Liters</p>
           <p className="text-2xl font-black text-emerald-600 tracking-tighter">{aggregate.liters.toLocaleString()} <span className="text-base text-emerald-400/60">L</span></p>
           <div className="mt-2 flex items-center gap-1.5">
              <span className="text-emerald-500 text-[8px]">📈</span>
              <p className="text-[7px] font-bold text-emerald-500 uppercase tracking-tighter">Fuel Liquidity Verified</p>
           </div>
        </div>

        <div className="bg-white p-4 rounded-3xl border border-slate-100 shadow-lg shadow-slate-200/50 relative overflow-hidden">
           <div className="absolute top-0 left-0 w-1 h-full bg-amber-500"></div>
           <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Fleet Efficiency</p>
           <p className="text-2xl font-black text-amber-600 tracking-tighter">{aggregate.avgKml.toFixed(3)} <span className="text-base text-amber-400/60">KM/L</span></p>
           <div className="mt-2 flex items-center gap-1.5">
              <span className="text-amber-500 text-[8px]">⚡</span>
              <p className="text-[7px] font-bold text-amber-500 uppercase tracking-tighter">AVG ACROSS {truckStats.length} UNITS</p>
           </div>
        </div>
      </div>

      {/* 3. PERFORMANCE & LIABILITIES ROW */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-8 space-y-6">
           <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 px-1">
              <div className="flex items-center gap-3">
                 <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Fleet Performance Ranking</h3>
                 <div className="bg-slate-100 p-0.5 rounded-lg flex">
                    {(['KM/L', 'L/TON', 'L/TRIP'] as const).map(m => (
                       <button 
                          key={m}
                          onClick={() => setLeaderboardMetric(m)}
                          className={`px-3 py-1 rounded-md text-[8px] font-black transition-all ${leaderboardMetric === m ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                       >
                          {m}
                       </button>
                    ))}
                 </div>
              </div>
           </div>

           <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-200/40 p-1 overflow-hidden">
              <div className="grid grid-cols-1 md:grid-cols-2">
                 {/* Best Performers */}
                 <div className="p-4 bg-emerald-50/20 border-r border-slate-50">
                    <div className="flex justify-between items-center mb-3 px-1">
                       <span className="text-[8px] font-black text-emerald-600 uppercase tracking-widest bg-emerald-100/50 px-2 py-0.5 rounded-full">🏆 Top Tier</span>
                       <span className="text-xs">✨</span>
                    </div>
                    <div className="space-y-1.5">
                       {bestPerformers.slice(0, 4).map((t, i) => (
                          <div key={t.id} onClick={() => setSelectedTruckTimeline(t.id)} className="bg-white p-2 rounded-xl flex justify-between items-center border border-slate-50 shadow-sm cursor-pointer hover:border-emerald-200 transition-all">
                             <div className="flex items-center gap-2">
                                <span className="text-[8px] font-black text-emerald-400 w-4">#{i+1}</span>
                                <span className="font-black font-mono text-slate-900 text-[11px]">{t.plateNumber}</span>
                             </div>
                             <span className="font-black text-emerald-600 text-[10px]">
                                {leaderboardMetric === 'L/TON' ? `${t.lPerTon.toFixed(3)}L/T` : leaderboardMetric === 'L/TRIP' ? `${t.lPerTrip.toFixed(3)}L/T` : `${t.avgKml.toFixed(3)}KM/L`}
                             </span>
                          </div>
                       ))}
                    </div>
                 </div>

                 {/* Worst Performers */}
                 <div className="p-4 bg-rose-50/20">
                    <div className="flex justify-between items-center mb-3 px-1">
                       <span className="text-[8px] font-black text-rose-600 uppercase tracking-widest bg-rose-100/50 px-2 py-0.5 rounded-full">🛑 Action Required</span>
                       <span className="text-xs">⚠️</span>
                    </div>
                    <div className="space-y-1.5">
                       {worstPerformers.slice(0, 4).map(t => (
                          <div key={t.id} className="bg-white p-2 rounded-xl flex justify-between items-center border border-slate-50 shadow-sm group/card">
                             <div className="flex items-center gap-2 cursor-pointer" onClick={() => setSelectedTruckTimeline(t.id)}>
                                <span className="text-[8px] font-black text-rose-400 w-4">!</span>
                                <span className="font-black font-mono text-slate-900 text-[11px]">{t.plateNumber}</span>
                             </div>
                             <div className="flex items-center gap-2">
                                <span className="font-black text-rose-600 text-[10px]">
                                   {leaderboardMetric === 'L/TON' ? `${t.lPerTon.toFixed(3)}L/T` : leaderboardMetric === 'L/TRIP' ? `${t.lPerTrip.toFixed(3)}L/T` : `${t.avgKml.toFixed(3)}KM/L`}
                                </span>
                                <button 
                                   onClick={() => setTaggingWorstTruck(t.id)}
                                   className="w-5 h-5 bg-slate-900 text-white rounded-md flex items-center justify-center text-[8px] opacity-0 group-hover/card:opacity-100 transition-all active:scale-95"
                                >
                                   💬
                                </button>
                             </div>
                          </div>
                       ))}
                    </div>
                 </div>
              </div>
           </div>
        </div>

        {/* LIABILITIES STRIP (TIGHTENED) */}
        <div className="lg:col-span-4 bg-slate-900 rounded-[2.5rem] p-5 shadow-2xl relative overflow-hidden group">
           <div className="relative z-10 space-y-4">
              <div className="flex justify-between items-start">
                 <div>
                    <h3 className="text-[10px] font-black text-amber-500 uppercase tracking-[0.2em] mb-0.5">Fuel Liabilities</h3>
                    <p className="text-[7px] font-bold text-slate-400 uppercase tracking-widest">Outstanding Debt Tracker</p>
                 </div>
                 <span className="bg-emerald-500 w-1.5 h-1.5 rounded-full animate-pulse shadow-lg shadow-emerald-500/50"></span>
              </div>

              <div className="space-y-2">
                 {stationStats.slice(0, 3).map(s => (
                    <div key={s.id} onClick={() => onNavigate?.('station-ledger', { stationId: s.id })} className="bg-slate-800/50 border border-slate-700/50 p-2.5 rounded-2xl hover:bg-slate-800 transition-all cursor-pointer group/row">
                       <div className="flex justify-between items-start mb-0.5">
                          <span className="text-[9px] font-black text-slate-300 uppercase truncate max-w-[120px]">{s.name}</span>
                          <span className="text-[11px] font-black text-white">₹{Math.round(s.cost).toLocaleString()}</span>
                       </div>
                       <div className="flex justify-between items-center">
                          <span className="text-[7px] font-bold text-slate-500 uppercase tracking-tighter group-hover/row:text-slate-400 transition-colors">Total Issued</span>
                          <span className="text-[8px] font-black text-slate-400">{s.liters.toFixed(3)} L</span>
                       </div>
                    </div>
                 ))}
              </div>

              <div className="pt-2 border-t border-slate-800">
                 <p className="text-[8px] font-black text-slate-500 uppercase tracking-[0.2em] mb-1">Total Outstanding</p>
                 <div className="flex justify-between items-end">
                    <p className="text-2xl font-black text-white tracking-tighter">₹{Math.round(stationStats.reduce((acc, s) => acc + s.cost, 0)).toLocaleString()}</p>
                    <div className="flex flex-col items-end">
                       <span className="text-[7px] font-black text-emerald-500 uppercase tracking-widest mb-0.5">Verified</span>
                       <div className="flex gap-0.5">
                          <div className="w-1 h-1 rounded-full bg-emerald-500/30"></div>
                          <div className="w-1 h-1 rounded-full bg-emerald-500/60"></div>
                          <div className="w-1 h-1 rounded-full bg-emerald-500"></div>
                       </div>
                    </div>
                 </div>
              </div>
           </div>
        </div>
      </div>
{/* 4. TRANSACTION ENGINE (REDESIGNED) */}
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 px-2">
           <div className="flex items-center gap-4">
              <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.3em]">Transaction Audit List</h3>
              <button 
                onClick={() => setShowTransactionList(!showTransactionList)}
                className="text-[9px] font-black text-slate-900 border-b-2 border-slate-900 uppercase py-0.5 hover:opacity-50 transition-opacity"
              >
                {showTransactionList ? 'HIDE ENGINE' : 'REVEAL ENGINE'}
              </button>
           </div>
           <div className="flex items-center gap-2">
              <button onClick={exportAnalytics} className="bg-emerald-600/10 text-emerald-600 px-4 py-2 rounded-xl font-black text-[9px] uppercase tracking-widest hover:bg-emerald-600 hover:text-white transition-all">Excel</button>
              <button onClick={exportPDF} className="bg-rose-600 text-white px-4 py-2 rounded-xl font-black text-[9px] uppercase tracking-widest shadow-lg shadow-rose-200 active:scale-95 transition-all">PDF</button>
              <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest ml-4 hidden md:block">{filteredFuelLogs.length} Records</p>
           </div>
        </div>

        {showTransactionList && (
           <div className="bg-white rounded-[3.5rem] shadow-2xl shadow-slate-200 border border-slate-100 overflow-hidden flex flex-col">
              {/* ADVANCED FILTER CONSOLE */}
              <div className="p-6 sm:p-10 border-b border-slate-50 grid grid-cols-1 lg:grid-cols-4 gap-6 bg-slate-50/30">
                 <div className="relative">
                    <span className="absolute left-5 top-1/2 -translate-y-1/2 text-lg opacity-30">🔍</span>
                    <input 
                      type="text" 
                      placeholder="Vehicle Search..." 
                      className="w-full pl-14 pr-6 py-4 bg-white border border-slate-200 rounded-[1.5rem] font-bold text-sm outline-none focus:ring-4 ring-slate-900/5 transition-all"
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                    />
                 </div>
                 <div className="flex gap-3">
                    <input 
                      type="date" 
                      className="flex-1 p-4 bg-white border border-slate-200 rounded-[1.5rem] font-bold text-xs outline-none focus:ring-4 ring-slate-900/5 transition-all uppercase"
                      value={startDate}
                      onChange={e => setStartDate(e.target.value)}
                    />
                    <input 
                      type="date" 
                      className="flex-1 p-4 bg-white border border-slate-200 rounded-[1.5rem] font-bold text-xs outline-none focus:ring-4 ring-slate-900/5 transition-all uppercase"
                      value={endDate}
                      onChange={e => setEndDate(e.target.value)}
                    />
                 </div>
                 <select 
                    className="p-4 bg-white border border-slate-200 rounded-[1.5rem] font-black text-[10px] uppercase tracking-widest outline-none focus:ring-4 ring-slate-900/5 transition-all"
                    value={selectedStation}
                    onChange={e => setSelectedStation(e.target.value)}
                 >
                    <option value="ALL">ALL STATIONS</option>
                    {state.masterData.fuelStations.map(s => (
                       <option key={s.id} value={s.id}>{s.name.toUpperCase()}{s.isInternal ? ' (TANKER)' : ''}</option>
                    ))}
                 </select>
                 <div className="flex gap-2">
                    <button className="flex-1 px-4 py-4 bg-slate-900 text-white rounded-[1.5rem] font-black text-[10px] uppercase tracking-widest active:scale-95 transition-all">Apply Filter</button>
                    <button 
                      onClick={() => { setSearchQuery(''); setStartDate(''); setEndDate(''); setSelectedStation('ALL'); }}
                      className="px-6 py-4 bg-slate-200 text-slate-500 rounded-[1.5rem] font-black text-[10px] uppercase tracking-widest active:scale-95 transition-all"
                    >
                      Reset
                    </button>
                 </div>
              </div>

              {/* AUDIT TABLE */}
              <div className="overflow-x-auto scrollbar-hide">
                 <table className="w-full text-left text-[11px]">
                     <thead className="bg-slate-50 text-slate-400 font-black uppercase tracking-widest">
                        <tr>
                           <th className="px-8 py-5">Audit Date</th>
                           <th className="px-8 py-5">Vehicle Identity</th>
                           <th className="px-8 py-5">Source station</th>
                           <th className="px-8 py-5 text-center">Fuel Vol.</th>
                           <th className="px-8 py-5 text-center">Trip Stats</th>
                           <th className="px-8 py-5 text-right">Debit (INR)</th>
                        </tr>
                     </thead>
                     <tbody className="divide-y divide-slate-50">
                        {filteredFuelLogs.slice(0, 50).map(l => {
                           const truck = state.trucks.find(t => t.id === l.truckId);
                           const station = state.masterData.fuelStations.find(s => s.id === l.stationId || s.name === l.stationId);
                           const distance = (l.odometer || 0) - (l.previousOdometer || 0);
                           const kml = l.fuelLiters > 0 ? (distance / l.fuelLiters).toFixed(3) : "0.00";
                           
                           return (
                              <tr key={l.id} className="hover:bg-slate-50/50 transition-colors group">
                                 <td className="px-8 py-4 font-bold text-slate-500 whitespace-nowrap">{l.date}</td>
                                 <td className="px-8 py-4">
                                    <button 
                                      onClick={() => setViewingSpecificLog(l)}
                                      className="flex flex-col text-left group/id"
                                    >
                                       <span className="font-black text-sm text-slate-900 font-mono tracking-tight group-hover/id:text-blue-600 transition-colors">{truck?.plateNumber || '--'}</span>
                                       <span className="text-[7.5px] font-black text-slate-400 uppercase">{truck?.fleetType} • VIEW PROOF</span>
                                    </button>
                                 </td>
                                 <td className="px-8 py-4">
                                    <div className="flex items-center gap-2">
                                       <span className="text-amber-600 font-black text-[10px] uppercase group-hover:underline cursor-pointer" onClick={() => station && onNavigate?.('station-ledger', { stationId: station.id })}>
                                         {station?.name || 'Self Recovery'}
                                       </span>
                                    </div>
                                 </td>
                                 <td className="px-8 py-4 text-center font-black text-slate-900 text-sm">{l.fuelLiters.toFixed(3)} L</td>
                                 <td className="px-8 py-4 text-center">
                                    <div className="flex flex-col items-center gap-0.5">
                                      <span className="text-[10px] font-black text-slate-900">{kml} KM/L</span>
                                      <span className="text-[7.5px] font-black text-slate-400 uppercase">{distance} KM TRIP</span>
                                    </div>
                                 </td>
                                 <td className="px-8 py-4 text-right">
                                    <div className="flex flex-col items-end">
                                      <span className="font-black text-emerald-600 text-sm">₹{(l.fuelLiters * (l.dieselPrice || 0)).toLocaleString()}</span>
                                      {l.performanceRemarks && (
                                        <span className="text-[7px] bg-slate-100 px-1 py-0.5 rounded uppercase font-black text-slate-500 mt-1">Remark logged</span>
                                      )}
                                    </div>
                                 </td>
                              </tr>
                           );
                        })}
                       {filteredFuelLogs.length === 0 && (
                          <tr>
                             <td colSpan={6} className="px-10 py-20 text-center text-slate-400 font-black uppercase tracking-widest opacity-40">Zero Log Match Filters</td>
                          </tr>
                       )}
                    </tbody>
                 </table>
              </div>
           </div>
        )}
      </div>

      {/* 5. OVERLAYS (MODALS) - PRESERVED LOGIC */}
      {selectedTruckTimeline && timelineTruck && (
         <div className="fixed inset-0 bg-slate-900/95 backdrop-blur-xl z-[1500] flex items-center justify-center p-4 animate-fadeIn">
            <div className="bg-white rounded-[3.5rem] shadow-2xl w-full max-w-4xl h-[90vh] overflow-hidden flex flex-col animate-scaleIn">
               <div className="bg-slate-900 p-8 sm:p-10 text-white flex justify-between items-center shrink-0">
                  <div className="flex items-center gap-6">
                     <div className="w-16 h-16 bg-white/5 rounded-[2rem] flex items-center justify-center text-3xl">🚚</div>
                     <div>
                        <h3 className="text-2xl font-black font-mono tracking-tighter uppercase">{timelineTruck.plateNumber} journey history</h3>
                        <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mt-1">Audit Log • Sequential Timeline</p>
                     </div>
                  </div>
                  <button onClick={() => setSelectedTruckTimeline(null)} className="text-white/40 hover:text-white text-5xl font-light transition-colors leading-none">&times;</button>
               </div>
               
               <div className="flex-1 overflow-y-auto p-10 space-y-8 scrollbar-hide bg-slate-50/30">
                  <div className="relative pl-10 border-l-2 border-slate-200 ml-4 py-4">
                     <div className="space-y-10">
                        {timelineLogs.map((log) => {
                           const station = state.masterData.fuelStations.find(s => s.id === log.stationId || s.name === log.stationId);
                           return (
                              <div key={log.id} className="relative group">
                                 <div className="absolute -left-[51px] top-6 w-5 h-5 bg-slate-100 rounded-full border-4 border-white shadow-md z-10 group-hover:bg-amber-500 group-hover:border-amber-100 transition-all"></div>
                                 <div className="bg-white p-6 sm:p-8 rounded-[2.5rem] border border-slate-100 shadow-sm hover:shadow-xl hover:shadow-slate-200/50 transition-all flex flex-col md:flex-row justify-between items-center gap-6">
                                    <div className="min-w-[140px]">
                                       <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{log.date}</p>
                                       <p className="text-3xl font-black text-slate-900">{log.fuelLiters.toFixed(3)} <span className="text-lg">L</span></p>
                                    </div>
                                    <div className="flex-1 grid grid-cols-2 lg:grid-cols-4 gap-6 w-full">
                                       <div className="space-y-1">
                                          <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Efficiency</p>
                                          <p className="text-sm font-black text-amber-600">{(log.fuelLiters > 0 ? ((log.odometer - log.previousOdometer) / log.fuelLiters).toFixed(3) : '0.00')} KM/L</p>
                                       </div>
                                       <div className="space-y-1">
                                          <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Odo Delta</p>
                                          <p className="text-sm font-black text-slate-900">{(log.odometer - log.previousOdometer).toLocaleString()} KM</p>
                                       </div>
                                       <div className="space-y-1">
                                          <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Station</p>
                                          <p className="text-[11px] font-bold text-slate-900 truncate uppercase">{station?.name || 'Self Recovery'}</p>
                                       </div>
                                       <div className="space-y-1">
                                          <p className="text-[8px] font-black text-emerald-500 uppercase tracking-widest">Net Value</p>
                                          <p className="text-sm font-black text-emerald-600 tracking-tighter">₹{(log.fuelLiters * (log.dieselPrice || 0)).toLocaleString()}</p>
                                       </div>
                                    </div>
                                    <button onClick={() => setViewingSpecificLog(log)} className="bg-slate-50 text-slate-400 p-4 rounded-2xl hover:bg-slate-900 hover:text-white transition-all text-sm">👁️</button>
                                 </div>
                              </div>
                           );
                        })}
                     </div>
                  </div>
               </div>

               <div className="p-10 bg-white border-t border-slate-100 flex justify-between items-center shrink-0">
                  <div className="flex gap-12">
                     <div>
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Fuel Journey</p>
                        <p className="text-2xl font-black text-emerald-600">{timelineLogs.reduce((acc, l) => acc + l.fuelLiters, 0).toFixed(3)} L</p>
                     </div>
                     <div>
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Estimated Cost</p>
                        <p className="text-2xl font-black text-slate-900">₹{timelineLogs.reduce((acc, l) => acc + (l.fuelLiters * (l.dieselPrice || 0)), 0).toLocaleString()}</p>
                     </div>
                  </div>
                  <button onClick={() => setSelectedTruckTimeline(null)} className="px-12 py-5 bg-slate-900 text-white rounded-[1.5rem] font-black text-xs uppercase tracking-widest shadow-xl active:scale-95 transition-all">Dismiss History</button>
               </div>
            </div>
         </div>
      )}

      {/* 6. RECEIPT MODAL - PRESERVED & STYLED */}
      {viewingSpecificLog && (
        <div className="fixed inset-0 bg-slate-900/98 backdrop-blur-xl z-[2000] flex items-center justify-center p-4 animate-fadeIn">
           <div className="bg-white rounded-[4rem] shadow-2xl w-full max-w-2xl overflow-hidden animate-scaleIn flex flex-col max-h-[90vh]">
              <div className="bg-slate-900 p-8 sm:p-10 text-white flex justify-between items-center shrink-0">
                 <div>
                    <h3 className="text-2xl font-black uppercase tracking-tighter">Audit Receipt</h3>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Verified Digital Proof</p>
                 </div>
                 <button onClick={() => setViewingSpecificLog(null)} className="text-white hover:text-rose-500 text-5xl font-light transition-colors leading-none">&times;</button>
              </div>
              <div className="p-10 space-y-10 overflow-y-auto scrollbar-hide flex-1 bg-white">
                 <div className="grid grid-cols-2 gap-10 pb-10 border-b border-slate-100">
                    <div className="space-y-1">
                       <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">Transaction Date</p>
                       <p className="text-xl font-black text-slate-900">{viewingSpecificLog.date}</p>
                    </div>
                    <div className="space-y-1">
                       <p className="text-[9px] font-black text-emerald-500 uppercase tracking-[0.2em]">Volume Issued</p>
                       <p className="text-2xl font-black text-emerald-600 tracking-tight">{viewingSpecificLog.fuelLiters.toFixed(3)} L</p>
                    </div>
                    <div className="space-y-1">
                       <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">Supplier Station</p>
                       <p className="text-lg font-black text-amber-600 uppercase tracking-tight">{state.masterData.fuelStations.find(s => s.id === viewingSpecificLog.stationId || s.name === viewingSpecificLog.stationId)?.name || 'SELF RECOVERY'}</p>
                    </div>
                    <div className="space-y-1">
                       <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">Current Liability</p>
                       <p className="text-2xl font-black text-slate-900 font-mono tracking-tighter">₹{(viewingSpecificLog.fuelLiters * (viewingSpecificLog.dieselPrice || 0)).toLocaleString()}</p>
                    </div>
                 </div>

                 <div className="space-y-6">
                    <div className="flex justify-between items-center">
                       <p className="text-[11px] font-black text-slate-900 uppercase tracking-widest">Digital Audit Proofs</p>
                       <div className="h-0.5 flex-1 bg-slate-50 ml-4"></div>
                    </div>
                    <div className="grid grid-cols-2 gap-6">
                       {viewingSpecificLog.verificationPhotos && Object.entries(viewingSpecificLog.verificationPhotos).map(([key, url]) => {
                         if (!url || key === 'tank') return null;
                         return (
                           <div key={key} className="space-y-3">
                              <p className="text-[9px] font-black text-slate-400 uppercase text-center tracking-[0.2em]">{key}</p>
                              <div className="h-40 sm:h-52 border-2 border-slate-100 rounded-[2.5rem] overflow-hidden bg-slate-50 shadow-inner group relative">
                                 <img src={url} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" alt={key} />
                                 <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                    <span className="text-white font-black text-[10px] uppercase border border-white/50 px-4 py-2 rounded-full">Expand Proof</span>
                                 </div>
                              </div>
                           </div>
                         );
                       })}
                    </div>
                 </div>
              </div>
              <div className="p-10 bg-slate-50 border-t border-slate-100 flex gap-4 shrink-0">
                  <button onClick={() => setViewingSpecificLog(null)} className="w-full py-5 bg-slate-900 text-white rounded-[1.5rem] font-black uppercase text-xs tracking-widest active:scale-95 shadow-2xl transition-all">Dismiss Audit Proof</button>
              </div>
           </div>
        </div>
      )}
      {/* 7. PERFORMANCE REASON MODAL */}
      {taggingWorstTruck && (
         <div className="fixed inset-0 bg-slate-900/95 backdrop-blur-xl z-[2500] flex items-center justify-center p-4 animate-fadeIn">
            <div className="bg-white rounded-[3rem] shadow-2xl w-full max-w-lg overflow-hidden animate-scaleIn">
               <div className="bg-rose-600 p-8 text-white flex justify-between items-center">
                  <div>
                     <h3 className="text-xl font-black uppercase tracking-tight">Log Performance Reason</h3>
                     <p className="text-[9px] font-bold text-rose-100 uppercase tracking-widest mt-1">Vehicle: {state.trucks.find(t => t.id === taggingWorstTruck)?.plateNumber}</p>
                  </div>
                  <button onClick={() => setTaggingWorstTruck(null)} className="text-white/60 hover:text-white text-3xl leading-none">&times;</button>
               </div>
               <div className="p-8 space-y-6">
                  <div className="space-y-2">
                     <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Why is this a poor performer?</label>
                     <textarea 
                        className="w-full h-32 p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-sm outline-none focus:ring-4 ring-rose-600/5 transition-all resize-none"
                        placeholder="e.g., Heavy traffic, engine issues, prolonged idling at site..."
                        value={reasonDraft}
                        onChange={e => setReasonDraft(e.target.value)}
                     ></textarea>
                  </div>
                  <div className="flex gap-3">
                     <button 
                        onClick={() => setTaggingWorstTruck(null)}
                        className="flex-1 py-4 bg-slate-100 text-slate-500 rounded-2xl font-black text-[10px] uppercase tracking-widest active:scale-95 transition-all"
                     >
                        Cancel
                     </button>
                     <button 
                        disabled={isSavingReason}
                        onClick={handleSaveReason}
                        className="flex-2 px-10 py-4 bg-rose-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl shadow-rose-200 active:scale-95 transition-all flex items-center justify-center gap-2"
                     >
                        {isSavingReason ? (
                           <>
                              <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                              Saving...
                           </>
                        ) : 'Save Audit Remark'}
                     </button>
                  </div>
               </div>
            </div>
         </div>
      )}
    </div>
  );
};

export default FuelAnalytics;