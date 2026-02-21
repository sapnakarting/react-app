import React, { useState, useMemo } from 'react';
import { CoalLog, Truck, Driver, FuelLog } from '../types';

import * as XLSX from 'xlsx-js-style';

interface CoalTransportProps {
  logs: CoalLog[];
  trucks: Truck[];
  drivers: Driver[];
  fuelLogs: FuelLog[]; 
  onEdit?: (log: CoalLog) => void;
  onUpdateLogs?: (logs: CoalLog[]) => void;
  onDelete?: (id: string) => void;
  onAddLogs?: (logs: CoalLog[]) => void;
  onUpdateFuel?: (truckId: string, prodDate: string, liters: number) => void;
  onAddTrigger?: () => void;
  navParams?: { truckId?: string; date?: string } | null;
  onClearNav?: () => void;
  currentUser: any;
  role: string | null;
}

const CoalTransport: React.FC<CoalTransportProps> = ({ 
  logs, trucks, drivers, fuelLogs, onDelete, onEdit, onUpdateLogs, onAddLogs, onUpdateFuel, onAddTrigger, navParams, onClearNav, currentUser, role 
}) => {
  const [truckFilter, setTruckFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [showReportCenter, setShowReportCenter] = useState(false);
  const [selectedGroupKey, setSelectedGroupKey] = useState<string | null>(null);
  const [bulkAddCount, setBulkAddCount] = useState('');
  const [visibleGroupCount, setVisibleGroupCount] = useState(30);
  
  const formatDate = (dateStr: string) => {
    if (!dateStr || !dateStr.includes('-')) return dateStr;
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  };

  const [editingLogId, setEditingLogId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [editBuffer, setEditBuffer] = useState<Partial<CoalLog>>({});
  const [isEditingAdjustment, setIsEditingAdjustment] = useState(false);
  const [adjEditValue, setAdjEditValue] = useState('');
  const [isEditingDieselAdj, setIsEditingDieselAdj] = useState(false);
  const [dieselAdjValue, setDieselAdjValue] = useState('');
  const [dieselAdjType, setDieselAdjType] = useState<'STOCK' | 'OTHER'>('OTHER');
  const [remarksBuffer, setRemarksBuffer] = useState('');
  const [includeExtriInRoll, setIncludeExtriInRoll] = useState(false);

  const [batchEditKey, setBatchEditKey] = useState<string | null>(null);
  const [batchEditBuffer, setBatchEditBuffer] = useState({ date: '', from: '', to: '', driverId: '' });

  const [showReportSettings, setShowReportSettings] = useState(false);
  const [reportOptions, setReportOptions] = useState({
    tripDetails: true,
    remarks: true,
    tonnage: true,
    diesel: true,
    financials: true,
    unmapped: true
  });
  const [columnOptions, setColumnOptions] = useState({
    date: true,
    truck: true,
    driver: true,
    passNo: true,
    material: true,
    grossWt: true,
    tareWt: true,
    netWt: true,
    diesel: true,
    rate: true,
    amount: true,
    remarks: true
  });

  React.useEffect(() => {
    if (selectedGroup) {
      const { entries, tripAdjustment, rollAmount } = selectedGroup;
      const { roll: calcRoll } = calculateBatchFinancials(entries, tripAdjustment);
      setIncludeExtriInRoll(rollAmount > 0 && rollAmount === calcRoll);
    }
  }, [selectedGroupKey]);

  React.useEffect(() => {
    if (navParams) {
      if (navParams.truckId) setTruckFilter(navParams.truckId);
      if (navParams.date) {
        setStartDate(navParams.date);
        setEndDate(navParams.date);
      }
      onClearNav?.();
    }
  }, [navParams, onClearNav]);

  const clearFilters = () => {
    setStartDate('');
    setEndDate('');
    setTruckFilter('');
    setSearchQuery('');
  };

  const calculateBatchFinancials = (numTrips: number, tripAdj: number) => {
    const welfare = numTrips > 0 ? 300 : 0;
    const effectiveAdj = includeExtriInRoll ? tripAdj : 0;
    const totalEffective = numTrips + effectiveAdj;
    const roll = Math.max(0, totalEffective - 4) * 100;
    return { welfare, roll };
  };

  // 1. Full Aggregation
  const fullAggregatedData = useMemo(() => {
    const groups: Record<string, any> = {};
    const getPrevDayStr = (dateStr: string) => {
      if (!dateStr || isNaN(Date.parse(dateStr))) return null;
      const d = new Date(dateStr);
      d.setDate(d.getDate() - 1);
      return d.toISOString().split('T')[0];
    };

    logs.forEach(log => {
      if (!log.date) return;
      const truck = trucks.find(t => t.id === log.truckId);
      const key = `${log.date}_${log.truckId}`;
      if (!groups[key]) {
        const relevantFuelLogs = fuelLogs.filter(f => f.truckId === log.truckId && f.attributionDate === log.date);
        const totalPumped = relevantFuelLogs.reduce((acc, f) => acc + f.fuelLiters, 0);
        const fillingTypes = [...new Set(relevantFuelLogs.map(f => f.entryType === 'FULL_TANK' ? 'full diesel' : 'per trip'))];
        
        const driverIdToUse = log.driverId || relevantFuelLogs[0]?.driverId || null;
        const syncedDriver = driverIdToUse ? drivers.find(d => d.id === driverIdToUse) : null;
        const syncedRate = log.dieselRate || relevantFuelLogs[0]?.dieselPrice || 90.55;

        groups[key] = {
          key, 
          date: log.date, 
          actualFuelDate: relevantFuelLogs[0]?.date || null,
          truckId: log.truckId, 
          plateNumber: truck?.plateNumber || 'Unknown', 
          wheelConfig: truck?.wheelConfig || 'N/A',
          entries: 0, 
          netWeight: 0,
          grossWeightTotal: 0,
          from: log.from || 'N/A',
          to: log.to || 'N/A',
          diesel: totalPumped,
          dieselAdjustment: log.dieselAdjustment || 0,
          airAdjustment: log.airAdjustment || 0,
          dieselAdjType: log.dieselAdjType || 'OTHER',
          tripAdjustment: log.adjustment || 0,
          tripRemarks: log.tripRemarks || '',
          dieselRemarks: log.dieselRemarks || '',
          airRemarks: log.airRemarks || '',
          syncedDriver: syncedDriver?.name || null,
          syncedDriverId: driverIdToUse,
          syncedRate: syncedRate,
          fillingTypes: fillingTypes.join(' / '),
          advanceFromYesterday: 0,
          logs: [],
          agentId: log.agentId
        };
      }
      groups[key].entries += 1;
      groups[key].netWeight += (log.netWeight || 0);
      groups[key].grossWeightTotal += (log.grossWeight || 0);
      groups[key].logs.push(log);
      
      if (log.tripRemarks) groups[key].tripRemarks = log.tripRemarks;
      if (log.dieselRemarks) groups[key].dieselRemarks = log.dieselRemarks;
      if (log.airRemarks) groups[key].airRemarks = log.airRemarks;
      if (log.adjustment) groups[key].tripAdjustment = log.adjustment;
      if (log.dieselAdjustment) groups[key].dieselAdjustment = log.dieselAdjustment;
      if (log.airAdjustment) groups[key].airAdjustment = log.airAdjustment;
      if (log.from && log.from !== 'N/A') groups[key].from = log.from;
      if (log.to && log.to !== 'N/A') groups[key].to = log.to;
    });

    const sortedGroups = Object.values(groups).sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());

    sortedGroups.forEach((g: any) => {
      const prevDate = getPrevDayStr(g.date);
      const prevKey = `${prevDate}_${g.truckId}`;
      const prevGroup = groups[prevKey];
      
      if (prevGroup && prevGroup.dieselAdjustment > 0) {
        g.advanceFromYesterday = Math.abs(prevGroup.dieselAdjustment);
      }
      
      const { welfare, roll } = calculateBatchFinancials(g.entries, g.tripAdjustment);
      g.staffWelfare = welfare;
      g.rollAmount = roll;
      g.totalPayable = g.staffWelfare + g.rollAmount;
      
      g.netTrips = g.entries + g.tripAdjustment;
      g.netDiesel = g.diesel + g.advanceFromYesterday - g.dieselAdjustment - g.airAdjustment;
    });

    return sortedGroups;
  }, [logs, trucks, fuelLogs, drivers, includeExtriInRoll]);

  // 2. Filtered Aggregation
  const aggregatedData = useMemo(() => {
    let data = fullAggregatedData;

    if (role !== 'ADMIN') {
       data = data.filter((g: any) => g.logs.some((l: any) => l.agentId === currentUser.username));
    }

    return data.filter((g: any) => {
      const matchesTruck = truckFilter ? g.truckId === truckFilter : true;
      const matchesSearch = searchQuery ? g.plateNumber.toLowerCase().includes(searchQuery.toLowerCase()) : true;
      const logDate = new Date(g.date);
      const start = startDate ? new Date(startDate) : null;
      const end = endDate ? new Date(endDate) : null;
      if (start) start.setHours(0, 0, 0, 0);
      if (end) end.setHours(23, 59, 59, 999);
      const matchesDate = (!start || logDate >= start) && (!end || logDate <= end);
      return matchesTruck && matchesSearch && matchesDate;
    }).sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [fullAggregatedData, truckFilter, searchQuery, startDate, endDate, role, currentUser]);

  const globalTotals = useMemo(() => {
    return aggregatedData.reduce((acc: any, g: any) => {
      const netTrips = g.netTrips; 
      const netAmount = g.diesel * g.syncedRate;
      return {
        tonnage: acc.tonnage + (g.netWeight || 0),
        diesel: acc.diesel + g.diesel,
        trips: acc.trips + netTrips,
        amount: acc.amount + netAmount
      };
    }, { tonnage: 0, diesel: 0, trips: 0, amount: 0 });
  }, [aggregatedData]);

  const selectedGroup = aggregatedData.find((g: any) => g.key === selectedGroupKey);

  const formatDateHeader = (dateStr: string) => {
     if (!dateStr) return '';
     const d = new Date(dateStr);
     return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  };

  const calculateMTD = () => {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    
    // UPDATED LOGIC: Use selected End Date as the anchor
    let anchorDateStr = todayStr;
    if (endDate && !isNaN(Date.parse(endDate))) {
       anchorDateStr = endDate;
    }
    const anchorDate = new Date(anchorDateStr);
    const firstOfMonth = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1);
    const startOfMonthStr = firstOfMonth.toISOString().split('T')[0];
    
    const r2DateStr = anchorDateStr; 
    const r2Date = new Date(r2DateStr);

    const r1StartDateStr = startOfMonthStr;
    const r1EndDate = new Date(r2Date);
    r1EndDate.setDate(r1EndDate.getDate() - 1);
    const r1EndDateStr = r1EndDate.toISOString().split('T')[0];
    
    if (isNaN(r2Date.getTime())) {
      return {
        range1Label: 'N/A', range2Label: 'N/A',
        net1: 0, net2: 0, fuel1: 0, fuel2: 0, amt1: 0, amt2: 0,
        avgLoad1: 0, avgLoad2: 0, avgFuel1: 0, avgFuel2: 0,
        rate1: 0, rate2: 0
      };
    }

    const baseTrucks = trucks.filter(t => t.wheelConfig && t.wheelConfig.includes('WHEEL'));
    let targetVehicleIds = baseTrucks.map(t => t.id);

    if (truckFilter) {
      targetVehicleIds = [truckFilter];
    } else if (searchQuery) {
      targetVehicleIds = baseTrucks
        .filter(t => t.plateNumber.toLowerCase().includes(searchQuery.toLowerCase()))
        .map(t => t.id);
    }

    const targetGroups = fullAggregatedData.filter((g: any) => targetVehicleIds.includes(g.truckId));

    const r1Groups = targetGroups.filter((g: any) => g.date >= r1StartDateStr && g.date <= r1EndDateStr);
    const r2Groups = targetGroups.filter((g: any) => g.date === r2DateStr);

    const sumAggregates = (groups: any[]) => {
       return groups.reduce((acc, g) => {
          return {
             netWeight: acc.netWeight + g.netWeight,
             dieselPumped: acc.dieselPumped + g.diesel, 
             netDiesel: acc.netDiesel + g.netDiesel,    
             amount: acc.amount + (g.diesel * g.syncedRate),
             dieselForRate: acc.dieselForRate + (g.diesel > 0 ? g.diesel : 0),
             physicalTrips: acc.physicalTrips + g.entries,
             netTrips: acc.netTrips + g.netTrips        
          };
       }, { netWeight: 0, dieselPumped: 0, netDiesel: 0, amount: 0, dieselForRate: 0, physicalTrips: 0, netTrips: 0 });
    };

    const t1 = sumAggregates(r1Groups);
    const t2 = sumAggregates(r2Groups);

    return {
      range1Label: r1StartDateStr < r2DateStr ? `${formatDateHeader(r1StartDateStr)} to ${formatDateHeader(r1EndDateStr)}` : 'Prev. Data',
      range2Label: formatDateHeader(r2DateStr) || 'Today',
      net1: t1.netWeight, net2: t2.netWeight,
      fuel1: t1.dieselPumped, fuel2: t2.dieselPumped, 
      amt1: t1.amount, amt2: t2.amount,
      avgLoad1: t1.physicalTrips > 0 ? (t1.netWeight / t1.physicalTrips) : 0,
      avgLoad2: t2.physicalTrips > 0 ? (t2.netWeight / t2.physicalTrips) : 0,
      avgFuel1: t1.netTrips > 0 ? (t1.netDiesel / t1.netTrips) : 0,
      avgFuel2: t2.netTrips > 0 ? (t2.netDiesel / t2.netTrips) : 0,
      rate1: t1.dieselForRate > 0 ? (t1.amount / t1.dieselForRate) : 0,
      rate2: t2.dieselForRate > 0 ? (t2.amount / t2.dieselForRate) : 0
    };
  };

  const handleExportExcel = () => {
    // FIX: Define workbook immediately to prevent ReferenceError
    const wb = XLSX.utils.book_new();

    const dataRows = aggregatedData.map((g: any, i: number) => {
       const tripsToday = g.entries;
       const avgPerTrip = g.netTrips > 0 ? (g.netDiesel / g.netTrips) : 0;
       const avgLoadTrip = tripsToday > 0 ? (g.netWeight/tripsToday) : 0;
       const totalAdj = g.dieselAdjustment + g.airAdjustment;

       return [
          i + 1,
          formatDate(g.date),
          g.wheelConfig,
          g.fillingTypes || 'per trip',
          g.plateNumber,
          g.syncedDriver || 'PENDING',
          tripsToday,
          g.tripAdjustment,
          g.netTrips,
          Number((g.grossWeightTotal / tripsToday).toFixed(3)),
          Number(g.netWeight.toFixed(3)),
          Number(avgLoadTrip.toFixed(3)),
          Number(g.diesel.toFixed(3)),
          Number((-totalAdj).toFixed(3)),
          Number(g.advanceFromYesterday.toFixed(3)),
          Number(g.netDiesel.toFixed(3)),
          Number(avgPerTrip.toFixed(3)),
          g.staffWelfare || 0,
          g.rollAmount || 0,
          g.totalPayable || 0
       ];
    });

    const totalTrips = dataRows.reduce((sum, row) => sum + row[6], 0);
    const totalNetTrips = dataRows.reduce((sum, row) => sum + row[8], 0);
    const totalNetWT = dataRows.reduce((sum, row) => sum + row[10], 0);
    const totalDieselRec = dataRows.reduce((sum, row) => sum + row[12], 0);
    const totalNetDiesel = dataRows.reduce((sum, row) => sum + row[15], 0);
    const totalWelf = dataRows.reduce((sum, row) => sum + (row[17] || 0), 0);
    const totalRoll = dataRows.reduce((sum, row) => sum + (row[18] || 0), 0);
    const totalPay = dataRows.reduce((sum, row) => sum + (row[19] || 0), 0);
    const avgPerTripVal = dataRows.length > 0 ? (dataRows.reduce((sum, row) => sum + row[16], 0) / dataRows.length) : 0;

    const uniqueTrucks = new Set(aggregatedData.map((g: any) => g.plateNumber)).size;
    
    const totalsRow = [
       'TOTAL/AGGREGATION>>', `${uniqueTrucks} vehicles`, '', '', '', '',
       totalTrips, '', totalNetTrips, '', Number(totalNetWT.toFixed(3)), '',
        totalDieselRec.toFixed(3), '', '', totalNetDiesel.toFixed(3), avgPerTripVal.toFixed(3),
        totalWelf, totalRoll, totalPay
     ];

     const headers = [
        ['S.No', 'Date', 'Wheels', 'Filling Type', 'Vehicle No', 'Driver', 'Trips', 'Trips Adj', 'Net Trips', 
         'Gross (Avg)', 'Net WT', 'Avg Load', 'Diesel', 'Adj', 
         'Stock Adv', 'Net D', 'Avg Lite', 'Welf', 'Roll', 'Payable']
     ];

    let adjustments: any[] = [];
    if (reportOptions.remarks) {
       adjustments = aggregatedData.filter((g: any) => 
          g.tripAdjustment !== 0 || g.dieselAdjustment !== 0 || g.airAdjustment !== 0 || g.advanceFromYesterday > 0
       ).map((g: any) => {
          const remarks = [];
          if (g.tripRemarks) remarks.push(g.tripRemarks);
          if (g.dieselRemarks) remarks.push(g.dieselRemarks);
          if (g.airRemarks) remarks.push(g.airRemarks);
          if (g.tripAdjustment !== 0) remarks.push(`${g.tripAdjustment} TRIP ADJUSTED`);
          if (g.advanceFromYesterday > 0) remarks.push(`${g.advanceFromYesterday} LTR STOCK ADVANCE`);
          if (g.dieselAdjustment !== 0 || g.airAdjustment !== 0) {
             const totalAdj = g.dieselAdjustment + g.airAdjustment;
             remarks.push(`${totalAdj.toFixed(3)} LITRE USE IN AIR`);
          }
          return ['', formatDate(g.date), g.plateNumber, remarks.join(', ').toUpperCase(), '', ''];
       });
    }

    const mtd = calculateMTD();
    
    const allRows = [...headers, ...dataRows, totalsRow];
    allRows.push([''], ['']);
    const sectionsStartRow = allRows.length;
    
    const mtdDataTonnage = [
      ['Metric Tonnage (MT)', Number(mtd.net1.toFixed(3)), Number(mtd.net2.toFixed(3)), Number((mtd.net1 + mtd.net2).toFixed(3))],
      ['Avg Load/Trip (MT)', Number(mtd.avgLoad1.toFixed(3)), Number(mtd.avgLoad2.toFixed(3)), Number(((mtd.avgLoad1 + mtd.avgLoad2) / 2).toFixed(3))],
      ['Avg Diesel/Trip (L)', Number(mtd.avgFuel1.toFixed(3)), Number(mtd.avgFuel2.toFixed(3)), Number(((mtd.avgFuel1 + mtd.avgFuel2) / 2).toFixed(3))]
    ];

    const mtdDataDiesel = [
      ['Diesel Consumed (L)', Number(mtd.fuel1.toFixed(3)), Number(mtd.fuel2.toFixed(3)), Number((mtd.fuel1 + mtd.fuel2).toFixed(3))],
      ['Amount Spent (₹)', Number(mtd.amt1.toFixed(2)), Number(mtd.amt2.toFixed(2)), Number((mtd.amt1 + mtd.amt2).toFixed(2))],
      ['Diesel Rate (₹)', Number(mtd.rate1.toFixed(2)), Number(mtd.rate2.toFixed(2)), Number(((mtd.rate1 + mtd.rate2) / 2).toFixed(2))]
    ];

    const financialTotals = [
      ['FINANCIAL TOTALS (₹)', ''], 
      ['Staff Welfare Total', totalWelf],
      ['Roll Amount Total', totalRoll],
      ['Grand Driver Payable', totalPay]
    ];

    let maxDataRows = 0;
    if (reportOptions.remarks) maxDataRows = Math.max(maxDataRows, adjustments.length);
    if (reportOptions.tonnage || reportOptions.diesel) maxDataRows = Math.max(maxDataRows, 3);
    if (reportOptions.financials) maxDataRows = Math.max(maxDataRows, 7); 

    const subHeaderRow = new Array(20).fill('');
    const subColHeaders = new Array(20).fill('');

    if (reportOptions.remarks) {
       subHeaderRow[1] = 'REMARKS AND ADJUSTMENTS';
       subColHeaders[1] = 'DATE'; subColHeaders[2] = 'VEHICLE NO.'; subColHeaders[3] = 'REMARKS';
    }
    if (reportOptions.tonnage) {
       subHeaderRow[9] = 'MTD ANALYTICS (MONTH START TO TODAY)';
       subColHeaders[9] = 'Category'; subColHeaders[11] = mtd.range1Label; subColHeaders[12] = mtd.range2Label; subColHeaders[13] = 'Total';
    }
    if (reportOptions.diesel) {
       subHeaderRow[15] = 'MTD ANALYTICS (MONTH START TO TODAY)';
       subColHeaders[15] = 'Category'; subColHeaders[17] = mtd.range1Label; subColHeaders[18] = mtd.range2Label; subColHeaders[19] = 'Total';
    }

    if (maxDataRows > 0) {
       allRows.push(subHeaderRow);
       allRows.push(subColHeaders);
    }
    
    for (let i = 0; i < maxDataRows; i++) {
       const row = new Array(20).fill('');
       if (reportOptions.remarks && i < adjustments.length) {
          row[1] = adjustments[i][1]; row[2] = adjustments[i][2]; row[3] = adjustments[i][3]; 
       }
       if (reportOptions.tonnage && i < 3) {
          row[9] = mtdDataTonnage[i][0]; row[11] = mtdDataTonnage[i][1]; row[12] = mtdDataTonnage[i][2]; row[13] = mtdDataTonnage[i][3];
       }
       if (reportOptions.diesel && i < 3) {
          row[15] = mtdDataDiesel[i][0]; row[17] = mtdDataDiesel[i][1]; row[18] = mtdDataDiesel[i][2]; row[19] = mtdDataDiesel[i][3];
       }
       if (reportOptions.financials && i >= 3 && i < 7) {
          const finIdx = i - 3;
          row[15] = financialTotals[finIdx][0]; row[19] = financialTotals[finIdx][1];
       }
       allRows.push(row);
    }

    const ws = XLSX.utils.aoa_to_sheet(allRows);

    ws['!cols'] = [
      {wch: 5},  {wch: 12}, {wch: 15}, {wch: 30}, {wch: 5}, {wch: 5}, 
      {wch: 6},  {wch: 8},  {wch: 8},  {wch: 12}, {wch: 12}, {wch: 14},
      {wch: 12}, {wch: 5},  {wch: 10}, {wch: 10}, {wch: 10}, {wch: 8}, {wch: 8}, {wch: 10} 
    ];

    const merges = [];
    if (reportOptions.remarks) merges.push({ s: { r: sectionsStartRow, c: 1 }, e: { r: sectionsStartRow, c: 7 } });
    if (reportOptions.tonnage) merges.push({ s: { r: sectionsStartRow, c: 9 }, e: { r: sectionsStartRow, c: 13 } });
    if (reportOptions.diesel) merges.push({ s: { r: sectionsStartRow, c: 15 }, e: { r: sectionsStartRow, c: 19 } });

    if (reportOptions.remarks) {
       for (let i = 0; i < adjustments.length; i++) {
          merges.push({ s: { r: sectionsStartRow + 2 + i, c: 3 }, e: { r: sectionsStartRow + 2 + i, c: 7 } });
       }
    }

    if (reportOptions.tonnage || reportOptions.diesel) {
       for (let i = 0; i < 3; i++) {
          if (reportOptions.tonnage) merges.push({ s: { r: sectionsStartRow + 2 + i, c: 9 }, e: { r: sectionsStartRow + 2 + i, c: 10 } });
          if (reportOptions.diesel) merges.push({ s: { r: sectionsStartRow + 2 + i, c: 15 }, e: { r: sectionsStartRow + 2 + i, c: 16 } });
       }
    }

    if (reportOptions.financials) {
       const finStartRow = sectionsStartRow + 2 + 3; 
       merges.push({ s: { r: finStartRow, c: 15 }, e: { r: finStartRow, c: 19 } });
       for (let i = 1; i < 4; i++) {
          merges.push({ s: { r: finStartRow + i, c: 15 }, e: { r: finStartRow + i, c: 18 } });
       }
    }
    
    ws['!merges'] = merges;

    const borderStyle = {
       top: { style: "thin", color: { rgb: "000000" } },
       bottom: { style: "thin", color: { rgb: "000000" } },
       left: { style: "thin", color: { rgb: "000000" } },
       right: { style: "thin", color: { rgb: "000000" } }
    };
    
    for (let col = 0; col < 20; col++) {
       const cellRef = XLSX.utils.encode_cell({ r: 0, c: col });
       if (!ws[cellRef]) continue;
       ws[cellRef].s = {
          font: { bold: true, color: { rgb: "FFFFFF" } },
          fill: { fgColor: { rgb: "333333" } },
          alignment: { horizontal: "center", vertical: "center" },
          border: borderStyle
       };
    }
    
    for (let r = sectionsStartRow; r < allRows.length; r++) {
       const isHeader = r === sectionsStartRow;
       const isColHeader = r === sectionsStartRow + 1;
       const isContent = r > sectionsStartRow + 1;
       
       if (reportOptions.remarks) {
          for (let c = 1; c <= 7; c++) {
             const cellRef = XLSX.utils.encode_cell({ r, c });
             if (!ws[cellRef]) ws[cellRef] = { v: '', t: 's' };
             const cell = ws[cellRef];
             
             if (isContent && (!adjustments.length || r >= sectionsStartRow + 2 + adjustments.length)) continue;
             if (isHeader || isColHeader || (isContent && r < sectionsStartRow + 2 + adjustments.length)) {
                cell.s = { ...cell.s, border: borderStyle };
             }
             if (isHeader) cell.s = { ...cell.s, font: { bold: true, color: { rgb: "FFFFFF" } }, fill: { fgColor: { rgb: "000000" } }, alignment: { horizontal: "center" } };
             else if (isColHeader) cell.s = { ...cell.s, font: { bold: true }, fill: { fgColor: { rgb: "F1F5F9" } }, alignment: { horizontal: "center" } };
          }
       }

       if (reportOptions.tonnage) {
          const mtdRows = 3;
          if (r < sectionsStartRow + 2 + mtdRows) {
              for (let c = 9; c <= 13; c++) {
                  const cellRef = XLSX.utils.encode_cell({ r, c });
                  if (!ws[cellRef]) ws[cellRef] = { v: '', t: 's' };
                  const cell = ws[cellRef];
                  cell.s = { ...cell.s, border: borderStyle };
                  if (r === sectionsStartRow) cell.s = { ...cell.s, font: { bold: true, color: { rgb: "FFFFFF" } }, fill: { fgColor: { rgb: "000000" } }, alignment: { horizontal: "center" } };
                  else if (r === sectionsStartRow + 1) cell.s = { ...cell.s, font: { bold: true }, fill: { fgColor: { rgb: "F1F5F9" } } };
              }
          }
       }
    
       if (reportOptions.diesel || reportOptions.financials) {
           const mtdRows = 3;
           const finRows = 4;
           let paint = false;
           if (reportOptions.diesel && r < sectionsStartRow + 2 + mtdRows) paint = true;
           if (reportOptions.financials && r >= sectionsStartRow + 2 + mtdRows && r < sectionsStartRow + 2 + mtdRows + finRows) paint = true;

           if (paint) {
              for (let c = 15; c <= 19; c++) {
                  const cellRef = XLSX.utils.encode_cell({ r, c });
                  if (!ws[cellRef]) ws[cellRef] = { v: '', t: 's' };
                  const cell = ws[cellRef];
                  cell.s = { ...cell.s, border: borderStyle };
                  
                  if (r === sectionsStartRow && reportOptions.diesel) {
                     cell.s = { ...cell.s, font: { bold: true, color: { rgb: "FFFFFF" } }, fill: { fgColor: { rgb: "000000" } }, alignment: { horizontal: "center" } };
                  } else if (r === sectionsStartRow + 1 && reportOptions.diesel) {
                     cell.s = { ...cell.s, font: { bold: true }, fill: { fgColor: { rgb: "F1F5F9" } } };
                  } else if (r === sectionsStartRow + 2 + mtdRows && reportOptions.financials) {
                     cell.s = { ...cell.s, font: { bold: true, color: { rgb: "FFFFFF" } }, fill: { fgColor: { rgb: "000000" } }, alignment: { horizontal: "center" } };
                  }
              }
           }
       }
    }

    XLSX.utils.book_append_sheet(wb, ws, "Coal Transport Audit");

    // UNMAPPED FUEL SHEET (FIXED: Uses lax date filter to ensure generation)
    if (reportOptions.unmapped) {
       // FIX: If no dates selected, use very wide range to ensure we capture unmapped data
       const reportStartDateStr = startDate || '1970-01-01';
       const reportEndDateStr = endDate || '2099-12-31';
       
       let relevantFuelLogs = fuelLogs;
       if (truckFilter || searchQuery) {
          relevantFuelLogs = fuelLogs.filter(f => {
             const t = trucks.find(tr => tr.id === f.truckId);
             if (!t) return false;
             if (truckFilter && t.id !== truckFilter) return false;
             if (searchQuery && !t.plateNumber.toLowerCase().includes(searchQuery.toLowerCase())) return false;
             return true;
          });
       }

       const unmappedFuelLogs = relevantFuelLogs.filter(f => {
          const d = f.attributionDate || f.date;
          const isInReportRange = d >= reportStartDateStr && d <= reportEndDateStr;
          if (!isInReportRange) return false;
          
          let relevantCoalLogs = logs;
          if (truckFilter || searchQuery) {
             relevantCoalLogs = logs.filter(l => {
                const t = trucks.find(tr => tr.id === l.truckId);
                if (!t) return false;
                if (truckFilter && t.id !== truckFilter) return false;
                if (searchQuery && !t.plateNumber.toLowerCase().includes(searchQuery.toLowerCase())) return false;
                return true;
             });
          }
          const isMapped = relevantCoalLogs.some(l => l.truckId === f.truckId && l.date === d);
          return !isMapped;
       });

       if (unmappedFuelLogs.length > 0) {
          const unmappedHeader = ['Date', 'Attribution Date', 'Vehicle', 'Driver', 'Liters', 'Price', 'Amount', 'Station', 'Type'];
          const unmappedRows = unmappedFuelLogs.map(f => {
             const truck = trucks.find(t => t.id === f.truckId);
             const driver = drivers.find(d => d.id === f.driverId);
             const station = f.stationId ? (currentUser?.masterData?.fuelStations?.find((s: any) => s.id === f.stationId)?.name || f.stationId) : 'N/A';
             return [
                formatDate(f.date),
                formatDate(f.attributionDate),
                truck?.plateNumber || 'Unknown',
                driver?.name || 'Unknown',
                f.fuelLiters,
                f.dieselPrice,
                (f.fuelLiters * (f.dieselPrice || 0)).toFixed(2),
                station,
                f.entryType
             ];
          });
          
          const wsUnmapped = XLSX.utils.aoa_to_sheet([unmappedHeader, ...unmappedRows]);
          const range = XLSX.utils.decode_range(wsUnmapped['!ref'] || 'A1');
          for (let c = range.s.c; c <= range.e.c; ++c) {
             const ref = XLSX.utils.encode_cell({ r: 0, c });
             if (!wsUnmapped[ref]) continue;
             wsUnmapped[ref].s = { font: { bold: true }, fill: { fgColor: { rgb: "E0E0E0" } } };
          }
          wsUnmapped['!cols'] = [{wch:12}, {wch:12}, {wch:15}, {wch:20}, {wch:10}, {wch:10}, {wch:12}, {wch:20}, {wch:12}];
          
          XLSX.utils.book_append_sheet(wb, wsUnmapped, "Unmapped Fuel");
       }
    }

    // TRIP DETAILS SHEET (FIXED: Uses lax date filter to ensure generation)
    if (reportOptions.tripDetails) {
       const reportStartDateStr = startDate || '1970-01-01';
       const reportEndDateStr = endDate || '2099-12-31';
       
       let detailLogs = logs.filter(l => {
          const d = l.date;
          return d >= reportStartDateStr && d <= reportEndDateStr;
       });

       if (truckFilter || searchQuery) {
          const matchingTruckIds = trucks
            .filter(t => {
               if (truckFilter && t.id !== truckFilter) return false;
               if (searchQuery && !t.plateNumber.toLowerCase().includes(searchQuery.toLowerCase())) return false;
               return true;
            })
            .map(t => t.id);
          detailLogs = detailLogs.filter(l => matchingTruckIds.includes(l.truckId));
       }

       detailLogs.sort((a, b) => {
          if (a.truckId === b.truckId) {
             return new Date(a.date).getTime() - new Date(b.date).getTime();
          }
          return a.truckId.localeCompare(b.truckId);
       });

       const detailHeaders = [];
       if (columnOptions.date) detailHeaders.push('Date');
       if (columnOptions.truck) detailHeaders.push('Vehicle No');
       if (columnOptions.driver) detailHeaders.push('Driver');
       if (columnOptions.passNo) detailHeaders.push('Pass No');
       if (columnOptions.material) detailHeaders.push('Material');
       if (columnOptions.grossWt) detailHeaders.push('Gross Wt');
       if (columnOptions.tareWt) detailHeaders.push('Tare Wt');
       if (columnOptions.netWt) detailHeaders.push('Net Wt');
       if (columnOptions.diesel) detailHeaders.push('Diesel (L)');
       if (columnOptions.rate) detailHeaders.push('Rate');
       if (columnOptions.amount) detailHeaders.push('Amount');
       if (columnOptions.remarks) detailHeaders.push('Remarks');

       const detailRows: any[][] = [];
       const merges: any[] = [];
       
       const logsByTruck: Record<string, typeof detailLogs> = {};
       detailLogs.forEach(l => {
           if (!logsByTruck[l.truckId]) logsByTruck[l.truckId] = [];
           logsByTruck[l.truckId].push(l);
       });

       let sheetRowIndex = 1; 
       
       Object.keys(logsByTruck).forEach(tId => {
           const truck = trucks.find(t => t.id === tId);
           const tLogs = logsByTruck[tId];
           
           const truckHeaderRow = new Array(detailHeaders.length).fill('');
           truckHeaderRow[0] = `VEHICLE NO:: ${truck?.plateNumber || 'Unknown'}`;
           detailRows.push(truckHeaderRow);
           merges.push({ s: { r: sheetRowIndex, c: 0 }, e: { r: sheetRowIndex, c: Math.max(0, detailHeaders.length - 1) } });
           sheetRowIndex++;
           
           let truckTotalNetWt = 0;
           let truckTotalDiesel = 0;
           let truckTotalAmount = 0;
           
           const logsByDate: Record<string, typeof detailLogs> = {};
           tLogs.forEach(l => {
               if (!logsByDate[l.date]) logsByDate[l.date] = [];
               logsByDate[l.date].push(l);
           });
           
           const sortedDates = Object.keys(logsByDate).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
           
           sortedDates.forEach(date => {
               const tripsOnDate = logsByDate[date];
               const fuelOnDate = fuelLogs.filter(f => f.truckId === tId && (f.attributionDate || f.date) === date);
               
               const maxRows = Math.max(tripsOnDate.length, fuelOnDate.length);
               
               for (let i = 0; i < maxRows; i++) {
                   const trip = tripsOnDate[i];
                   const fuel = fuelOnDate[i];
                   const driver = trip ? drivers.find(d => d.id === trip.driverId) : (fuel ? drivers.find(d => d.id === fuel.driverId) : null);
                   
                   const row = [];
                   if (columnOptions.date) row.push(formatDate(date));
                   if (columnOptions.truck) row.push(truck?.plateNumber || '');
                   if (columnOptions.driver) row.push(driver?.name || (trip ? 'Pending' : ''));
                   if (columnOptions.passNo) row.push(trip ? trip.passNo : '');
                   if (columnOptions.material) row.push(trip ? 'Coal' : '');
                   if (columnOptions.grossWt) row.push(trip ? trip.grossWeight : '');
                   if (columnOptions.tareWt) row.push(trip ? trip.tareWeight : '');
                   if (columnOptions.netWt) {
                      row.push(trip ? trip.netWeight : '');
                      if (trip) truckTotalNetWt += (trip.netWeight || 0);
                   }
                   if (columnOptions.diesel) {
                      row.push(fuel ? fuel.fuelLiters : 0);
                      if (fuel) truckTotalDiesel += (fuel.fuelLiters || 0);
                   }
                   if (columnOptions.rate) row.push(fuel ? fuel.dieselPrice : (trip?.dieselRate || 0));
                   if (columnOptions.amount) {
                      const amount = fuel ? (fuel.fuelLiters * (fuel.dieselPrice || 0)) : 0;
                      row.push(amount ? amount.toFixed(2) : 0);
                      truckTotalAmount += amount;
                   }
                   if (columnOptions.remarks) {
                      const remarks = [];
                      if (trip?.remarks) remarks.push(trip.remarks);
                      if (trip?.dieselAdjustment) remarks.push(`${trip.dieselAdjustment}L Adj`);
                      if (trip?.airAdjustment) remarks.push(`${trip.airAdjustment}L Air`);
                      if (trip?.adjustment) remarks.push(`${trip.adjustment} Trip Adj`);
                      if (fuel?.entryType === 'FULL_TANK') remarks.push('Full Tank');
                      row.push(remarks.join(', '));
                   }
                   
                   detailRows.push(row);
                   sheetRowIndex++;
               }
           });
           
           const subTotalRow = new Array(detailHeaders.length).fill('');
           let cIdx = 0;
           if (columnOptions.date) cIdx++;
           if (columnOptions.truck) cIdx++;
           if (columnOptions.driver) cIdx++;
           if (columnOptions.passNo) cIdx++;
           if (columnOptions.material) cIdx++;
           if (columnOptions.grossWt) cIdx++;
           if (columnOptions.tareWt) cIdx++;
           if (columnOptions.netWt) {
              subTotalRow[cIdx] = Number(truckTotalNetWt.toFixed(3)); 
              cIdx++;
           }
           if (columnOptions.diesel) {
              subTotalRow[cIdx] = Number(truckTotalDiesel.toFixed(2));
              cIdx++;
           }
           if (columnOptions.rate) cIdx++;
           if (columnOptions.amount) {
              subTotalRow[cIdx] = Number(truckTotalAmount.toFixed(2));
              cIdx++;
           }
           
           detailRows.push(subTotalRow);
           sheetRowIndex++;
       });

       if (detailRows.length > 0) {
          const wsDetails = XLSX.utils.aoa_to_sheet([detailHeaders, ...detailRows]);
          const range = XLSX.utils.decode_range(wsDetails['!ref'] || 'A1');
          
          for (let c = range.s.c; c <= range.e.c; ++c) {
             const ref = XLSX.utils.encode_cell({ r: 0, c });
             if (!wsDetails[ref]) continue;
             wsDetails[ref].s = { font: { bold: true }, fill: { fgColor: { rgb: "E0E0E0" } } };
          }
          
          detailRows.forEach((row, idx) => {
             const sRowIdx = idx + 1;
             const isVehicleHeader = row[0] && String(row[0]).startsWith('VEHICLE NO::');
             const isSubtotal = !isVehicleHeader && String(row[0]) === '' && String(row[1]) === ''; 
             
             if (isVehicleHeader || isSubtotal) {
                for (let c = range.s.c; c <= range.e.c; ++c) {
                   const ref = XLSX.utils.encode_cell({ r: sRowIdx, c });
                   if (!wsDetails[ref]) wsDetails[ref] = { v: '', t: 's' };
                   wsDetails[ref].s = { ...wsDetails[ref].s, font: { bold: true } };
                   if (isVehicleHeader) {
                      wsDetails[ref].s.fill = { fgColor: { rgb: "CCCCCC" } };
                   }
                }
             }
          });
          
          wsDetails['!merges'] = merges;
          wsDetails['!cols'] = detailHeaders.map(() => ({ wch: 15 }));
          
          XLSX.utils.book_append_sheet(wb, wsDetails, "Trip Details");
       }
    }

    XLSX.writeFile(wb, `Coal_Audit_${formatDate(startDate)}_to_${formatDate(endDate)}.xlsx`);
  };

  const handleExportPDF = () => {
     // @ts-ignore
     if (!window.jspdf) {
        alert("PDF Library not loaded. Please refresh.");
        return;
     }

     // @ts-ignore
     const doc = new window.jspdf.jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
     
     // HEADER
     doc.setFontSize(16);
     doc.setTextColor(40);
     doc.text("COAL TRANSPORT AUDIT REPORT", 14, 12);
     doc.setFontSize(9);
     doc.text(`Period: ${formatDate(startDate) || 'Start'} to ${formatDate(endDate) || 'End'} | Generated: ${new Date().toLocaleDateString()}`, 14, 18);

     // MAIN TABLE DATA
     const tableBody = aggregatedData.map((g, i) => {
       const tripsToday = g.entries;
       const avgPerTrip = g.netTrips > 0 ? (g.netDiesel / g.netTrips) : 0;
       const avgLoadTrip = tripsToday > 0 ? (g.netWeight/tripsToday) : 0;

       return [
          i + 1,
          formatDate(g.date),
          g.wheelConfig,
          g.fillingTypes || 'per trip',
          g.plateNumber,
          g.syncedDriver || '-',
          tripsToday,
          g.tripAdjustment || '',
          g.netTrips,
          (g.grossWeightTotal / tripsToday).toFixed(3),
          g.netWeight.toFixed(3),
          avgLoadTrip.toFixed(3),
          g.diesel.toFixed(3),
          (-(g.dieselAdjustment + g.airAdjustment)).toFixed(3) || '',
          g.advanceFromYesterday || '',
          g.netDiesel.toFixed(3),
          avgPerTrip.toFixed(3),
          g.staffWelfare || 0,
          g.rollAmount || 0,
          g.totalPayable || 0
       ];
     });

     // Calculate Totals
      const totalTrips = tableBody.reduce((sum, row) => sum + row[6], 0);
      const totalNetTrips = tableBody.reduce((sum, row) => sum + row[8], 0);
      const totalNetWT = tableBody.reduce((sum, row) => sum + parseFloat(row[10]), 0);
      const totalDieselRec = tableBody.reduce((sum, row) => sum + parseFloat(row[12]), 0);
      const totalNetDiesel = tableBody.reduce((sum, row) => sum + parseFloat(row[15]), 0);
      const totalWelfare = tableBody.reduce((sum, row) => sum + (row[17] || 0), 0);
      const totalRoll = tableBody.reduce((sum, row) => sum + (row[18] || 0), 0);
      const totalDriverPayable = tableBody.reduce((sum, row) => sum + (row[19] || 0), 0);
      const avgPerTripVal = tableBody.length > 0 ? (tableBody.reduce((sum, row) => sum + parseFloat(row[16]), 0) / tableBody.length) : 0;
     const uniqueTrucks = new Set(aggregatedData.map((g: any) => g.plateNumber)).size;

      const totalsRow = [
         'TOTAL/AGGREGATION>>',
         `${uniqueTrucks} vehicles`,
         '', '', '', '',
         totalTrips,
         '',
         totalNetTrips,
         '',
         totalNetWT.toFixed(3),
         '',
         totalDieselRec.toFixed(3),
         '',
         '',
         totalNetDiesel.toFixed(3),
         avgPerTripVal.toFixed(3),
         totalWelfare,
         totalRoll,
         totalDriverPayable
      ];

      // @ts-ignore
      doc.autoTable({
         head: [['S.No', 'Date', 'Wheels', 'Filling Type', 'Vehicle No', 'Driver', 'Trips', 'Trips Adj', 'Net Trips', 
                 'Gross (MT)', 'Net WT (MT)', 'Avg Load/Trip', 'Diesel (L)', 'Adj', 'Adv', 'Net D', 'Avg', 'Welf', 'Roll', 'Total']],
        body: [...tableBody, totalsRow],
        startY: 24,
        theme: 'grid',
        styles: { fontSize: 6, cellPadding: 0.8, overflow: 'linebreak' },
        headStyles: { fillColor: [51, 51, 51], textColor: 255, fontStyle: 'bold', fontSize: 6 },
        columnStyles: {
           0: { cellWidth: 8, halign: 'center' },
           1: { cellWidth: 14 },
           2: { cellWidth: 12 },
           3: { cellWidth: 14 },
           4: { cellWidth: 18, fontStyle: 'bold' },
           5: { cellWidth: 16 },
           6: { halign: 'center', cellWidth: 10 },
           7: { halign: 'center', cellWidth: 10, textColor: [220, 38, 38] },
           8: { halign: 'center', cellWidth: 10, fontStyle: 'bold' },
           9: { halign: 'right', cellWidth: 14 },
           10: { halign: 'right', cellWidth: 14, fontStyle: 'bold' },
           11: { halign: 'right', cellWidth: 14 },
           12: { halign: 'right', cellWidth: 16 },
           13: { halign: 'right', cellWidth: 12, textColor: [220, 38, 38] },
           14: { halign: 'right', cellWidth: 12 },
            15: { halign: 'right', cellWidth: 10, fontStyle: 'bold' },
            16: { halign: 'right', cellWidth: 10 },
            17: { halign: 'right', cellWidth: 10, textColor: [37, 99, 235] },
            18: { halign: 'right', cellWidth: 10, textColor: [147, 51, 234] },
            19: { halign: 'right', cellWidth: 12, fontStyle: 'bold', fillColor: [241, 245, 249] }
        },
        didParseCell: (data: any) => {
            if (data.row.index === tableBody.length) {
               data.cell.styles.fontStyle = 'bold';
               data.cell.styles.fillColor = [240, 240, 240];
            }
        }
     });

     let finalY = (doc as any).lastAutoTable.finalY + 10;
     const sectionStartY = finalY;
     const remarksWidth = 85;
     const mtdWidth = 85;
     
     // 1. Remarks section
     if (reportOptions.remarks) {
        const adjustments = aggregatedData.filter((g: any) => 
           g.tripAdjustment !== 0 || g.dieselAdjustment !== 0 || g.airAdjustment !== 0 || g.advanceFromYesterday > 0
        ).map((g: any) => {
           const remarks = [];
           if (g.tripRemarks) remarks.push(g.tripRemarks);
           if (g.dieselRemarks) remarks.push(g.dieselRemarks);
           if (g.airRemarks) remarks.push(g.airRemarks);
           if (g.tripAdjustment !== 0) remarks.push(`${g.tripAdjustment} TRIP ADJUSTED`);
           if (g.advanceFromYesterday > 0) remarks.push(`${g.advanceFromYesterday} LTR STOCK ADVANCE`);
           if (g.dieselAdjustment !== 0 || g.airAdjustment !== 0) {
              const totalAdj = g.dieselAdjustment + g.airAdjustment;
              remarks.push(`${totalAdj.toFixed(3)} LITRE USE IN AIR`);
           }
           return [formatDate(g.date), g.plateNumber, remarks.join(', ').toUpperCase()];
        });

        if (adjustments.length > 0) {
           // @ts-ignore
           doc.autoTable({
              head: [['REMARKS AND ADJUSTMENTS']],
              body: [],
              startY: sectionStartY, margin: { left: 14 }, tableWidth: remarksWidth, theme: 'grid',
              headStyles: { fillColor: [0, 0, 0], textColor: 255, halign: 'center', fontStyle: 'bold' }
           });
           // @ts-ignore
           doc.autoTable({
              head: [['DATE', 'VEHICLE NO.', 'REMARKS']],
              body: adjustments,
              startY: (doc as any).lastAutoTable.finalY, margin: { left: 14 }, tableWidth: remarksWidth, theme: 'grid',
              styles: { fontSize: 7, cellPadding: 1 },
              headStyles: { fillColor: [241, 245, 249], textColor: 40, fontStyle: 'bold' },
              columnStyles: { 0: { cellWidth: 20 }, 1: { cellWidth: 25 }, 2: { cellWidth: 40 } }
           });
        }
     }

     // 2. MTD section
     const mtd = calculateMTD();
     
     if (reportOptions.tonnage) {
        const mtdTonnagePDF = [
           ['Metric Tonnage (MT)', mtd.net1.toFixed(3), mtd.net2.toFixed(3), (mtd.net1 + mtd.net2).toFixed(3)],
           ['Avg Load/Trip (MT)', mtd.avgLoad1.toFixed(3), mtd.avgLoad2.toFixed(3), ((mtd.avgLoad1 + mtd.avgLoad2)/2).toFixed(3)],
           ['Avg Diesel/Trip (L)', mtd.avgFuel1.toFixed(3), mtd.avgFuel2.toFixed(3), ((mtd.avgFuel1 + mtd.avgFuel2)/2).toFixed(3)]
        ];

        const tonerX = 14 + 85 + 7;
        // @ts-ignore
        doc.autoTable({
           head: [['MTD ANALYTICS (TONNAGE)']],
           body: [],
           startY: sectionStartY, margin: { left: tonerX }, tableWidth: 85, theme: 'grid',
           headStyles: { fillColor: [0, 0, 0], textColor: 255, halign: 'center', fontStyle: 'bold' }
        });
        // @ts-ignore
        doc.autoTable({
           head: [['Category', mtd.range1Label, mtd.range2Label, 'Total']],
           body: mtdTonnagePDF,
           startY: (doc as any).lastAutoTable.finalY, margin: { left: tonerX }, tableWidth: 85, theme: 'grid',
           styles: { fontSize: 7, cellPadding: 1 },
           headStyles: { fillColor: [241, 245, 249], textColor: 40, fontStyle: 'bold' },
           columnStyles: { 0: { cellWidth: 35 }, 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right', fontStyle: 'bold' } }
        });
     }

     if (reportOptions.diesel) {
         const mtdDieselPDF = [
           ['Diesel Consumed (L)', mtd.fuel1.toFixed(3), mtd.fuel2.toFixed(3), (mtd.fuel1 + mtd.fuel2).toFixed(3)],
           ['Amount Spent (₹)', mtd.amt1.toFixed(2), mtd.amt2.toFixed(2), (mtd.amt1 + mtd.amt2).toFixed(2)],
           ['Diesel Rate (₹)', mtd.rate1.toFixed(2), mtd.rate2.toFixed(2), ((mtd.rate1 + mtd.rate2)/2).toFixed(2)]
        ];

        const dieselX = 14 + 85 + 7 + 85 + 7; // Fixed position to match alignment
        // @ts-ignore
        doc.autoTable({
           head: [['MTD ANALYTICS (DIESEL)']],
           body: [],
           startY: sectionStartY, margin: { left: dieselX }, tableWidth: 85, theme: 'grid',
           headStyles: { fillColor: [0, 0, 0], textColor: 255, halign: 'center', fontStyle: 'bold' }
        });
        // @ts-ignore
        doc.autoTable({
           head: [['Category', mtd.range1Label, mtd.range2Label, 'Total']],
           body: mtdDieselPDF,
           startY: (doc as any).lastAutoTable.finalY, margin: { left: dieselX }, tableWidth: 85, theme: 'grid',
           styles: { fontSize: 7, cellPadding: 1 },
           headStyles: { fillColor: [241, 245, 249], textColor: 40, fontStyle: 'bold' },
           columnStyles: { 0: { cellWidth: 35 }, 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right', fontStyle: 'bold' } }
        });
        
        // 4. Financial Summary (Under Diesel)
        if (reportOptions.financials) {
           // @ts-ignore
           doc.autoTable({
              head: [['FINANCIAL TOTALS (₹)']],
              body: [],
              startY: (doc as any).lastAutoTable.finalY + 5, margin: { left: dieselX }, tableWidth: 85, theme: 'grid',
              headStyles: { fillColor: [0, 0, 0], textColor: 255, halign: 'center', fontStyle: 'bold' }
           });
           // @ts-ignore
           doc.autoTable({
              body: [
                 ['Staff Welfare Total', totalWelfare.toLocaleString()],
                 ['Roll Amount Total', totalRoll.toLocaleString()],
                 ['Grand Total Driver Payable', totalDriverPayable.toLocaleString()]
              ],
              startY: (doc as any).lastAutoTable.finalY, margin: { left: dieselX }, tableWidth: 85, theme: 'grid',
              styles: { fontSize: 8, fontStyle: 'bold' },
              columnStyles: { 0: { cellWidth: 55 }, 1: { halign: 'right' } }
           });
        }
     }

     // FOOTER
     const pages = doc.internal.getNumberOfPages();
     for (let j = 1; j <= pages; j++) {
        doc.setPage(j);
        doc.setFontSize(7);
        doc.text(`Page ${j} of ${pages}`, 280, 200, { align: 'right' });
     }

     doc.save(`Coal_Report_${formatDate(startDate)}_to_${formatDate(endDate)}.pdf`);
  };

  const startBatchEdit = (group: any) => {
    setBatchEditKey(group.key);
    setBatchEditBuffer({
      date: group.date,
      from: group.from,
      to: group.to,
      driverId: group.syncedDriverId || ''
    });
  };

  const handleSaveBatchEdit = async () => {
    const group = aggregatedData.find((g: any) => g.key === batchEditKey);
    if (group && (onUpdateLogs || onEdit)) {
      const { welfare, roll } = calculateBatchFinancials(group.logs.length, group.tripAdjustment);
      
      const updatedLogs = group.logs.map((log: any, i: number) => ({
        ...log,
        date: batchEditBuffer.date,
        from: batchEditBuffer.from,
        to: batchEditBuffer.to,
        driverId: batchEditBuffer.driverId || null,
        staffWelfare: i === 0 ? welfare : 0,
        rollAmount: i === 0 ? roll : 0
      }));

      if (onUpdateLogs) {
        await onUpdateLogs(updatedLogs);
      } else {
        for (const log of updatedLogs) {
          await onEdit!(log);
        }
      }
      setBatchEditKey(null);
    }
  };

  const handleUpdateAdjustment = async (field: 'trip' | 'stock' | 'air') => {
    if (!selectedGroup || !onEdit) return;
    if (!remarksBuffer.trim()) {
      alert("Remarks are mandatory.");
      return;
    }

    const newTripAdj = field === 'trip' ? (parseFloat(adjEditValue) || 0) : selectedGroup.tripAdjustment;
    const { welfare, roll } = calculateBatchFinancials(selectedGroup.logs.length, newTripAdj);

    const updatedLogs = selectedGroup.logs.map((log: any, i: number) => {
      let updates: any = {};
      if (field === 'trip') updates = { adjustment: newTripAdj, tripRemarks: remarksBuffer };
      if (field === 'stock') updates = { dieselAdjustment: parseFloat(dieselAdjValue) || 0, dieselAdjType: 'STOCK', dieselRemarks: remarksBuffer };
      if (field === 'air') updates = { airAdjustment: parseFloat(dieselAdjValue) || 0, airRemarks: remarksBuffer };
      
      updates.staffWelfare = i === 0 ? welfare : 0;
      updates.rollAmount = i === 0 ? roll : 0;
      
      return { ...log, ...updates };
    });

    if (onUpdateLogs) {
      await onUpdateLogs(updatedLogs);
    } else if (onEdit) {
      for (const log of updatedLogs) {
        await onEdit(log);
      }
    }

    setIsEditingAdjustment(false);
    setIsEditingDieselAdj(false);
    setRemarksBuffer('');
  };

  const startInlineEdit = (log: CoalLog) => {
    setEditingLogId(log.id);
    setEditBuffer({ ...log });
  };

  const saveInlineEdit = async () => {
    if (editingLogId && onEdit && editBuffer.id && selectedGroup) {
      const g = Number(editBuffer.grossWeight) || 0;
      const t = Number(editBuffer.tareWeight) || 0;
      const updatedLog = { ...(editBuffer as CoalLog), netWeight: Math.max(0, g - t) };
      
      const logIdx = selectedGroup.logs.findIndex((l: CoalLog) => l.id === editingLogId);
      const { welfare, roll } = calculateBatchFinancials(selectedGroup.logs.length, selectedGroup.tripAdjustment);
      
      updatedLog.staffWelfare = logIdx === 0 ? welfare : 0;
      updatedLog.rollAmount = logIdx === 0 ? roll : 0;

      await onEdit(updatedLog);
      setEditingLogId(null);
    }
  };

  const handleBulkAddRows = async () => {
    const count = parseInt(bulkAddCount);
    if (isNaN(count) || count <= 0 || !selectedGroup || !onAddLogs) return;
    
    const { welfare, roll } = calculateBatchFinancials(selectedGroup.logs.length + count, selectedGroup.tripAdjustment);
    
    const newLogs: CoalLog[] = Array.from({ length: count }).map((_, i) => ({
      id: crypto.randomUUID(), 
      date: selectedGroup.date, 
      truckId: selectedGroup.truckId, 
      driverId: selectedGroup.syncedDriverId || null,
      passNo: '', 
      grossWeight: 0, 
      tareWeight: 0, 
      netWeight: 0, 
      dieselLiters: 0, 
      dieselAdjustment: selectedGroup.dieselAdjustment, 
      dieselAdjType: selectedGroup.dieselAdjType,
      dieselRate: selectedGroup.syncedRate,
      from: selectedGroup.from, 
      to: selectedGroup.to,
      tripRemarks: selectedGroup.tripRemarks,
      dieselRemarks: selectedGroup.dieselRemarks,
      airRemarks: selectedGroup.airRemarks,
      adjustment: selectedGroup.tripAdjustment,
      airAdjustment: selectedGroup.airAdjustment,
      staffWelfare: 0, 
      rollAmount: 0    
    }));

    const updatedFirstLog = { ...selectedGroup.logs[0], staffWelfare: welfare, rollAmount: roll };
    const cleanedOtherExistingLogs = selectedGroup.logs.slice(1).map((l: any) => ({ ...l, staffWelfare: 0, rollAmount: 0 }));
    
    if (selectedGroup.logs.length === 0) {
      newLogs[0].staffWelfare = welfare;
      newLogs[0].rollAmount = roll;
      await onAddLogs(newLogs);
    } else if (onUpdateLogs) {
      await onUpdateLogs([updatedFirstLog, ...cleanedOtherExistingLogs, ...newLogs]);
    } else if (onEdit) {
      await onEdit(updatedFirstLog);
      for (const log of cleanedOtherExistingLogs) await onEdit(log);
      await onAddLogs(newLogs);
    }
    setBulkAddCount('');
  };

  return (
    <div className="space-y-6 animate-fadeIn w-full">
      {/* Header & Controls */}
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-6 px-1 no-print">
        <div className="flex flex-col sm:flex-row items-baseline gap-2 w-full sm:w-auto">
          <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tighter">Coal Transport Summary</h2>
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-100 px-3 py-1 rounded-full">{aggregatedData.length} records</span>
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full xl:w-auto">
          <button onClick={onAddTrigger} className="bg-amber-500 hover:bg-amber-600 text-white px-6 py-3 sm:py-2.5 rounded-2xl font-black text-[11px] uppercase shadow-xl transition-all active:scale-95 border-b-4 border-amber-700">Add New Entry</button>
          
          <div className="flex flex-1 sm:flex-none items-center gap-3">
              <div className="relative flex-1">
                 <input type="text" placeholder="Search Plate Number..." className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-2xl text-[11px] font-bold outline-none shadow-sm focus:ring-2 focus:ring-amber-500 min-w-[200px]" value={searchQuery} onChange={(e) => { setSearchQuery(e.target.value); setVisibleGroupCount(30); }} />
                 <span className="absolute left-4 top-1/2 -translate-y-1/2 opacity-30 text-xs">🔍</span>
              </div>
              <select className="px-4 py-3 bg-white border border-slate-200 rounded-2xl text-[11px] font-bold outline-none shadow-sm focus:ring-2 focus:ring-amber-500" value={truckFilter} onChange={(e) => { setTruckFilter(e.target.value); setVisibleGroupCount(30); }}>
                <option value="">All Vehicles</option>
                {trucks.filter(t => t.fleetType === 'COAL').map(t => <option key={t.id} value={t.id}>{t.plateNumber}</option>)}
              </select>
          </div>

          <div className="bg-white p-1.5 rounded-[1.5rem] border border-slate-200 shadow-sm flex items-center gap-2">
            {!showReportCenter ? (
              <button onClick={() => setShowReportCenter(true)} className="bg-slate-900 text-white px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-md hover:bg-black transition-all">📊 REPORTS</button>
            ) : (
              <div className="flex items-center gap-2 animate-fadeIn p-0.5">
                <div className="flex items-center gap-1 bg-slate-50 px-2 py-1.5 rounded-lg">
                  <input type="date" className="bg-transparent text-[9px] font-black border-none outline-none focus:ring-0" value={startDate} onChange={e => { setStartDate(e.target.value); setVisibleGroupCount(30); }} />
                  <span className="text-[8px] font-black text-slate-300">→</span>
                  <input type="date" className="bg-transparent text-[9px] font-black border-none outline-none focus:ring-0" value={endDate} onChange={e => { setEndDate(e.target.value); setVisibleGroupCount(30); }} />
                </div>
                <div className="flex gap-1">
                   {/* Settings Button */}
                   <button onClick={() => setShowReportSettings(true)} className="bg-slate-100 hover:bg-slate-200 text-slate-600 px-3 py-2 rounded-lg text-[12px] transition-colors" title="Report Settings">⚙️</button>
                   
                   <button onClick={handleExportPDF} title="PDF" className="bg-slate-900 text-white px-3 py-2 rounded-lg text-[9px] font-black uppercase">PDF</button>
                   <button onClick={handleExportExcel} title="Excel" className="bg-emerald-600 text-white px-3 py-2 rounded-lg text-[9px] font-black uppercase">XL</button>
                   <button onClick={() => setShowReportCenter(false)} className="bg-slate-100 hover:bg-slate-200 p-2 rounded-lg transition-colors text-[8px]">✕</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[11px]">
            <thead className="bg-slate-900 text-slate-300 font-black uppercase tracking-widest">
              <tr>
                <th className="px-4 py-6 w-12 text-center">#</th>
                <th className="px-8 py-6">Prod Date</th>
                <th className="px-8 py-6">Vehicle</th>
                <th className="px-8 py-6">Route (From → To)</th>
                <th className="px-8 py-6">Operator (Synced)</th>
                <th className="px-8 py-6 text-center">Trips (Adj)</th>
                <th className="px-8 py-6 text-center">Net W.T (MT)</th>
                <th className="px-8 py-6 text-center">
                   <div className="flex flex-col items-center">
                     <span className="text-amber-500">Diesel Avg (L)</span>
                     <span className="text-[7px] text-slate-500 mt-1">Diesel Avg Per Trip</span>
                   </div>
                </th>
                <th className="px-8 py-6 text-center text-emerald-500">Fuel History (Audit)</th>
                <th className="px-8 py-6 text-right no-print">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {aggregatedData.slice(0, visibleGroupCount).map((group: any, idx: number) => {
                const efficiencyTrips = Math.max(0.1, group.entries + group.tripAdjustment);
                const netEfficiencyDiesel = group.diesel + group.advanceFromYesterday - group.dieselAdjustment - group.airAdjustment;
                return (
                  <tr key={group.key} className="hover:bg-slate-50/50 transition-colors group">
                    <td className="px-4 py-5 text-center font-black text-rose-500">{idx + 1}</td>
                    <td className="px-8 py-5 font-bold text-slate-600">{formatDate(group.date)}</td>
                    <td className="px-8 py-5" onClick={() => setSelectedGroupKey(group.key)}>
                      <div className="flex flex-col cursor-pointer group">
                        <span className="font-black text-slate-900 font-mono text-xl group-hover:text-amber-500 transition-colors uppercase">
                          {group.plateNumber}
                        </span>
                        <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest mt-0.5">Fleet -- {group.wheelConfig || 'Wheels'}</span>
                      </div>
                    </td>
                    <td className="px-8 py-5">
                       <div className="flex flex-col">
                          <span className="text-[10px] font-black text-slate-900 uppercase">{group.from}</span>
                          <span className="text-[9px] font-bold text-slate-400 uppercase">→ {group.to}</span>
                       </div>
                    </td>
                    <td className="px-8 py-5"><span className="font-bold text-slate-700 uppercase">{group.syncedDriver || 'PENDING'}</span></td>
                    <td className="px-8 py-5 text-center">
                       <span className="font-bold text-slate-700">{group.entries}</span>
                       {group.tripAdjustment !== 0 && <span className={`ml-1 text-[9px] font-black ${group.tripAdjustment > 0 ? 'text-blue-500' : 'text-rose-400'}`}>({group.tripAdjustment > 0 ? '+' : ''}{group.tripAdjustment})</span>}
                    </td>
                    <td className="px-8 py-5 text-center font-mono font-black text-slate-900 text-sm">{(group.netWeight || 0).toFixed(3)}</td>
                    <td className="px-8 py-5 text-center font-mono font-black text-emerald-600 text-sm bg-emerald-50/10">
                      {(netEfficiencyDiesel / efficiencyTrips).toFixed(3)}
                    </td>
                    <td className="px-8 py-5 text-center">
                       <div className="flex flex-col items-center leading-tight">
                          <span className="font-bold text-slate-500 text-[10px]">{group.actualFuelDate ? formatDate(group.actualFuelDate) : 'N/A'}</span>
                          <div className="flex items-center gap-1 mt-0.5">
                             <span className="text-[10px] font-black text-emerald-600 uppercase tracking-tighter">{group.diesel.toFixed(3)}L</span>
                             <span className="text-[7px] font-black text-slate-300 uppercase">/</span>
                             <span className="text-[7px] font-black text-slate-400 uppercase tracking-tighter">{group.fillingTypes === 'full diesel' ? 'FULL' : 'TRIP'}</span>
                          </div>
                       </div>
                    </td>
                    <td className="px-8 py-5 text-right no-print">
                      <div className="flex justify-end gap-2">
                        <button onClick={() => startBatchEdit(group)} className="border border-rose-500 text-rose-500 px-4 py-2.5 rounded-xl hover:bg-rose-50 font-black uppercase text-[9px] tracking-widest transition-all">Edit</button>
                        <button onClick={() => setSelectedGroupKey(group.key)} className="bg-slate-900 text-white px-5 py-2.5 rounded-xl hover:bg-black font-black uppercase text-[9px] tracking-widest shadow-md transition-all active:scale-95">Details</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        
        {/* Load More Button */}
        {aggregatedData.length > visibleGroupCount && (
          <div className="p-8 text-center bg-slate-50/30 border-t border-slate-50">
             <button 
                onClick={() => setVisibleGroupCount(prev => prev + 30)}
                className="px-8 py-3 bg-white border border-slate-200 text-slate-600 rounded-xl font-black uppercase text-[10px] tracking-widest shadow-sm hover:bg-slate-900 hover:text-white transition-all active:scale-95"
             >
                Load More Records ({aggregatedData.length - visibleGroupCount} more)
             </button>
          </div>
        )}
      </div>

      {/* Totals Section */}
      <div className="flex flex-col sm:flex-row gap-6 no-print">
         <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex flex-col justify-center min-w-[200px] flex-1">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">Total Metric Tonnage</span>
            <div className="flex items-baseline gap-4">
              <span className="text-3xl font-black text-slate-900">{(globalTotals.tonnage || 0).toFixed(3)} <span className="text-sm font-bold text-slate-400">MT</span></span>
              <span className="text-lg font-black text-amber-600">{globalTotals.trips} <span className="text-[10px] uppercase text-slate-400">Net Trips</span></span>
            </div>
         </div>
         <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex flex-col justify-center min-w-[200px] flex-1">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">Total Net Diesel Issued</span>
            <div className="flex items-baseline gap-4">
              <span className="text-3xl font-black text-emerald-600">{(globalTotals.diesel || 0).toFixed(3)} <span className="text-sm font-bold text-emerald-400">L</span></span>
              <span className="text-lg font-black text-emerald-700">₹{globalTotals.amount.toLocaleString(undefined, {maximumFractionDigits: 0})}</span>
            </div>
         </div>
         <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex flex-col justify-center min-w-[200px] flex-1">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">Fleet Avg Load</span>
            <span className="text-3xl font-black text-amber-600">{(globalTotals.tonnage / Math.max(1, globalTotals.trips)).toFixed(3)} <span className="text-sm font-bold text-amber-400">MT/T</span></span>
         </div>
         <div className="bg-slate-900 p-6 rounded-[2rem] border border-slate-800 shadow-sm flex flex-col justify-center min-w-[200px] flex-1">
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-1">Fleet Diesel Avg</span>
            <span className="text-3xl font-black text-amber-500">{(globalTotals.diesel / Math.max(1, globalTotals.trips)).toFixed(3)} <span className="text-sm font-bold text-amber-700">L/T</span></span>
         </div>
      </div>

      <>
      {/* Batch Edit Modal */}
      {batchEditKey && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[400] flex items-center justify-center p-4 animate-fadeIn no-print">
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-md overflow-hidden animate-scaleIn">
            <div className="bg-slate-900 p-8 text-white flex justify-between items-center">
              <h3 className="text-xl font-black uppercase tracking-tight">Batch Header Update</h3>
              <button onClick={() => setBatchEditKey(null)} className="text-white hover:text-amber-500 text-2xl font-light">&times;</button>
            </div>
            <div className="p-8 space-y-6">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Production Date</label>
                <input type="date" className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none" value={batchEditBuffer.date} onChange={e => setBatchEditBuffer({...batchEditBuffer, date: e.target.value})} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">From</label>
                  <input type="text" className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none" value={batchEditBuffer.from} onChange={e => setBatchEditBuffer({...batchEditBuffer, from: e.target.value.toUpperCase()})} />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">To</label>
                  <input type="text" className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none" value={batchEditBuffer.to} onChange={e => setBatchEditBuffer({...batchEditBuffer, to: e.target.value.toUpperCase()})} />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Operator</label>
                <select className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none" value={batchEditBuffer.driverId} onChange={e => setBatchEditBuffer({...batchEditBuffer, driverId: e.target.value})}>
                  <option value="">Select Operator...</option>
                  {drivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <button onClick={handleSaveBatchEdit} className="w-full py-5 bg-amber-500 text-white rounded-2xl font-black uppercase shadow-xl hover:bg-amber-600 transition-all border-b-4 border-amber-700">Apply to All Trips</button>
            </div>
          </div>
        </div>
      )}

      {/* Batch Detail Modal */}
      {selectedGroup && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[300] flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fadeIn no-print overflow-y-auto">
          <div className="bg-white rounded-t-[2.5rem] sm:rounded-[2.5rem] shadow-2xl w-full max-w-7xl h-[90vh] sm:h-auto sm:max-h-[95vh] overflow-hidden animate-slideUp sm:animate-scaleIn sm:my-8 flex flex-col">
            <div className="bg-slate-900 p-6 sm:p-8 text-white flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shrink-0">
              <div className="flex flex-col sm:flex-row sm:items-center gap-4 w-full sm:w-auto">
                <div>
                  <h3 className="text-xl font-black font-mono tracking-tight">
                    {selectedGroup.plateNumber} Batch Detail 
                    <span className="ml-4 text-[10px] font-black bg-blue-500/20 text-blue-400 px-2 py-1 rounded-md uppercase tracking-widest">{selectedGroup.wheelConfig || 'WHEELS'}</span>
                    <span className="ml-0 sm:ml-4 block sm:inline text-amber-500 opacity-60 text-sm">[{formatDate(selectedGroup.date)}]</span>
                  </h3>
                  <p className="text-xs text-rose-400 font-black uppercase tracking-[0.2em] mt-1 italic">diesel filling type: {selectedGroup.fillingTypes || 'per trip'}</p>
                </div>
                <div className={`px-4 py-1.5 rounded-xl border flex items-center gap-2 self-start ${selectedGroup.syncedDriver ? 'bg-emerald-500/10 border-emerald-500 text-emerald-400' : 'bg-rose-500/10 border-rose-500 text-rose-400 animate-pulse'}`}>
                    <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Operator:</span>
                    <span className="text-[10px] font-black uppercase tracking-tight">{selectedGroup.syncedDriver || 'SYNC PENDING'}</span>
                </div>
              </div>
              <div className="flex items-center justify-between w-full sm:w-auto gap-4">
                 <div className="flex bg-white/10 p-1.5 rounded-2xl border border-white/10 shadow-inner">
                    <input type="number" placeholder="Qty" className="bg-transparent text-white px-3 py-1 text-xs outline-none w-12 sm:w-16 font-bold" value={bulkAddCount} onChange={e => setBulkAddCount(e.target.value)} />
                    <button onClick={handleBulkAddRows} className="bg-white text-slate-900 px-4 sm:px-6 py-2 rounded-xl text-[10px] font-black uppercase hover:bg-amber-400 transition-colors">ADD TRIPS</button>
                 </div>
                 <button onClick={() => { setSelectedGroupKey(null); setEditingLogId(null); setIsEditingAdjustment(false); setIsEditingDieselAdj(false); setConfirmDeleteId(null); }} className="text-white hover:text-amber-500 text-3xl font-light px-2 transition-colors">&times;</button>
              </div>
            </div>
            
            <div className="p-4 sm:p-8 overflow-y-auto scrollbar-hide border-b border-slate-100 flex-1">
              <div className="overflow-x-auto">
              <table className="w-full text-left text-xs min-w-[600px]">
                <thead className="bg-slate-50 border-b border-slate-100 font-black text-slate-400 uppercase tracking-widest">
                  <tr>
                    <th className="px-6 py-4">Pass No</th>
                    <th className="px-6 py-4 text-center">Gross (MT)</th>
                    <th className="px-6 py-4 text-center">Tare (MT)</th>
                    <th className="px-6 py-4 text-center">Net (MT)</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                   {selectedGroup.logs.map((log, idx) => {
                    const isEditing = editingLogId === log.id;
                    const isConfirmingDelete = confirmDeleteId === log.id;
                    return (
                      <tr key={log.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                        <td className="px-6 py-4">
                           <div className="flex items-center gap-3">
                              <span className="text-[10px] font-black text-slate-300">{idx + 1}.</span>
                              {isEditing ? (
                                <input type="text" className="bg-white border border-rose-400 rounded px-2 py-1 text-xs font-black uppercase outline-none shadow-sm" value={editBuffer.passNo} onChange={e => setEditBuffer({ ...editBuffer, passNo: e.target.value })} autoFocus />
                              ) : (
                                <span className="font-black text-amber-600 uppercase tracking-wider">{log.passNo}</span>
                              )}
                           </div>
                        </td>
                        <td className="px-6 py-4 text-center">
                          {isEditing ? (
                            <input type="number" step="0.001" className="bg-white border border-rose-400 rounded px-2 py-1 text-xs font-bold w-20 text-center outline-none shadow-sm" value={editBuffer.grossWeight} onChange={e => setEditBuffer({ ...editBuffer, grossWeight: e.target.value })} />
                          ) : (
                            <span className="font-mono font-bold text-slate-700">{(log.grossWeight || 0).toFixed(3)}</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-center">
                          {isEditing ? (
                            <input type="number" step="0.001" className="bg-white border border-rose-400 rounded px-2 py-1 text-xs font-medium w-20 text-center outline-none shadow-sm" value={editBuffer.tareWeight} onChange={e => setEditBuffer({ ...editBuffer, tareWeight: e.target.value })} />
                          ) : (
                            <span className="font-mono font-bold text-slate-400">{(log.tareWeight || 0).toFixed(3)}</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-center font-black text-slate-900 font-mono text-sm">
                          {isEditing ? (Math.max(0, (Number(editBuffer.grossWeight) || 0) - (Number(editBuffer.tareWeight) || 0))).toFixed(3) : (log.netWeight || 0).toFixed(3)}
                        </td>
                        <td className="px-6 py-4 text-right">
                           {isEditing ? (
                             <div className="flex justify-end gap-2">
                               <button onClick={saveInlineEdit} className="bg-emerald-500 text-white px-3 py-1 rounded text-[8px] font-black uppercase">Save</button>
                               <button onClick={() => setEditingLogId(null)} className="text-slate-400 text-[8px] font-black uppercase">Cancel</button>
                             </div>
                           ) : isConfirmingDelete ? (
                             <div className="flex justify-end items-center gap-2">
                               <span className="text-[8px] font-black text-rose-600 uppercase">Confirm?</span>
                               <button onClick={() => { onDelete?.(log.id); setConfirmDeleteId(null); }} className="bg-rose-500 text-white px-2 py-1 rounded text-[8px] font-black uppercase">Yes</button>
                               <button onClick={() => setConfirmDeleteId(null)} className="text-slate-400 text-[8px] font-black uppercase">No</button>
                             </div>
                           ) : (
                             <div className="flex justify-end gap-3 items-center">
                                <button onClick={() => startInlineEdit(log)} className="text-blue-500 font-black text-[9px] uppercase tracking-widest">Edit</button>
                                <button onClick={() => setConfirmDeleteId(log.id)} className="text-rose-500 font-black text-[9px] uppercase tracking-widest">Delete</button>
                             </div>
                           )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
            </div>

            <div className="p-4 bg-slate-50 flex flex-col gap-4 shrink-0 safe-pb">
               <div className="flex flex-col xl:flex-row justify-between items-center gap-2">
                 <div className="grid grid-cols-2 lg:grid-cols-6 gap-2 w-full items-stretch">
                    <div className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-sm flex flex-col items-center justify-center">
                        <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-0.5 font-mono">NET (MT)</span>
                        <span className="text-xl font-black text-slate-900">{(selectedGroup.netWeight || 0).toFixed(3)}</span>
                        <span className="text-[7px] font-black text-slate-400 uppercase tracking-tighter mt-1">TOTAL</span>
                    </div>

                    <div className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-sm flex flex-col items-center justify-center relative group">
                      <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-0.5 font-mono">TRIPS</span>
                      <span className="text-xl font-black text-slate-600">{selectedGroup.entries}</span>
                      <div className="mt-1 flex items-center gap-1">
                          <input 
                            type="checkbox" 
                            checked={includeExtriInRoll}
                            onChange={async (e) => {
                              const newVal = e.target.checked;
                              setIncludeExtriInRoll(newVal);
                              // Immediate save to DB when toggled
                              if (selectedGroup && selectedGroup.logs.length > 0 && (onUpdateLogs || onEdit)) {
                                const { welfare, roll } = calculateBatchFinancials(selectedGroup.entries, selectedGroup.tripAdjustment);
                                const firstLog = {
                                  ...selectedGroup.logs[0],
                                  staffWelfare: welfare,
                                  rollAmount: roll
                                };

                                if (onUpdateLogs) {
                                  await onUpdateLogs([firstLog]);
                                } else if (onEdit) {
                                  await onEdit(firstLog);
                                }
                              }
                            }} 
                            className="w-3 h-3 accent-amber-500 cursor-pointer" 
                            id="incAdj" 
                          />
                          <label htmlFor="incAdj" className="text-[7px] font-black text-slate-400 uppercase cursor-pointer">INC ADJ?</label>
                      </div>
                    </div>
                    
                    <div className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-sm flex flex-col items-center justify-center">
                        <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-0.5 font-mono">PER TRIP TONNAGE AVG (MT)</span>
                        <span className="text-xl font-black text-slate-900">{(selectedGroup.netWeight / Math.max(1, selectedGroup.entries)).toFixed(3)}</span>
                        <span className="text-[7px] font-black text-slate-400 uppercase tracking-tighter mt-1">AVG: {(selectedGroup.netWeight / Math.max(1, selectedGroup.entries)).toFixed(3)}</span>
                    </div>

                    <div className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-sm flex flex-col items-center justify-center">
                        <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-0.5 font-mono text-center">PER TRIP DIESEL AVG</span>
                        <span className="text-xl font-black text-emerald-600">{( (selectedGroup.diesel + selectedGroup.advanceFromYesterday - selectedGroup.dieselAdjustment - selectedGroup.airAdjustment) / Math.max(1, selectedGroup.entries) ).toFixed(3)} L</span>
                        <span className="text-[7px] font-black text-slate-400 uppercase mt-1 tracking-tighter">PER TRIP</span>
                    </div>

                    <div className={`p-3 rounded-xl border transition-all flex flex-col ${isEditingAdjustment ? 'bg-amber-50 border-amber-400 ring-2 ring-amber-200' : 'bg-white border-slate-200 shadow-sm'}`}>
                      <div className="flex justify-between w-full items-center mb-2">
                          <span className="text-[9px] font-black text-amber-600 uppercase tracking-widest">TRIP ADJ</span>
                          {!isEditingAdjustment && <button onClick={() => { setIsEditingAdjustment(true); setAdjEditValue(selectedGroup.tripAdjustment.toString()); setRemarksBuffer(selectedGroup.tripRemarks); }} className="text-[8px] font-black text-blue-600 uppercase hover:underline bg-blue-50 px-2 py-1 rounded-md">EDIT</button>}
                      </div>
                      {isEditingAdjustment ? (
                        <div className="space-y-3 animate-fadeIn w-full">
                          <div className="space-y-1">
                            <label className="text-[8px] font-black text-amber-700 uppercase ml-1">Adjustment Value</label>
                            <input type="number" autoFocus className="w-full bg-white border border-amber-300 rounded-xl px-3 py-2 text-sm font-black outline-none focus:ring-2 focus:ring-amber-500 shadow-sm" value={adjEditValue} onChange={e => setAdjEditValue(e.target.value)} />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[8px] font-black text-amber-700 uppercase ml-1">Reason / Remarks</label>
                            <input type="text" className="w-full bg-white border border-amber-200 rounded-xl px-3 py-2 text-[11px] font-bold outline-none focus:ring-2 focus:ring-amber-500 shadow-sm" value={remarksBuffer} onChange={e => setRemarksBuffer(e.target.value)} placeholder="Why is this change needed?" />
                          </div>
                          <div className="flex gap-2 pt-1">
                            <button onClick={() => handleUpdateAdjustment('trip')} disabled={!remarksBuffer.trim()} className="flex-1 bg-amber-600 text-white py-2.5 rounded-xl text-[10px] font-black uppercase shadow-md hover:bg-amber-700 transition-all disabled:opacity-50">SAVE</button>
                            <button onClick={() => setIsEditingAdjustment(false)} className="px-4 bg-white border border-slate-200 text-slate-500 py-2.5 rounded-xl text-[10px] font-black uppercase hover:bg-slate-50 transition-all">CANCEL</button>
                          </div>
                        </div>
                      ) : (
                          <div className="h-full flex items-center justify-center py-2">
                            <span className={`${selectedGroup.tripAdjustment !== 0 ? 'text-amber-600' : 'text-slate-300'} text-3xl font-black`}>
                              {selectedGroup.tripAdjustment > 0 ? `+${selectedGroup.tripAdjustment}` : selectedGroup.tripAdjustment}
                            </span>
                          </div>
                      )}
                    </div>

                    <div className={`p-3 rounded-xl border transition-all flex flex-col ${isEditingDieselAdj ? 'bg-emerald-50 border-emerald-400 ring-2 ring-emerald-200' : 'bg-white border-slate-200 shadow-sm'}`}>
                      <div className="flex justify-between w-full items-center mb-2">
                          <span className="text-[9px] font-black text-emerald-600 uppercase tracking-widest font-mono">NET DIESEL</span>
                          {!isEditingDieselAdj && <button onClick={() => { setIsEditingDieselAdj(true); setDieselAdjValue('0'); setRemarksBuffer(''); setDieselAdjType('OTHER'); }} className="text-[8px] font-black text-blue-600 uppercase hover:underline bg-blue-50 px-2 py-1 rounded-md">ADJ</button>}
                      </div>
                      {isEditingDieselAdj ? (
                        <div className="space-y-3 animate-fadeIn w-full">
                           <div className="grid grid-cols-2 gap-2">
                             <div className="space-y-1">
                               <label className="text-[8px] font-black text-emerald-700 uppercase ml-1">Type</label>
                               <select className="w-full bg-white border border-emerald-300 rounded-xl px-2 py-2 text-[10px] font-black outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm" value={dieselAdjType} onChange={e => setDieselAdjType(e.target.value as any)}>
                                  <option value="STOCK">Stock</option>
                                  <option value="OTHER">Correction</option>
                               </select>
                             </div>
                             <div className="space-y-1">
                               <label className="text-[8px] font-black text-emerald-700 uppercase ml-1">Liters</label>
                               <input type="number" step="0.001" autoFocus className="w-full bg-white border border-emerald-300 rounded-xl px-3 py-2 text-sm font-black outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm" value={dieselAdjValue} onChange={e => setDieselAdjValue(e.target.value)} />
                             </div>
                           </div>
                           <div className="space-y-1">
                             <label className="text-[8px] font-black text-emerald-700 uppercase ml-1">Reason / Remarks</label>
                             <input type="text" className="w-full bg-white border border-emerald-200 rounded-xl px-3 py-2 text-[10px] font-bold outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm" value={remarksBuffer} onChange={e => setRemarksBuffer(e.target.value)} placeholder="Describe the adjustment..." />
                           </div>
                           <div className="flex gap-2 pt-1">
                             <button onClick={() => handleUpdateAdjustment(dieselAdjType === 'STOCK' ? 'stock' : 'air')} disabled={!remarksBuffer.trim()} className="flex-1 bg-emerald-600 text-white py-2.5 rounded-xl text-[10px] font-black uppercase shadow-md hover:bg-emerald-700 transition-all disabled:opacity-50">SAVE</button>
                             <button onClick={() => setIsEditingDieselAdj(false)} className="px-4 bg-white border border-slate-200 text-slate-500 py-2.5 rounded-xl text-[10px] font-black uppercase hover:bg-slate-50 transition-all">CANCEL</button>
                           </div>
                        </div>
                      ) : (
                          <div className="h-full flex items-center justify-center py-2">
                            <span className="text-3xl font-black text-emerald-600">{(selectedGroup.diesel + selectedGroup.advanceFromYesterday - selectedGroup.dieselAdjustment - selectedGroup.airAdjustment).toFixed(3)}<span className="text-sm font-bold ml-1 opacity-60 text-emerald-500">L</span></span>
                          </div>
                      )}
                    </div>
                  </div>

                  <button 
                    onClick={async () => {
                      // Final save before close to ensure consistency
                      if (selectedGroup && selectedGroup.logs.length > 0) {
                        const { welfare, roll } = calculateBatchFinancials(selectedGroup.logs.length, selectedGroup.tripAdjustment);
                        const updatedFirstLog = { ...selectedGroup.logs[0], staffWelfare: welfare, rollAmount: roll };
                        const cleanedOtherLogs = selectedGroup.logs.slice(1).map(l => ({ ...l, staffWelfare: 0, rollAmount: 0 }));
                        
                        if (onUpdateLogs) {
                          await onUpdateLogs([updatedFirstLog, ...cleanedOtherLogs]);
                        } else if (onEdit) {
                          await onEdit(updatedFirstLog);
                          for (const log of cleanedOtherLogs) await onEdit(log);
                        }
                      }
                      setSelectedGroupKey(null);
                    }} 
                    className="bg-slate-900 text-white rounded-xl font-black uppercase shadow-xl hover:bg-black transition-all min-h-[60px] flex items-center justify-center p-2.5"
                  >
                    <div className="flex flex-col items-center leading-tight">
                       <span className="text-[10px] tracking-[0.2em] font-black">SAVE AND CLOSE</span>
                    </div>
                  </button>
                </div>
              </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-2">
                  <div className="bg-white border border-slate-200 rounded-xl p-3 flex flex-col gap-2 shadow-sm">
                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-[0.2em] border-b border-slate-50 pb-1">DIESEL MOVEMENT TRIAL</p>
                    <div className="space-y-1.5 font-mono">
                       <div className="flex justify-between items-center text-[10px] font-bold">
                          <span className="text-slate-500 uppercase">Opening Stock</span>
                          <span className="text-slate-900">(+) {selectedGroup.advanceFromYesterday.toFixed(3)} L</span>
                       </div>
                       <div className="flex justify-between items-center text-[10px] font-bold">
                          <span className="text-slate-500 uppercase">Today's Pump</span>
                          <span className="text-slate-900">(+) {selectedGroup.diesel.toFixed(3)} L</span>
                       </div>
                       {(selectedGroup.dieselAdjustment > 0 || selectedGroup.airAdjustment > 0) && (
                         <div className="flex justify-between items-center text-[10px] font-bold">
                            <span className="text-rose-500 uppercase">Adjustments</span>
                            <span className="text-rose-500">(-) {(selectedGroup.dieselAdjustment + selectedGroup.airAdjustment).toFixed(3)} L</span>
                         </div>
                       )}
                       <div className="pt-1.5 border-t border-slate-100 flex justify-between items-center">
                          <span className="text-[9px] font-black text-emerald-600 uppercase">Net Consumed</span>
                          <span className="text-sm font-black text-emerald-600">{(selectedGroup.diesel + selectedGroup.advanceFromYesterday - selectedGroup.dieselAdjustment - selectedGroup.airAdjustment).toFixed(3)} L</span>
                       </div>
                    </div>
                  </div>

                  <div className="bg-white border border-slate-200 rounded-xl p-3 flex flex-col gap-2 shadow-sm lg:col-span-2">
                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-[0.2em] border-b border-slate-50 pb-1">PAYABLE & AUDIT TRAIL</p>
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-6">
                            <div className="flex flex-col">
                                <span className="text-[8px] font-black text-slate-400 uppercase">Staff Welfare</span>
                                <span className="text-xs font-black text-slate-700">₹{selectedGroup.staffWelfare}</span>
                            </div>
                            <div className="flex flex-col">
                                <span className="text-[8px] font-black text-slate-400 uppercase">Roll Amount</span>
                                <span className="text-xs font-black text-slate-700">₹{selectedGroup.rollAmount}</span>
                            </div>
                            <div className="flex flex-col bg-slate-900 px-3 py-1 rounded-lg">
                                <span className="text-[8px] font-black text-slate-400 uppercase">Total Payable</span>
                                <span className="text-xs font-black text-white">₹{selectedGroup.totalPayable}</span>
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-x-6 gap-y-1">
                           {selectedGroup.advanceFromYesterday > 0 && (
                             <span className="text-[8px] font-black text-blue-600 uppercase italic">• STOCK ADVANCE: "{selectedGroup.advanceFromYesterday}L applied"</span>
                           )}
                           {selectedGroup.tripRemarks && (
                             <span className="text-[8px] font-black text-amber-600 uppercase italic">• TRIP BALANCING: "{selectedGroup.tripRemarks}"</span>
                           )}
                           {selectedGroup.dieselRemarks && (
                             <span className="text-[8px] font-black text-emerald-600 uppercase italic">• DIESEL ADJUSTMENT: "{selectedGroup.dieselRemarks}"</span>
                           )}
                           {selectedGroup.airRemarks && (
                             <span className="text-[8px] font-black text-rose-600 uppercase italic">• AIR ADJUSTMENT: "{selectedGroup.airRemarks}"</span>
                           )}
                           {!(selectedGroup.advanceFromYesterday > 0 || selectedGroup.tripRemarks || selectedGroup.dieselRemarks || selectedGroup.airRemarks) && (
                             <p className="text-[8px] font-black text-slate-300 italic uppercase tracking-wider">Zero operational adjustments logged.</p>
                           )}
                        </div>
                    </div>
                  </div>
                </div>
          </div>
        </div>
      )}
      {showReportSettings && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[300] flex items-center justify-center p-4">
           <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-scaleIn">
              <div className="bg-slate-900 p-6 flex justify-between items-center">
                 <h3 className="text-white font-black text-lg tracking-tight">Report Settings</h3>
                 <button onClick={() => setShowReportSettings(false)} className="text-slate-400 hover:text-white text-2xl">&times;</button>
              </div>
              
              <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
                 {/* Section 1: Report Sections */}
                 <div>
                    <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">Include Sections</h4>
                    <div className="grid grid-cols-2 gap-3">
                       {Object.entries(reportOptions).map(([key, value]) => (
                          <label key={key} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl cursor-pointer hover:bg-slate-100 border border-slate-100">
                             <input type="checkbox" checked={value} onChange={() => setReportOptions(prev => ({...prev, [key]: !prev[key as keyof typeof reportOptions]}))} className="w-4 h-4 rounded text-amber-500 focus:ring-amber-500" />
                             <span className="text-xs font-bold text-slate-700 capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                          </label>
                       ))}
                    </div>
                 </div>

                 {/* Section 2: Trip Detail Columns */}
                 {reportOptions.tripDetails && (
                    <div>
                       <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">Trip Details Columns</h4>
                       <div className="grid grid-cols-3 gap-2">
                          {Object.entries(columnOptions).map(([key, value]) => (
                             <label key={key} className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg cursor-pointer hover:bg-slate-100">
                                <input type="checkbox" checked={value} onChange={() => setColumnOptions(prev => ({...prev, [key]: !prev[key as keyof typeof columnOptions]}))} className="w-3 h-3 rounded text-amber-500 focus:ring-amber-500" />
                                <span className="text-[10px] font-bold text-slate-600 capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                             </label>
                          ))}
                       </div>
                    </div>
                 )}
              </div>

              <div className="p-6 bg-slate-50 border-t flex justify-end">
                 <button onClick={() => setShowReportSettings(false)} className="bg-slate-900 text-white px-6 py-3 rounded-xl font-black text-xs uppercase tracking-widest shadow-lg active:scale-95">Save & Close</button>
              </div>
           </div>
        </div>
      )}
      
      <div className="mt-8 pt-8 border-t border-slate-100 flex justify-center no-print">
         <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.3em]">Sapna Transport Logistics • Operation Monitor v3.0</p>
      </div>
      </>
    </div>
  );
};

export default CoalTransport;