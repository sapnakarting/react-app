import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Truck, FuelLog, TripLog, CoalLog, MiningLog, Driver, MasterData, DailyOdoEntry, User } from '../types';
import { dbService } from '../services/dbService';
import { storageService } from '../services/storageService';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

declare const XLSX: any;

interface AgentProps {
  currentUser: User;
  role: 'ADMIN' | 'FUEL_AGENT';
  trucks: Truck[];
  drivers: Driver[];
  fuelLogs: FuelLog[];
  coalLogs: CoalLog[];
  miningLogs: MiningLog[];
  dailyOdo: DailyOdoEntry[];
  masterData: MasterData;
  users: User[];
  onAddLog: (log: FuelLog) => Promise<void> | void;
  onUpdateLog?: (log: FuelLog) => Promise<void> | void;
  onNavigate?: (view: string, params?: { truckId?: string; date?: string; stationId?: string }) => void;
}

const FuelAgentView: React.FC<AgentProps> = ({ 
  currentUser, role, trucks, drivers, fuelLogs, coalLogs, miningLogs, dailyOdo, onAddLog, onUpdateLog, masterData, onNavigate, users
}) => {
  // Form State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedTruckId, setSelectedTruckId] = useState('');
  const [truckSearch, setTruckSearch] = useState('');
  const [showTruckDropdown, setShowTruckDropdown] = useState(false);
  const [selectedDriverId, setSelectedDriverId] = useState('');
  const [driverSearch, setDriverSearch] = useState('');
  const [showDriverDropdown, setShowDriverDropdown] = useState(false);
  const [truckHighlightIndex, setTruckHighlightIndex] = useState(-1);
  const [driverHighlightIndex, setDriverHighlightIndex] = useState(-1);
  const [selectedStationId, setSelectedStationId] = useState('');
  const [odometer, setOdometer] = useState('');
  const [fuelLiters, setFuelLiters] = useState('');
  const [dieselPrice, setDieselPrice] = useState('90.55');
  const [fuelingDate, setFuelingDate] = useState(new Date().toISOString().split('T')[0]);
  const [entryType, setEntryType] = useState<'PER_TRIP' | 'FULL_TANK'>('FULL_TANK');
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [photosUploaded, setPhotosUploaded] = useState(false);
  const [uploadedUrls, setUploadedUrls] = useState<(string | null)[]>([null, null, null, null]);
  const [showProofSection, setShowProofSection] = useState(false);
  
  // Computed Attribution Date
  const attributionDate = useMemo(() => {
    if (entryType === 'PER_TRIP') return fuelingDate;
    const d = new Date(fuelingDate);
    d.setDate(d.getDate() - 1);
    return d.toISOString().split('T')[0];
  }, [fuelingDate, entryType]);

  // Verification Proofs
  const [photos, setPhotos] = useState<(string | null)[]>([null, null, null, null]);

  // UI States
  const [viewingLog, setViewingLog] = useState<FuelLog | null>(null);
  const [success, setSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastSavedLog, setLastSavedLog] = useState<FuelLog | null>(null);
  const [historySearch, setHistorySearch] = useState('');
  const [historyStartDate, setHistoryStartDate] = useState('');
  const [historyEndDate, setHistoryEndDate] = useState('');
  const [fleetFilter, setFleetFilter] = useState<'ALL' | 'COAL' | 'MINING'>('ALL');
  const [historyStationFilter, setHistoryStationFilter] = useState('ALL');
  const [visibleCount, setVisibleCount] = useState(30);

  const truckDropdownRef = useRef<HTMLDivElement>(null);
  const driverDropdownRef = useRef<HTMLDivElement>(null);

  const filteredTrucks = useMemo(() => {
    return trucks
      .filter(t => t.status === 'ACTIVE') // Requirement: Only show active trucks
      .filter(t => t.plateNumber.toLowerCase().includes(truckSearch.toLowerCase()));
  }, [trucks, truckSearch]);

  const filteredDrivers = useMemo(() => {
    return drivers
      .filter(d => d.status === 'ON Duty') // Fixed: Driver status is 'ON Duty', not 'ACTIVE'
      .filter(d => d.name.toLowerCase().includes(driverSearch.toLowerCase()));
  }, [drivers, driverSearch]);

  // Handle outside clicks to close dropdowns
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (truckDropdownRef.current && !truckDropdownRef.current.contains(event.target as Node)) {
        setShowTruckDropdown(false);
      }
      if (driverDropdownRef.current && !driverDropdownRef.current.contains(event.target as Node)) {
        setShowDriverDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);
  
  const [adminAgentFilter, setAdminAgentFilter] = useState('ALL');

  const completedLogs = useMemo(() => {
    let list = fuelLogs.filter(l => l.status !== 'IN_PROGRESS');
    
    // Apply Fleet Filter
    if (fleetFilter !== 'ALL') {
      list = list.filter(l => trucks.find(t => t.id === l.truckId)?.fleetType === fleetFilter);
    }

    if (historySearch) {
      list = list.filter(l => trucks.find(t => t.id === l.truckId)?.plateNumber.toLowerCase().includes(historySearch.toLowerCase()));
    }
    if (historyStartDate) {
      list = list.filter(l => l.date >= historyStartDate);
    }
    if (historyEndDate) {
      list = list.filter(l => l.date <= historyEndDate);
    }
    if (historyStationFilter !== 'ALL') {
      list = list.filter(l => l.stationId === historyStationFilter || l.stationId === masterData.fuelStations.find(s => s.id === historyStationFilter)?.name);
    }

    // Role-based filtering
    if (role === 'FUEL_AGENT') {
      list = list.filter(l => l.agentId === currentUser.username);
    } else if (role === 'ADMIN' && adminAgentFilter !== 'ALL') {
      list = list.filter(l => l.agentId === adminAgentFilter);
    }

    return list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [fuelLogs, historySearch, historyStartDate, historyEndDate, trucks, fleetFilter, historyStationFilter, masterData.fuelStations, role, currentUser.username, adminAgentFilter]);

  const selectedTruck = trucks.find(t => t.id === selectedTruckId);

  // Requirement: Fetch that days odometer reading (Source: Daily ODO Registry table)
  const previousOdometer = useMemo(() => {
    if (!selectedTruckId) return 0;
    
    // If editing, use the log's own saved previous odometer
    if (editingId) {
      const log = fuelLogs.find(l => l.id === editingId);
      if (log) return log.previousOdometer;
    }

    // 1. Check for existing logs on the same date first (for multiple fills in one day)
    const sameDayLogs = fuelLogs
      .filter(l => l.truckId === selectedTruckId && l.date === fuelingDate && l.status === 'COMPLETED')
      .sort((a, b) => b.odometer - a.odometer); // Highest odometer first implies latest
    
    if (sameDayLogs.length > 0) {
      return sameDayLogs[0].odometer;
    }

    // 2. Check Daily ODO Registry (The Snapshots)
    // Only used if no logs exist for today yet
    const registryEntry = dailyOdo.find(d => d.truckId === selectedTruckId && d.date === fuelingDate);
    if (registryEntry?.openingOdometer) return registryEntry.openingOdometer;

    // 3. Fallback: Lookup latest log for this truck that occurred strictly BEFORE the selected date
    const earlierLogs = fuelLogs
      .filter(l => l.truckId === selectedTruckId && l.date < fuelingDate && l.status === 'COMPLETED' && l.id !== editingId)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    
    if (earlierLogs.length > 0) return earlierLogs[0].odometer;
    
    // 4. Last Resort: use truck's current system odometer
    return selectedTruck?.currentOdometer || 0;
  }, [selectedTruckId, fuelingDate, dailyOdo, fuelLogs, editingId, selectedTruck]);

  const handlePhotoUpload = async (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      setPhotos(prev => {
        const next = [...prev];
        next[index] = reader.result as string;
        return next;
      });
    };
    reader.readAsDataURL(file);
  };

  const handleDiscardPhoto = (index: number) => {
    setPhotos(prev => {
      const next = [...prev];
      next[index] = null;
      return next;
    });
    setUploadedUrls(prev => {
      const next = [...prev];
      next[index] = null;
      return next;
    });
    setPhotosUploaded(false);
  };

  const resetForm = () => {
    setEditingId(null);
    setSelectedTruckId('');
    setTruckSearch('');
    setSelectedDriverId('');
    setDriverSearch('');
    setSelectedStationId('');
    setOdometer('');
    setFuelLiters('');
    setDieselPrice('90.55');
    setEntryType('FULL_TANK');
    setPhotos([null, null, null, null]);
    setUploadedUrls([null, null, null, null]);
    setPhotosUploaded(false);
    setShowProofSection(false);
    setTruckHighlightIndex(-1);
    setDriverHighlightIndex(-1);
  };

  const handleEdit = (log: FuelLog) => {
    const truck = trucks.find(t => t.id === log.truckId);
    const driver = drivers.find(d => d.id === log.driverId);
    
    // Robust station matching: handle both ID and Name in legacy logs
    const station = masterData.fuelStations.find(s => s.id === log.stationId || s.name === log.stationId);

    setEditingId(log.id);
    setSelectedTruckId(log.truckId);
    setTruckSearch(truck?.plateNumber || '');
    setSelectedDriverId(log.driverId);
    setDriverSearch(driver?.name || '');
    setSelectedStationId(station?.id || '');
    setOdometer(log.odometer.toString());
    setFuelLiters(log.fuelLiters.toString());
    setDieselPrice(log.dieselPrice?.toString() || '90.55');
    setFuelingDate(log.date);
    setEntryType(log.entryType || 'FULL_TANK');
    setPhotos([
      log.verificationPhotos?.plate || null,
      log.verificationPhotos?.odo || null,
      log.verificationPhotos?.pumpStart || null,
      log.verificationPhotos?.pumpEnd || null
    ]);
    setUploadedUrls([
      log.verificationPhotos?.plate || null,
      log.verificationPhotos?.odo || null,
      log.verificationPhotos?.pumpStart || null,
      log.verificationPhotos?.pumpEnd || null
    ]);
    setPhotosUploaded(true); // Treat existing photos as "uploaded"
    
    // Automatically open proof section if there are photos
    if (log.verificationPhotos?.plate || log.verificationPhotos?.odo || log.verificationPhotos?.pumpStart || log.verificationPhotos?.pumpEnd) {
      setShowProofSection(true);
    } else {
      setShowProofSection(false);
    }
    
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const validateOdometer = (val: string) => {
    const currentOdo = parseInt(val);
    if (currentOdo && currentOdo < previousOdometer) {
      return false;
    }
    return true;
  };

  const handleTruckKeyDown = (e: React.KeyboardEvent) => {
    if (!showTruckDropdown) return;
    
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setTruckHighlightIndex(prev => (prev < filteredTrucks.length - 1 ? prev + 1 : prev));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setTruckHighlightIndex(prev => (prev > 0 ? prev - 1 : prev));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (truckHighlightIndex >= 0 && truckHighlightIndex < filteredTrucks.length) {
        const t = filteredTrucks[truckHighlightIndex];
        setSelectedTruckId(t.id);
        setTruckSearch(t.plateNumber);
        setShowTruckDropdown(false);
        setTruckHighlightIndex(-1);
      }
    } else if (e.key === 'Escape') {
      setShowTruckDropdown(false);
      setTruckHighlightIndex(-1);
    }
  };

  const handleDriverKeyDown = (e: React.KeyboardEvent) => {
    if (!showDriverDropdown) return;
    
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setDriverHighlightIndex(prev => (prev < filteredDrivers.length - 1 ? prev + 1 : prev));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setDriverHighlightIndex(prev => (prev > 0 ? prev - 1 : prev));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (driverHighlightIndex >= 0 && driverHighlightIndex < filteredDrivers.length) {
        const d = filteredDrivers[driverHighlightIndex];
        setSelectedDriverId(d.id);
        setDriverSearch(d.name);
        setShowDriverDropdown(false);
        setDriverHighlightIndex(-1);
      }
    } else if (e.key === 'Escape') {
      setShowDriverDropdown(false);
      setDriverHighlightIndex(-1);
    }
  };

  const handleUploadPhotos = async () => {
    if (!selectedTruckId) {
      alert("Please select a truck first.");
      return;
    }
    
    setUploadingPhotos(true);
    try {
      const urls: (string | null)[] = [...uploadedUrls];
      
      for (let i = 0; i < photos.length; i++) {
        const currentData = photos[i];
        if (currentData && currentData.startsWith('data:')) {
          const url = await storageService.uploadFile('fuel-proofs', `fuel_slot${i}_${selectedTruckId}_${Date.now()}.jpg`, currentData);
          urls[i] = url;
        }
      }
      
      setUploadedUrls(urls);
      setPhotosUploaded(true);
      alert("Photos uploaded and verified.");
    } catch (err) {
      console.error("Upload failed:", err);
      alert("Photo upload failed. Check connection.");
    } finally {
      setUploadingPhotos(false);
    }
  };

  const handleSaveFueling = async (e: React.FormEvent) => {
    e.preventDefault();
    const currentOdo = parseInt(odometer);

    if (!selectedTruckId || !selectedDriverId || !odometer || !fuelLiters || !dieselPrice) {
      alert("Please fill all details.");
      return;
    }

    const hasCapturedPhotos = photos.some(p => p && p.startsWith('data:'));

    if (hasCapturedPhotos && !photosUploaded) {
      alert("Please upload verification photos first.");
      return;
    }

    if (!validateOdometer(odometer)) {
      alert("Odometer reading is invalid.");
      return;
    }

    setIsSubmitting(true);
    try {
      const logData: FuelLog = {
        id: editingId || crypto.randomUUID(),
        truckId: selectedTruckId,
        driverId: selectedDriverId,
        stationId: selectedStationId || undefined,
        date: fuelingDate,
        attributionDate: attributionDate,
        entryType: entryType,
        odometer: currentOdo,
        previousOdometer: previousOdometer,
        fuelLiters: parseFloat(fuelLiters),
        dieselPrice: parseFloat(dieselPrice),
        agentId: currentUser.username,
        status: 'COMPLETED',
        verificationPhotos: {
          plate: uploadedUrls[0] || null,
          odo: uploadedUrls[1] || null,
          pumpStart: uploadedUrls[2] || null,
          pumpEnd: uploadedUrls[3] || null,
          tank: null
        }
      };

      if (editingId) {
        if (onUpdateLog) await onUpdateLog(logData);
        else await dbService.updateFuelLog(logData);
      } else {
        if (onAddLog) await onAddLog(logData);
        else await dbService.addFuelLog(logData);
      }

      setLastSavedLog(logData);
      setSuccess(true);
      resetForm();
    } catch (err) {
      console.error(err);
      alert("Sync failed. Check connection.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleExportHistory = () => {
    if (typeof XLSX === 'undefined') {
      alert("Excel library not loaded. Please wait or refresh.");
      return;
    }

    const data: any[] = [];
    let totalLiters = 0;
    let totalAmount = 0;

    completedLogs.forEach(l => {
      const truck = trucks.find(t => t.id === l.truckId);
      const driver = drivers.find(d => d.id === l.driverId);
      // Corrected station lookup to handle both IDs and Names
      const station = masterData.fuelStations.find(s => s.id === l.stationId || s.name === l.stationId);
      const distance = l.odometer - (l.previousOdometer || 0);
      const amount = (l.fuelLiters || 0) * (l.dieselPrice || 0);
      const avg = l.fuelLiters > 0 ? (distance / l.fuelLiters).toFixed(3) : '0.00';
      
      totalLiters += l.fuelLiters;
      totalAmount += amount;

      data.push({
        'DATE': l.date.split('-').reverse().join('/'),
        'PLATE NO': truck?.plateNumber || 'N/A',
        'STATION': station?.name || 'N/A',
        'TYPE': l.entryType === 'FULL_TANK' ? 'FULL' : 'TRIP',
        'LITERS': l.fuelLiters,
        'RATE': l.dieselPrice || 0,
        'AMOUNT': amount.toFixed(3),
        'ODO START': l.previousOdometer,
        'ODO END': l.odometer,
        'DISTANCE': distance,
        'AVG (KM/L)': avg,
        'OPERATOR': driver?.name || 'N/A'
      });
    });

    // Add Totals Row
    data.push({
      'DATE': 'TOTALS',
      'PLATE NO': '',
      'STATION': '',
      'TYPE': '',
      'LITERS': totalLiters.toFixed(3),
      'RATE': '',
      'AMOUNT': totalAmount.toFixed(3),
      'ODO START': '',
      'ODO END': '',
      'DISTANCE': '',
      'AVG (KM/L)': '',
      'OPERATOR': ''
    });

    const ws = XLSX.utils.json_to_sheet(data);
    
    // Professional styling: Column widths
    const wscols = [
      { wch: 12 }, { wch: 15 }, { wch: 25 }, { wch: 10 }, { wch: 10 }, 
      { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, 
      { wch: 12 }, { wch: 20 }
    ];
    ws['!cols'] = wscols;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Fuel Audit");
    XLSX.writeFile(wb, `Fuel_Audit_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handleExportPDF = () => {
    const doc = new jsPDF('l', 'mm', 'a4'); // Landscape for more columns
    const totalLiters = completedLogs.reduce((acc, l) => acc + (l.fuelLiters || 0), 0);
    const totalAmount = completedLogs.reduce((acc, l) => acc + ((l.fuelLiters || 0) * (l.dieselPrice || 0)), 0);

    doc.setFontSize(20); doc.setTextColor(15, 23, 42); doc.setFont("helvetica", "bold");
    doc.text("SAPNA CARTING - FUEL REPORT", 14, 15);
    
    doc.setFontSize(9); doc.setTextColor(100); doc.setFont("helvetica", "normal");
    doc.text(`Generated on: ${new Date().toLocaleString()} | Period: ${historyStartDate || 'Start'} to ${historyEndDate || 'End'}`, 14, 22);

    const tableData = completedLogs.map(l => {
      const truck = trucks.find(t => t.id === l.truckId);
      const driver = drivers.find(d => d.id === l.driverId);
      const station = masterData.fuelStations.find(s => s.id === l.stationId || s.name === l.stationId);
      const distance = l.odometer - (l.previousOdometer || 0);
      const amount = (l.fuelLiters || 0) * (l.dieselPrice || 0);
      const avg = l.fuelLiters > 0 ? (distance / l.fuelLiters).toFixed(3) : '0.00';

      return [
        l.date.split('-').reverse().join('/'),
        truck?.plateNumber || '--',
        station?.name || 'Self/Unknown',
        l.entryType === 'FULL_TANK' ? 'FULL' : 'TRIP',
        `${l.fuelLiters.toFixed(3)} L`,
        `${(l.dieselPrice || 0).toFixed(3)}`,
        `${amount.toLocaleString()}`,
        l.previousOdometer.toLocaleString(),
        l.odometer.toLocaleString(),
        `${distance} KM`,
        `${avg} KM/L`,
        driver?.name || '--'
      ];
    });

    autoTable(doc, {
      startY: 30,
      head: [['Date', 'Plate', 'Station', 'Type', 'Liters', 'Rate', 'Amount', 'Odo Start', 'Odo End', 'Dist', 'Avg', 'Operator']],
      body: tableData,
      theme: 'grid',
      styles: { fontSize: 7, cellPadding: 2 },
      headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold' },
      foot: [['TOTALS', '', '', '', `${totalLiters.toFixed(3)} L`, '', `${totalAmount.toLocaleString()}`, '', '', '', '', '']],
      footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold' },
      columnStyles: {
        4: { halign: 'center' }, 5: { halign: 'right' }, 6: { halign: 'right' },
        7: { halign: 'right' }, 8: { halign: 'right' }, 9: { halign: 'center' }, 10: { halign: 'center' }
      }
    });

    doc.save(`Professional_Fuel_Audit_${new Date().getTime()}.pdf`);
  };

  const shareToWhatsApp = (log: FuelLog) => {
    const truck = trucks.find(t => t.id === log.truckId);
    const driver = drivers.find(d => d.id === log.driverId);
    const station = masterData.fuelStations.find(s => s.id === log.stationId);
    const p = log.verificationPhotos;
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const dateStr = now.toLocaleDateString();
    
    const distance = (log.odometer || 0) - (log.previousOdometer || 0);
    const average = (log.fuelLiters || 0) > 0 ? (distance / log.fuelLiters).toFixed(3) : '0.00';

    const msg = `*⛽ FUELING SLIP*
-------------------------
🚚 *Truck:* ${truck?.plateNumber || 'N/A'}
👤 *Driver:* ${driver?.name || 'N/A'}
🏪 *Station:* ${station?.name || 'Self/Unknown'}
📅 *Prod Date:* ${log.attributionDate}
🏗️ *Mode:* ${log.entryType}

📏 *Last ODO:* ${(log.previousOdometer || 0).toLocaleString()} KM
📏 *Current ODO:* ${(log.odometer || 0).toLocaleString()} KM
🔄 *Distance:* ${distance.toLocaleString()} KM

💧 *Fuel:* ${(log.fuelLiters || 0).toFixed(3)} L
💰 *Rate:* ₹${log.dieselPrice || '0.00'}
💵 *Total:* ₹${((log.fuelLiters || 0) * (log.dieselPrice || 0)).toFixed(3)}
📉 *Average:* ${average} KM/L

📸 *VERIFIED PROOFS:*
Plate: ${p?.plate || 'NA'}
Odo: ${p?.odo || 'NA'}
Opening: ${p?.pumpStart || 'NA'}
Closing: ${p?.pumpEnd || 'NA'}
-------------------------
👤 *Logged By:* ${log.agentId}
⏰ *Time:* ${timeStr}
📅 *Logged On:* ${dateStr}
-------------------------
_via SapnaCarting Portal_`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
  };

  return (
    <div className="max-w-6xl mx-auto py-2 sm:py-4 px-1 sm:px-4 animate-fadeIn space-y-4 sm:space-y-10 overflow-hidden select-none">
      {/* SUCCESS OVERLAY */}
      {success && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-sm p-6 sm:p-8 text-center space-y-6 animate-scaleIn relative">
            <button 
              onClick={() => setSuccess(false)} 
              className="absolute top-6 right-6 text-slate-300 hover:text-rose-500 text-3xl font-light transition-colors leading-none"
            >
              &times;
            </button>
            <div className="w-16 h-16 sm:w-20 sm:h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center text-4xl mx-auto">✓</div>
            <div>
              <h2 className="text-xl sm:text-2xl font-black text-slate-900 uppercase tracking-tight">Entry Saved</h2>
              <p className="text-slate-500 text-sm font-bold mt-1">Cloud sync completed successfully.</p>
            </div>
            <div className="grid gap-3 pt-2">
              <button onClick={() => lastSavedLog && shareToWhatsApp(lastSavedLog)} className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-black uppercase text-xs tracking-widest shadow-lg active:scale-95 transition-all">Share to WhatsApp</button>
              <button onClick={() => setSuccess(false)} className="w-full py-4 bg-slate-100 text-slate-500 rounded-2xl font-black uppercase text-xs tracking-widest active:scale-95 transition-all">Dismiss</button>
            </div>
          </div>
        </div>
      )}

      {/* COMPACT ENTRY FORM */}
      <div className="bg-white rounded-[1.5rem] sm:rounded-[2.5rem] shadow-xl overflow-hidden border border-slate-100 no-print">
        <div className="bg-slate-900 p-5 sm:p-8 text-white flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 sticky top-0 sm:static z-20">
          <div className="flex items-center gap-3">
            <span className="text-2xl sm:text-3xl">⛽</span>
            <div>
              <h2 className="text-lg sm:text-2xl font-black uppercase tracking-tight">{editingId ? 'Edit Fueling Record' : 'Fuel Station Entry'}</h2>
              <p className="text-[9px] sm:text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Verification & Compliance Audit</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full sm:w-auto">
            {role === 'ADMIN' && editingId && (
              <button onClick={resetForm} className="bg-rose-500 text-white px-4 sm:px-6 py-2 rounded-xl text-[10px] font-black uppercase shadow-lg">Cancel Edit</button>
            )}
            <div className="flex bg-white/10 p-1 rounded-xl shadow-inner w-full sm:w-auto">
               <button type="button" onClick={() => setEntryType('PER_TRIP')} className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-[10px] font-black uppercase transition-all ${entryType === 'PER_TRIP' ? 'bg-emerald-500 text-white shadow-sm' : 'text-slate-400 hover:text-white'}`}>per trip date</button>
               <button type="button" onClick={() => setEntryType('FULL_TANK')} className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-[10px] font-black uppercase transition-all ${entryType === 'FULL_TANK' ? 'bg-green-500 text-white shadow-sm' : 'text-slate-400 hover:text-white'}`}>full diesel date</button>
            </div>
          </div>
        </div>
        
        { (role === 'ADMIN' || !editingId || fuelLogs.find(l => l.id === editingId)?.agentId === currentUser.username) ? (
          <form onSubmit={handleSaveFueling} className="p-4 sm:p-8 space-y-6 sm:space-y-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-10">
            <div className="space-y-4 sm:space-y-6">
               <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2 flex items-center gap-2"><span>🆔</span> Identity</h3>
               
               <div className="space-y-1 relative" ref={truckDropdownRef}>
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Vehicle Plate</label>
                  <input 
                    type="text"
                    required 
                    placeholder="Search Plate..." 
                    className="w-full p-3 sm:p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-amber-500 font-black font-mono text-base sm:text-2xl transition-all" 
                    value={truckSearch} 
                    onKeyDown={handleTruckKeyDown}
                    onFocus={() => { setShowTruckDropdown(true); setTruckHighlightIndex(-1); }} 
                    onChange={e => { setTruckSearch(e.target.value); setShowTruckDropdown(true); setTruckHighlightIndex(-1); }} 
                  />
                   {showTruckDropdown && (
                    <div className="absolute z-[100] top-full left-0 right-0 mt-2 bg-white border border-slate-200 rounded-2xl shadow-2xl max-h-60 overflow-y-auto scrollbar-hide">
                      {filteredTrucks.map((t, index) => (
                        <button 
                          key={t.id} 
                          type="button" 
                          ref={(el) => { if (index === truckHighlightIndex && el) el.scrollIntoView({ block: 'nearest' }); }}
                          className={`w-full px-4 sm:px-6 py-3 sm:py-4 text-left border-b border-slate-50 last:border-0 transition-colors ${index === truckHighlightIndex ? 'bg-slate-300 rounded-xl' : 'hover:bg-slate-50'}`} 
                          onClick={() => { setSelectedTruckId(t.id); setTruckSearch(t.plateNumber); setShowTruckDropdown(false); setTruckHighlightIndex(-1); }}
                        >
                          <div className="flex justify-between items-center">
                            <span className="font-black font-mono text-base sm:text-lg">{t.plateNumber}</span>
                            <div className="text-right">
                              <span className="text-[9px] font-black text-slate-400 uppercase bg-slate-100 px-2 py-1 rounded-md mr-1 sm:mr-2">{t.fleetType}</span>
                              <span className="text-[9px] font-black text-amber-600 uppercase bg-amber-50 px-2 py-1 rounded-md">{t.wheelConfig} WHEEL</span>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
               </div>

               <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1 relative" ref={driverDropdownRef}>
                      <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Operator</label>
                      <input 
                        type="text" 
                        required 
                        placeholder="Search Operator..." 
                        className="w-full p-3 sm:p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-amber-500 font-bold text-sm sm:text-lg transition-all" 
                        value={driverSearch} 
                        onKeyDown={handleDriverKeyDown}
                        onFocus={() => { setShowDriverDropdown(true); setDriverHighlightIndex(-1); }} 
                        onChange={e => { setDriverSearch(e.target.value); setShowDriverDropdown(true); setDriverHighlightIndex(-1); }} 
                      />
                      {showDriverDropdown && (
                        <div className="absolute z-[100] top-full left-0 right-0 mt-2 bg-white border border-slate-200 rounded-2xl shadow-2xl max-h-60 overflow-y-auto scrollbar-hide">
                          {filteredDrivers.map((d, index) => (
                            <button 
                              key={d.id} 
                              type="button" 
                              ref={(el) => { if (index === driverHighlightIndex && el) el.scrollIntoView({ block: 'nearest' }); }}
                              className={`w-full px-4 sm:px-6 py-3 sm:py-4 text-left border-b border-slate-50 last:border-0 transition-colors ${index === driverHighlightIndex ? 'bg-slate-300 rounded-xl' : 'hover:bg-slate-50'}`} 
                              onClick={() => { setSelectedDriverId(d.id); setDriverSearch(d.name); setShowDriverDropdown(false); setDriverHighlightIndex(-1); }}
                            >
                              <div className="flex justify-between items-center">
                                <span className="font-bold text-sm sm:text-base text-slate-800">{d.name}</span>
                                <span className="text-[9px] font-black text-slate-400 uppercase bg-slate-100 px-2 py-1 rounded-md">{d.type}</span>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                  </div>
                  <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Fueling Station</label>
                      <select required className="w-full p-3 sm:p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none focus:ring-2 focus:ring-amber-500 text-sm sm:text-lg transition-all h-[52px] sm:h-[66px]" value={selectedStationId} onChange={e => setSelectedStationId(e.target.value)}>
                        <option value="">Choose Station...</option>
                        {masterData.fuelStations.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                  </div>
               </div>

               <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Liters</label>
                    <input type="number" step="0.01" required placeholder="0.00" className="w-full p-3 sm:p-4 bg-slate-50 border border-slate-200 rounded-2xl font-black text-lg sm:text-2xl text-emerald-600 outline-none transition-all" value={fuelLiters} onChange={e => setFuelLiters(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Rate (₹)</label>
                    <input type="number" step="0.01" required placeholder="₹" className="w-full p-3 sm:p-4 bg-slate-50 border border-slate-200 rounded-2xl font-black text-lg sm:text-2xl outline-none transition-all" value={dieselPrice} onChange={e => setDieselPrice(e.target.value)} />
                  </div>
               </div>
            </div>

              <div className="space-y-4 sm:space-y-6">
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2 flex items-center gap-2"><span>📏</span> Production & ODO</h3>
                <div className="relative">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-1 block mb-1">Production Date</label>
                  <input type="date" className="w-full p-3 sm:p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none text-sm sm:text-lg transition-all" value={fuelingDate} onChange={e => setFuelingDate(e.target.value)} />
                </div>
              
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
                 <div className="flex-1 space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Current Odometer</label>
                    <input 
                      type="number" 
                      required 
                      placeholder="Reading" 
                      className={`w-full p-3 sm:p-4 bg-slate-50 border rounded-2xl font-mono font-black text-xl sm:text-2xl outline-none transition-all ${
                        odometer && !validateOdometer(odometer) ? 'border-rose-500 ring-2 ring-rose-200' : 'border-slate-200 focus:ring-2 focus:ring-amber-500'
                      }`} 
                      value={odometer} 
                      onChange={e => setOdometer(e.target.value)} 
                    />
                    {odometer && !validateOdometer(odometer) && (
                      <p className="text-[10px] font-black text-rose-600 uppercase mt-1 ml-1 bg-rose-50 px-2 py-1 rounded inline-block">⚠️ Odometer reading less than yesterday</p>
                    )}
                    <div className="mt-2 text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-50 p-2 rounded-lg border border-slate-100 flex justify-between items-center">
                      <span>Attribution Date:</span>
                      <span className="text-amber-600">{attributionDate}</span>
                    </div>
                 </div>
                 <div className="flex-1 bg-amber-50 p-4 rounded-2xl border border-amber-100 min-h-[88px] flex flex-col justify-center text-center sm:text-left">
                    <span className="text-[9px] font-black text-amber-600 uppercase tracking-tight">System ODO (Last)</span>
                    <span className="font-black font-mono text-xl">{(previousOdometer || 0).toLocaleString()} <span className="text-[10px]">KM</span></span>
                 </div>
              </div>

              <div className="p-5 sm:p-6 bg-slate-900 rounded-3xl text-white text-center shadow-xl border-b-4 border-black">
                 <p className="text-[10px] font-black text-amber-500 uppercase tracking-widest mb-1">Total Billing</p>
                 <p className="text-3xl sm:text-4xl font-black text-white">₹ {(parseFloat(fuelLiters || '0') * parseFloat(dieselPrice || '0')).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
              </div>
            </div>
          </div>

          <div className="space-y-4 pt-4">
             <div className="flex justify-between items-center px-1">
                <div className="flex items-center gap-3">
                  <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><span>📸</span> Proof Verification</h3>
                  <button 
                    type="button" 
                    onClick={() => setShowProofSection(!showProofSection)}
                    className={`px-3 py-1.5 rounded-full text-[9px] font-black uppercase transition-all ${showProofSection ? 'bg-slate-100 text-slate-500' : 'bg-amber-100 text-amber-700 hover:bg-amber-200'}`}
                  >
                    {showProofSection ? 'Hide Photos' : '+ Add Photos (Optional)'}
                  </button>
                </div>
                {showProofSection && photos.some(p => p && p.startsWith('data:')) && !photosUploaded && (
                  <button 
                    type="button"
                    disabled={uploadingPhotos}
                    onClick={handleUploadPhotos}
                    className="bg-amber-500 text-white px-4 py-2 rounded-xl text-[9px] font-black uppercase shadow-lg active:scale-95 transition-all flex items-center gap-2"
                  >
                    {uploadingPhotos ? (
                      <>
                        <span className="w-2 h-2 bg-white rounded-full animate-ping"></span>
                        Uploading...
                      </>
                    ) : (
                      <><span>☁️</span> Upload Proofs</>
                    )}
                  </button>
                )}
                {showProofSection && photosUploaded && (
                  <span className="text-[9px] font-black text-emerald-600 uppercase bg-emerald-50 px-3 py-1.5 rounded-full flex items-center gap-1">
                    <span>✓</span> Confirmed
                  </span>
                )}
             </div>
             
             {showProofSection && (
               <div className="animate-fadeIn">
                 <p className="text-[8px] font-bold text-slate-400 uppercase ml-1 mb-3">Take 1-4 verification photos at once</p>
                 <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                    {[0, 1, 2, 3].map(index => (
                      <div key={index} className={`relative aspect-[4/3] sm:aspect-square border-2 border-dashed rounded-[1.25rem] sm:rounded-[1.5rem] bg-slate-50 flex flex-col items-center justify-center overflow-hidden group transition-all shadow-sm ${
                        photos[index] ? 'border-emerald-200 bg-emerald-50/10' : 'border-slate-200 hover:border-amber-400'
                      }`}>
                        {photos[index] ? (
                          <div className="absolute inset-0">
                            <img src={photos[index]!} className="w-full h-full object-cover" alt={`Proof ${index + 1}`} />
                            <div className="absolute inset-0 bg-black/60 flex items-center justify-center gap-3 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                               <button 
                                 type="button" 
                                 onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDiscardPhoto(index); }}
                                 className="relative z-10 text-[9px] sm:text-[10px] font-black text-white uppercase bg-rose-600 px-4 py-2 rounded-full hover:bg-rose-700 shadow-lg active:scale-95 transition-transform"
                               >
                                 Discard
                               </button>
                               <label className="relative z-10 text-[9px] sm:text-[10px] font-black text-white uppercase bg-slate-700 px-4 py-2 rounded-full hover:bg-slate-600 shadow-lg cursor-pointer active:scale-95 transition-transform">
                                 Retake
                                 <input 
                                   type="file" 
                                   className="hidden" 
                                   accept="image/*" 
                                   capture="environment" 
                                   onChange={e => {
                                     handlePhotoUpload(index, e);
                                     setPhotosUploaded(false); 
                                   }} 
                                 />
                               </label>
                            </div>
                          </div>
                        ) : (
                          <label className="absolute inset-0 flex flex-col items-center justify-center cursor-pointer w-full h-full">
                            <span className="text-2xl sm:text-3xl mb-1 opacity-40">📷</span>
                            <span className="text-[9px] font-black text-slate-400 uppercase px-2 text-center">Slot {index + 1}</span>
                            <input 
                              type="file" 
                              className="hidden" 
                              accept="image/*" 
                              capture="environment" 
                              onChange={e => {
                                handlePhotoUpload(index, e);
                                setPhotosUploaded(false); 
                              }} 
                            />
                          </label>
                        )}
                      </div>
                    ))}
                 </div>
               </div>
             )}
          </div>

          <button 
            type="submit" 
            disabled={isSubmitting || (photos.some(p => p && p.startsWith('data:')) && !photosUploaded)} 
            className={`w-full py-5 sm:py-6 rounded-[1.5rem] sm:rounded-[2.5rem] font-black text-lg sm:text-xl shadow-2xl transition-all uppercase tracking-[0.2em] border-b-8 ${
              isSubmitting || (photos.some(p => p && p.startsWith('data:')) && !photosUploaded)
                ? 'bg-slate-300 border-slate-400 text-slate-500 cursor-not-allowed' 
                : 'bg-slate-900 border-black hover:bg-black text-white active:scale-95'
            }`}
          >
            {isSubmitting ? 'Syncing with Cloud...' : (photos.some(p => p && p.startsWith('data:')) && !photosUploaded) ? 'Upload Proofs First' : editingId ? 'Commit Changes' : 'Finalize Fuel Entry'}
          </button>
        </form>
        ) : (
          <div className="p-10 text-center space-y-4">
            <p className="text-slate-500 font-bold uppercase text-[10px] tracking-widest">Editing is restricted for agents</p>
            <button onClick={resetForm} className="bg-slate-900 text-white px-8 py-3 rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl active:scale-95 transition-all">Back to New Entry</button>
          </div>
        )}
      </div>

      {/* HISTORY TABLE */}
      <div className="bg-white rounded-[1.5rem] sm:rounded-[2.5rem] shadow-xl border border-slate-100 overflow-hidden">
        <div className="p-4 sm:p-8 border-b border-slate-50 space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <h3 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">Recent Fueling History</h3>
            <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full sm:w-auto">
                <button onClick={handleExportHistory} className="flex-1 sm:flex-none bg-emerald-600 text-white px-6 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl active:scale-95 transition-all">Export</button>
                <button onClick={handleExportPDF} className="flex-1 sm:flex-none bg-rose-600 text-white px-6 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl active:scale-95 transition-all">PDF Report</button>
            </div>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
             <div className="bg-slate-50 px-4 py-3 rounded-2xl border border-slate-100 flex items-center">
                <span className="text-[10px] text-slate-400 font-black mr-2">FLEET</span>
                <select 
                    value={fleetFilter} 
                    onChange={(e) => { setFleetFilter(e.target.value as any); setVisibleCount(30); }}
                    className="flex-1 bg-transparent font-bold text-[10px] outline-none uppercase text-slate-900 cursor-pointer"
                >
                    <option value="ALL">All Fleets</option>
                    <option value="COAL">Coal Fleet</option>
                    <option value="MINING">Mining Fleet</option>
                </select>
             </div>

             <div className="bg-slate-50 px-4 py-3 rounded-2xl border border-slate-100 flex items-center">
                <span className="text-[10px] text-slate-400 font-black mr-2">STATION</span>
                <select 
                    value={historyStationFilter} 
                    onChange={(e) => { setHistoryStationFilter(e.target.value); setVisibleCount(30); }}
                    className="flex-1 bg-transparent font-bold text-[10px] outline-none uppercase text-slate-900 cursor-pointer"
                >
                    <option value="ALL">All Stations</option>
                    {masterData.fuelStations.map(s => (
                       <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                </select>
             </div>

             <div className="flex items-center gap-2 bg-slate-50 px-4 py-3 rounded-2xl border border-slate-100">
                <input type="date" className="bg-transparent font-bold text-xs outline-none w-full" value={historyStartDate} onChange={e => { setHistoryStartDate(e.target.value); setVisibleCount(30); }} />
                <span className="text-slate-300 font-black text-[10px]">TO</span>
                <input type="date" className="bg-transparent font-bold text-xs outline-none w-full" value={historyEndDate} onChange={e => { setHistoryEndDate(e.target.value); setVisibleCount(30); }} />
             </div>

              <div className="relative">
                <input type="text" placeholder="Search plate..." className="w-full pl-10 pr-4 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-bold outline-none focus:ring-2 focus:ring-amber-500 transition-all" value={historySearch} onChange={e => { setHistorySearch(e.target.value); setVisibleCount(30); }} />
                <span className="absolute left-4 top-1/2 -translate-y-1/2 opacity-30 text-xs">🔍</span>
              </div>

              {role === 'ADMIN' && (
                <div className="bg-slate-50 px-4 py-3 rounded-2xl border border-slate-100 flex items-center">
                  <span className="text-[10px] text-slate-400 font-black mr-2">AGENT</span>
                  <select 
                      value={adminAgentFilter} 
                      onChange={(e) => { setAdminAgentFilter(e.target.value); setVisibleCount(30); }}
                      className="flex-1 bg-transparent font-bold text-[10px] outline-none uppercase text-slate-900 cursor-pointer"
                  >
                      <option value="ALL">All Agents</option>
                      {Array.from(new Set([
                        ...users.map(u => u.username),
                        ...fuelLogs.map(l => l.agentId).filter(Boolean)
                      ])).sort().map(agent => (
                        <option key={agent} value={agent}>{agent}</option>
                      ))}
                  </select>
                </div>
              )}
          </div>
        </div>

        <div className="overflow-x-auto scrollbar-hide hidden sm:block">
          <table className="w-full text-left text-[11px]">
            <thead className="bg-slate-50 text-slate-400 font-black uppercase tracking-widest">
              <tr>
                <th className="px-4 sm:px-8 py-5">Date</th>
                <th className="px-4 sm:px-8 py-5">Plate</th>
                <th className="px-4 sm:px-8 py-5 hidden md:table-cell">Station</th>
                <th className="px-4 sm:px-8 py-5 text-center">Fuel</th>
                <th className="px-4 sm:px-8 py-5 text-center hidden sm:table-cell">Odo</th>
                <th className="px-4 sm:px-8 py-5 text-center">Status</th>
                <th className="px-4 sm:px-8 py-5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {completedLogs.slice(0, visibleCount).map((item) => {
                const truck = trucks.find(t => t.id === item.truckId);
                const station = masterData.fuelStations.find(s => s.id === item.stationId || s.name === item.stationId);
                return (
                  <tr key={item.id} className="hover:bg-slate-50 transition-colors group cursor-pointer" onClick={() => setViewingLog(item)}>
                    <td className="px-4 sm:px-8 py-4 font-bold text-slate-500 whitespace-nowrap">{item.date.split('-').reverse().join('/')}</td>
                    <td className="px-4 sm:px-8 py-4 font-black font-mono text-slate-900">
                      {(() => {
                        const plate = truck?.plateNumber || '--';
                        if (plate.length < 4) return plate;
                        const prefix = plate.slice(0, -4);
                        const suffix = plate.slice(-4);
                        return (
                          <div className="flex items-baseline gap-0.5">
                            <span className="text-xs opacity-50">{prefix}</span>
                            <span className="text-xl">{suffix}</span>
                          </div>
                        );
                      })()}
                    </td>
                    <td className="px-4 sm:px-8 py-4 hidden md:table-cell">
                      {station ? (
                        (role === 'ADMIN') ? (
                          <button 
                            onClick={(e) => { 
                              e.stopPropagation(); 
                              onNavigate?.('station-ledger', { stationId: station.id });
                            }}
                            className="font-black text-rose-500 uppercase text-[10px] hover:bg-rose-50 px-2 py-1 rounded transition-colors border border-rose-200"
                          >
                            {station.name}
                          </button>
                        ) : (
                          <span className="font-black text-rose-500 uppercase text-[10px] bg-rose-50/50 px-2 py-1 rounded border border-rose-100 italic">
                            {station.name}
                          </span>
                        )
                      ) : (
                        <span className="font-bold text-slate-400 uppercase text-[9px]">--</span>
                      )}
                    </td>
                    <td className="px-4 sm:px-8 py-4 text-center whitespace-nowrap">
                       <p className="text-emerald-600 font-black">{(item.fuelLiters || 0).toFixed(3)} L</p>
                       <p className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">{item.entryType === 'FULL_TANK' ? 'full diesel' : 'per trip'}</p>
                    </td>
                    <td className="px-4 sm:px-8 py-4 text-center font-mono text-slate-900 hidden sm:table-cell leading-tight">
                       <p className="text-[10px] font-bold opacity-30">{(item.previousOdometer || 0).toLocaleString()}</p>
                       <div className="flex items-center justify-center gap-1">
                          <span className="text-[8px] opacity-20">→</span>
                          <span className="font-black text-sm">{(item.odometer || 0).toLocaleString()}</span>
                       </div>
                    </td>
                    <td className="px-4 sm:px-8 py-4 text-center">
                       {(() => {
                          const isCoal = truck?.fleetType === 'COAL';
                          const hasBatch = isCoal 
                             ? coalLogs.some(c => c.truckId === item.truckId && c.date === item.attributionDate)
                             : miningLogs.some(m => m.truckId === item.truckId && m.date === item.attributionDate);
                          return (
                            <span className={`px-2 py-1 rounded-lg text-[8px] font-black uppercase border shrink-0 ${hasBatch ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-amber-50 text-amber-600 border-amber-100'}`}>
                               {hasBatch ? 'Mapped' : 'Unmapped'}
                            </span>
                          );
                       })()}
                    </td>
                    <td className="px-4 sm:px-8 py-4 text-right">
                       <div className="flex flex-col sm:flex-row justify-end gap-2 sm:gap-4">
                          <button onClick={(e) => { e.stopPropagation(); handleEdit(item); }} className="text-amber-600 font-black text-[9px] uppercase tracking-widest hover:underline">Edit</button>
                          <button onClick={(e) => { e.stopPropagation(); shareToWhatsApp(item); }} className="text-emerald-500 font-black text-[9px] uppercase tracking-widest hover:underline">Share</button>
                       </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* MOBILE CARD VIEW */}
        <div className="sm:hidden divide-y divide-slate-100">
           {completedLogs.slice(0, visibleCount).map((item) => {
             const truck = trucks.find(t => t.id === item.truckId);
             const station = masterData.fuelStations.find(s => s.id === item.stationId || s.name === item.stationId);
             const distance = item.odometer - (item.previousOdometer || 0);
             const amount = (item.fuelLiters || 0) * (item.dieselPrice || 0);
             
             return (
               <div key={item.id} className="p-4 space-y-4 bg-gray-100 rounded-xl mb-2" onClick={() => setViewingLog(item)}>
                  <div className="flex justify-between items-start">
                     <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{item.date.split('-').reverse().join('/')}</p>
                        <h4 className="text-xl font-black font-mono text-slate-900 mt-1">
                           {(() => {
                              const plate = truck?.plateNumber || '--';
                              if (plate.length < 4) return plate;
                              const prefix = plate.slice(0, -4);
                              const suffix = plate.slice(-4);
                              return <>{prefix}<span className="text-2xl">{suffix}</span></>;
                           })()}
                        </h4>
                     </div>
                     <div className="text-right">
                        <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">₹ {amount.toLocaleString()}</p>
                        <p className="text-lg font-black text-emerald-600">{(item.fuelLiters || 0).toFixed(3)} L</p>
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-tighter leading-none mt-0.5">{item.entryType === 'FULL_TANK' ? 'full diesel' : 'per trip'}</p>
                     </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                     <div className="space-y-1">
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-tight">Odometer Range</p>
                        <p className="text-xs font-bold text-slate-700 font-mono">{(item.previousOdometer || 0).toLocaleString()} → {item.odometer.toLocaleString()}</p>
                     </div>
                     <div className="space-y-1">
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-tight">KM Ran</p>
                        <p className="text-xs font-black text-slate-900">{distance} KM</p>
                     </div>
                     <div className="space-y-1 col-span-2">
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-tight">Station</p>
                        <p className="text-xs font-bold text-rose-500 uppercase truncate">{station?.name || 'Self/Unknown'}</p>
                     </div>
                  </div>

                  <div className="flex gap-2">
                     <button onClick={(e) => { e.stopPropagation(); handleEdit(item); }} className="flex-1 py-3 bg-amber-50 text-amber-600 rounded-xl font-black uppercase text-[10px] tracking-widest border border-amber-100">Edit</button>
                     <button onClick={(e) => { e.stopPropagation(); shareToWhatsApp(item); }} className="flex-1 py-3 bg-emerald-50 text-emerald-600 rounded-xl font-black uppercase text-[10px] tracking-widest border border-emerald-100">Share</button>
                  </div>
               </div>
             );
           })}
           {completedLogs.length === 0 && (
             <div className="p-10 text-center text-slate-400 font-black uppercase tracking-widest opacity-40 text-[10px]">Zero Entries Found</div>
           )}
        </div>

        {/* LOAD MORE BUTTON */}
        {completedLogs.length > visibleCount && (
          <div className="p-8 text-center border-t border-slate-50 bg-slate-50/30">
             <button 
                onClick={() => setVisibleCount(prev => prev + 30)}
                className="px-10 py-4 bg-white border border-slate-200 text-slate-600 rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-sm hover:bg-slate-900 hover:text-white hover:border-black transition-all active:scale-95"
             >
                Load More Entries ({completedLogs.length - visibleCount} remaining)
             </button>
          </div>
        )}
      </div>

      {/* DETAIL MODAL */}
      {viewingLog && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-md z-[1100] flex items-center justify-center p-2 sm:p-4">
           <div className="bg-white rounded-[2rem] sm:rounded-[3rem] shadow-2xl w-full max-w-2xl overflow-hidden animate-scaleIn h-full sm:h-auto flex flex-col max-h-[95vh] relative">
              <div className="bg-slate-900 p-6 sm:p-8 text-white flex justify-between items-center shrink-0 sticky top-0 z-10 border-b border-white/10">
                 <h2 className="text-lg sm:text-xl font-black uppercase tracking-tight">Audit Slip Detail</h2>
                 <button 
                  onClick={() => setViewingLog(null)} 
                  className="text-white text-4xl font-light hover:text-rose-500 transition-colors leading-none px-2 py-1"
                >
                  &times;
                </button>
              </div>
              <div className="p-6 sm:p-8 space-y-6 sm:space-y-8 overflow-y-auto scrollbar-hide flex-1">
                 <div className="grid grid-cols-2 gap-x-4 sm:gap-x-12 gap-y-6 sm:gap-y-8 pb-6 sm:pb-8 border-b border-slate-100">
                    <div className="space-y-1">
                       <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Vehicle ID</p>
                       <p className="text-lg sm:text-xl font-black font-mono text-slate-900">{trucks.find(t => t.id === viewingLog.truckId)?.plateNumber}</p>
                    </div>
                    <div className="space-y-1">
                       <p className="text-[9px] font-black text-emerald-500 uppercase tracking-widest">Liters Issued</p>
                       <p className="text-xl sm:text-2xl font-black text-emerald-600">{(viewingLog.fuelLiters || 0).toFixed(3)} L</p>
                    </div>
                    <div className="space-y-1 text-center bg-slate-50 p-4 rounded-2xl border border-slate-100 col-span-2 sm:col-span-1 flex flex-col justify-center">
                       <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Mapping Status</p>
                       {(() => {
                          const truck = trucks.find(t => t.id === viewingLog.truckId);
                          const isCoal = truck?.fleetType === 'COAL';
                          const matchingLogs = isCoal 
                             ? coalLogs.filter(c => c.truckId === viewingLog.truckId && c.date === viewingLog.attributionDate)
                             : miningLogs.filter(m => m.truckId === viewingLog.truckId && m.date === viewingLog.attributionDate);
                          const hasMapping = matchingLogs.length > 0;
                          const totalWeight = matchingLogs.reduce((sum, l) => {
                             if (isCoal) return sum + ((l as CoalLog).netWeight || 0);
                             return sum + (((l as MiningLog).gross || 0) - ((l as MiningLog).tare || 0));
                          }, 0);
                          
                          return hasMapping ? (
                            <div className="space-y-2">
                               <p className="text-[10px] font-black text-emerald-600 uppercase">✓ MAPPED TO OPERATION</p>
                               <div className="bg-emerald-50/50 p-2 rounded-lg border border-emerald-100/50">
                                  <p className="text-[9px] font-black text-emerald-700 uppercase">{matchingLogs.length} Trips Recorded</p>
                                  <p className="text-[11px] font-black text-emerald-900">{totalWeight.toFixed(3)} MT Total</p>
                               </div>
                               {role === 'ADMIN' && (
                                 <button 
                                    onClick={() => onNavigate?.(isCoal ? 'coal-transport' : 'mining-ops', { truckId: viewingLog.truckId, date: viewingLog.attributionDate })}
                                    className="px-4 py-2 bg-emerald-600 text-white text-[9px] font-black rounded-lg uppercase shadow-lg shadow-emerald-200"
                                 >
                                    View Batch
                                 </button>
                               )}
                            </div>
                          ) : (
                            <div className="space-y-2">
                               <p className="text-[10px] font-black text-amber-600 uppercase">⚠️ TRIPS NOT RECORDED</p>
                               {role === 'ADMIN' && (
                                 <button 
                                    onClick={() => onNavigate?.(isCoal ? 'coal-entry' : 'mining-entry', { truckId: viewingLog.truckId, date: viewingLog.attributionDate })}
                                    className="px-4 py-2 bg-amber-500 text-white text-[9px] font-black rounded-lg uppercase shadow-lg shadow-amber-200"
                                 >
                                    + Add Batch
                                 </button>
                               )}
                            </div>
                          );
                       })()}
                    </div>
                    <div className="space-y-1 flex flex-col justify-center">
                       <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Attribution Date</p>
                       <p className="text-lg font-black text-slate-900 italic underline decoration-amber-500 decoration-2">{viewingLog.attributionDate}</p>
                    </div>
                 </div>

                 <div className="grid grid-cols-2 gap-4 sm:gap-12">
                    <div className="space-y-1">
                       <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Entry Date</p>
                       <p className="text-sm font-bold text-slate-600">{viewingLog.date}</p>
                    </div>
                    <div className="space-y-1">
                       <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Odometer</p>
                       <p className="text-sm font-bold text-slate-900 font-mono tracking-tighter">{(viewingLog.odometer || 0).toLocaleString()} KM</p>
                    </div>
                    <div className="space-y-1 col-span-2">
                       <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Station / Issuer</p>
                       <p className="text-sm font-bold text-slate-900 uppercase">{masterData.fuelStations.find(s => s.id === viewingLog.stationId)?.name || '--'}</p>
                    </div>
                 </div>

                 <div className="pt-4 space-y-4">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Digital Proof Verification</p>
                    <div className="grid grid-cols-2 gap-3 sm:gap-4">
                        {viewingLog.verificationPhotos && Object.entries(viewingLog.verificationPhotos).map(([key, url]) => {
                          if (!url || key === 'tank') return null;
                          return (
                            <div key={key} className="space-y-1">
                               <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest text-center">{key}</p>
                               <div className="h-32 sm:h-44 border-2 border-slate-100 rounded-2xl sm:rounded-3xl overflow-hidden bg-slate-50 shadow-sm transition-transform hover:scale-[1.02]">
                                  <img src={url} className="w-full h-full object-cover" alt={key} />
                               </div>
                            </div>
                          );
                        })}
                    </div>
                 </div>
              </div>
              <div className="p-5 sm:p-8 bg-slate-50 border-t border-slate-100 shrink-0">
                 <div className="flex gap-3">
                    <button onClick={() => { shareToWhatsApp(viewingLog); setViewingLog(null); }} className="flex-[2] py-4 sm:py-5 bg-emerald-600 text-white rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl active:scale-95 transition-all">Share Slip</button>
                    <button onClick={() => setViewingLog(null)} className="flex-1 py-4 sm:py-5 bg-slate-200 text-slate-500 rounded-2xl font-black uppercase text-xs tracking-widest active:scale-95 transition-all">Dismiss</button>
                 </div>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default FuelAgentView;