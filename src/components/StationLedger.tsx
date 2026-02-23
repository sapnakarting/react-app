import React, { useState, useMemo } from 'react';
import { FuelStation, FuelLog, StationPayment, Truck, MiscFuelEntry } from '../types';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx-js-style';

interface Props {
  station: FuelStation;
  allStations: FuelStation[];
  fuelLogs: FuelLog[];
  payments: StationPayment[];
  trucks: Truck[];
  miscFuelEntries: MiscFuelEntry[];
  onAddMiscFuelEntry: (entry: MiscFuelEntry) => Promise<void>;
  onDeleteMiscFuelEntry: (id: string) => Promise<void>;
  onAddPayment: (payment: StationPayment) => Promise<void>;
  onDeletePayment: (id: string) => Promise<void>;
  onBack: () => void;
  onNavigateToStation: (stationId: string) => void;
}

const StationLedger: React.FC<Props> = ({ 
  station, allStations, fuelLogs, payments, trucks, miscFuelEntries, onAddMiscFuelEntry, onDeleteMiscFuelEntry, onAddPayment, onDeletePayment, onBack, onNavigateToStation 
}) => {
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showMiscModal, setShowMiscModal] = useState(false);
  const [newMiscEntry, setNewMiscEntry] = useState<Partial<MiscFuelEntry>>({
    date: new Date().toISOString().split('T')[0],
    usageType: 'OTHER',
    fuelLiters: 0,
    dieselPrice: 0,
  });

  const [newPayment, setNewPayment] = useState<Partial<StationPayment>>({
    date: new Date().toISOString().split('T')[0],
    amount: 0,
    paymentMethod: 'Online Transfer',
    remarks: ''
  });

  // Filter States
  const [searchTerm, setSearchTerm] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [filterType, setFilterType] = useState<'ALL' | 'PURCHASE' | 'PAYMENT' | 'STOCK_IN'>('ALL');

  // Combine fuel logs, miscs, and payments into one chronological ledger
  const ledger = useMemo(() => {
    // 1. Core Fleet Purchases (Outward consumption)
    const stationLogs = fuelLogs
      .filter(l => l.stationId === station.id || l.stationId === station.name)
      .map(l => ({
        id: l.id,
        date: l.date,
        type: 'PURCHASE' as const,
        description: trucks.find(t => t.id === l.truckId)?.plateNumber || 'Unknown Truck',
        quantity: l.fuelLiters,
        rate: l.dieselPrice || 0,
        amount: (l.fuelLiters || 0) * (l.dieselPrice || 0),
        raw: l
      }));

    // 2. Misc Purchases recorded AGAINST this station (Debt owed to this station)
    const miscOut = miscFuelEntries
      .filter(m => m.stationId === station.id)
      .map(m => ({
        id: m.id,
        date: m.date,
        type: 'PURCHASE' as const,
        description: m.usageType === 'BULK_TRANSFER' ? `Bulk Transfer to ${allStations.find(s=>s.id === m.destinationStationId)?.name || 'Tanker'}` : m.vehicleDescription,
        quantity: m.fuelLiters,
        rate: m.dieselPrice,
        amount: m.amount,
        raw: m,
        isMisc: true
      }));

    // 3. Bulk Received INWARDS (If this is an internal Tanker)
    const miscIn = station.isInternal ? miscFuelEntries
      .filter(m => m.destinationStationId === station.id)
      .map(m => ({
        id: m.id + '_recv',
        date: m.date,
        type: 'STOCK_IN' as const,
        description: `Source: ${allStations.find(s=>s.id === m.stationId)?.name || 'Unknown'} | Inv: ${m.invoiceNo || 'N/A'}`,
        quantity: m.fuelLiters,
        rate: m.dieselPrice,
        amount: m.amount,
        raw: m,
        isMisc: true
      })) : [];

    // 4. Financial Payments (Cradit against this station)
    const stationPayments = payments
      .filter(p => p.stationId === station.id || p.stationId === station.name)
      .map(p => ({
        id: p.id,
        date: p.date,
        type: 'PAYMENT' as const,
        description: `${p.paymentMethod} ${p.referenceNo ? `(${p.referenceNo})` : ''}`,
        quantity: 0,
        rate: 0,
        amount: p.amount,
        raw: p
      }));

    return [...stationLogs, ...miscOut, ...miscIn, ...stationPayments].sort((a, b) => 
      new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  }, [fuelLogs, payments, station.id, station.name, station.isInternal, trucks, miscFuelEntries, allStations]);

  // Apply Filters
  const filteredLedger = useMemo(() => {
    return ledger.filter(item => {
      const matchesSearch = item.description.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesType = filterType === 'ALL' || item.type === filterType;
      const matchesStart = !startDate || new Date(item.date) >= new Date(startDate);
      const matchesEnd = !endDate || new Date(item.date) <= new Date(endDate);
      return matchesSearch && matchesType && matchesStart && matchesEnd;
    });
  }, [ledger, searchTerm, filterType, startDate, endDate]);

  const summary = useMemo(() => {
    if (station.isInternal) {
      const totalStockIn = filteredLedger
        .filter(item => item.type === 'STOCK_IN')
        .reduce((sum, item) => sum + (item.quantity || 0), 0);
        
      const totalDispensed = filteredLedger
        .filter(item => item.type === 'PURCHASE')
        .reduce((sum, item) => sum + (item.quantity || 0), 0);
        
      return {
        isInternal: true,
        totalStockIn,
        totalDispensed,
        balance: totalStockIn - totalDispensed,
        totalLiters: 0,
        totalPurchased: 0,
        totalPaid: 0
      };
    } else {
      const totalPurchased = filteredLedger
        .filter(item => item.type === 'PURCHASE')
        .reduce((sum, item) => sum + item.amount, 0);
      
      const totalPaid = filteredLedger
        .filter(item => item.type === 'PAYMENT')
        .reduce((sum, item) => sum + item.amount, 0);

      const totalLiters = filteredLedger
        .filter(item => item.type === 'PURCHASE')
        .reduce((sum, item) => sum + (item.quantity || 0), 0);

      return {
        isInternal: false,
        totalPurchased,
        totalPaid,
        totalLiters,
        balance: totalPurchased - totalPaid,
        totalStockIn: 0,
        totalDispensed: 0
      };
    }
  }, [filteredLedger, station.isInternal]);

  const exportToExcel = () => {
    const wb = XLSX.utils.book_new();
    const headerStyle = {
      font: { bold: true, color: { rgb: "FFFFFF" } },
      fill: { fgColor: { rgb: "0F172A" } },
      alignment: { horizontal: "center", vertical: "center" }
    };
    const companyName = "SAPNA CARTING - PETROL PUMP AUDIT";
    const reportTitle = `${station.name} ${station.isInternal ? 'INVENTORY' : 'LEDGER'} REPORT`;
    const address = station.location || "Branch Site";
    const dateRangeStr = startDate && endDate ? `${startDate} to ${endDate}` : "Full History";

    if (station.isInternal) {
      // ── Internal Tanker: Inventory view ──
      const data: any[][] = [
        [companyName],
        [reportTitle],
        [`Location: ${address}`],
        [`Report Period: ${dateRangeStr}`],
        [],
        ["DATE", "DESCRIPTION", "TYPE", "LITERS", "RATE (₹)", "AMOUNT (₹)"]
      ];
      filteredLedger.forEach(item => {
        data.push([
          item.date,
          item.description,
          item.type,
          item.quantity,
          item.rate || '--',
          item.amount
        ]);
      });
      data.push([]);
      data.push(["STOCK IN", "", "", summary.totalStockIn, "", ""]);
      data.push(["DISPENSED", "", "", summary.totalDispensed, "", ""]);
      data.push(["NET INVENTORY", "", "", summary.balance, "", ""]);

      const ws = XLSX.utils.aoa_to_sheet(data);
      // Styling
      const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
      for (let R = range.s.r; R <= range.e.r; ++R) {
        for (let C = range.s.c; C <= range.e.c; ++C) {
          const addr = XLSX.utils.encode_cell({ r: R, c: C });
          if (!ws[addr]) continue;
          ws[addr].s = { font: { sz: 10 } };
          if (R < 4) ws[addr].s = { font: { bold: true, sz: 12 } };
          if (R === 5) ws[addr].s = headerStyle;
        }
      }
      ws['!cols'] = [{ wch: 15 }, { wch: 35 }, { wch: 15 }, { wch: 12 }, { wch: 10 }, { wch: 14 }];
      XLSX.utils.book_append_sheet(wb, ws, "Inventory");
    } else {
      // ── External Pump: Financial view ──
      const data: any[][] = [
        [companyName],
        [reportTitle],
        [`Location: ${address}`],
        [`Report Period: ${dateRangeStr}`],
        [],
        ["DATE", "DESCRIPTION", "LITERS", "RATE (₹)", "DEBIT (₹)", "CREDIT (₹)"]
      ];
      filteredLedger.forEach(item => {
        data.push([
          item.date,
          item.description,
          item.type === 'PURCHASE' ? item.quantity : "--",
          item.type === 'PURCHASE' ? item.rate : "--",
          item.type === 'PURCHASE' ? item.amount : 0,
          item.type === 'PAYMENT' ? item.amount : 0
        ]);
      });
      data.push([]);
      data.push(["", "TOTALS", summary.totalLiters, "", summary.totalPurchased, summary.totalPaid]);
      data.push(["", "OUTSTANDING BALANCE", "", "", "", summary.totalPurchased - summary.totalPaid]);

      const ws = XLSX.utils.aoa_to_sheet(data);
      const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
      for (let R = range.s.r; R <= range.e.r; ++R) {
        for (let C = range.s.c; C <= range.e.c; ++C) {
          const addr = XLSX.utils.encode_cell({ r: R, c: C });
          if (!ws[addr]) continue;
          ws[addr].s = { font: { sz: 10 } };
          if (R < 4) ws[addr].s = { font: { bold: true, sz: 12 } };
          if (R === 5) ws[addr].s = headerStyle;
        }
      }
      ws['!cols'] = [{ wch: 15 }, { wch: 30 }, { wch: 10 }, { wch: 10 }, { wch: 15 }, { wch: 15 }];
      XLSX.utils.book_append_sheet(wb, ws, "Ledger");
    }

    XLSX.writeFile(wb, `${station.name.replace(/\s+/g, '_')}_${station.isInternal ? 'Inventory' : 'Ledger'}.xlsx`);
  };

  const exportToPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(22); doc.setTextColor(15, 23, 42); doc.setFont("helvetica", "bold");
    doc.text("SAPNA CARTING", 14, 20);
    doc.setFontSize(10); doc.setTextColor(100);
    doc.text(station.isInternal ? "Internal Tanker Inventory Report" : "Professional Petroleum Audit & Logistics Management", 14, 26);
    doc.setFontSize(14); doc.setTextColor(15, 23, 42);
    doc.text(`${station.name} ${station.isInternal ? 'Inventory' : 'Ledger'} Report`, 14, 40);
    doc.setFontSize(9); doc.setTextColor(80);
    doc.text(`Location: ${station.location || 'N/A'}`, 14, 46);
    doc.text(`Report Generated: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`, 14, 51);

    if (station.isInternal) {
      // ── Internal Tanker: Inventory summary box ──
      doc.setFillColor(239, 246, 255); doc.roundedRect(140, 35, 55, 30, 3, 3, 'F');
      doc.setFontSize(8); doc.setTextColor(100); doc.text("Current Stock", 145, 42);
      doc.setFontSize(14); doc.setTextColor(29, 78, 216);
      doc.text(`${summary.balance.toLocaleString()} L`, 145, 50);
      doc.setFontSize(7); doc.setTextColor(100);
      doc.text(`IN: ${summary.totalStockIn?.toLocaleString()} L  OUT: ${summary.totalDispensed?.toLocaleString()} L`, 145, 57);

      const tableData = filteredLedger.map(item => [
        item.date,
        item.description,
        item.type === 'STOCK_IN' ? 'Stock IN' : 'Dispensed',
        `${item.quantity} L`,
        item.rate ? `₹${item.rate}` : '--',
        item.amount ? `₹${item.amount.toLocaleString()}` : '--'
      ]);

      autoTable(doc, {
        startY: 70,
        head: [['Date', 'Description', 'Type', 'Liters', 'Rate', 'Amount']],
        body: tableData,
        theme: 'striped',
        headStyles: { fillColor: [29, 78, 216], fontSize: 9, halign: 'center' },
        bodyStyles: { fontSize: 8 },
        foot: [[
          'SUMMARY', '',
          'Stock IN / Out / Net',
          `${summary.totalStockIn?.toLocaleString()} / ${summary.totalDispensed?.toLocaleString()} / ${summary.balance.toLocaleString()} L`,
          '', ''
        ]],
        footStyles: { fillColor: [239, 246, 255], textColor: [15, 23, 42], fontSize: 9, fontStyle: 'bold' }
      });
    } else {
      // ── External Pump: Financial summary box ──
      doc.setFillColor(248, 250, 252); doc.roundedRect(140, 35, 55, 30, 3, 3, 'F');
      doc.setFontSize(8); doc.setTextColor(100); doc.text("Outstanding Balance", 145, 42);
      doc.setFontSize(14); doc.setTextColor(225, 29, 72); doc.text(`INR ${summary.balance.toLocaleString()}`, 145, 50);

      const tableData = filteredLedger.map(item => [
        item.date,
        item.description,
        item.type === 'PURCHASE' ? `${item.quantity} L` : '--',
        item.type === 'PURCHASE' ? `INR ${item.rate}` : '--',
        item.type === 'PURCHASE' ? `INR ${item.amount.toLocaleString()}` : '--',
        item.type === 'PAYMENT' ? `INR ${item.amount.toLocaleString()}` : '--'
      ]);

      autoTable(doc, {
        startY: 70,
        head: [['Date', 'Entry Detail', 'Liters', 'Rate', 'Debit (Purchase)', 'Credit (Paid)']],
        body: tableData,
        theme: 'striped',
        headStyles: { fillColor: [15, 23, 42], fontSize: 9, halign: 'center' },
        bodyStyles: { fontSize: 8 },
        columnStyles: { 4: { halign: 'right' }, 5: { halign: 'right' } },
        foot: [[
          'TOTALS', '',
          `${summary.totalLiters.toFixed(3)} L`, '',
          `INR ${summary.totalPurchased.toLocaleString()}`,
          `INR ${summary.totalPaid.toLocaleString()}`
        ]],
        footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontSize: 9, fontStyle: 'bold' }
      });
    }

    const finalY = (doc as any).lastAutoTable.finalY || 100;
    doc.setFontSize(8); doc.setTextColor(150);
    doc.text("* This is a computer generated audit record.", 14, finalY + 15);
    doc.save(`${station.name.replace(/\s+/g, '_')}_Report.pdf`);
  };

  const handleSaveMisc = async () => {
    if (!newMiscEntry.fuelLiters || !newMiscEntry.dieselPrice) return;
    
    await onAddMiscFuelEntry({
      id: crypto.randomUUID(),
      stationId: station.id,
      date: newMiscEntry.date!,
      vehicleDescription: newMiscEntry.vehicleDescription || newMiscEntry.usageType!,
      usageType: newMiscEntry.usageType as any,
      fuelLiters: Number(newMiscEntry.fuelLiters),
      dieselPrice: Number(newMiscEntry.dieselPrice),
      amount: Number(newMiscEntry.fuelLiters) * Number(newMiscEntry.dieselPrice),
      invoiceNo: newMiscEntry.invoiceNo,
      receiverName: newMiscEntry.receiverName,
      remarks: newMiscEntry.remarks,
      destinationStationId: newMiscEntry.usageType === 'BULK_TRANSFER' ? newMiscEntry.destinationStationId : undefined
    });
    
    setShowMiscModal(false);
    setNewMiscEntry({
      date: new Date().toISOString().split('T')[0],
      usageType: 'OTHER',
      fuelLiters: 0,
      dieselPrice: 0,
      invoiceNo: '',
      receiverName: '',
      remarks: '',
      vehicleDescription: ''
    });
  };

  const handleSavePayment = async () => {
    if (!newPayment.amount || newPayment.amount <= 0) return;
    
    await onAddPayment({
      id: crypto.randomUUID(),
      stationId: station.id,
      date: newPayment.date!,
      amount: Number(newPayment.amount),
      paymentMethod: newPayment.paymentMethod as any,
      referenceNo: newPayment.referenceNo,
      remarks: newPayment.remarks
    });
    
    setShowPaymentModal(false);
    setNewPayment({
      date: new Date().toISOString().split('T')[0],
      amount: 0,
      paymentMethod: 'Online Transfer',
      remarks: ''
    });
  };

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          {/* Back link + Station switcher */}
          <div className="flex items-center gap-3 mb-2 flex-wrap">
            <button
              onClick={onBack}
              className="text-slate-400 hover:text-slate-900 font-black text-[10px] uppercase tracking-widest flex items-center gap-1 transition-colors"
            >
              ← All Stations
            </button>
            <span className="text-slate-200 text-xs">|</span>
            {/* Station quick-switch dropdown */}
            <div className="relative flex items-center gap-1">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Switch:</span>
              <select
                className="text-[10px] font-black text-slate-600 bg-slate-100 border-0 rounded-lg px-2 py-1 uppercase tracking-widest outline-none cursor-pointer hover:bg-amber-50 hover:text-amber-700 transition-all max-w-[160px]"
                value={station.id}
                onChange={e => {
                  if (e.target.value !== station.id) onNavigateToStation(e.target.value);
                }}
              >
                {allStations.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.isInternal ? '🛢 ' : '⛽ '}{s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <h1 className="text-2xl sm:text-4xl font-black text-slate-900 uppercase tracking-tight flex items-center gap-3">
            <span className="text-3xl sm:text-4xl">{station.isInternal ? '🛢️' : '🏛️'}</span>
            {station.name} <span className="text-slate-300">LEDGER</span>
          </h1>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <button 
            onClick={() => setShowMiscModal(true)}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-4 rounded-[1.5rem] font-black uppercase text-xs tracking-widest shadow-xl active:scale-95 transition-all flex-1 sm:flex-initial"
          >
            + Record Fuel Entry
          </button>
          {!station.isInternal && (
            <button 
              onClick={() => setShowPaymentModal(true)}
              className="bg-slate-900 text-white px-6 py-4 rounded-[1.5rem] font-black uppercase text-xs tracking-widest shadow-xl active:scale-95 transition-all flex-1 sm:flex-initial"
            >
              + Record Payment
            </button>
          )}
        </div>
      </div>

      {/* DASHBOARD CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {station.isInternal ? (
          <>
            <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Stock IN</p>
              <p className="text-2xl font-black text-slate-900">{summary.totalStockIn?.toLocaleString()} L</p>
              <p className="text-[10px] font-bold text-emerald-500 mt-1">From Bulk Transfers</p>
            </div>
            <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Dispensed</p>
              <p className="text-2xl font-black text-amber-600">{summary.totalDispensed?.toLocaleString()} L</p>
              <p className="text-[10px] font-bold text-amber-500 mt-1">To Fleet Vehicles</p>
            </div>
            <div className={`p-6 rounded-[2rem] border shadow-sm ${summary.balance > 0 ? 'bg-blue-50 border-blue-100' : 'bg-slate-50 border-slate-100'}`}>
              <p className="text-[10px] font-black opacity-50 uppercase tracking-widest mb-1 text-blue-900">Current Inventory</p>
              <p className={`text-2xl font-black text-blue-700`}>
                {summary.balance.toLocaleString()} L
              </p>
              <p className="text-[10px] font-black opacity-40 mt-1 uppercase tracking-widest text-blue-900">
                Physical Stock Remaining
              </p>
            </div>
          </>
        ) : (
          <>
            <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Purchased</p>
              <p className="text-2xl font-black text-slate-900">₹{summary.totalPurchased.toLocaleString()}</p>
              <p className="text-[10px] font-bold text-emerald-500 mt-1">{summary.totalLiters.toFixed(3)} Liters Total</p>
            </div>
            <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Paid</p>
              <p className="text-2xl font-black text-emerald-600">₹{summary.totalPaid.toLocaleString()}</p>
            </div>
            <div className={`p-6 rounded-[2rem] border shadow-sm ${summary.balance > 0 ? 'bg-rose-50 border-rose-100' : 'bg-emerald-50 border-emerald-100'}`}>
              <p className="text-[10px] font-black opacity-50 uppercase tracking-widest mb-1">Outstanding Balance</p>
              <p className={`text-2xl font-black ${summary.balance > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                ₹{summary.balance.toLocaleString()}
              </p>
              <p className="text-[10px] font-black opacity-40 mt-1 uppercase tracking-widest">
                {summary.balance > 0 ? 'Dues Outstanding' : 'All Settled'}
              </p>
            </div>
          </>
        )}
        <div className="bg-slate-900 p-6 rounded-[2rem] text-white">
           <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{station.isInternal ? 'Tanker Location' : 'Station Location'}</p>
           <p className="text-lg font-bold">{station.location || 'Main Premise'}</p>
           <p className="text-[9px] font-black text-amber-500 uppercase tracking-widest mt-1">
             {station.isInternal ? 'Internal Inventory' : 'External Vendor'}
           </p>
        </div>
      </div>

      {/* LEDGER TABLE */}
      <div className="bg-white rounded-[2rem] shadow-xl border border-slate-100 overflow-hidden">
        <div className="p-6 sm:p-8 border-b border-slate-50 space-y-6">
           <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
              <h3 className="font-black text-slate-900 uppercase tracking-widest text-xs">Full Audit Trail</h3>
              
              <div className="flex flex-wrap gap-2 w-full lg:w-auto">
                 <div className="relative flex-1 lg:w-64">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔍</span>
                    <input 
                      type="text" 
                      placeholder="Search Vehicle / Method..." 
                      className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-xl font-bold text-xs" 
                      value={searchTerm}
                      onChange={e => setSearchTerm(e.target.value)}
                    />
                 </div>
                 
                 <div className="flex gap-2 flex-1 lg:flex-initial">
                    <input 
                      type="date" 
                      className="p-3 bg-slate-50 border border-slate-100 rounded-xl font-bold text-xs" 
                      value={startDate}
                      onChange={e => setStartDate(e.target.value)}
                    />
                    <input 
                      type="date" 
                      className="p-3 bg-slate-50 border border-slate-100 rounded-xl font-bold text-xs" 
                      value={endDate}
                      onChange={e => setEndDate(e.target.value)}
                    />
                 </div>

                 <select 
                    className="p-3 bg-slate-50 border border-slate-100 rounded-xl font-bold text-xs uppercase"
                    value={filterType}
                    onChange={e => setFilterType(e.target.value as any)}
                 >
                    <option value="ALL">ALL TYPES</option>
                    <option value="PURCHASE">PURCHASES</option>
                    {station.isInternal
                      ? <option value="STOCK_IN">STOCK RECEIVED</option>
                      : <option value="PAYMENT">PAYMENTS</option>
                    }
                 </select>

                 <div className="flex gap-2 w-full sm:w-auto mt-2 sm:mt-0">
                    <button onClick={exportToExcel} className="flex-1 sm:flex-initial px-6 py-3 bg-emerald-50 text-emerald-600 border border-emerald-100 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-emerald-100 transition-all">Excel</button>
                    <button onClick={exportToPDF} className="flex-1 sm:flex-initial px-6 py-3 bg-rose-50 text-rose-600 border border-rose-100 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-rose-100 transition-all">Report PDF</button>
                 </div>
              </div>
           </div>
           
           <div className="flex gap-4">
              <span className="flex items-center gap-1 text-[9px] font-black text-slate-400 uppercase"><span className="w-2 h-2 rounded-full bg-emerald-500"></span> Purchase</span>
              <span className="flex items-center gap-1 text-[9px] font-black text-slate-400 uppercase"><span className="w-2 h-2 rounded-full bg-slate-900"></span> Payment</span>
           </div>
        </div>
        <div className="overflow-x-auto scrollbar-hide">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-400 font-black uppercase tracking-widest">
              <tr>
                <th className="px-8 py-5">Date</th>
                <th className="px-8 py-5">Vehicle / Method</th>
                <th className="px-8 py-5 text-center">Liters / Rate</th>
                <th className="px-8 py-5 text-right">Debit (₹)</th>
                <th className="px-8 py-5 text-right">Credit (₹)</th>
                <th className="px-8 py-5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
               {filteredLedger.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-8 py-4 font-bold text-slate-500">{item.date}</td>
                  <td className="px-8 py-4">
                    <span className={`font-black uppercase tracking-tighter text-sm ${item.type === 'PURCHASE' ? 'text-slate-900' : 'text-emerald-600'}`}>
                      {item.description}
                    </span>
                    {item.type === 'PAYMENT' && (
                      <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">Manual Settlement</p>
                    )}
                  </td>
                  <td className="px-8 py-4 text-center">
                    {item.type === 'PURCHASE' || item.type === 'STOCK_IN' ? (
                      <div>
                        <span className="font-black text-slate-900">{item.quantity} L</span>
                        <p className="text-[9px] text-slate-400 font-bold">@ ₹{item.rate}</p>
                      </div>
                    ) : '--'}
                  </td>
                  <td className="px-8 py-4 text-right font-black text-slate-900">
                    {item.type === 'PURCHASE' || item.type === 'STOCK_IN' ? `₹${item.amount.toLocaleString()}` : '--'}
                  </td>
                  <td className="px-8 py-4 text-right font-black text-emerald-600">
                    {item.type === 'PAYMENT' ? `₹${item.amount.toLocaleString()}` : '--'}
                  </td>
                  <td className="px-8 py-4 text-right">
                    {item.type === 'PAYMENT' ? (
                      <button 
                        onClick={() => onDeletePayment(item.id)}
                        className="text-rose-500 hover:text-rose-700 font-black uppercase text-[10px] tracking-widest"
                      >
                        Delete
                      </button>
                    ) : (item as any).isMisc ? (
                      <button 
                        onClick={() => onDeleteMiscFuelEntry(item.id.replace('_recv', ''))}
                        className="text-amber-500 hover:text-amber-700 font-black uppercase text-[10px] tracking-widest"
                      >
                        Delete
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
              {ledger.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-8 py-12 text-center text-slate-400 font-bold uppercase tracking-widest text-xs">
                    No transactions found for this station.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* PAYMENT MODAL */}
      {showPaymentModal && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-md z-[2000] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-lg overflow-hidden animate-scaleIn">
            <div className="bg-slate-900 p-8 text-white flex justify-between items-center">
               <div>
                 <h2 className="text-xl font-black uppercase tracking-tight">Record Payment</h2>
                 <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Manual Credit Entry</p>
               </div>
               <button onClick={() => setShowPaymentModal(false)} className="text-slate-400 hover:text-white text-2xl font-black">×</button>
            </div>
            
            <div className="p-8 space-y-6">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Payment Date</label>
                <input 
                  type="date" 
                  className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none ring-slate-900 focus:ring-2 transition-all"
                  value={newPayment.date}
                  onChange={e => setNewPayment(prev => ({ ...prev, date: e.target.value }))}
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Amount (₹)</label>
                <input 
                  type="number" 
                  placeholder="0.00"
                  className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-black text-2xl text-emerald-600 outline-none ring-slate-900 focus:ring-2 transition-all"
                  value={newPayment.amount || ''}
                  onChange={e => setNewPayment(prev => ({ ...prev, amount: Number(e.target.value) }))}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Method</label>
                  <select 
                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none ring-slate-900 focus:ring-2 transition-all h-[58px]"
                    value={newPayment.paymentMethod}
                    onChange={e => setNewPayment(prev => ({ ...prev, paymentMethod: e.target.value as any }))}
                  >
                    <option value="Online Transfer">Online Transfer</option>
                    <option value="Cheque">Cheque</option>
                    <option value="Cash">Cash</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Reference No.</label>
                  <input 
                    type="text" 
                    placeholder="Chq / Txn ID"
                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none ring-slate-900 focus:ring-2 transition-all"
                    value={newPayment.referenceNo || ''}
                    onChange={e => setNewPayment(prev => ({ ...prev, referenceNo: e.target.value }))}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Remarks</label>
                <textarea 
                  placeholder="Notes..."
                  className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none ring-slate-900 focus:ring-2 transition-all resize-none"
                  rows={2}
                  value={newPayment.remarks || ''}
                  onChange={e => setNewPayment(prev => ({ ...prev, remarks: e.target.value }))}
                />
              </div>

              <button 
                onClick={handleSavePayment}
                className="w-full py-5 bg-slate-900 text-white rounded-[1.5rem] font-black uppercase text-xs tracking-widest shadow-2xl active:scale-95 transition-all mt-4"
              >
                Confirm Settlement
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MISC FUEL ENTRY MODAL */}
      {showMiscModal && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-md z-[2000] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-lg overflow-hidden animate-scaleIn max-h-[90vh] flex flex-col">
            <div className="bg-emerald-700 p-8 text-white flex justify-between items-center flex-shrink-0">
              <div>
                <h2 className="text-xl font-black uppercase tracking-tight">Record Fuel Entry</h2>
                <p className="text-[10px] text-emerald-200 font-bold uppercase tracking-widest mt-1">
                  {station.isInternal ? 'Fuel Dispensed from Tanker' : 'Misc / Bulk Purchase'}
                </p>
              </div>
              <button onClick={() => setShowMiscModal(false)} className="text-emerald-200 hover:text-white text-2xl font-black">×</button>
            </div>

            <div className="p-8 space-y-5 overflow-y-auto">
              {/* Date */}
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Date</label>
                <input
                  type="date"
                  className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none ring-emerald-500 focus:ring-2 transition-all"
                  value={newMiscEntry.date || ''}
                  onChange={e => setNewMiscEntry(prev => ({ ...prev, date: e.target.value }))}
                />
              </div>

              {/* Usage Type — only show for external stations */}
              {!station.isInternal && (
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Entry Type</label>
                  <select
                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none ring-emerald-500 focus:ring-2 transition-all h-[58px]"
                    value={newMiscEntry.usageType || 'OTHER'}
                    onChange={e => setNewMiscEntry(prev => ({ ...prev, usageType: e.target.value as any }))}
                  >
                    <option value="PERSONAL">Personal Vehicle</option>
                    <option value="OFFICE">Office / Site Bike</option>
                    <option value="BULK_TRANSFER">Bulk Transfer to Internal Tanker</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>
              )}

              {/* Vehicle Description */}
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">
                  {newMiscEntry.usageType === 'BULK_TRANSFER' ? 'Vehicle / Reference' : 'Vehicle Description'}
                </label>
                <input
                  type="text"
                  placeholder={newMiscEntry.usageType === 'BULK_TRANSFER' ? 'e.g. Tanker Load #1' : 'e.g. GJ01 Office Bike'}
                  className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none ring-emerald-500 focus:ring-2 transition-all"
                  value={newMiscEntry.vehicleDescription || ''}
                  onChange={e => setNewMiscEntry(prev => ({ ...prev, vehicleDescription: e.target.value }))}
                />
              </div>

              {/* Liters + Rate */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Fuel Liters</label>
                  <input
                    type="number"
                    placeholder="0.000"
                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-black text-lg outline-none ring-emerald-500 focus:ring-2 transition-all"
                    value={newMiscEntry.fuelLiters || ''}
                    onChange={e => setNewMiscEntry(prev => ({ ...prev, fuelLiters: Number(e.target.value) }))}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Rate (₹/L)</label>
                  <input
                    type="number"
                    placeholder="0.00"
                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-black text-lg outline-none ring-emerald-500 focus:ring-2 transition-all"
                    value={newMiscEntry.dieselPrice || ''}
                    onChange={e => setNewMiscEntry(prev => ({ ...prev, dieselPrice: Number(e.target.value) }))}
                  />
                </div>
              </div>

              {/* Calculated Amount */}
              {(newMiscEntry.fuelLiters || 0) > 0 && (newMiscEntry.dieselPrice || 0) > 0 && (
                <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 flex justify-between items-center">
                  <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Total Amount</span>
                  <span className="text-xl font-black text-emerald-700">
                    ₹{((newMiscEntry.fuelLiters || 0) * (newMiscEntry.dieselPrice || 0)).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  </span>
                </div>
              )}

              {/* Invoice No + Receiver Name */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Invoice No.</label>
                  <input
                    type="text"
                    placeholder="Optional"
                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none ring-emerald-500 focus:ring-2 transition-all"
                    value={newMiscEntry.invoiceNo || ''}
                    onChange={e => setNewMiscEntry(prev => ({ ...prev, invoiceNo: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Receiver Name</label>
                  <input
                    type="text"
                    placeholder="Optional"
                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none ring-emerald-500 focus:ring-2 transition-all"
                    value={newMiscEntry.receiverName || ''}
                    onChange={e => setNewMiscEntry(prev => ({ ...prev, receiverName: e.target.value }))}
                  />
                </div>
              </div>

              {/* Destination Tanker — only for BULK_TRANSFER */}
              {newMiscEntry.usageType === 'BULK_TRANSFER' && (
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Destination Tanker</label>
                  <select
                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none ring-emerald-500 focus:ring-2 transition-all h-[58px]"
                    value={newMiscEntry.destinationStationId || ''}
                    onChange={e => setNewMiscEntry(prev => ({ ...prev, destinationStationId: e.target.value || undefined }))}
                  >
                    <option value="">-- Select Internal Tanker --</option>
                    {allStations.filter(s => s.isInternal && s.id !== station.id).map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Remarks */}
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Remarks</label>
                <textarea
                  placeholder="Optional notes..."
                  className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none ring-emerald-500 focus:ring-2 transition-all resize-none"
                  rows={2}
                  value={newMiscEntry.remarks || ''}
                  onChange={e => setNewMiscEntry(prev => ({ ...prev, remarks: e.target.value }))}
                />
              </div>

              <button
                onClick={handleSaveMisc}
                disabled={!newMiscEntry.fuelLiters || !newMiscEntry.dieselPrice}
                className="w-full py-5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-[1.5rem] font-black uppercase text-xs tracking-widest shadow-2xl active:scale-95 transition-all mt-2"
              >
                Save Fuel Entry
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StationLedger;
