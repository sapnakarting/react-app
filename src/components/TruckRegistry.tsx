import React, { useState, useMemo, useEffect } from 'react';
import { Truck, Tire, FleetType, StatusHistoryEntry } from '../types';
import { storageService } from '../services/storageService';

declare const XLSX: any;

interface RegistryProps {
  trucks: Truck[];
  spareTires: Tire[];
  onAddTruck: (truck: Truck) => void;
  onUpdateTruck: (truck: Truck) => void;
  onReplaceTire: (
    truckId: string,
    position: string,
    spareTireId: string | null,
    oldTireUpdate: { status: 'SPARE' | 'SCRAPPED' | 'REPAIR', scrappedReason?: string, mileage?: number, unmountOdometer?: number },
    mountingKm?: number,
    mountRemarks?: string
  ) => void;
  initialSelectedId?: string | null;
  onClearSelection?: () => void;
}

const TruckRegistry: React.FC<RegistryProps> = ({ trucks, spareTires, onReplaceTire, onUpdateTruck, onAddTruck, initialSelectedId, onClearSelection }) => {
  const [selectedTruckId, setSelectedTruckId] = useState<string | null>(initialSelectedId || null);
  const [editingTruckId, setEditingTruckId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [fleetTypeFilter, setFleetTypeFilter] = useState<'ALL' | FleetType>('ALL');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isTirePickerOpen, setIsTirePickerOpen] = useState(false);
  const [isKmPromptOpen, setIsKmPromptOpen] = useState(false);
  const [pickingPosition, setPickingPosition] = useState<{ truckId: string, pos: string, currentTire?: Tire } | null>(null);
  const [selectedSpareId, setSelectedSpareId] = useState<string | null>(null);
  const [mountKm, setMountKm] = useState('');
  const [mountRemarks, setMountRemarks] = useState('');
  const [tirePickerSearch, setTirePickerSearch] = useState('');
  const [isUnmountModalOpen, setIsUnmountModalOpen] = useState(false);
  const [unmountData, setUnmountData] = useState<{ status: 'SPARE' | 'SCRAPPED' | 'REPAIR', remarks: string, km: string }>({ status: 'SPARE', remarks: '', km: '' });
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isMaintenanceLogOpen, setIsMaintenanceLogOpen] = useState(false);

  // Reporting Engine States
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [repFleetFilter, setRepFleetFilter] = useState<'ALL' | FleetType>('ALL');
  const [repTruckFilter, setRepTruckFilter] = useState<string>('ALL');

  useEffect(() => {
    if (initialSelectedId) {
      setSelectedTruckId(initialSelectedId);
    }
  }, [initialSelectedId]);

  const [editFormData, setEditFormData] = useState<Partial<Truck>>({});
  const [newTruck, setNewTruck] = useState<any>({
    plateNumber: '', transporterName: '', model: 'Standard', wheelConfig: '10 WHEEL', fleetType: 'MINING',
    currentOdometer: '', fitnessExpiry: '', insuranceExpiry: '', puccExpiry: '', taxExpiry: '', permitExpiry: '', rcExpiry: '',
    status: 'ACTIVE', remarks: '',
    documents: {}
  });

  const docList = [
    { label: 'Registration (RC)', key: 'rcExpiry', docKey: 'rc', noDate: true },
    { label: 'Fitness', key: 'fitnessExpiry', docKey: 'fitness' },
    { label: 'Insurance', key: 'insuranceExpiry', docKey: 'insurance' },
    { label: 'PUCC', key: 'puccExpiry', docKey: 'pucc' },
    { label: 'TAX', key: 'taxExpiry', docKey: 'tax' },
    { label: 'PERMIT', key: 'permitExpiry', docKey: 'permit' }
  ];

  const getComplianceStatus = (dateStr: string | undefined) => {
    if (!dateStr) return 'NOT_CONFIGURED';
    const expiry = new Date(dateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffTime = expiry.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays <= 7) return 'CRITICAL'; 
    if (diffDays <= 14) return 'WARNING'; 
    return 'GOOD'; 
  };

  const getComplianceColor = (dateStr: string | undefined) => {
    const status = getComplianceStatus(dateStr);
    if (status === 'CRITICAL') return 'text-rose-500 font-bold'; 
    if (status === 'WARNING') return 'text-amber-500 font-bold'; 
    if (status === 'GOOD') return 'text-emerald-500 font-bold';
    return 'text-slate-400'; 
  };

  const handleFileUpload = async (type: string, e: React.ChangeEvent<HTMLInputElement>, isEdit = false) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64 = event.target?.result as string;
      const plate = isEdit ? editFormData.plateNumber : newTruck.plateNumber;
      const fileName = `${plate || 'TEMP'}_${type}_${Date.now()}.pdf`;
      const publicUrl = await storageService.uploadFile('truck-docs', fileName, base64);
      if (publicUrl) {
        if (isEdit) {
          setEditFormData(prev => ({ ...prev, documents: { ...(prev.documents || {}), [type]: publicUrl } }));
        } else {
          setNewTruck((prev: any) => ({ ...prev, documents: { ...(prev.documents || {}), [type]: publicUrl } }));
        }
      }
      setIsUploading(false);
    };
    reader.readAsDataURL(file);
  };

  const requestSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const filteredTrucks = useMemo(() => {
    let list = trucks.filter(t => {
      const matchesSearch = t.plateNumber.toLowerCase().includes(search.toLowerCase()) ||
                           (t.transporterName || '').toLowerCase().includes(search.toLowerCase());
      const matchesFleet = fleetTypeFilter === 'ALL' || t.fleetType === fleetTypeFilter;
      return matchesSearch && matchesFleet;
    });

    if (sortConfig) {
      list.sort((a, b) => {
        const valA = (a as any)[sortConfig.key] || '';
        const valB = (b as any)[sortConfig.key] || '';
        if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
        if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return list;
  }, [trucks, search, fleetTypeFilter, sortConfig]);

  const selectedTruck = useMemo(() => trucks.find(t => t.id === selectedTruckId) || null, [trucks, selectedTruckId]);

  const reportingList = useMemo(() => {
    return trucks.filter(t => {
      const fleetMatch = repFleetFilter === 'ALL' || t.fleetType === repFleetFilter;
      const truckMatch = repTruckFilter === 'ALL' || t.id === repTruckFilter;
      return fleetMatch && truckMatch;
    });
  }, [trucks, repFleetFilter, repTruckFilter]);

  const exportFleetExcel = () => {
    const getStyle = (dateStr: string | undefined) => {
      const status = getComplianceStatus(dateStr);
      if (status === 'CRITICAL') return 'color: #ef4444; font-weight: bold;';
      if (status === 'WARNING') return 'color: #f59e0b; font-weight: bold;';
      if (status === 'GOOD') return 'color: #10b981; font-weight: bold;';
      return 'color: #94a3b8;';
    };

    let tableHtml = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
      <head><!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>Compliance Report</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]--></head>
      <body>
      <table border="1">
        <thead>
          <tr style="background-color: #0f172a; color: #ffffff;">
            <th>SR NO</th>
            <th>PLATE NUMBER</th>
            <th>TRANSPORTER</th>
            <th>FLEET</th>
            <th>ODO (KM)</th>
            <th>STATUS</th>
            <th>FITNESS EXPIRY</th>
            <th>INSURANCE EXPIRY</th>
            <th>PUCC EXPIRY</th>
            <th>TAX EXPIRY</th>
            <th>PERMIT EXPIRY</th>
            <th>OVERALL COMPLIANCE</th>
          </tr>
        </thead>
        <tbody>
    `;

    reportingList.forEach((t, idx) => {
      const overallCritical = [t.fitnessExpiry, t.insuranceExpiry, t.puccExpiry, t.taxExpiry, t.permitExpiry].some(d => getComplianceStatus(d) === 'CRITICAL');
      const complianceText = overallCritical ? 'CRITICAL (EXPIRED/DUE)' : 'ACTIVE/UPCOMING';
      const complianceStyle = overallCritical ? 'color: #ef4444; font-weight: bold;' : 'color: #10b981; font-weight: bold;';

      tableHtml += `
        <tr>
          <td>${idx + 1}</td>
          <td>${t.plateNumber}</td>
          <td>${t.transporterName || 'Self'}</td>
          <td>${t.fleetType}</td>
          <td>${t.currentOdometer}</td>
          <td>${t.status}</td>
          <td style="${getStyle(t.fitnessExpiry)}">${t.fitnessExpiry || 'N/A'}</td>
          <td style="${getStyle(t.insuranceExpiry)}">${t.insuranceExpiry || 'N/A'}</td>
          <td style="${getStyle(t.puccExpiry)}">${t.puccExpiry || 'N/A'}</td>
          <td style="${getStyle(t.taxExpiry)}">${t.taxExpiry || 'N/A'}</td>
          <td style="${getStyle(t.permitExpiry)}">${t.permitExpiry || 'N/A'}</td>
          <td style="${complianceStyle}">${complianceText}</td>
        </tr>
      `;
    });

    tableHtml += `</tbody></table></body></html>`;

    const blob = new Blob([tableHtml], { type: 'application/vnd.ms-excel' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Fleet_Registry_Report_${new Date().toISOString().split('T')[0]}.xls`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const exportStatusReport = () => {
    // Format date as dd/mm/yyyy for display and dd_mm_yyyy for filename
    const now = new Date();
    const dd = String(now.getDate()).padStart(2, '0');
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const yyyy = now.getFullYear();
    const displayDate = `${dd}/${mm}/${yyyy}`;
    const fileDate = `${dd}_${mm}_${yyyy}`;

    let fleetLabel = 'FLEET';
    if (repFleetFilter === 'COAL') fleetLabel = 'VALIA LIGHNITE';
    if (repFleetFilter === 'MINING') fleetLabel = 'LOCAL';

    let tableHtml = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
      <head><!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>Status Report</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]--></head>
      <body>
      <table border="1">
        <thead>
          <tr>
            <th colspan="5" style="font-weight: bold; text-align: center;">S A LOGISTICS VEHICLE STATUS: ${fleetLabel}</th>
          </tr>
          <tr>
            <th colspan="5" style="font-weight: bold; text-align: center;">DATE : ${displayDate}</th>
          </tr>
          <tr style="font-weight: bold;">
            <th>SR NO</th>
            <th>VEHICLE ID</th>
            <th>NO. OF WHEELS</th>
            <th>STATUS</th>
            <th>REASON/REMARKS</th>
          </tr>
        </thead>
        <tbody>
    `;

    reportingList.forEach((t, idx) => {
      const isBreakdownOrMaintenance = t.status === 'BREAKDOWN' || t.status === 'MAINTENANCE';
      let reason = '';
      
      if (isBreakdownOrMaintenance) {
        // Find the latest remark from history or use the current truck's remark
        const latestRemarkObj = t.statusHistory?.find(h => h.remarks && (h.status === 'BREAKDOWN' || h.status === 'MAINTENANCE'));
        reason = latestRemarkObj?.remarks || t.remarks || '';
      }

      const style = isBreakdownOrMaintenance ? 'color: #ef4444; font-weight: bold;' : '';
      // wheelConfig is already formatted like '10 WHEEL', if it's just a number or undefined we append WHEEL
      const wheelConfigStr = t.wheelConfig ? (t.wheelConfig.includes('WHEEL') ? t.wheelConfig : `${t.wheelConfig} WHEEL`) : '10 WHEEL';
      
      tableHtml += `
        <tr>
          <td>${idx + 1}</td>
          <td>${t.plateNumber}</td>
          <td>${wheelConfigStr}</td>
          <td style="${style}">${t.status}</td>
          <td style="${style}">${isBreakdownOrMaintenance ? reason : ''}</td>
        </tr>
      `;
    });

    tableHtml += `</tbody></table></body></html>`;

    const blob = new Blob([tableHtml], { type: 'application/vnd.ms-excel' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    
    link.download = `Fleet_Status_Report_${fileDate}.xls`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTruck.plateNumber) return;
    onAddTruck({
      id: crypto.randomUUID(),
      plateNumber: newTruck.plateNumber.toUpperCase(),
      transporterName: newTruck.transporterName || 'Self Owned',
      model: newTruck.model || 'Standard',
      wheelConfig: newTruck.wheelConfig,
      fleetType: newTruck.fleetType,
      currentOdometer: parseInt(newTruck.currentOdometer) || 0,
      fuelEfficiency: 0,
      status: newTruck.status || 'ACTIVE',
      remarks: newTruck.remarks || '',
      tires: [],
      rcExpiry: newTruck.rcExpiry,
      fitnessExpiry: newTruck.fitnessExpiry,
      insuranceExpiry: newTruck.insuranceExpiry,
      puccExpiry: newTruck.puccExpiry,
      taxExpiry: newTruck.taxExpiry,
      permitExpiry: newTruck.permitExpiry,
      documents: newTruck.documents,
      statusHistory: [{
        date: new Date().toISOString().split('T')[0],
        status: newTruck.status || 'ACTIVE',
        remarks: 'Initial Registration'
      }]
    });
    setIsAddModalOpen(false);
    setNewTruck({ plateNumber: '', transporterName: '', model: 'Standard', wheelConfig: '10 WHEEL', fleetType: 'MINING', currentOdometer: '', fitnessExpiry: '', insuranceExpiry: '', puccExpiry: '', taxExpiry: '', permitExpiry: '', rcExpiry: '', status: 'ACTIVE', remarks: '', documents: {} });
  };

  const handleUpdateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editFormData.id) {
      const originalTruck = trucks.find(t => t.id === editFormData.id);
      let updatedHistory = [...(originalTruck?.statusHistory || [])];
      
      // Tracking: Check if status changed or new remarks added
      const statusChanged = originalTruck?.status !== editFormData.status;
      const remarksChanged = editFormData.remarks && editFormData.remarks !== originalTruck?.remarks;

      if (statusChanged || remarksChanged) {
        const newEntry: StatusHistoryEntry = {
          date: new Date().toISOString().split('T')[0],
          status: (editFormData.status as any) || originalTruck?.status || 'ACTIVE',
          remarks: editFormData.remarks || 'Status update'
        };
        updatedHistory.unshift(newEntry); // Newest first
      }

      onUpdateTruck({
        ...editFormData,
        statusHistory: updatedHistory
      } as Truck);
      setEditingTruckId(null);
    }
  };

  const handleFinalMount = () => {
    if (pickingPosition && selectedSpareId) {
      onReplaceTire(
        pickingPosition.truckId,
        pickingPosition.pos,
        selectedSpareId,
        { status: 'SPARE' }, 
        parseInt(mountKm) || (selectedTruck?.currentOdometer || 0),
        mountRemarks
      );
      setIsKmPromptOpen(false);
      setIsTirePickerOpen(false);
      setPickingPosition(null);
      setSelectedSpareId(null);
      setMountKm('');
      setMountRemarks('');
    }
  };

  const handleFinalUnmount = () => {
    if (pickingPosition && pickingPosition.currentTire) {
      const tire = pickingPosition.currentTire;
      const unmountOdo = parseInt(unmountData.km) || 0;
      
      // Robust calculation: Recalculate total mileage from full history to fix DB drift
      // 1. Calculate historical closed loops
      let historicalMileage = 0;
      let tempMountOdo: number | null = null;
      
      (tire.history || []).forEach(entry => {
        if (entry.event === 'Mounted') {
          const match = entry.description.match(/ODO:\s*(\d+)/i);
          if (match) tempMountOdo = parseInt(match[1]);
        } else if (entry.event === 'Unmounted') {
          const match = entry.description.match(/at\s*(\d+)\s*KM/i);
          if (match && tempMountOdo !== null) {
            historicalMileage += Math.max(0, parseInt(match[1]) - tempMountOdo);
            tempMountOdo = null;
          }
        }
      });

      // 2. Calculate current open loop (the one being closed now)
      // Attempt to get the start ODO from the last Mounted event in history if possible, fallback to tire property
      let currentMountOdo = tire.mountedAtOdometer || 0;
      // Find last mount event to ensure we have the correct start point for this segment
      const lastMountEvent = [...(tire.history || [])].reverse().find(e => e.event === 'Mounted');
      if (lastMountEvent) {
         const match = lastMountEvent.description.match(/ODO:\s*(\d+)/i);
         if (match) currentMountOdo = parseInt(match[1]);
      }

      const currentRun = Math.max(0, unmountOdo - currentMountOdo);
      const newTotalMileage = historicalMileage + currentRun;

      onReplaceTire(
        pickingPosition.truckId,
        pickingPosition.pos,
        null,
        { 
          status: unmountData.status, 
          scrappedReason: unmountData.remarks,
          mileage: newTotalMileage, 
          unmountOdometer: unmountOdo
        },
        0
      );
      setIsUnmountModalOpen(false);
      setPickingPosition(null);
    }
  };

  const openUnmountModal = (pos: string, tire: Tire) => {
    setPickingPosition({ truckId: selectedTruckId!, pos, currentTire: tire });
    setUnmountData({ 
        status: 'SPARE', 
        remarks: '', 
        km: selectedTruck?.currentOdometer.toString() || tire.mileage.toString() 
    });
    setIsUnmountModalOpen(true);
  };

  const getWheelPositions = (config: string) => {
    const wheelCount = parseInt(config);
    const positions = ['AXLE-1 LEFT', 'AXLE-1 RIGHT'];
    if (wheelCount === 10) positions.push('AXLE-2 L-OUT', 'AXLE-2 L-IN', 'AXLE-2 R-IN', 'AXLE-2 R-OUT', 'AXLE-3 L-OUT', 'AXLE-3 L-IN', 'AXLE-3 R-IN', 'AXLE-3 R-OUT');
    else if (wheelCount === 14) positions.push('AXLE-2 LEFT', 'AXLE-2 RIGHT', 'AXLE-3 LEFT', 'AXLE-3 RIGHT', 'AXLE-4 L-OUT', 'AXLE-4 L-IN', 'AXLE-4 R-IN', 'AXLE-4 R-OUT', 'AXLE-5 L-OUT', 'AXLE-5 L-IN', 'AXLE-5 R-IN', 'AXLE-5 R-OUT');
    else if (wheelCount === 16) positions.push('AXLE-2 LEFT', 'AXLE-2 RIGHT','AXLE-3 L-OUT', 'AXLE-3 L-IN', 'AXLE-3 R-IN', 'AXLE-3 R-OUT','AXLE-4 L-OUT', 'AXLE-4 L-IN', 'AXLE-4 R-IN', 'AXLE-4 R-OUT', 'AXLE-5 L-OUT', 'AXLE-5 L-IN', 'AXLE-5 R-IN', 'AXLE-5 R-OUT');
    return positions;
  };

  const filteredSpareTires = useMemo(() => {
    return spareTires.filter(t => 
      t.status !== 'SCRAPPED' && t.status !== 'MOUNTED' && 
      (t.serialNumber.toLowerCase().includes(tirePickerSearch.toLowerCase()) || t.brand.toLowerCase().includes(tirePickerSearch.toLowerCase()))
    );
  }, [spareTires, tirePickerSearch]);

  const exportMaintenanceLog = () => {
    if (!selectedTruck) return;
    
    const identityData = [
      { Field: 'Plate Number', Value: selectedTruck.plateNumber },
      { Field: 'Transporter', Value: selectedTruck.transporterName || 'Self Owned' },
      { Field: 'Fleet Type', Value: selectedTruck.fleetType },
      { Field: 'Current Status', Value: selectedTruck.status },
      { Field: 'Current Odometer (KM)', Value: selectedTruck.currentOdometer.toLocaleString() },
      { Field: 'Generated On', Value: new Date().toLocaleString() }
    ];

    const historyData = (selectedTruck.statusHistory || []).map((h, i) => ({
      'SR NO': i + 1,
      'Date': h.date,
      'Status': h.status,
      'Remarks / Event Details': h.remarks || 'No remarks recorded.'
    }));

    const wb = XLSX.utils.book_new();
    const wsSummary = XLSX.utils.json_to_sheet(identityData);
    const wsHistory = XLSX.utils.json_to_sheet(historyData);
    
    XLSX.utils.book_append_sheet(wb, wsSummary, "Vehicle Detail");
    XLSX.utils.book_append_sheet(wb, wsHistory, "Maintenance Log");
    
    XLSX.writeFile(wb, `Maintenance_Log_${selectedTruck.plateNumber}.xlsx`);
  };

  return (
    <div className="space-y-4 sm:space-y-6 w-full animate-fadeIn max-w-full">
      <div className="flex flex-col gap-4 no-print px-1">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-3">
          <div className="flex flex-col sm:flex-row items-center gap-3 w-full lg:w-auto">
            <div className="relative w-full sm:w-auto">
              <input type="text" placeholder="Search Plate/Transporter..." className="w-full sm:w-80 pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-2xl outline-none shadow-sm font-bold text-sm" value={search} onChange={(e) => setSearch(e.target.value)} />
              <span className="absolute left-4 top-3.5 opacity-30 text-xs">🔍</span>
            </div>
            <select className="w-full sm:w-auto px-6 py-3 bg-white border border-slate-200 rounded-2xl font-bold text-sm min-w-[160px]" value={fleetTypeFilter} onChange={(e) => setFleetTypeFilter(e.target.value as any)}>
              <option value="ALL">All Fleets</option>
              <option value="MINING">Mining</option>
              <option value="COAL">Coal</option>
            </select>
          </div>
          <div className="flex gap-2 w-full lg:w-auto">
            <button onClick={() => setIsReportModalOpen(true)} className="flex-1 sm:flex-none bg-white border border-slate-200 text-slate-900 px-4 sm:px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-50 shadow-sm transition-all flex items-center justify-center gap-2">
              <span>📋</span> <span className="hidden sm:inline">REPORTS</span>
            </button>
            <button onClick={() => setIsAddModalOpen(true)} className="flex-1 sm:flex-none bg-amber-500 hover:bg-amber-600 text-white px-4 sm:px-6 py-4 rounded-2xl font-black shadow-xl active:scale-95 border-b-4 border-amber-700 uppercase tracking-[0.2em] transition-all text-xs sm:text-sm">
              + ADD NEW <span className="hidden sm:inline">ASSET</span>
            </button>
          </div>
        </div>
      </div>

      {!selectedTruck ? (
        <div className="bg-white rounded-[1.5rem] sm:rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden">
          <div className="overflow-x-auto scrollbar-hide">
            <table className="w-full text-left text-[11px]">
              <thead className="bg-slate-900 text-slate-300">
                <tr className="text-[10px] font-black uppercase tracking-widest">
                  <th className="px-4 sm:px-6 py-6 w-12 text-center">#</th>
                  <th onClick={() => requestSort('plateNumber')} className="px-4 sm:px-6 py-6 cursor-pointer">Vehicle ID / Transporter</th>
                  <th className="px-4 sm:px-6 py-6 text-center">Fleet</th>
                  <th onClick={() => requestSort('fitnessExpiry')} className="px-4 sm:px-6 py-6 text-center hidden md:table-cell">Fitness ⇅</th>
                  <th onClick={() => requestSort('insuranceExpiry')} className="px-4 sm:px-6 py-6 text-center hidden md:table-cell">Insurance ⇅</th>
                  <th onClick={() => requestSort('puccExpiry')} className="px-4 sm:px-6 py-6 text-center hidden lg:table-cell">PUCC ⇅</th>
                  <th onClick={() => requestSort('taxExpiry')} className="px-4 sm:px-6 py-6 text-center hidden lg:table-cell">TAX ⇅</th>
                  <th onClick={() => requestSort('permitExpiry')} className="px-4 sm:px-6 py-6 text-center hidden xl:table-cell">PERMIT ⇅</th>
                  <th className="px-4 sm:px-6 py-6 text-center">Status</th>
                  <th className="px-4 sm:px-6 py-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredTrucks.map((truck, idx) => (
                  <tr key={truck.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 sm:px-6 py-4 sm:py-5 text-center font-black text-rose-500 text-xs">{idx + 1}</td>
                    <td className="px-4 sm:px-6 py-4 sm:py-5 cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => setSelectedTruckId(truck.id)}>
                      <div className="flex flex-col">
                        <span className="font-black text-slate-900 font-mono text-sm sm:text-base">{truck.plateNumber}</span>
                        <span className="text-[8px] sm:text-[9px] text-amber-600 font-black uppercase tracking-tighter">{truck.transporterName || 'Self Owned'}</span>
                      </div>
                    </td>
                    <td className="px-4 sm:px-6 py-4 sm:py-5 text-center">
                      <span className={`px-2 sm:px-3 py-1 rounded-lg text-[8px] sm:text-[9px] font-black border uppercase ${truck.fleetType === 'COAL' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'}`}>{truck.fleetType}</span>
                    </td>
                    <td className={`px-4 sm:px-6 py-4 sm:py-5 text-center font-mono hidden md:table-cell ${getComplianceColor(truck.fitnessExpiry)}`}>{truck.fitnessExpiry || '-'}</td>
                    <td className={`px-4 sm:px-6 py-4 sm:py-5 text-center font-mono hidden md:table-cell ${getComplianceColor(truck.insuranceExpiry)}`}>{truck.insuranceExpiry || '-'}</td>
                    <td className={`px-4 sm:px-6 py-4 sm:py-5 text-center font-mono hidden lg:table-cell ${getComplianceColor(truck.puccExpiry)}`}>{truck.puccExpiry || '-'}</td>
                    <td className={`px-4 sm:px-6 py-4 sm:py-5 text-center font-mono hidden lg:table-cell ${getComplianceColor(truck.taxExpiry)}`}>{truck.taxExpiry || '-'}</td>
                    <td className={`px-4 sm:px-6 py-4 sm:py-5 text-center font-mono hidden xl:table-cell ${getComplianceColor(truck.permitExpiry)}`}>{truck.permitExpiry || '-'}</td>
                    <td className="px-4 sm:px-6 py-4 sm:py-5 text-center">
                      <span className={`px-2 sm:px-3 py-1 rounded-full text-[9px] sm:text-[10px] font-black uppercase ${truck.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-700' : truck.status === 'BREAKDOWN' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>{truck.status}</span>
                    </td>
                    <td className="px-4 sm:px-6 py-4 sm:py-5 text-right">
                      <div className="flex justify-end gap-2 sm:gap-3">
                        <button onClick={() => { setEditFormData(truck); setEditingTruckId(truck.id); }} className="text-slate-400 hover:text-emerald-600 font-black text-[9px] sm:text-[10px] uppercase tracking-widest transition-all">EDIT</button>
                        <button onClick={() => setSelectedTruckId(truck.id)} className="text-slate-400 hover:text-amber-600 font-black text-[9px] sm:text-[10px] uppercase tracking-widest transition-all">DETAILS</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="animate-fadeIn space-y-4 sm:space-y-8">
           <button onClick={() => { setSelectedTruckId(null); onClearSelection?.(); }} className="text-slate-400 hover:text-slate-900 flex items-center space-x-2 font-black text-xs uppercase tracking-widest"><span>← BACK TO FLEET</span></button>
           
           <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
             <div className="lg:col-span-4 bg-white p-6 sm:p-8 rounded-[1.5rem] sm:rounded-[2.5rem] shadow-sm border border-slate-100 space-y-8 self-start">
                <div>
                  <div className="flex justify-between items-start">
                    <h3 className="text-2xl sm:text-4xl font-black text-slate-900 tracking-tight">{selectedTruck.plateNumber}</h3>
                    <span className={`px-3 sm:px-4 py-1.5 rounded-full text-[9px] sm:text-[10px] font-black uppercase ${selectedTruck.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-700' : selectedTruck.status === 'BREAKDOWN' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>{selectedTruck.status}</span>
                  </div>
                  <div className="mt-4 space-y-1">
                    <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">ASSET OWNER: <span className="text-slate-900 font-bold ml-1">{selectedTruck.transporterName || 'Self Owned'}</span></p>
                    <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">LIVE ODOMETER: <span className="text-slate-900 font-mono font-bold ml-1">{selectedTruck.currentOdometer.toLocaleString()} KM</span></p>
                    {selectedTruck.remarks && <p className="text-[10px] text-rose-500 font-black uppercase tracking-widest mt-2">Latest Remark: <span className="italic font-bold ml-1">"{selectedTruck.remarks}"</span></p>}
                  </div>
                </div>

                <div className="space-y-4">
                  {docList.map(doc => {
                    const expiry = (selectedTruck as any)[doc.key];
                    const docUrl = selectedTruck.documents?.[doc.docKey];
                    return (
                      <div key={doc.key} className="flex flex-col border-b border-slate-50 pb-4 last:border-0">
                        <div className="flex justify-between items-start mb-1">
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{doc.label}</span>
                          {docUrl && <span className="text-[8px] sm:text-[9px] font-black text-emerald-500 uppercase">PDF ATTACHED</span>}
                        </div>
                        <div className="flex justify-between items-center">
                          <span className={`text-xs font-black font-mono ${getComplianceColor(expiry)}`}>{doc.noDate ? 'VIEW ONLY' : (expiry || 'Not Configured')}</span>
                          <div className="flex gap-2">
                            <button 
                              onClick={() => docUrl && window.open(docUrl, '_blank')}
                              disabled={!docUrl}
                              className={`px-3 sm:px-4 py-1.5 rounded-lg font-black text-[9px] uppercase tracking-widest transition-all ${docUrl ? 'bg-blue-50 text-blue-600 hover:bg-blue-100' : 'bg-slate-50 text-slate-300 cursor-not-allowed'}`}
                            >
                              {doc.docKey === 'rc' ? 'RC' : 'VIEW'}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <button onClick={() => { setEditFormData(selectedTruck); setEditingTruckId(selectedTruck.id); }} className="w-full py-4 sm:py-5 bg-slate-900 text-white rounded-2xl font-black text-[10px] sm:text-[11px] uppercase tracking-widest shadow-xl hover:bg-black transition-all border-b-4 border-black">UPDATE SPECS</button>
             </div>

             <div className="lg:col-span-8 bg-white p-6 sm:p-10 rounded-[1.5rem] sm:rounded-[2.5rem] shadow-sm border border-slate-100">
               <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 sm:mb-10 gap-4">
                  <h4 className="text-lg sm:text-xl font-black text-slate-900">Asset Wheel Config ({selectedTruck.wheelConfig})</h4>
                  <button onClick={() => setIsMaintenanceLogOpen(true)} className="bg-emerald-50 text-emerald-600 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-100 transition-colors border border-emerald-100">
                      View Log
                  </button>
               </div>
               <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-6">
                 {getWheelPositions(selectedTruck.wheelConfig).map(pos => {
                   const mountedTire = selectedTruck.tires.find(t => t.position?.toUpperCase() === pos.toUpperCase());
                   return (
                     <div key={pos} className={`p-4 sm:p-6 rounded-[1.5rem] sm:rounded-[2rem] border-2 transition-all cursor-pointer flex flex-col items-center justify-center text-center min-h-[120px] sm:min-h-[140px] ${mountedTire ? 'bg-white border-slate-100 shadow-sm ring-1 ring-slate-100' : 'bg-slate-50 border-dashed border-slate-200 hover:border-amber-400'}`} 
                        onClick={() => { if (mountedTire) openUnmountModal(pos, mountedTire); else { setPickingPosition({ truckId: selectedTruck.id, pos }); setIsTirePickerOpen(true); } }}>
                       <p className="text-[9px] sm:text-[10px] font-black text-slate-400 uppercase mb-2 tracking-widest">{pos}</p>
                       {mountedTire ? (
                         <div className="w-full">
                           <p className="text-xs sm:text-sm font-black text-slate-900 font-mono truncate">{mountedTire.serialNumber}</p>
                           <p className="text-[8px] sm:text-[9px] font-black text-amber-500 uppercase mt-1 tracking-widest">MOUNTED</p>
                         </div>
                       ) : (
                         <div className="flex flex-col items-center opacity-40">
                            <span className="text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest">+ MOUNT</span>
                         </div>
                       )}
                     </div>
                   );
                 })}
               </div>
             </div>
           </div>
        </div>
      )}

      {/* Fleet Reporting Modal */}
      {isReportModalOpen && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-xl z-[500] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] sm:rounded-[3rem] shadow-2xl w-full max-w-7xl h-[90vh] overflow-hidden flex flex-col animate-scaleIn print:h-auto print:bg-white">
            <div className="bg-slate-900 p-6 sm:p-10 text-white flex justify-between items-center no-print shrink-0">
              <div>
                <h3 className="text-xl sm:text-3xl font-black uppercase tracking-tight">Fleet Compliance</h3>
                <p className="hidden sm:block text-sm text-slate-400 font-bold uppercase tracking-widest mt-1 italic">Audit Registry & Document Status Dashboard</p>
              </div>
              <div className="flex gap-2 sm:gap-4">
                <button onClick={exportStatusReport} className="bg-transparent border border-rose-500 text-rose-500 px-4 sm:px-6 py-2 sm:py-3 rounded-2xl font-black text-[10px] sm:text-xs uppercase tracking-widest hover:bg-rose-500 hover:text-white transition-all flex items-center gap-2">
                  <span>status report</span>
                </button>
                <button onClick={exportFleetExcel} className="bg-emerald-600 text-white px-4 sm:px-6 py-2 sm:py-3 rounded-2xl font-black text-[10px] sm:text-xs uppercase tracking-widest shadow-xl hover:bg-emerald-700 transition-all flex items-center gap-2">
                  <span>Detail compilane report</span>
                </button>
                <button onClick={() => setIsReportModalOpen(false)} className="text-white text-3xl font-light hover:text-rose-500 transition-colors">&times;</button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 sm:p-10 space-y-8 scrollbar-hide">
              <div className="hidden print:block mb-8">
                 <h1 className="text-4xl font-black text-slate-900 uppercase tracking-tighter">Fleet Asset Compliance Audit</h1>
                 <p className="text-slate-500 font-bold mt-2 uppercase tracking-widest">{new Date().toLocaleDateString()} • {repFleetFilter === 'ALL' ? 'Total Fleet' : `${repFleetFilter} PORTFOLIO`}</p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 no-print">
                 <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Fleet Sector</label>
                    <select className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-sm outline-none" value={repFleetFilter} onChange={e => { setRepFleetFilter(e.target.value as any); setRepTruckFilter('ALL'); }}>
                       <option value="ALL">Entire Fleet Registry</option>
                       <option value="MINING">Mining Operations</option>
                       <option value="COAL">Coal Transport</option>
                    </select>
                 </div>
                 <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Individual Asset Filter</label>
                    <select className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold text-sm outline-none" value={repTruckFilter} onChange={e => setRepTruckFilter(e.target.value)}>
                       <option value="ALL">All Mapped Vehicles</option>
                       {trucks.filter(t => repFleetFilter === 'ALL' || t.fleetType === repFleetFilter).map(t => (
                         <option key={t.id} value={t.id}>{t.plateNumber}</option>
                       ))}
                    </select>
                 </div>
                 <div className="col-span-2 flex gap-4">
                    <div className="bg-amber-50 p-6 rounded-[2.5rem] border border-amber-100 flex-1 flex flex-col justify-center">
                       <span className="text-[10px] font-black text-amber-600 uppercase tracking-widest">Total Assets</span>
                       <span className="text-3xl font-black text-slate-900">{reportingList.length}</span>
                    </div>
                    <div className="bg-rose-50 p-6 rounded-[2.5rem] border border-rose-100 flex-1 flex flex-col justify-center">
                       <span className="text-[10px] font-black text-rose-600 uppercase tracking-widest">Expiring Soon</span>
                       <span className="text-3xl font-black text-slate-900">
                          {reportingList.filter(t => [t.fitnessExpiry, t.insuranceExpiry, t.puccExpiry, t.taxExpiry, t.permitExpiry].some(d => getComplianceStatus(d) === 'CRITICAL')).length}
                       </span>
                    </div>
                 </div>
              </div>

              <div className="bg-white rounded-[2.5rem] border border-slate-100 overflow-hidden shadow-sm">
                 <div className="overflow-x-auto">
                   <table className="w-full text-left text-[10px]">
                      <thead className="bg-slate-900 text-slate-300 font-black uppercase tracking-widest">
                         <tr>
                            <th className="px-6 py-5">Vehicle ID</th>
                            <th className="px-6 py-5">Fleet</th>
                            <th className="px-6 py-5 text-center">Fitness</th>
                            <th className="px-6 py-5 text-center">Insurance</th>
                            <th className="px-6 py-5 text-center">PUCC</th>
                            <th className="px-6 py-5 text-center">Tax</th>
                            <th className="px-6 py-5 text-center">Permit</th>
                            <th className="px-6 py-5 text-right">Odometer</th>
                         </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                         {reportingList.map(t => (
                            <tr key={t.id} className="hover:bg-slate-50 transition-colors">
                               <td className="px-6 py-4">
                                  <div className="flex flex-col">
                                     <span className="font-black text-slate-900 font-mono text-sm">{t.plateNumber}</span>
                                     <span className="text-[9px] font-bold text-slate-400 uppercase">{t.transporterName || 'Self'}</span>
                                  </div>
                               </td>
                               <td className="px-6 py-4">
                                  <span className={`px-2 py-1 rounded text-[8px] font-black uppercase ${t.fleetType === 'COAL' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'}`}>{t.fleetType}</span>
                               </td>
                               <td className={`px-6 py-4 text-center font-mono ${getComplianceColor(t.fitnessExpiry)}`}>{t.fitnessExpiry || '--'}</td>
                               <td className={`px-6 py-4 text-center font-mono ${getComplianceColor(t.insuranceExpiry)}`}>{t.insuranceExpiry || '--'}</td>
                               <td className={`px-6 py-4 text-center font-mono ${getComplianceColor(t.puccExpiry)}`}>{t.puccExpiry || '--'}</td>
                               <td className={`px-6 py-4 text-center font-mono ${getComplianceColor(t.taxExpiry)}`}>{t.taxExpiry || '--'}</td>
                               <td className={`px-6 py-4 text-center font-mono ${getComplianceColor(t.permitExpiry)}`}>{t.permitExpiry || '--'}</td>
                               <td className="px-6 py-4 text-right font-black text-slate-900 font-mono text-xs">{t.currentOdometer.toLocaleString()} KM</td>
                            </tr>
                         ))}
                         {reportingList.length === 0 && (
                            <tr><td colSpan={8} className="py-20 text-center font-black text-slate-300 uppercase italic">No records matching registry criteria</td></tr>
                         )}
                      </tbody>
                   </table>
                 </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {(isAddModalOpen || editingTruckId) && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[200] flex items-center justify-center p-2 sm:p-4">
          <div className="bg-white rounded-[2rem] sm:rounded-[2.5rem] shadow-2xl w-full max-w-6xl overflow-hidden animate-scaleIn h-full sm:h-auto max-h-[95vh] flex flex-col">
            <div className="bg-slate-900 p-6 sm:p-8 text-white flex justify-between items-center shrink-0">
              <h3 className="text-lg sm:text-xl font-black uppercase tracking-tight">{editingTruckId ? 'UPDATE ASSET SPECS' : 'REGISTER NEW ASSET'}</h3>
              <button onClick={() => { setIsAddModalOpen(false); setEditingTruckId(null); }} className="text-white text-3xl font-light hover:text-amber-500 transition-colors">&times;</button>
            </div>
            <form onSubmit={editingTruckId ? handleUpdateSubmit : handleAddSubmit} className="p-6 sm:p-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-12 overflow-y-auto scrollbar-hide flex-1">
              
              {/* Column 1: Core Identity */}
              <div className="space-y-6">
                <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-widest border-b pb-2">CORE IDENTITY</h4>
                <div className="grid grid-cols-1 gap-6">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase text-slate-400 ml-1">PLATE NUMBER</label>
                    <input type="text" className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-black uppercase text-lg" value={editingTruckId ? editFormData.plateNumber : newTruck.plateNumber} onChange={e => editingTruckId ? setEditFormData({...editFormData, plateNumber: e.target.value.toUpperCase()}) : setNewTruck({...newTruck, plateNumber: e.target.value.toUpperCase()})} required />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase text-slate-400 ml-1">ASSET OWNER</label>
                    <input type="text" className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-lg" value={editingTruckId ? editFormData.transporterName : newTruck.transporterName} onChange={e => editingTruckId ? setEditFormData({...editFormData, transporterName: e.target.value}) : setNewTruck({...newTruck, transporterName: e.target.value})} required />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase text-slate-400 ml-1">ODOMETER (KM)</label>
                      <input type="number" className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-black font-mono" value={editingTruckId ? editFormData.currentOdometer : newTruck.currentOdometer} onChange={e => editingTruckId ? setEditFormData({...editFormData, currentOdometer: parseInt(e.target.value) || 0}) : setNewTruck({...newTruck, currentOdometer: e.target.value})} required />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase text-slate-400 ml-1">FLEET CATEGORY</label>
                      <select className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold" value={editingTruckId ? editFormData.fleetType : newTruck.fleetType} onChange={e => editingTruckId ? setEditFormData({...editFormData, fleetType: e.target.value as any}) : setNewTruck({...newTruck, fleetType: e.target.value as any})}>
                        <option value="MINING">Mining</option>
                        <option value="COAL">Coal</option>
                      </select>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase text-slate-400 ml-1">WHEEL CONFIGURATION</label>
                    <select className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold" value={editingTruckId ? editFormData.wheelConfig : newTruck.wheelConfig} onChange={e => editingTruckId ? setEditFormData({...editFormData, wheelConfig: e.target.value as any}) : setNewTruck({...newTruck, wheelConfig: e.target.value as any})}>
                      <option value="10 WHEEL">10 WHEEL</option>
                      <option value="14 WHEEL">14 WHEEL</option>
                      <option value="16 WHEEL">16 WHEEL</option>
                    </select>
                  </div>
                  
                  {/* Status Dropdown Logic */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase text-emerald-600 ml-1">ASSET STATUS</label>
                    <select 
                      className={`w-full p-4 border-2 rounded-2xl font-black uppercase tracking-tight text-lg outline-none transition-all ${
                        (editingTruckId ? editFormData.status : newTruck.status) === 'ACTIVE' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 
                        (editingTruckId ? editFormData.status : newTruck.status) === 'BREAKDOWN' ? 'bg-rose-50 border-rose-200 text-rose-700' : 
                        'bg-amber-50 border-amber-200 text-amber-700'
                      }`}
                      value={editingTruckId ? editFormData.status : newTruck.status} 
                      onChange={e => editingTruckId ? setEditFormData({...editFormData, status: e.target.value as any}) : setNewTruck({...newTruck, status: e.target.value as any})}
                    >
                      <option value="ACTIVE">ACTIVE / READY</option>
                      <option value="MAINTENANCE">MAINTENANCE / SERVICE</option>
                      <option value="BREAKDOWN">BREAKDOWN / REPAIR</option>
                      <option value="IDLE">IDLE / PARARKED</option>
                    </select>
                  </div>

                  {/* Conditional Remarks Field */}
                  {((editingTruckId ? editFormData.status : newTruck.status) === 'MAINTENANCE' || (editingTruckId ? editFormData.status : newTruck.status) === 'BREAKDOWN') && (
                    <div className="space-y-1 animate-fadeIn">
                      <label className="text-[10px] font-black uppercase text-rose-500 ml-1 tracking-widest">BREAKDOWN/SERVICE REMARKS</label>
                      <textarea 
                        className="w-full p-4 bg-rose-50/50 border-2 border-rose-100 rounded-2xl font-bold text-sm h-24 placeholder:text-rose-300"
                        placeholder="Describe issue, parts needed, or estimate downtime..."
                        value={editingTruckId ? editFormData.remarks : newTruck.remarks}
                        onChange={e => editingTruckId ? setEditFormData({...editFormData, remarks: e.target.value}) : setNewTruck({...newTruck, remarks: e.target.value})}
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Column 2: Compliance & Status History */}
              <div className="space-y-6">
                <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-widest border-b pb-2">COMPLIANCE & DOCUMENTS</h4>
                <div className="space-y-4">
                  {docList.map(doc => (
                    <div key={doc.key} className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end bg-slate-50/50 p-3 rounded-2xl border border-slate-100">
                      <div className="space-y-1">
                        <label className="text-[9px] font-black uppercase text-slate-400 ml-1">{doc.label} {doc.noDate ? '' : 'EXPIRY'}</label>
                        {!doc.noDate ? (
                          <input type="date" className="w-full p-3 bg-white border border-slate-200 rounded-xl font-bold text-xs" value={(editingTruckId ? editFormData : newTruck)[doc.key] || ''} onChange={e => editingTruckId ? setEditFormData({...editFormData, [doc.key]: e.target.value}) : setNewTruck({...newTruck, [doc.key]: e.target.value})} />
                        ) : (
                          <div className="w-full p-3 bg-slate-100 border border-slate-200 rounded-xl text-[9px] font-bold text-slate-400 flex items-center">
                            N/A
                          </div>
                        )}
                      </div>
                      <div className="space-y-1">
                         {/* ... Upload ... */}
                         <div className="relative">
                           <input type="file" accept=".pdf" className="absolute inset-0 opacity-0 cursor-pointer" onChange={e => handleFileUpload(doc.docKey, e, !!editingTruckId)} />
                           <div className={`p-3 border border-dashed rounded-xl text-center text-[10px] font-black uppercase ${(editingTruckId ? editFormData : newTruck).documents?.[doc.docKey] ? 'bg-emerald-50 border-emerald-500 text-emerald-600' : 'bg-white border-slate-200 text-slate-400'}`}>
                             {(editingTruckId ? editFormData : newTruck).documents?.[doc.docKey] ? '✓ ATTACHED' : 'ATTACH PDF +'}
                           </div>
                         </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Column 3: History & Finalize */}
              <div className="space-y-6">
                <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-widest border-b pb-2">EVENT LOG</h4>
                <div className="bg-slate-900 rounded-3xl p-6 min-h-[200px] sm:min-h-[300px] max-h-[300px] sm:max-h-[400px] overflow-y-auto scrollbar-hide space-y-4">
                  {(editingTruckId ? (trucks.find(t => t.id === editingTruckId)?.statusHistory || []) : []).map((h, i) => (
                    <div key={i} className="border-l-2 border-slate-700 pl-4 py-1 relative">
                       {/* Fix: Color circle should use appropriate background color classes based on status, fixed unintentional comparison with 'EMERALD-500' */}
                       <div className={`absolute -left-[5px] top-2 w-2 h-2 rounded-full ${h.status === 'BREAKDOWN' ? 'bg-rose-500' : h.status === 'MAINTENANCE' ? 'bg-amber-500' : 'bg-emerald-500'}`}></div>
                       <p className="text-[8px] font-black text-slate-500 uppercase">{h.date}</p>
                       <p className="text-[10px] font-black text-white uppercase tracking-tighter">{h.status}</p>
                       {h.remarks && <p className="text-[10px] text-slate-400 font-bold italic mt-0.5">"{h.remarks}"</p>}
                    </div>
                  ))}
                  {(!editingTruckId || !(trucks.find(t => t.id === editingTruckId)?.statusHistory?.length)) && (
                    <div className="h-full flex flex-col items-center justify-center opacity-20 py-10">
                       <span className="text-4xl mb-2">📜</span>
                       <p className="text-[10px] font-black text-white uppercase tracking-widest">No previous events</p>
                    </div>
                  )}
                </div>

                <div className="pt-6">
                  <button type="submit" disabled={isUploading} className={`w-full py-5 sm:py-6 rounded-[2rem] sm:rounded-[2.5rem] font-black text-lg sm:text-xl shadow-xl uppercase tracking-widest transition-all border-b-8 ${isUploading ? 'bg-slate-200 text-slate-400 cursor-not-allowed' : 'bg-amber-500 hover:bg-amber-600 text-white border-amber-700'}`}>
                    {isUploading ? 'UPLOADING...' : (editingTruckId ? 'COMMIT CHANGES' : 'REGISTER ASSET')}
                  </button>
                </div>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* Maintenance Log View Modal */}
      {isMaintenanceLogOpen && selectedTruck && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[600] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-md overflow-hidden animate-scaleIn">
            <div className="bg-slate-900 p-8 text-white flex justify-between items-center">
              <div>
                <h3 className="text-lg font-black uppercase tracking-tight">Downtime & Event Log</h3>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{selectedTruck.plateNumber}</p>
              </div>
              <div className="flex items-center gap-3">
                <button 
                  onClick={exportMaintenanceLog}
                  className="border border-emerald-500 text-emerald-500 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-500 hover:text-white transition-all shadow-md active:scale-95"
                >
                  download report
                </button>
                <button onClick={() => setIsMaintenanceLogOpen(false)} className="text-white text-3xl font-light hover:text-rose-500 transition-colors">&times;</button>
              </div>
            </div>
            <div className="p-8 space-y-4">
                <div className="bg-slate-900 rounded-3xl p-6 min-h-[400px] max-h-[60vh] overflow-y-auto scrollbar-hide space-y-4">
                  {(selectedTruck.statusHistory || []).map((h, i) => (
                    <div key={i} className="border-l-2 border-slate-700 pl-4 py-1 relative">
                       <div className={`absolute -left-[5px] top-2 w-2 h-2 rounded-full ${h.status === 'BREAKDOWN' ? 'bg-rose-500' : h.status === 'MAINTENANCE' ? 'bg-amber-500' : 'bg-emerald-500'}`}></div>
                       <p className="text-[8px] font-black text-slate-500 uppercase">{h.date}</p>
                       <p className="text-[10px] font-black text-white uppercase tracking-tighter">{h.status}</p>
                       {h.remarks && <p className="text-[10px] text-slate-400 font-bold italic mt-0.5">"{h.remarks}"</p>}
                    </div>
                  ))}
                  {!(selectedTruck.statusHistory?.length) && (
                    <div className="h-full flex flex-col items-center justify-center opacity-20 py-20">
                       <span className="text-4xl mb-2">📜</span>
                       <p className="text-[10px] font-black text-white uppercase tracking-widest">No maintenance events recorded</p>
                    </div>
                  )}
                </div>
                <button onClick={() => setIsMaintenanceLogOpen(false)} className="w-full py-4 bg-amber-500 text-white rounded-2xl font-black uppercase text-xs tracking-widest shadow-lg hover:bg-amber-600 transition-all border-b-4 border-amber-700">Close Log</button>
            </div>
          </div>
        </div>
      )}

      {/* Tire Picker Modal */}
      {isTirePickerOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[500] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-2xl overflow-hidden animate-scaleIn">
            <div className="bg-slate-900 p-8 text-white flex justify-between items-center">
              <div>
                <h3 className="text-xl font-black uppercase tracking-tight">Select Replacement Tire</h3>
                <p className="text-xs text-slate-400 uppercase font-bold tracking-widest mt-1">Spare Pool Inventory</p>
              </div>
              <button onClick={() => setIsTirePickerOpen(false)} className="text-white text-3xl font-light hover:text-amber-500 transition-colors">&times;</button>
            </div>
            <div className="p-8 space-y-6">
              <input type="text" placeholder="Filter by Serial or Brand..." className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold outline-none focus:border-amber-400 transition-all" value={tirePickerSearch} onChange={e => setTirePickerSearch(e.target.value)} />
              <div className="max-h-80 overflow-y-auto space-y-3 pr-2 scrollbar-hide">
                {filteredSpareTires.map(t => (
                  <button key={t.id} onClick={() => { setSelectedSpareId(t.id); setIsKmPromptOpen(true); }} className="w-full bg-slate-50 hover:bg-amber-50 border border-slate-100 hover:border-amber-200 p-6 rounded-2xl text-left transition-all flex justify-between items-center group">
                    <div>
                      <p className="font-black text-slate-900 font-mono text-lg">{t.serialNumber}</p>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{t.brand} • {t.size}</p>
                    </div>
                    
                    <span className={`text-[10px] font-black uppercase tracking-widest ${t.status === 'NEW' ? 'text-emerald-500' : 'text-slate-500'}`}>
                        {t.status}
                    </span>

                    <span className="bg-white px-4 py-2 rounded-xl text-[10px] font-black text-amber-500 uppercase tracking-widest shadow-sm group-hover:bg-amber-500 group-hover:text-white transition-all">Select</span>
                  </button>
                ))}
                {filteredSpareTires.length === 0 && <p className="text-center py-10 text-slate-300 font-black uppercase tracking-widest">No matching spare tires</p>}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* KM Prompt Modal */}
      {isKmPromptOpen && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[600] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-md overflow-hidden animate-scaleIn">
            <div className="bg-slate-900 p-8 text-white flex justify-between items-center">
              <h3 className="text-lg font-black uppercase tracking-tight">Mounting Specs</h3>
              <button onClick={() => setIsKmPromptOpen(false)} className="text-white text-2xl font-light hover:text-rose-500 transition-colors">&times;</button>
            </div>
            <div className="p-8 space-y-6">
               <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Mounting Odometer (KM)</label>
                  <input type="number" className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-2xl outline-none focus:border-amber-400" placeholder={selectedTruck?.currentOdometer.toString()} value={mountKm} onChange={e => setMountKm(e.target.value)} />
               </div>
               <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Installation Remarks</label>
                  <textarea className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold h-24 outline-none focus:border-amber-400" placeholder="Condition notes..." value={mountRemarks} onChange={e => setMountRemarks(e.target.value)} />
               </div>
               <button onClick={handleFinalMount} className="w-full py-5 bg-amber-500 text-white rounded-[2rem] font-black uppercase shadow-xl hover:bg-amber-600 transition-all border-b-4 border-amber-700">Confirm Installation</button>
            </div>
          </div>
        </div>
      )}

      {/* Unmount Modal */}
      {isUnmountModalOpen && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[600] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-md overflow-hidden animate-scaleIn">
            <div className="bg-slate-900 p-8 text-white flex justify-between items-center">
              <div>
                <h3 className="text-lg font-black uppercase tracking-tight">Unmount & Detach</h3>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{pickingPosition?.currentTire?.serialNumber}</p>
              </div>
              <button onClick={() => setIsUnmountModalOpen(false)} className="text-white text-2xl font-light hover:text-rose-500 transition-colors">&times;</button>
            </div>
            <div className="p-8 space-y-6">
               <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Destination State</label>
                  <select className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black uppercase outline-none focus:border-amber-400" value={unmountData.status} onChange={e => setUnmountData({...unmountData, status: e.target.value as any})}>
                     <option value="SPARE">BACK TO SPARE POOL</option>
                     <option value="REPAIR">SEND FOR REPAIR</option>
                     <option value="SCRAPPED">RETIRE / SCRAP</option>
                  </select>
               </div>
               <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Closing Mileage (KM)</label>
                  <input type="number" className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-2xl outline-none focus:border-amber-400" value={unmountData.km} onChange={e => setUnmountData({...unmountData, km: e.target.value})} />
               </div>
               <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Reason / Remarks</label>
                  <textarea className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold h-24 outline-none focus:border-amber-400" placeholder="Why is it being detached?" value={unmountData.remarks} onChange={e => setUnmountData({...unmountData, remarks: e.target.value})} />
               </div>
               <button onClick={handleFinalUnmount} className="w-full py-5 bg-rose-500 text-white rounded-[2rem] font-black uppercase shadow-xl hover:bg-rose-600 transition-all border-b-4 border-rose-700">Unmount Tire</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TruckRegistry;