
import React, { useState, useMemo } from 'react';
import { Tire, FleetState, TirePurchase, TireHistoryEntry, MasterData } from '../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell, PieChart, Pie } from 'recharts';

declare const XLSX: any;

interface TireInventoryProps {
  state: FleetState;
  onAddTire: (tire: Tire | Tire[]) => void;
  onUpdateTireStatus?: (tireId: string, status: Tire['status'], scrappedReason?: string, mileage?: number) => void;
  onUpdateTire?: (tireId: string, updates: Partial<Tire>) => void;
  onNavigateToTruck?: (truckId: string) => void;
}

const TireInventory: React.FC<TireInventoryProps> = ({ state, onAddTire, onUpdateTireStatus, onUpdateTire, onNavigateToTruck }) => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'NEW' | 'MOUNTED' | 'SPARE' | 'REPAIR' | 'SCRAPPED'>('ALL');
  const [brandFilter, setBrandFilter] = useState('ALL');
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [isEditStatusModalOpen, setIsEditStatusModalOpen] = useState(false);
  const [isEditSpecsModalOpen, setIsEditSpecsModalOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [isTireReportModalOpen, setIsTireReportModalOpen] = useState(false);
  const [viewingTire, setViewingTire] = useState<Tire | null>(null);
  const [editingTire, setEditingTire] = useState<Tire | null>(null);
  const [specBuffer, setSpecBuffer] = useState<Partial<Tire>>({});
  const [showStatusSuccess, setShowStatusSuccess] = useState(false);
  const [showSpecsSuccess, setShowSpecsSuccess] = useState(false);

  // Reporting Engine States
  const [repBrandFilter, setRepBrandFilter] = useState('ALL');
  const [repSerialFilter, setRepSerialFilter] = useState('ALL');

  const [bulkSetup, setBulkSetup] = useState({ supplier: '', billNumber: '', count: '1' });
  const [bulkTires, setBulkTires] = useState<{ serialNumber: string, brand: string, startingKm: string }[]>([]);
  const [bulkStep, setBulkStep] = useState<1 | 2>(1);

  const [newTire, setNewTire] = useState({
    serialNumber: '', brand: '', size: '12.00R20', manufacturer: '', supplier: '', billNumber: '', status: 'NEW' as Tire['status'], mileage: '0'
  });

  // Ensure initial brand is from master data if available
  useMemo(() => {
    if (!newTire.brand && state.masterData.tireBrands.length > 0) {
      setNewTire(prev => ({ ...prev, brand: state.masterData.tireBrands[0] }));
    }
  }, [state.masterData.tireBrands]);

  const allTires = useMemo(() => {
    const tireMap = new Map<string, any>();
    
    // First, add all from inventory (base data)
    state.tireInventory.forEach(t => {
      tireMap.set(t.id, { ...t });
    });
    
    // Then, overlay with mounted tires (enriched with plate/position)
    state.trucks.forEach(truck => {
      (truck.tires || []).forEach(t => {
        const existing = tireMap.get(t.id);
        tireMap.set(t.id, { 
          ...(existing || t), 
          truckId: truck.id, 
          plateNumber: truck.plateNumber 
        });
      });
    });
    
    return Array.from(tireMap.values());
  }, [state.trucks, state.tireInventory]);

  const brands = useMemo(() => ['ALL', ...new Set(allTires.map(t => t.brand))], [allTires]);

  const filteredTires = allTires.filter(t => {
    const s = search.toLowerCase();
    const plate = (t as any).plateNumber?.toLowerCase() || '';
    const matchesSearch = (t.serialNumber || '').toLowerCase().includes(s) ||
                         (t.brand || '').toLowerCase().includes(s) ||
                         plate.includes(s);
    const matchesStatus = statusFilter === 'ALL' || t.status === statusFilter;
    const matchesBrand = brandFilter === 'ALL' || t.brand === brandFilter;
    return matchesSearch && matchesStatus && matchesBrand;
  });

  const getTireMileageDetails = (tire: Tire) => {
    const history = [...(tire.history || [])];
    let totalMileage = 0;
    const processedHistory: any[] = [];
    let activeMountOdo: number | null = null;

    const currentTruck = state.trucks.find(t => t.id === tire.truckId);

    history.forEach((entry) => {
      let runDistance = 0;

      if (entry.event === 'Mounted') {
        const odoMatch = entry.description.match(/ODO:\s*(\d+)/i);
        if (odoMatch) {
          activeMountOdo = parseInt(odoMatch[1]);
        }
      } else if (entry.event === 'Unmounted') {
        const odoMatch = entry.description.match(/at\s*(\d+)\s*KM/i);
        if (odoMatch && activeMountOdo !== null) {
          runDistance = Math.max(0, parseInt(odoMatch[1]) - activeMountOdo);
          totalMileage += runDistance;
          activeMountOdo = null;
        }
      }

      processedHistory.push({ ...entry, runDistance });
    });

    if (tire.status === 'MOUNTED' && activeMountOdo !== null && currentTruck) {
      const ongoingDistance = Math.max(0, currentTruck.currentOdometer - activeMountOdo);
      totalMileage += ongoingDistance;
      for (let i = processedHistory.length - 1; i >= 0; i--) {
        if (processedHistory[i].event === 'Mounted') {
          processedHistory[i].runDistance = ongoingDistance;
          break;
        }
      }
    }

    return { processedHistory, totalMileage };
  };

  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTire.serialNumber || !newTire.brand) return;
    const tire: Tire = {
      id: crypto.randomUUID(),
      serialNumber: newTire.serialNumber.toUpperCase(),
      brand: newTire.brand,
      size: newTire.size,
      mileage: parseInt(newTire.mileage) || 0,
      expectedLifespan: 100000,
      status: 'NEW',
      lastInspectionDate: new Date().toISOString(),
      manufacturer: newTire.brand, // Use brand as manufacturer by default
      supplier: newTire.supplier,
      billNumber: newTire.billNumber,
      history: [{ date: new Date().toISOString().split('T')[0], event: 'Procured', description: `Registered via Manual Entry. Bill: ${newTire.billNumber}, Start KM: ${newTire.mileage}` }]
    };
    onAddTire(tire);
    setIsRegisterModalOpen(false);
    setNewTire({ serialNumber: '', brand: state.masterData.tireBrands[0] || '', size: '12.00R20', manufacturer: '', supplier: '', billNumber: '', status: 'NEW', mileage: '0' });
  };

  const handlePrepareBulk = (e: React.FormEvent) => {
    e.preventDefault();
    const count = parseInt(bulkSetup.count) || 1;
    setBulkTires(Array.from({ length: count }).map(() => ({ 
      serialNumber: '', 
      brand: state.masterData.tireBrands[0] || '', 
      startingKm: '0' 
    })));
    setBulkStep(2);
  };

  const handleBulkFinalSave = () => {
    const tiresToSave: Tire[] = bulkTires
      .filter(bt => bt.serialNumber)
      .map((bt) => ({
        id: crypto.randomUUID(),
        serialNumber: bt.serialNumber.toUpperCase(),
        brand: bt.brand,
        size: '12.00R20',
        mileage: parseInt(bt.startingKm) || 0,
        expectedLifespan: 100000,
        status: 'NEW',
        lastInspectionDate: new Date().toISOString(),
        manufacturer: bt.brand,
        supplier: bulkSetup.supplier,
        billNumber: bulkSetup.billNumber,
        history: [{ date: new Date().toISOString().split('T')[0], event: 'Procured', description: `Bulk Import. Bill: ${bulkSetup.billNumber}, Start KM: ${bt.startingKm}` }]
      }));
    if (tiresToSave.length > 0) {
      onAddTire(tiresToSave);
      setIsBulkModalOpen(false);
      setBulkStep(1);
      setBulkSetup({ supplier: '', billNumber: '', count: '1' });
    }
  };

  const handleUpdateStatusSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingTire && onUpdateTireStatus) {
      await onUpdateTireStatus(editingTire.id, editingTire.status, editingTire.scrappedReason, editingTire.mileage);
      setIsEditStatusModalOpen(false);
      setEditingTire(null);
      setShowStatusSuccess(true);
      setTimeout(() => setShowStatusSuccess(false), 3000);
    }
  };

  const handleUpdateSpecsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingTire && onUpdateTire) {
      await onUpdateTire(editingTire.id, specBuffer);
      setIsEditSpecsModalOpen(false);
      setEditingTire(null);
      setSpecBuffer({});
      setShowSpecsSuccess(true);
      setTimeout(() => setShowSpecsSuccess(false), 3000);
    }
  };

  const openManualUpdateModal = (tire: Tire) => {
    const details = getTireMileageDetails(tire);
    setEditingTire({ ...tire, mileage: details.totalMileage });
    setIsEditStatusModalOpen(true);
  };

  const openEditSpecsModal = (tire: Tire) => {
    setEditingTire(tire);
    setSpecBuffer({ ...tire });
    setIsEditSpecsModalOpen(true);
  };

  const exportSingleTireHistory = (tire: Tire) => {
    const { processedHistory, totalMileage } = getTireMileageDetails(tire);
    const data = processedHistory.map((h, idx) => ({
      'SR NO': idx + 1,
      'SERIAL': tire.serialNumber,
      'DATE': h.date,
      'EVENT': h.event,
      'DETAILS': h.description,
      'DISTANCE IN PERIOD (KM)': h.runDistance || 0
    }));
    data.push({
      'SR NO': 'TOTAL',
      'SERIAL': '',
      'DATE': '',
      'EVENT': '',
      'DETAILS': 'Cumulative Distance Travelled',
      'DISTANCE IN PERIOD (KM)': totalMileage
    } as any);
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Tire Audit");
    XLSX.writeFile(wb, `Audit_${tire.serialNumber}_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const reportingTires = useMemo(() => {
    return allTires.filter(t => {
      const brandMatch = repBrandFilter === 'ALL' || t.brand === repBrandFilter;
      const serialMatch = repSerialFilter === 'ALL' || t.id === repSerialFilter;
      return brandMatch && serialMatch;
    });
  }, [allTires, repBrandFilter, repSerialFilter]);

  const reportStats = useMemo(() => {
    let totalKm = 0;
    reportingTires.forEach(t => {
      totalKm += getTireMileageDetails(t).totalMileage;
    });
    return {
      totalKm,
      count: reportingTires.length,
      avgKm: reportingTires.length > 0 ? totalKm / reportingTires.length : 0
    };
  }, [reportingTires]);

  const exportBrandDetailedExcel = () => {
    const mainData = reportingTires.map((t, idx) => {
      const details = getTireMileageDetails(t);
      const journey = (t.history || []).map(h => `${h.event} (${h.date})`).join(' > ');
      return {
        'SR NO': idx + 1,
        'SERIAL': t.serialNumber,
        'BRAND': t.brand,
        'SIZE': t.size,
        'STATUS': t.status,
        'TOTAL RUN (KM)': details.totalMileage,
        'EXPECTED LIFE (KM)': t.expectedLifespan,
        'SCRAP MILEAGE': t.status === 'SCRAPPED' ? t.mileage : 'N/A',
        'SCRAP REASON': t.scrappedReason || '',
        'BILL NO': t.billNumber || '',
        'SUPPLIER': t.supplier || '',
        'MANUFACTURER': t.manufacturer || '',
        'LIFECYCLE JOURNEY': journey
      };
    });
    const historyData: any[] = [];
    reportingTires.forEach(t => {
      const { processedHistory } = getTireMileageDetails(t);
      processedHistory.forEach(h => {
        historyData.push({
          'TIRE SERIAL': t.serialNumber,
          'BRAND': t.brand,
          'DATE': h.date,
          'EVENT': h.event,
          'DETAILS': h.description,
          'KM IN PERIOD': h.runDistance || 0
        });
      });
    });
    const wb = XLSX.utils.book_new();
    const wsMain = XLSX.utils.json_to_sheet(mainData);
    const wsHistory = XLSX.utils.json_to_sheet(historyData);
    XLSX.utils.book_append_sheet(wb, wsMain, "Asset Summary");
    XLSX.utils.book_append_sheet(wb, wsHistory, "Audit Trail");
    XLSX.writeFile(wb, `Fleet_Report_${repBrandFilter}_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  return (
    <div className="space-y-6 animate-fadeIn w-full max-w-full print:p-0">
      {showStatusSuccess && (
        <div className="fixed top-8 right-8 z-[600] bg-emerald-600 text-white px-8 py-4 rounded-2xl shadow-2xl font-black animate-slideInRight border-b-4 border-emerald-800">
          ✓ TIRE LIFECYCLE UPDATED
        </div>
      )}

      {showSpecsSuccess && (
        <div className="fixed top-8 right-8 z-[600] bg-emerald-600 text-white px-8 py-4 rounded-2xl shadow-2xl font-black animate-slideInRight border-b-4 border-emerald-800">
          ✓ TIRE SPECIFICATIONS SAVED
        </div>
      )}

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 px-1 no-print">
        <div className="flex-1">
          <p className="text-[10px] font-black text-amber-600 uppercase tracking-[0.3em] block mb-1">Fleet Asset Control</p>
          <h2 className="text-3xl font-black text-slate-900 tracking-tighter">Tire Inventory Pool</h2>
        </div>
        <div className="flex gap-2">
           <button onClick={() => { setIsTireReportModalOpen(true); setRepBrandFilter('ALL'); setRepSerialFilter('ALL'); }} className="bg-white border border-slate-200 text-slate-900 px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-50 shadow-sm transition-all flex items-center gap-2">
             <span>📊</span> REPORTS
           </button>
           <button onClick={() => setIsBulkModalOpen(true)} className="bg-white border border-slate-200 text-slate-900 px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-50 shadow-sm transition-all">+ BULK IMPORT</button>
          <button onClick={() => setIsRegisterModalOpen(true)} className="bg-slate-900 hover:bg-black text-white px-8 py-3 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl active:scale-95 transition-all">+ REGISTER TIRE</button>
        </div>
      </div>

      <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-6 border-b border-slate-50 flex flex-col lg:flex-row gap-4 items-center justify-between no-print">
           <div className="relative flex-1 max-w-md w-full">
              <input type="text" placeholder="Search by serial, brand or vehicle plate..." className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold outline-none focus:ring-2 focus:ring-amber-500 transition-all" value={search} onChange={(e) => setSearch(e.target.value)} />
              <span className="absolute left-4 top-3.5 opacity-40">🔍</span>
           </div>
           <div className="flex gap-2 w-full lg:w-auto">
             <select className="flex-1 lg:w-48 p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs outline-none" value={brandFilter} onChange={(e) => setBrandFilter(e.target.value)}>
                {brands.map(b => <option key={b} value={b}>{b === 'ALL' ? 'All Brands' : b}</option>)}
              </select>
             <select className="flex-1 lg:w-48 p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs outline-none" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)}>
                <option value="ALL">All Categories</option>
                <option value="NEW">New Stock</option>
                <option value="MOUNTED">On Trucks</option>
                <option value="SPARE">Ready Spares</option>
                <option value="SCRAPPED">Retired/Scrap</option>
              </select>
           </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[1000px]">
            <thead className="bg-slate-900 text-slate-300">
              <tr className="text-[10px] font-black uppercase tracking-widest">
                <th className="px-5 py-5 w-16 text-center">#</th>
                <th className="px-5 py-5">SERIAL / BRAND</th>
                <th className="px-5 py-5">PROCUREMENT INFO</th>
                <th className="px-5 py-5 text-center">STATUS / LOCATION</th>
                <th className="px-5 py-5 text-center">TOTAL RUN (KM)</th>
                <th className="px-5 py-5 text-right no-print">ACTIONS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-[11px]">
              {filteredTires.map((tire, idx) => (
                <tr key={tire.id} className="hover:bg-slate-50 transition-colors group">
                  <td className="px-5 py-4 font-black text-slate-300">
                    {(idx + 1).toString().padStart(2, '0')}
                  </td>
                  <td className="px-5 py-4 cursor-pointer" onClick={() => { setViewingTire(tire); setIsHistoryModalOpen(true); }}>
                    <div className="flex flex-col">
                      <span className="font-black text-slate-900 font-mono text-base">{tire.serialNumber}</span>
                      <span className="font-bold text-slate-400 text-[10px] uppercase">{tire.brand} • {tire.size}</span>
                      <span className="text-[8px] font-black text-amber-500 uppercase mt-1 tracking-widest hover:text-amber-600 transition-colors">TIMELINE AUDIT →</span>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex flex-col text-[10px] font-bold">
                      <span className="text-slate-400 uppercase">SUP: {tire.supplier || 'N/A'}</span>
                      <span className="text-amber-500 uppercase font-black">BILL: {tire.billNumber || 'N/A'}</span>
                      <span className="text-slate-400 uppercase">MAN: {tire.manufacturer || 'N/A'}</span>
                    </div>
                  </td>
                  <td className="px-5 py-4 text-center">
                    <div className="flex flex-col items-center">
                      <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase mb-1 ${
                        tire.status === 'MOUNTED' ? 'bg-blue-100 text-blue-700' : 
                        tire.status === 'SCRAPPED' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-800'
                      }`}>{tire.status}</span>
                      {(tire as any).plateNumber && (
                        <button 
                          onClick={() => (tire as any).truckId && onNavigateToTruck?.((tire as any).truckId)}
                          className="flex flex-col items-center group/btn"
                        >
                          <span className="bg-slate-900 text-white px-3 py-1 rounded-lg font-mono font-black text-[10px] hover:bg-amber-500 transition-all">{(tire as any).plateNumber}</span>
                          <span className="text-[8px] font-black text-slate-400 uppercase mt-0.5 group-hover/btn:text-amber-500 transition-all">{tire.position}</span>
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-4 text-center">
                    <span className="font-black text-slate-900 font-mono text-base">{getTireMileageDetails(tire).totalMileage.toLocaleString()} <span className="text-[10px] text-slate-400">KM</span></span>
                  </td>
                  <td className="px-5 py-4 text-right no-print">
                    <div className="flex flex-col items-end gap-1">
                      <button onClick={() => openEditSpecsModal(tire)} className="text-blue-500 hover:text-blue-700 font-black text-[10px] uppercase">EDIT SPECS</button>
                      {tire.status !== 'MOUNTED' && (
                        <button onClick={() => openManualUpdateModal(tire)} className="text-slate-900 hover:text-amber-600 font-black text-[10px] uppercase">Edit STATUS</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      
      {/* Reporting Engine Modal */}
      {isTireReportModalOpen && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-xl z-[600] flex items-center justify-center p-4">
          <div className="bg-white rounded-[3rem] shadow-2xl w-full max-w-7xl h-[90vh] overflow-hidden flex flex-col animate-scaleIn print:h-auto print:bg-white">
            <div className="bg-slate-900 p-10 text-white flex justify-between items-center no-print">
              <div>
                <h3 className="text-3xl font-black uppercase tracking-tight">Tire Reporting Engine</h3>
                <p className="text-sm text-slate-400 font-bold uppercase tracking-widest mt-1 italic">Advanced Performance Analytics & Portfolio Audit</p>
              </div>
              <div className="flex gap-4">
                <button onClick={exportBrandDetailedExcel} className="bg-emerald-600 text-white px-8 py-3 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl hover:bg-emerald-700 transition-all flex items-center gap-2">
                  <span>📗</span> EXCEL REPORT
                </button>
                <button onClick={() => window.print()} className="bg-white text-slate-900 px-8 py-3 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl hover:bg-slate-100 transition-all">SAVE REPORT PDF</button>
                <button onClick={() => setIsTireReportModalOpen(false)} className="text-white text-3xl font-light hover:text-rose-500 transition-colors">&times;</button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-10 space-y-12 scrollbar-hide">
              <div className="hidden print:block mb-8">
                 <h1 className="text-4xl font-black text-slate-900 uppercase">Fleet Tire Performance Report</h1>
                 <p className="text-slate-500 font-bold mt-2 uppercase tracking-widest">Generating Audit for {repBrandFilter} Portfolio • {new Date().toLocaleDateString()}</p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 no-print">
                 <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Brand Selection</label>
                    <select className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-sm outline-none focus:ring-2 focus:ring-amber-500" value={repBrandFilter} onChange={e => { setRepBrandFilter(e.target.value); setRepSerialFilter('ALL'); }}>
                       {brands.map(b => <option key={b} value={b}>{b === 'ALL' ? 'Total Fleet Analysis' : `${b} Portfolio`}</option>)}
                    </select>
                 </div>
                 <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Serial Sub-Filter</label>
                    <select className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold text-sm outline-none focus:ring-2 focus:ring-amber-500" value={repSerialFilter} onChange={e => setRepSerialFilter(e.target.value)}>
                       <option value="ALL">All Units in Brand</option>
                       {allTires.filter(t => repBrandFilter === 'ALL' || t.brand === repBrandFilter).map(t => (
                         <option key={t.id} value={t.id}>{t.serialNumber}</option>
                       ))}
                    </select>
                 </div>
                 <div className="col-span-1 lg:col-span-2 bg-amber-50 p-6 rounded-[2.5rem] border border-amber-100 flex items-center justify-between shadow-sm">
                    <div className="flex flex-col">
                      <span className="text-[10px] font-black text-amber-600 uppercase tracking-widest">Aggregate Mileage (KM)</span>
                      <span className="text-4xl font-black text-slate-900">{reportStats.totalKm.toLocaleString()}</span>
                    </div>
                    <div className="flex flex-col items-end">
                      <span className="text-[10px] font-black text-amber-600 uppercase tracking-widest">Sample Size</span>
                      <span className="text-2xl font-black text-slate-900">{reportStats.count} Units</span>
                    </div>
                 </div>
              </div>

              <div className="space-y-6">
                 <div className="flex justify-between items-center px-2">
                   <h4 className="text-lg font-black text-slate-900 uppercase tracking-tight">Portfolio Audit Table</h4>
                   <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest italic">Showing detailed metrics for retirement and active lifecycle</p>
                 </div>
                 
                 <div className="bg-white rounded-[2.5rem] border border-slate-100 overflow-hidden shadow-sm">
                    <table className="w-full text-left text-[11px]">
                      <thead className="bg-slate-900 text-slate-300 font-black uppercase tracking-widest">
                        <tr>
                          <th className="px-6 py-5">Serial / Brand</th>
                          <th className="px-6 py-5 text-center">Status</th>
                          <th className="px-6 py-5">Bill / Supplier</th>
                          <th className="px-6 py-5 text-center">Current Run (KM)</th>
                          <th className="px-6 py-5 text-center">Expected Life</th>
                          <th className="px-6 py-5 text-center">Scrap Mileage</th>
                          <th className="px-6 py-5 text-right">Performance</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {reportingTires.map(t => {
                          const details = getTireMileageDetails(t);
                          const lifeReached = (details.totalMileage / (t.expectedLifespan || 100000)) * 100;
                          const plateNo = (t as any).plateNumber;
                          return (
                            <tr key={t.id} className="hover:bg-slate-50/50 transition-colors">
                              <td className="px-6 py-4">
                                <div className="flex flex-col">
                                  <span className="font-black text-slate-900 font-mono text-sm">{t.serialNumber}</span>
                                  <span className="text-[9px] font-bold text-slate-400 uppercase">{t.brand} • {t.size}</span>
                                </div>
                              </td>
                              <td className="px-6 py-4 text-center">
                                <span className={`px-3 py-1 rounded-lg text-[8px] font-black uppercase border ${
                                  t.status === 'MOUNTED' ? 'bg-blue-50 text-blue-600 border-blue-100' :
                                  t.status === 'SCRAPPED' ? 'bg-rose-50 text-rose-600 border-rose-100' : 'bg-amber-50 text-amber-600 border-amber-100'
                                }`}>
                                  {t.status === 'MOUNTED' ? `MOUNTED ON ${plateNo || 'VEHICLE'}` : t.status}
                                </span>
                              </td>
                              <td className="px-6 py-4">
                                <div className="flex flex-col text-[9px] font-bold">
                                  <span className="text-amber-600 font-black uppercase">BILL: {t.billNumber || 'N/A'}</span>
                                  <span className="text-slate-400 uppercase">{t.supplier || 'N/A'}</span>
                                </div>
                              </td>
                              <td className="px-6 py-4 text-center font-black font-mono text-sm">{details.totalMileage.toLocaleString()}</td>
                              <td className="px-6 py-4 text-center font-bold text-slate-400">{(t.expectedLifespan || 100000).toLocaleString()}</td>
                              <td className="px-6 py-4 text-center">
                                {t.status === 'SCRAPPED' ? (
                                  <div className="flex flex-col">
                                    <span className="font-black text-rose-600 font-mono">{t.mileage.toLocaleString()}</span>
                                    <span className="text-[8px] font-bold text-rose-400 uppercase truncate max-w-[100px]">{t.scrappedReason || 'No Reason'}</span>
                                  </div>
                                ) : <span className="text-slate-200">--</span>}
                              </td>
                              <td className="px-6 py-4 text-right">
                                <div className="flex flex-col items-end">
                                  <span className={`text-[10px] font-black ${lifeReached >= 100 ? 'text-emerald-500' : 'text-amber-500'}`}>{lifeReached.toFixed(1)}%</span>
                                  <div className="w-20 h-1 bg-slate-100 rounded-full mt-1 overflow-hidden">
                                    <div className={`h-full ${lifeReached >= 100 ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{ width: `${Math.min(100, lifeReached)}%` }}></div>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                        {reportingTires.length === 0 && (
                          <tr><td colSpan={7} className="py-20 text-center font-black text-slate-300 uppercase italic">No units found matching portfolio criteria</td></tr>
                        )}
                      </tbody>
                    </table>
                 </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Timeline Audit Modal */}
      {isHistoryModalOpen && viewingTire && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[500] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-4xl overflow-hidden animate-scaleIn">
            <div className="bg-slate-900 p-8 text-white flex justify-between items-center">
              <div>
                <h3 className="text-xl font-black uppercase tracking-tight">Timeline Audit: {viewingTire.serialNumber}</h3>
                <p className="text-xs text-slate-400 uppercase tracking-widest">{viewingTire.brand} • {viewingTire.size}</p>
              </div>
              <button onClick={() => setIsHistoryModalOpen(false)} className="text-white text-3xl font-light hover:text-amber-500 transition-colors">&times;</button>
            </div>
            <div className="p-8 max-h-[60vh] overflow-y-auto scrollbar-hide space-y-4">
               {(() => {
                 const { processedHistory } = getTireMileageDetails(viewingTire);
                 return processedHistory.map((h, i) => (
                   <div key={i} className="flex gap-4 border-l-2 border-slate-100 pl-6 py-2 relative">
                      <div className="absolute -left-[9px] top-4 w-4 h-4 rounded-full bg-amber-500 border-4 border-white shadow-sm"></div>
                      <div className="flex-1 flex justify-between items-start">
                         <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase">{h.date}</p>
                            <p className="font-black text-slate-900 uppercase text-xs">{h.event}</p>
                            <p className="text-xs text-slate-500 font-bold max-w-lg">{h.description}</p>
                         </div>
                         {h.runDistance > 0 && (
                             <div className="text-right flex flex-col items-end">
                                 <span className="text-[9px] font-black text-emerald-500 uppercase tracking-widest">Distance</span>
                                 <span className="text-sm font-black text-slate-900">{h.runDistance.toLocaleString()} KM</span>
                             </div>
                         )}
                      </div>
                   </div>
                 ));
               })()}
               {(!viewingTire.history || viewingTire.history.length === 0) && (
                 <p className="text-center text-slate-300 font-black uppercase tracking-widest py-20 italic">No history records found for this unit</p>
               )}
            </div>
            <div className="p-8 bg-slate-50 border-t flex justify-between items-center">
               <div className="px-6 py-4 bg-white border-2 border-slate-100 rounded-3xl flex flex-col min-w-[180px]">
                   <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Mileage</p>
                   <p className="text-3xl font-black text-slate-900 leading-none mt-1">
                     {getTireMileageDetails(viewingTire).totalMileage.toLocaleString()} <span className="text-sm">KM</span>
                   </p>
               </div>
               <div className="flex gap-2">
                   <button onClick={() => exportSingleTireHistory(viewingTire)} className="bg-white border border-slate-200 text-slate-900 px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-sm hover:bg-slate-50 transition-all">Download Log</button>
                   <button onClick={() => setIsHistoryModalOpen(false)} className="bg-slate-900 text-white px-12 py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl hover:bg-black transition-all">Close</button>
               </div>
            </div>
          </div>
        </div>
      )}

      {/* Manual Life Update Modal */}
      {isEditStatusModalOpen && editingTire && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[500] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-md overflow-hidden animate-scaleIn">
            <div className="bg-slate-900 p-8 text-white flex justify-between items-center">
              <div>
                <h3 className="text-xl font-black uppercase tracking-tight">Manual Update</h3>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em] mt-1">Tire Serial Entry</p>
              </div>
              <button onClick={() => setIsEditStatusModalOpen(false)} className="text-white text-3xl font-light hover:text-amber-500 transition-colors">&times;</button>
            </div>
            <form onSubmit={handleUpdateStatusSubmit} className="p-8 space-y-6">
               <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-1 tracking-widest">Current Mileage (KM)</label>
                  <input 
                    type="number" 
                    required 
                    className="w-full p-6 bg-slate-50 border border-slate-200 rounded-3xl font-black text-3xl outline-none focus:ring-2 focus:ring-amber-500 text-slate-900 transition-all" 
                    value={editingTire.mileage} 
                    onChange={e => setEditingTire({...editingTire, mileage: parseInt(e.target.value) || 0})} 
                  />
                  <p className="text-[10px] text-emerald-600 font-black uppercase tracking-tight ml-1 mt-2">Total Distance Travelled So Far</p>
               </div>
               <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-1 tracking-widest">Lifecycle Status</label>
                  <select className="w-full p-5 bg-slate-50 border border-slate-200 rounded-2xl font-black uppercase outline-none focus:ring-2 focus:ring-amber-500 text-sm" value={editingTire.status} onChange={e => setEditingTire({...editingTire, status: e.target.value as any})}>
                     <option value="NEW">NEW STOCK</option>
                     <option value="SPARE">READY SPARE</option>
                     <option value="REPAIR">IN REPAIR</option>
                     <option value="SCRAPPED">RETIRED / SCRAP</option>
                  </select>
               </div>
               
               <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Remarks / Reason</label>
                  <textarea className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold h-24 outline-none focus:border-slate-300 placeholder:text-slate-300" placeholder="Enter status change remarks..." value={editingTire.scrappedReason || ''} onChange={e => setEditingTire({...editingTire, scrappedReason: e.target.value})} />
               </div>

               <button type="submit" className="w-full py-6 bg-slate-900 text-white rounded-[2.5rem] font-black uppercase text-sm shadow-xl active:scale-95 transition-all border-b-4 border-black hover:bg-black mt-4">Apply Lifecycle Update</button>
            </form>
          </div>
        </div>
      )}

      {/* Edit Specs Modal */}
      {isEditSpecsModalOpen && editingTire && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[500] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-2xl overflow-hidden animate-scaleIn">
            <div className="bg-slate-900 p-8 text-white flex justify-between items-center">
              <div>
                <h3 className="text-xl font-black uppercase tracking-tight">Edit Tire Specifications</h3>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Ref: {editingTire.serialNumber}</p>
              </div>
              <button onClick={() => setIsEditSpecsModalOpen(false)} className="text-white text-3xl font-light hover:text-amber-500 transition-colors">&times;</button>
            </div>
            <form onSubmit={handleUpdateSpecsSubmit} className="p-8 flex flex-col gap-6">
               <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase ml-1 tracking-widest">Serial Number</label>
                    <input type="text" required className="w-full p-5 bg-slate-50 border border-slate-100 rounded-2xl font-black uppercase outline-none focus:ring-2 focus:ring-amber-500" value={specBuffer.serialNumber || ''} onChange={e => setSpecBuffer({...specBuffer, serialNumber: e.target.value.toUpperCase()})} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase ml-1 tracking-widest">Brand</label>
                    <select required className="w-full p-5 bg-slate-50 border border-slate-100 rounded-2xl font-black uppercase outline-none focus:ring-2 focus:ring-amber-500" value={specBuffer.brand || ''} onChange={e => setSpecBuffer({...specBuffer, brand: e.target.value})}>
                        {state.masterData.tireBrands.map(b => <option key={b} value={b}>{b}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase ml-1 tracking-widest">Size</label>
                    <input type="text" required className="w-full p-5 bg-slate-50 border border-slate-100 rounded-2xl font-mono font-bold outline-none focus:ring-2 focus:ring-amber-500" value={specBuffer.size || ''} onChange={e => setSpecBuffer({...specBuffer, size: e.target.value})} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase ml-1 tracking-widest">Expected Lifespan (KM)</label>
                    <input type="number" required className="w-full p-5 bg-slate-50 border border-slate-100 rounded-2xl font-black outline-none focus:ring-2 focus:ring-amber-500" value={specBuffer.expectedLifespan || 100000} onChange={e => setSpecBuffer({...specBuffer, expectedLifespan: parseInt(e.target.value) || 0})} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase ml-1 tracking-widest">Supplier</label>
                    <select className="w-full p-5 bg-slate-50 border border-slate-100 rounded-2xl font-black uppercase outline-none focus:ring-2 focus:ring-amber-500" value={specBuffer.supplier || ''} onChange={e => setSpecBuffer({...specBuffer, supplier: e.target.value})}>
                      <option value="">Select Supplier...</option>
                      {state.masterData.tireSuppliers.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase ml-1 tracking-widest">Manufacturer</label>
                    <select className="w-full p-5 bg-slate-50 border border-slate-100 rounded-2xl font-black uppercase outline-none focus:ring-2 focus:ring-amber-500" value={specBuffer.manufacturer || ''} onChange={e => setSpecBuffer({...specBuffer, manufacturer: e.target.value})}>
                        {state.masterData.tireBrands.map(b => <option key={b} value={b}>{b}</option>)}
                    </select>
                  </div>
               </div>
               <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-1 tracking-widest">Bill/Invoice Number</label>
                  <input type="text" className="w-full p-5 bg-slate-50 border border-slate-100 rounded-2xl font-black uppercase outline-none focus:ring-2 focus:ring-amber-500" value={specBuffer.billNumber || ''} onChange={e => setSpecBuffer({...specBuffer, billNumber: e.target.value})} />
               </div>
               
               <div className="pt-4 flex flex-col items-center">
                  <button type="submit" className="w-full py-6 bg-slate-900 text-white rounded-[2.5rem] font-black uppercase text-sm shadow-xl active:scale-95 transition-all border-b-4 border-black hover:bg-black">Save Updated Specifications</button>
               </div>
            </form>
          </div>
        </div>
      )}

      {/* Bulk Entry Modal */}
      {isBulkModalOpen && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[500] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-4xl overflow-hidden animate-scaleIn">
            <div className="bg-slate-900 p-8 text-white flex justify-between items-center">
              <h3 className="text-xl font-black uppercase tracking-tight">Bulk Tire Entry</h3>
              <button onClick={() => setIsBulkModalOpen(false)} className="text-white text-3xl font-light hover:text-amber-500 transition-colors">&times;</button>
            </div>
            {bulkStep === 1 ? (
              <form onSubmit={handlePrepareBulk} className="p-8 space-y-6">
                <div className="grid grid-cols-3 gap-6">
                   <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Supplier</label>
                      <select required className="w-full p-4 bg-slate-50 border rounded-2xl font-bold outline-none focus:ring-2 focus:ring-amber-500" value={bulkSetup.supplier} onChange={e => setBulkSetup({...bulkSetup, supplier: e.target.value})}>
                          <option value="">Select Supplier...</option>
                          {state.masterData.tireSuppliers.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                   </div>
                   <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Bill No</label>
                      <input type="text" required className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-black uppercase outline-none focus:ring-2 focus:ring-amber-500" value={bulkSetup.billNumber} onChange={e => setBulkSetup({...bulkSetup, billNumber: e.target.value})} />
                   </div>
                   <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Qty to Add</label>
                      <input type="number" required className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-black outline-none focus:ring-2 focus:ring-amber-500" value={bulkSetup.count} onChange={e => setBulkSetup({...bulkSetup, count: e.target.value})} />
                   </div>
                </div>
                <button type="submit" className="w-full py-5 bg-amber-500 text-white rounded-[2rem] font-black uppercase shadow-xl hover:bg-amber-600 transition-all border-b-4 border-amber-700">Prepare Entry Form</button>
              </form>
            ) : (
              <div className="p-8 space-y-6">
                <div className="max-h-96 overflow-y-auto space-y-3 pr-2 scrollbar-hide">
                  {bulkTires.map((bt, i) => (
                    <div key={i} className="grid grid-cols-3 gap-4 items-center bg-slate-50 p-4 rounded-2xl border">
                      <input placeholder="Serial Number" className="p-3 border rounded-xl font-black uppercase outline-none focus:border-amber-400" value={bt.serialNumber} onChange={e => { const copy = [...bulkTires]; copy[i].serialNumber = e.target.value; setBulkTires(copy); }} />
                      <select className="p-3 border rounded-xl font-bold outline-none focus:border-amber-400" value={bt.brand} onChange={e => { const copy = [...bulkTires]; copy[i].brand = e.target.value; setBulkTires(copy); }}>
                        {state.masterData.tireBrands.map(b => <option key={b} value={b}>{b}</option>)}
                      </select>
                      <input placeholder="Starting KM" type="number" className="p-3 border rounded-xl font-mono outline-none focus:border-amber-400" value={bt.startingKm} onChange={e => { const copy = [...bulkTires]; copy[i].startingKm = e.target.value; setBulkTires(copy); }} />
                    </div>
                  ))}
                </div>
                <div className="flex gap-4">
                  <button onClick={() => setBulkStep(1)} className="flex-1 py-5 bg-slate-100 text-slate-500 rounded-[2.5rem] font-black uppercase tracking-widest text-xs">Back</button>
                  <button onClick={handleBulkFinalSave} className="flex-[2] py-5 bg-amber-500 text-white rounded-[2.5rem] font-black uppercase shadow-xl border-b-4 border-amber-700">Commit All Records</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Register Individual Modal */}
      {isRegisterModalOpen && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[500] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-md overflow-hidden animate-scaleIn">
            <div className="bg-slate-900 p-8 text-white flex justify-between items-center">
              <h3 className="text-xl font-black uppercase tracking-tight">Register Unit</h3>
              <button onClick={() => setIsRegisterModalOpen(false)} className="text-white text-3xl font-light hover:text-amber-500 transition-colors">&times;</button>
            </div>
            <form onSubmit={handleRegister} className="p-8 space-y-4">
               <div className="space-y-1">
                 <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Serial Number</label>
                 <input placeholder="SERIAL NUMBER" className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-black uppercase outline-none focus:ring-2 focus:ring-amber-500" value={newTire.serialNumber} onChange={e => setNewTire({...newTire, serialNumber: e.target.value.toUpperCase()})} required />
               </div>
               <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Brand</label>
                    <select required className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold uppercase outline-none focus:ring-2 focus:ring-amber-500" value={newTire.brand} onChange={e => setNewTire({...newTire, brand: e.target.value})}>
                        {state.masterData.tireBrands.map(b => <option key={b} value={b}>{b}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Size</label>
                    <input placeholder="SIZE" className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-mono uppercase outline-none focus:ring-2 focus:ring-amber-500" value={newTire.size} onChange={e => setNewTire({...newTire, size: e.target.value})} required />
                  </div>
               </div>
               <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Supplier</label>
                  <select className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none focus:ring-2 focus:ring-amber-500" value={newTire.supplier} onChange={e => setNewTire({...newTire, supplier: e.target.value})}>
                     <option value="">Choose Supplier...</option>
                     {state.masterData.tireSuppliers.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
               </div>
               <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Bill Number</label>
                  <input placeholder="BILL NUMBER" className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-black uppercase outline-none focus:ring-2 focus:ring-amber-500" value={newTire.billNumber} onChange={e => setNewTire({...newTire, billNumber: e.target.value})} />
               </div>
               <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Starting KM</label>
                  <input placeholder="STARTING KM" type="number" className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-mono outline-none focus:ring-2 focus:ring-amber-500" value={newTire.mileage} onChange={e => setNewTire({...newTire, mileage: e.target.value})} />
               </div>
               <button type="submit" className="w-full py-5 bg-amber-500 text-white rounded-[2rem] font-black uppercase shadow-xl mt-4 border-b-4 border-amber-700 active:scale-95 transition-all">Save Entry</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default TireInventory;