import React, { useState, useMemo } from 'react';
import { MiningLog, Truck, Driver, MasterData, FuelLog } from '../types';
import * as XLSX from 'xlsx-js-style';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface MiningReportsProps {
  logs: MiningLog[];
  trucks: Truck[];
  drivers: Driver[];
  masterData: MasterData;
  fuelLogs?: FuelLog[];
  onBack?: () => void;
}

/* ─── Column Config ─────────────────────────────────────────────────── */
const DEFAULT_COLUMNS = {
  date: true,
  vehicle: true,
  driver: true,
  chalan: true,
  royaltyNo: true,
  supplier: true,
  customer: true,
  customerSite: true,
  material: true,
  cartingAgent: true,
  grossWt: true,
  tareWt: true,
  netWt: true,
  loadingGross: false,
  loadingTare: false,
  loadingNet: true,
  unloadingGross: false,
  unloadingTare: false,
  unloadingNet: true,
  shortage: true,
  staffWelfare: false,
  rollAmount: false,
  type: true,
};

const COLUMN_LABELS: Record<string, string> = {
  date: 'Date',
  vehicle: 'Vehicle No.',
  driver: 'Operator',
  chalan: 'Chalan No.',
  royaltyNo: 'Royalty No.',
  supplier: 'Supplier',
  customer: 'Customer',
  customerSite: 'Customer Site',
  material: 'Material',
  cartingAgent: 'Carting Agent',
  grossWt: 'Gross Wt (MT)',
  tareWt: 'Tare Wt (MT)',
  netWt: 'Net Wt (MT)',
  loadingGross: 'Loading Gross',
  loadingTare: 'Loading Tare',
  loadingNet: 'Loading Net',
  unloadingGross: 'Unloading Gross',
  unloadingTare: 'Unloading Tare',
  unloadingNet: 'Unloading Net',
  shortage: 'Shortage (MT)',
  staffWelfare: 'Staff Welfare',
  rollAmount: 'Roll Amount',
  type: 'Type',
};

/* ─── Report Section Config ───────────────────────────────────────────── */
const DEFAULT_SECTIONS = {
  tripDetails: true,
  mtdAnalytics: true,
  dieselAnalytics: true,
  materialSummary: true,
  vehicleSummary: true,
  customerSummary: true,
  agentSummary: true,
};

type DimensionKey = 'all' | 'vehicle' | 'customer' | 'material' | 'driver' | 'agent';

/* ─── Helpers ─────────────────────────────────────────────────────────── */
const fmt3 = (n: number) => n.toFixed(3);
const fmt0 = (n: number) => n.toFixed(0);
const formatDate = (d: string) => {
  if (!d || !d.includes('-')) return d;
  const p = d.split('-');
  return `${p[2]}-${p[1]}-${p[0]}`;
};
const groupBy = <T,>(arr: T[], fn: (item: T) => string): Record<string, T[]> =>
  arr.reduce((acc, item) => {
    const k = fn(item);
    if (!acc[k]) acc[k] = [];
    acc[k]!.push(item);
    return acc;
  }, {} as Record<string, T[]>);

/* ─── MTD Calculation (mirrors CoalTransport.calculateMTD) ────────────── */
function calculateMTD(allLogs: MiningLog[], anchorDate: string, startDateOverride: string, filterFn: (log: MiningLog) => boolean) {
  const anchor = new Date(anchorDate);
  const firstOfMonth = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const r1End = new Date(anchor); r1End.setDate(r1End.getDate() - 1);

  let r1Start = firstOfMonth.toISOString().split('T')[0];
  if (startDateOverride && !isNaN(Date.parse(startDateOverride))) {
      r1Start = startDateOverride;
  }
  const r1EndStr = r1End.toISOString().split('T')[0];
  const r2Str = anchorDate;

  const base = allLogs.filter(filterFn);
  const r1 = base.filter(l => l.date >= r1Start && l.date <= r1EndStr);
  const r2 = base.filter(l => l.date === r2Str);

  const sum = (logs: MiningLog[]) => ({
    trips: logs.length,
    netWt: logs.reduce((s, l) => s + (l.net || l.gross - l.tare || 0), 0),
    shortage: logs.reduce((s, l) => s + (l.shortageWt || 0), 0),
    avgLoad: 0,
  });
  const s1 = sum(r1); s1.avgLoad = s1.trips > 0 ? s1.netWt / s1.trips : 0;
  const s2 = sum(r2); s2.avgLoad = s2.trips > 0 ? s2.netWt / s2.trips : 0;

  const r1Label = r1Start < r1EndStr ? `${formatDate(r1Start)} → ${formatDate(r1EndStr)}` : 'Prev. Data';
  const r2Label = formatDate(r2Str) || 'Today';

  return { r1Label, r2Label, s1, s2 };
}

/* ─── Excel Styles ─────────────────────────────────────────────────────── */
const STYLE = {
  headerDark: { font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 9 }, fill: { fgColor: { rgb: '1E293B' } }, alignment: { horizontal: 'center' as const, vertical: 'center' as const }, border: { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } } },
  headerAmber: { font: { bold: true, color: { rgb: '000000' }, sz: 9 }, fill: { fgColor: { rgb: 'F59E0B' } }, alignment: { horizontal: 'center' as const }, border: { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } } },
  total: { font: { bold: true, sz: 9 }, fill: { fgColor: { rgb: 'F1F5F9' } }, alignment: { horizontal: 'right' as const }, border: { top: { style: 'medium' }, bottom: { style: 'medium' }, left: { style: 'thin' }, right: { style: 'thin' } } },
  cell: { font: { sz: 8 }, border: { top: { style: 'thin', color: { rgb: 'E2E8F0' } }, bottom: { style: 'thin', color: { rgb: 'E2E8F0' } }, left: { style: 'thin', color: { rgb: 'E2E8F0' } }, right: { style: 'thin', color: { rgb: 'E2E8F0' } } } },
  sectionHeader: { font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 10 }, fill: { fgColor: { rgb: '0F172A' } }, alignment: { horizontal: 'center' as const } },
};

function styledCell(value: any, style: any) {
  return { v: value, t: typeof value === 'number' ? 'n' : 's', s: style };
}

/* ─── MAIN COMPONENT ─────────────────────────────────────────────────── */
const MiningReports: React.FC<MiningReportsProps> = ({ logs, trucks, drivers, masterData, fuelLogs = [], onBack }) => {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [dimension, setDimension] = useState<DimensionKey>('all');
  const [dimensionValue, setDimensionValue] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'DISPATCH' | 'PURCHASE'>('all');
  
  // Specific Filters
  const [truckIdFilter, setTruckIdFilter] = useState('');
  const [driverIdFilter, setDriverIdFilter] = useState('');
  const [customerFilter, setCustomerFilter] = useState('');
  const [materialFilter, setMaterialFilter] = useState('');
  const [supplierFilter, setSupplierFilter] = useState('');
  const [agentFilter, setAgentFilter] = useState('');

  const [columns, setColumns] = useState<Record<string, boolean>>(DEFAULT_COLUMNS);
  const [sections, setSections] = useState<Record<string, boolean>>(DEFAULT_SECTIONS);
  const [showConfig, setShowConfig] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  /* ── Active filtered logs ─────────────────────────────────────────────── */
  const filteredLogs = useMemo(() => {
    return logs.filter(l => {
      if (startDate && l.date < startDate) return false;
      if (endDate && l.date > endDate) return false;
      if (typeFilter !== 'all' && l.type !== typeFilter) return false;
      
      // Global Grouping Dimension (legacy support)
      if (dimension === 'vehicle' && dimensionValue) {
        const t = trucks.find(t => t.id === l.truckId);
        if (t?.plateNumber !== dimensionValue) return false;
      }
      if (dimension === 'customer' && dimensionValue && l.customerName !== dimensionValue) return false;
      if (dimension === 'material' && dimensionValue && l.material !== dimensionValue) return false;
      if (dimension === 'driver' && dimensionValue) {
        const d = drivers.find(d => d.id === l.driverId);
        if (d?.name !== dimensionValue) return false;
      }
      if (dimension === 'agent' && dimensionValue && l.cartingAgent !== dimensionValue) return false;

      // Direct Specific Filters
      if (truckIdFilter && l.truckId !== truckIdFilter) return false;
      if (driverIdFilter && l.driverId !== driverIdFilter) return false;
      if (customerFilter && l.customerName !== customerFilter) return false;
      if (materialFilter && l.material !== materialFilter) return false;
      if (supplierFilter && l.supplier !== supplierFilter) return false;
      if (agentFilter && l.cartingAgent !== agentFilter) return false;

      return true;
    }).sort((a, b) => b.date.localeCompare(a.date));
  }, [logs, startDate, endDate, dimension, dimensionValue, typeFilter, trucks, drivers, truckIdFilter, driverIdFilter, customerFilter, materialFilter, supplierFilter, agentFilter]);

  /* ── Summary stats ─────────────────────────────────────────────────────── */
  const stats = useMemo(() => ({
    trips: filteredLogs.length,
    totalNet: filteredLogs.reduce((s, l) => s + (l.net || l.gross - l.tare || 0), 0),
    totalShortage: filteredLogs.reduce((s, l) => s + (l.shortageWt || 0), 0),
    vehicles: new Set(filteredLogs.map(l => l.truckId)).size,
    materials: new Set(filteredLogs.map(l => l.material)).size,
  }), [filteredLogs]);

  /* ── MTD ───────────────────────────────────────────────────────────────── */
  const mtd = useMemo(() => {
    if (!endDate) return null;
    const filterFn = (l: MiningLog) => {
      if (dimension === 'vehicle' && dimensionValue) {
        const t = trucks.find(t => t.id === l.truckId);
        if (t?.plateNumber !== dimensionValue) return false;
      }
      if (dimension === 'customer' && dimensionValue && l.customerName !== dimensionValue) return false;
      if (dimension === 'material' && dimensionValue && l.material !== dimensionValue) return false;
      return true;
    };
    return calculateMTD(logs, endDate, startDate, filterFn);
  }, [logs, startDate, endDate, dimension, dimensionValue, trucks]);

  /* ── Dimension values for dropdown ─────────────────────────────────────── */
  const dimensionOptions = useMemo(() => {
    if (dimension === 'vehicle') return [...new Set(trucks.filter(t => t.fleetType === 'MINING').map(t => t.plateNumber))];
    if (dimension === 'customer') return masterData.customers;
    if (dimension === 'material') return masterData.materials;
    if (dimension === 'driver') return drivers.map(d => d.name);
    if (dimension === 'agent') return masterData.agents;
    return [];
  }, [dimension, trucks, drivers, masterData]);

  /* ── Active columns list ─────────────────────────────────────────────────── */
  const activeColumns = Object.entries(columns).filter(([, on]) => on).map(([k]) => k);

  /* ── Build row for a log ─────────────────────────────────────────────────── */
  const buildRow = (log: MiningLog): string[] => {
    const truck = trucks?.find(t => t.id === log.truckId);
    const driver = drivers?.find(d => d.id === log.driverId);
    const net = log.net || log.gross - log.tare || 0;
    const vals: Record<string, string> = {
      date: formatDate(log.date),
      vehicle: truck?.plateNumber || 'Unknown',
      driver: driver?.name || 'N/A',
      chalan: log.chalanNo || '',
      royaltyNo: log.royaltyNo || log.royaltyPassNo || '',
      supplier: log.supplier || '',
      customer: log.customerName || '',
      customerSite: log.customerSite || log.site || '',
      material: log.material || '',
      cartingAgent: log.cartingAgent || '',
      grossWt: fmt3(log.gross || 0),
      tareWt: fmt3(log.tare || 0),
      netWt: fmt3(net),
      loadingGross: fmt3(log.loadingGrossWt || 0),
      loadingTare: fmt3(log.loadingTareWt || 0),
      loadingNet: log.loadingNetWt != null ? fmt3(log.loadingNetWt) : '',
      unloadingGross: fmt3(log.unloadingGrossWt || 0),
      unloadingTare: fmt3(log.unloadingTareWt || 0),
      unloadingNet: log.unloadingNetWt != null ? fmt3(log.unloadingNetWt) : '',
      shortage: log.shortageWt != null ? fmt3(log.shortageWt) : '',
      staffWelfare: log.staffWelfare ? log.staffWelfare.toString() : '0',
      rollAmount: log.rollAmount ? log.rollAmount.toString() : '0',
      type: log.type || '',
    };
    return activeColumns.map(k => vals[k] || '');
  };

  /* ────────────────────── EXCEL EXPORT ──────────────────────────────────── */
  const handleExcelExport = async () => {
    setIsGenerating(true);
    try {
      const wb = XLSX.utils.book_new();

      /* ── Sheet 1: Trip Details ─── */
      if (sections.tripDetails) {
        const headers = activeColumns.map(k => COLUMN_LABELS[k]);
        const dataRows = filteredLogs.map(buildRow);

        // Totals row
        const netIdx = activeColumns.indexOf('netWt');
        const shortIdx = activeColumns.indexOf('shortage');
        const swIdx = activeColumns.indexOf('staffWelfare');
        const raIdx = activeColumns.indexOf('rollAmount');
        const ldIdx = activeColumns.indexOf('loadingNet');
        const ulIdx = activeColumns.indexOf('unloadingNet');
        const totalRow: any[] = new Array(activeColumns.length).fill('');
        totalRow[0] = `TOTAL — ${filteredLogs.length} trips`;
        if (netIdx >= 0) totalRow[netIdx] = fmt3(stats.totalNet);
        if (shortIdx >= 0) totalRow[shortIdx] = fmt3(stats.totalShortage);
        if (swIdx >= 0) totalRow[swIdx] = filteredLogs.reduce((s, l) => s + (l.staffWelfare || 0), 0);
        if (raIdx >= 0) totalRow[raIdx] = filteredLogs.reduce((s, l) => s + (l.rollAmount || 0), 0);
        if (ldIdx >= 0) totalRow[ldIdx] = fmt3(filteredLogs.reduce((s, l) => s + (l.loadingNetWt || 0), 0));
        if (ulIdx >= 0) totalRow[ulIdx] = fmt3(filteredLogs.reduce((s, l) => s + (l.unloadingNetWt || 0), 0));

        const allRows = [headers, ...dataRows, totalRow];
        const ws = XLSX.utils.aoa_to_sheet(allRows);
        const numCols = headers.length;

        // Widen columns
        ws['!cols'] = activeColumns.map(k =>
          ['date', 'vehicle', 'driver', 'customer', 'material'].includes(k) ? { wch: 18 } :
          ['chalan', 'royaltyNo', 'supplier', 'customerSite', 'cartingAgent'].includes(k) ? { wch: 15 } :
          { wch: 12 }
        );

        // Style header row
        for (let c = 0; c < numCols; c++) {
          const ref = XLSX.utils.encode_cell({ r: 0, c });
          if (ws[ref]) ws[ref].s = STYLE.headerDark;
        }
        // Style data rows
        for (let r = 1; r <= dataRows.length; r++) {
          for (let c = 0; c < numCols; c++) {
            const ref = XLSX.utils.encode_cell({ r, c });
            if (!ws[ref]) ws[ref] = { v: '', t: 's' };
            ws[ref].s = STYLE.cell;
          }
        }
        // Style totals row
        const totalR = dataRows.length + 1;
        for (let c = 0; c < numCols; c++) {
          const ref = XLSX.utils.encode_cell({ r: totalR, c });
          if (!ws[ref]) ws[ref] = { v: '', t: 's' };
          ws[ref].s = STYLE.headerAmber;
        }

        XLSX.utils.book_append_sheet(wb, ws, 'Trip Details');
      }

      /* ── Sheet 2: MTD Analytics ─── */
      if (sections.mtdAnalytics && mtd) {
        const mtdRows = [
          ['MINING OPERATIONS — MTD ANALYTICS', '', '', ''],
          ['', '', '', ''],
          ['Metric', 'Category', mtd.r1Label, mtd.r2Label, 'Period Total'],
          ['Tonnage (MT)', 'Net Weight', fmt3(mtd.s1.netWt), fmt3(mtd.s2.netWt), fmt3(mtd.s1.netWt + mtd.s2.netWt)],
          ['', 'Avg Load/Trip', fmt3(mtd.s1.avgLoad), fmt3(mtd.s2.avgLoad), ''],
          ['Shortages', 'Total Shortage (MT)', fmt3(mtd.s1.shortage), fmt3(mtd.s2.shortage), fmt3(mtd.s1.shortage + mtd.s2.shortage)],
          ['Trips', 'Total Trips', fmt0(mtd.s1.trips), fmt0(mtd.s2.trips), fmt0(mtd.s1.trips + mtd.s2.trips)],
        ];
        const wsMTD = XLSX.utils.aoa_to_sheet(mtdRows);
        wsMTD['!cols'] = [{ wch: 20 }, { wch: 22 }, { wch: 20 }, { wch: 20 }, { wch: 18 }];
        wsMTD['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 4 } }];
        // Style header
        if (wsMTD['A1']) wsMTD['A1'].s = STYLE.sectionHeader;
        for (let c = 0; c < 5; c++) {
          const ref = XLSX.utils.encode_cell({ r: 2, c });
          if (wsMTD[ref]) wsMTD[ref].s = STYLE.headerDark;
        }
        for (let r = 3; r < mtdRows.length; r++) {
          for (let c = 0; c < 5; c++) {
            const ref = XLSX.utils.encode_cell({ r, c });
            if (!wsMTD[ref]) wsMTD[ref] = { v: '', t: 's' };
            wsMTD[ref].s = STYLE.cell;
          }
        }
        XLSX.utils.book_append_sheet(wb, wsMTD, 'MTD Analytics');
      }

      /* ── Sheet 3: Material Summary ─── */
      if (sections.materialSummary) {
        const byMat = groupBy(filteredLogs, (l: MiningLog) => l.material || 'Unknown');
        const matRows = [
          ['Material', 'Trips', 'Total Net (MT)', 'Total Shortage (MT)', 'Avg Load/Trip'],
          ...Object.entries(byMat).map(([mat, items]) => {
            const mLogs = items as MiningLog[];
            const net = mLogs.reduce((s, l) => s + (l.net || (l.gross && l.tare ? l.gross - l.tare : 0) || 0), 0);
            const sh = mLogs.reduce((s, l) => s + (l.shortageWt || 0), 0);
            return [mat, mLogs.length.toString(), fmt3(net), fmt3(sh), fmt3(mLogs.length > 0 ? net / mLogs.length : 0)];
          }),
        ];
        const wsM = XLSX.utils.aoa_to_sheet(matRows);
        wsM['!cols'] = [{ wch: 22 }, { wch: 10 }, { wch: 18 }, { wch: 20 }, { wch: 15 }];
        for (let c = 0; c < 5; c++) {
          const ref = XLSX.utils.encode_cell({ r: 0, c });
          if (wsM[ref]) wsM[ref].s = STYLE.headerAmber;
        }
        XLSX.utils.book_append_sheet(wb, wsM, 'Material Summary');
      }

      /* ── Sheet: Diesel Analytics ─── */
      if (sections.dieselAnalytics) {
        const byTruck = groupBy(filteredLogs, (l: MiningLog) => trucks.find(t => t.id === l.truckId)?.plateNumber || 'Unknown');
        
        const dRows = [
          ['Vehicle No.', 'Period Net Wt (MT)', 'Trips', 'Diesel (Ltrs)', 'Amount (₹)', 'Ltrs/Trip', 'Ltrs/MT', 'Avg KM/L'],
          ...Object.entries(byTruck).map(([plate, items]) => {
            const vLogs = items as MiningLog[];
            const trkId = vLogs[0]?.truckId;
            const net = vLogs.reduce((s, l) => s + (l.net || (l.gross && l.tare ? l.gross - l.tare : 0) || 0), 0);
            const tripsCount = vLogs.length;

            // Fuel Data within the period for this truck
            const vFuel = fuelLogs.filter(f => f.vehicleId === trkId && f.date >= startDate && f.date <= endDate);
            
            // Handle Stock Advances/Returns on edge dates
            let advTaken = 0, advGiven = 0;
            vLogs.forEach(l => {
              if (l.advanceFromYesterday && l.date === startDate) advTaken += l.advanceFromYesterday;
              if (l.advanceFromYesterday && l.date === endDate) advGiven += l.advanceFromYesterday;
            });

            const rawFuelLtrs = vFuel.reduce((s, f) => s + f.liters, 0);
            const amtRs = vFuel.reduce((s, f) => s + f.amount, 0);
            
            const adjLtrs = (rawFuelLtrs + advTaken) - advGiven;
            
            // Calculate KM metrics for MINING (Based strictly on Fuel Logs)
            let kmPerL = 0;
            if (vFuel.length > 1) {
              const sortedFuel = [...vFuel].sort((a,b) => a.date.localeCompare(b.date));
              const firstOdo = sortedFuel[0].odometer;
              const lastOdo = sortedFuel[sortedFuel.length - 1].odometer;
              if (lastOdo > firstOdo && adjLtrs > 0) {
                kmPerL = (lastOdo - firstOdo) / adjLtrs;
              }
            } else if (vFuel.length === 1 && vFuel[0].odometer > 0 && adjLtrs > 0) {
               kmPerL = 0; // Not enough data for one fill to calculate accurate distance.
            }

            const ltrsTrip = tripsCount > 0 ? (adjLtrs / tripsCount) : 0;
            const ltrsMt = net > 0 ? (adjLtrs / net) : 0;

            return [
              plate, 
              fmt3(net), 
              tripsCount.toString(), 
              fmt3(adjLtrs), 
              fmt0(amtRs), 
              fmt3(ltrsTrip), 
              fmt3(ltrsMt), 
              kmPerL > 0 ? fmt3(kmPerL) : '--'
            ];
          }),
        ];
        
        const wsD = XLSX.utils.aoa_to_sheet(dRows);
        wsD['!cols'] = [{ wch: 18 }, { wch: 18 }, { wch: 10 }, { wch: 15 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }];
        for (let c = 0; c < 8; c++) {
          const ref = XLSX.utils.encode_cell({ r: 0, c });
          if (wsD[ref]) wsD[ref].s = STYLE.headerDark;
        }
        XLSX.utils.book_append_sheet(wb, wsD, 'Diesel Analytics');
      }

      /* ── Sheet 4: Vehicle Summary ─── */
      if (sections.vehicleSummary) {
        const byTruck = groupBy(filteredLogs, (l: MiningLog) => trucks.find(t => t.id === l.truckId)?.plateNumber || 'Unknown');
        const vRows = [
          ['Vehicle No.', 'Trips', 'Total Net (MT)', 'Shortage (MT)', 'Avg Load/Trip'],
          ...Object.entries(byTruck).map(([plate, items]) => {
            const vLogs = items as MiningLog[];
            const net = vLogs.reduce((s, l) => s + (l.net || (l.gross && l.tare ? l.gross - l.tare : 0) || 0), 0);
            const sh = vLogs.reduce((s, l) => s + (l.shortageWt || 0), 0);
            return [plate, vLogs.length.toString(), fmt3(net), fmt3(sh), fmt3(vLogs.length > 0 ? net / vLogs.length : 0)];
          }),
        ];
        const wsV = XLSX.utils.aoa_to_sheet(vRows);
        wsV['!cols'] = [{ wch: 18 }, { wch: 10 }, { wch: 18 }, { wch: 15 }, { wch: 15 }];
        for (let c = 0; c < 5; c++) {
          const ref = XLSX.utils.encode_cell({ r: 0, c });
          if (wsV[ref]) wsV[ref].s = STYLE.headerDark;
        }
        XLSX.utils.book_append_sheet(wb, wsV, 'Vehicle Summary');
      }

      /* ── Sheet 5: Customer Summary ─── */
      if (sections.customerSummary) {
        const byCust = groupBy(filteredLogs, (l: MiningLog) => l.customerName || 'Unknown');
        const cRows = [
          ['Customer', 'Trips', 'Total Net (MT)', 'Shortage (MT)', 'Avg Load/Trip'],
          ...Object.entries(byCust).map(([cust, items]) => {
            const cLogs = items as MiningLog[];
            const net = cLogs.reduce((s, l) => s + (l.net || (l.gross && l.tare ? l.gross - l.tare : 0) || 0), 0);
            const sh = cLogs.reduce((s, l) => s + (l.shortageWt || 0), 0);
            return [cust, cLogs.length.toString(), fmt3(net), fmt3(sh), fmt3(cLogs.length > 0 ? net / cLogs.length : 0)];
          }),
        ];
        const wsC = XLSX.utils.aoa_to_sheet(cRows);
        wsC['!cols'] = [{ wch: 25 }, { wch: 10 }, { wch: 18 }, { wch: 15 }, { wch: 15 }];
        for (let c = 0; c < 5; c++) {
          const ref = XLSX.utils.encode_cell({ r: 0, c });
          if (wsC[ref]) wsC[ref].s = STYLE.headerAmber;
        }
        XLSX.utils.book_append_sheet(wb, wsC, 'Customer Summary');
      }

      /* ── Sheet 6: Agent Summary ─── */
      if (sections.agentSummary) {
        const byAgent = groupBy(filteredLogs, (l: MiningLog) => l.cartingAgent || 'Unknown');
        const aRows = [
          ['Carting Agent', 'Trips', 'Total Net (MT)', 'Shortage (MT)'],
          ...Object.entries(byAgent).map(([agent, items]) => {
            const aLogs = items as MiningLog[];
            const net = aLogs.reduce((s, l) => s + (l.net || (l.gross && l.tare ? l.gross - l.tare : 0) || 0), 0);
            const sh = aLogs.reduce((s, l) => s + (l.shortageWt || 0), 0);
            return [agent, aLogs.length.toString(), fmt3(net), fmt3(sh)];
          }),
        ];
        const wsA = XLSX.utils.aoa_to_sheet(aRows);
        wsA['!cols'] = [{ wch: 25 }, { wch: 10 }, { wch: 18 }, { wch: 15 }];
        for (let c = 0; c < 4; c++) {
          const ref = XLSX.utils.encode_cell({ r: 0, c });
          if (wsA[ref]) wsA[ref].s = STYLE.headerDark;
        }
        XLSX.utils.book_append_sheet(wb, wsA, 'Agent Summary');
      }

      const filename = `Mining_Report_${startDate || 'ALL'}_to_${endDate || 'ALL'}.xlsx`;
      XLSX.writeFile(wb, filename);
    } finally {
      setIsGenerating(false);
    }
  };

  /* ────────────────────── PDF EXPORT ────────────────────────────────────── */
  const handlePDFExport = async () => {
    setIsGenerating(true);
    try {
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const pageW = doc.internal.pageSize.getWidth();

      const addHeader = (title: string) => {
        doc.setFillColor(15, 23, 42);
        doc.rect(10, 8, pageW - 20, 12, 'F');
        doc.setFontSize(12);
        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.text('MINING OPERATIONS REPORT', 14, 16);
        doc.setFontSize(9);
        doc.setTextColor(245, 158, 11);
        doc.text(title, pageW - 14, 16, { align: 'right' });
        doc.setFontSize(7.5);
        doc.setTextColor(100, 116, 139);
        doc.text(`Period: ${startDate || 'All'} → ${endDate || 'All'} | Trips: ${filteredLogs.length} | Net Wt: ${fmt3(stats.totalNet)} MT`, 14, 24);
        return 28;
      };

      /* ── Page 1: Trip Details ─── */
      if (sections.tripDetails) {
        let y = addHeader('TRIP DETAILS');
        const headers = activeColumns.map(k => COLUMN_LABELS[k]);
        const rows = filteredLogs.map(buildRow);
        const netWt = fmt3(stats.totalNet);
        const shortage = fmt3(stats.totalShortage);

        autoTable(doc, {
          startY: y,
          head: [headers],
          body: rows,
          foot: [[...new Array(Math.max(0, activeColumns.indexOf('netWt'))).fill(''), netWt, ...new Array(Math.max(0, activeColumns.length - activeColumns.indexOf('netWt') - 1)).fill('')]],
          margin: { left: 10, right: 10 },
          styles: { fontSize: 6.5, cellPadding: 2, lineColor: [226, 232, 240], lineWidth: 0.1 },
          headStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: 'bold', fontSize: 6.5, halign: 'center' },
          footStyles: { fillColor: [245, 158, 11], textColor: [0, 0, 0], fontStyle: 'bold', halign: 'center' },
          alternateRowStyles: { fillColor: [248, 250, 252] },
          columnStyles: { 0: { cellWidth: 18 } },
          didDrawPage: () => {
            doc.setFontSize(7);
            doc.setTextColor(150);
            doc.text(`Page ${(doc as any).internal.getCurrentPageInfo().pageNumber}`, pageW / 2, doc.internal.pageSize.getHeight() - 5, { align: 'center' });
          }
        });
      }

      /* ── Page 2: MTD Analytics ─── */
      if (sections.mtdAnalytics && mtd) {
        doc.addPage();
        let y = addHeader('MTD ANALYTICS');

        autoTable(doc, {
          startY: y,
          head: [['Metric', 'Category', mtd.r1Label, mtd.r2Label, 'Period Total']],
          body: [
            ['Tonnage', 'Net Weight (MT)', fmt3(mtd.s1.netWt), fmt3(mtd.s2.netWt), fmt3(mtd.s1.netWt + mtd.s2.netWt)],
            ['', 'Avg Load/Trip (MT)', fmt3(mtd.s1.avgLoad), fmt3(mtd.s2.avgLoad), ''],
            ['Trips', 'Total Trips', fmt0(mtd.s1.trips), fmt0(mtd.s2.trips), fmt0(mtd.s1.trips + mtd.s2.trips)],
            ['Shortage', 'Total Shortage (MT)', fmt3(mtd.s1.shortage), fmt3(mtd.s2.shortage), fmt3(mtd.s1.shortage + mtd.s2.shortage)],
          ],
          margin: { left: 10, right: 10 },
          styles: { fontSize: 9, cellPadding: 4 },
          headStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: 'bold' },
          columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right', fillColor: [255, 251, 235] }, 4: { halign: 'right', fontStyle: 'bold' } },
        });
      }

      /* ── Page 3: Summaries ─── */
      if (sections.materialSummary || sections.vehicleSummary || sections.customerSummary || sections.agentSummary) {
        doc.addPage();
        let y = addHeader('SUMMARY BREAKDOWN');

        if (sections.materialSummary) {
          const byMat = groupBy(filteredLogs, (l: MiningLog) => l.material || 'Unknown');
          autoTable(doc, {
            startY: y, margin: { left: 10, right: 10 },
            head: [['Material', 'Trips', 'Net Wt (MT)', 'Shortage (MT)', 'Avg/Trip']],
            body: Object.entries(byMat).map(([mat, items]) => {
              const mLogs = items as MiningLog[];
              const net = mLogs.reduce((s, l) => s + (l.net || (l.gross && l.tare ? l.gross - l.tare : 0) || 0), 0);
              return [mat, mLogs.length.toString(), fmt3(net), fmt3(mLogs.reduce((s, l) => s + (l.shortageWt || 0), 0)), fmt3(mLogs.length > 0 ? net / mLogs.length : 0)];
            }),
            styles: { fontSize: 8 }, headStyles: { fillColor: [245, 158, 11], textColor: [0, 0, 0], fontStyle: 'bold' },
            didDrawPage: (data) => { y = (data.cursor?.y || y) + 8; }
          });
        }
        if (sections.dieselAnalytics) {
          const byTruck = groupBy(filteredLogs, (l: MiningLog) => trucks.find(t => t.id === l.truckId)?.plateNumber || 'Unknown');
          autoTable(doc, {
            startY: (doc as any).lastAutoTable?.finalY ? (doc as any).lastAutoTable.finalY + 8 : y,
            margin: { left: 10, right: 10 },
            head: [['Vehicle No.', 'Net Wt (MT)', 'Trips', 'Diesel (Ltrs)', 'Amt (₹)', 'Ltrs/Trip', 'Ltrs/MT', 'KM/L']],
            body: Object.entries(byTruck).map(([plate, items]) => {
              const vLogs = items as MiningLog[];
              const trkId = vLogs[0]?.truckId;
              const net = vLogs.reduce((s, l) => s + (l.net || (l.gross && l.tare ? l.gross - l.tare : 0) || 0), 0);
              const tripsCount = vLogs.length;

              const vFuel = fuelLogs.filter(f => f.vehicleId === trkId && f.date >= startDate && f.date <= endDate);
              
              let advTaken = 0, advGiven = 0;
              vLogs.forEach(l => {
                if (l.advanceFromYesterday && l.date === startDate) advTaken += l.advanceFromYesterday;
                if (l.advanceFromYesterday && l.date === endDate) advGiven += l.advanceFromYesterday;
              });

              const rawFuelLtrs = vFuel.reduce((s, f) => s + f.liters, 0);
              const amtRs = vFuel.reduce((s, f) => s + f.amount, 0);
              const adjLtrs = (rawFuelLtrs + advTaken) - advGiven;
              
              let kmPerL = 0;
              if (vFuel.length > 1) {
                const sortedFuel = [...vFuel].sort((a,b) => a.date.localeCompare(b.date));
                const firstOdo = sortedFuel[0].odometer;
                const lastOdo = sortedFuel[sortedFuel.length - 1].odometer;
                if (lastOdo > firstOdo && adjLtrs > 0) {
                  kmPerL = (lastOdo - firstOdo) / adjLtrs;
                }
              }

              const ltrsTrip = tripsCount > 0 ? (adjLtrs / tripsCount) : 0;
              const ltrsMt = net > 0 ? (adjLtrs / net) : 0;

              return [
                plate, 
                fmt3(net), 
                tripsCount.toString(), 
                fmt3(adjLtrs), 
                fmt0(amtRs), 
                fmt3(ltrsTrip), 
                fmt3(ltrsMt), 
                kmPerL > 0 ? fmt3(kmPerL) : '--'
              ];
            }),
            styles: { fontSize: 8 }, headStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: 'bold' },
          });
        }
        if (sections.vehicleSummary) {
          const byTruck = groupBy(filteredLogs, (l: MiningLog) => trucks.find(t => t.id === l.truckId)?.plateNumber || 'Unknown');
          autoTable(doc, {
            startY: (doc as any).lastAutoTable?.finalY ? (doc as any).lastAutoTable.finalY + 8 : y,
            margin: { left: 10, right: 10 },
            head: [['Vehicle No.', 'Trips', 'Net Wt (MT)', 'Shortage (MT)', 'Avg/Trip']],
            body: Object.entries(byTruck).map(([plate, items]) => {
              const vLogs = items as MiningLog[];
              const net = vLogs.reduce((s, l) => s + (l.net || (l.gross && l.tare ? l.gross - l.tare : 0) || 0), 0);
              return [plate, vLogs.length.toString(), fmt3(net), fmt3(vLogs.reduce((s, l) => s + (l.shortageWt || 0), 0)), fmt3(vLogs.length > 0 ? net / vLogs.length : 0)];
            }),
            styles: { fontSize: 8 }, headStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: 'bold' },
          });
        }
        if (sections.customerSummary) {
          const byCust = groupBy(filteredLogs, (l: MiningLog) => l.customerName || 'Unknown');
          autoTable(doc, {
            startY: (doc as any).lastAutoTable?.finalY ? (doc as any).lastAutoTable.finalY + 8 : y,
            margin: { left: 10, right: 10 },
            head: [['Customer', 'Trips', 'Net Wt (MT)', 'Shortage (MT)']],
            body: Object.entries(byCust).map(([cust, items]) => {
              const cLogs = items as MiningLog[];
              const net = cLogs.reduce((s, l) => s + (l.net || (l.gross && l.tare ? l.gross - l.tare : 0) || 0), 0);
              return [cust, cLogs.length.toString(), fmt3(net), fmt3(cLogs.reduce((s, l) => s + (l.shortageWt || 0), 0))];
            }),
            styles: { fontSize: 8 }, headStyles: { fillColor: [245, 158, 11], textColor: [0, 0, 0], fontStyle: 'bold' },
          });
        }
      }

      doc.save(`Mining_Report_${startDate || 'ALL'}_to_${endDate || 'ALL'}.pdf`);
    } finally {
      setIsGenerating(false);
    }
  };

  /* ── Toggle helpers ───────────────────────────────────────────────────── */
  const toggleCol = (k: string) => setColumns(prev => ({ ...prev, [k]: !prev[k] }));
  const toggleSec = (k: string) => setSections(prev => ({ ...prev, [k]: !prev[k] }));
  const selectAllCols = (on: boolean) => setColumns(Object.fromEntries(Object.keys(columns).map(k => [k, on])));

  const Toggle: React.FC<{ label: string; on: boolean; onClick: () => void; color?: string }> = ({ label, on, onClick, color = 'amber' }) => (
    <button onClick={onClick}
      className={`flex items-center gap-2 px-3 py-2 rounded-xl border font-bold text-[10px] uppercase transition-all ${on
        ? color === 'amber' ? 'bg-amber-50 border-amber-400 text-amber-700' : 'bg-slate-900 border-slate-900 text-white'
        : 'bg-white border-slate-200 text-slate-400 hover:border-slate-300'}`}>
      <span className={`w-3 h-3 rounded-sm border ${on ? 'bg-current border-current' : 'border-slate-300'}`}>
        {on && <svg viewBox="0 0 12 12" className="w-3 h-3 text-current fill-current"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" fill="none"/></svg>}
      </span>
      {label}
    </button>
  );

  return (
    <div className="space-y-6 animate-fadeIn w-full max-w-full overflow-x-hidden">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 px-1">
        <div className="flex items-center gap-4">
          {onBack && (
            <button 
              onClick={onBack}
              className="w-12 h-12 flex items-center justify-center bg-white border border-slate-200 rounded-2xl text-slate-400 hover:text-slate-900 hover:border-slate-900 transition-all active:scale-95 shadow-sm"
            >
              <span className="text-xl">←</span>
            </button>
          )}
          <div>
            <h2 className="text-2xl font-black text-slate-800 tracking-tight">Mining Reports Engine</h2>
            <p className="text-slate-500 text-sm font-medium">Configurable export with MTD analytics — PDF & Excel</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowConfig(!showConfig)}
            className={`px-5 py-2.5 rounded-xl font-black text-xs uppercase transition-all border ${showConfig ? 'bg-slate-900 text-white border-slate-900' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-400'}`}>
            ⚙ {showConfig ? 'Hide' : 'Configure'} Report
          </button>
          <button onClick={handleExcelExport} disabled={isGenerating || filteredLogs.length === 0}
            className="px-5 py-2.5 rounded-xl font-black text-xs uppercase bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-all active:scale-95 shadow-lg">
            {isGenerating ? '⏳ Generating…' : '⬇ Excel'}
          </button>
          <button onClick={handlePDFExport} disabled={isGenerating || filteredLogs.length === 0}
            className="px-5 py-2.5 rounded-xl font-black text-xs uppercase bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50 transition-all active:scale-95 shadow-lg">
            {isGenerating ? '⏳ Generating…' : '⬇ PDF'}
          </button>
        </div>
      </div>

      {/* ── Filters ────────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-3xl border border-slate-100 p-6 shadow-sm">
        <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Filters</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
          <div className="space-y-1">
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Start Date</label>
            <input type="date" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-amber-500 transition-all"
              value={startDate} onChange={e => setStartDate(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">End Date (MTD)</label>
            <input type="date" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-amber-500 transition-all"
              value={endDate} onChange={e => setEndDate(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Type</label>
            <select className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-amber-500 transition-all"
              value={typeFilter} onChange={e => setTypeFilter(e.target.value as any)}>
              <option value="all">All Types</option>
              <option value="DISPATCH">Dispatch</option>
              <option value="PURCHASE">Purchase</option>
            </select>
          </div>

          {/* New Specific Filters */}
          <div className="space-y-1">
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Vehicle</label>
            <select className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-amber-500 transition-all"
              value={truckIdFilter} onChange={e => setTruckIdFilter(e.target.value)}>
              <option value="">— All Vehicles —</option>
              {trucks.filter(t => t.fleetType === 'MINING').map(t => (
                <option key={t.id} value={t.id}>{t.plateNumber}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Operator/Driver</label>
            <select className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-amber-500 transition-all"
              value={driverIdFilter} onChange={e => setDriverIdFilter(e.target.value)}>
              <option value="">— All Operators —</option>
              {drivers.sort((a,b) => a.name.localeCompare(b.name)).map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Material</label>
            <select className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-amber-500 transition-all"
              value={materialFilter} onChange={e => setMaterialFilter(e.target.value)}>
              <option value="">— All Materials —</option>
              {masterData.materials.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Customer</label>
            <select className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-amber-500 transition-all"
              value={customerFilter} onChange={e => setCustomerFilter(e.target.value)}>
              <option value="">— All Customers —</option>
              {masterData.customers.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Supplier</label>
            <select className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-amber-500 transition-all"
              value={supplierFilter} onChange={e => setSupplierFilter(e.target.value)}>
              <option value="">— All Suppliers —</option>
              {masterData.suppliers.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Grouping (Legacy)</label>
            <select className="w-full p-3 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-amber-500 transition-all"
              value={dimension} onChange={e => { setDimension(e.target.value as DimensionKey); setDimensionValue(''); }}>
              <option value="all">None</option>
              <option value="vehicle">By Vehicle</option>
              <option value="customer">By Customer</option>
              <option value="material">By Material</option>
              <option value="driver">By Driver</option>
              <option value="agent">By Carting Agent</option>
            </select>
          </div>
          {dimension !== 'all' && (
            <div className="space-y-1 animate-fadeIn">
              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Group Value</label>
              <select className="w-full p-3 bg-amber-50 border border-amber-300 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-amber-500"
                value={dimensionValue} onChange={e => setDimensionValue(e.target.value)}>
                <option value="">— All —</option>
                {dimensionOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* ── Config Panel ───────────────────────────────────────────────────── */}
      {showConfig && (
        <div className="bg-white rounded-3xl border border-slate-100 p-6 shadow-sm space-y-6">
          {/* Column Selection */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Columns to Include</h3>
              <div className="flex gap-2">
                <button onClick={() => selectAllCols(true)} className="text-[9px] font-black text-amber-600 uppercase hover:text-amber-800">Select All</button>
                <span className="text-slate-300">|</span>
                <button onClick={() => selectAllCols(false)} className="text-[9px] font-black text-slate-400 uppercase hover:text-slate-600">Clear All</button>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
              {Object.keys(columns).map(k => (
                <Toggle key={k} label={COLUMN_LABELS[k]} on={columns[k]} onClick={() => toggleCol(k)} />
              ))}
            </div>
          </div>

          {/* Section Selection */}
          <div>
            <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">Report Sections to Generate</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {Object.entries({ tripDetails: 'Trip Details', mtdAnalytics: 'MTD Analytics', materialSummary: 'Material Summary', vehicleSummary: 'Vehicle Summary', customerSummary: 'Customer Summary', agentSummary: 'Agent Summary' }).map(([k, label]) => (
                <Toggle key={k} label={label} on={sections[k]} onClick={() => toggleSec(k)} color="dark" />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Stats Preview ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Matching Trips', val: stats.trips.toString(), color: 'slate' },
          { label: 'Total Net Wt (MT)', val: fmt3(stats.totalNet), color: 'amber' },
          { label: 'Total Shortage (MT)', val: fmt3(stats.totalShortage), color: stats.totalShortage > 0 ? 'rose' : 'emerald' },
          { label: 'Vehicles Involved', val: stats.vehicles.toString(), color: 'blue' },
        ].map(({ label, val, color }) => (
          <div key={label} className={`bg-white rounded-3xl border p-5 shadow-sm ${color === 'rose' ? 'border-rose-100' : color === 'emerald' ? 'border-emerald-100' : color === 'amber' ? 'border-amber-100' : 'border-slate-100'}`}>
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</p>
            <p className={`text-3xl font-black mt-1 font-mono ${color === 'rose' ? 'text-rose-600' : color === 'emerald' ? 'text-emerald-600' : color === 'amber' ? 'text-amber-600' : 'text-slate-900'}`}>{val}</p>
          </div>
        ))}
      </div>

      {/* ── MTD Preview Card ──────────────────────────────────────────────── */}
      {mtd && sections.mtdAnalytics && (
        <div className="bg-slate-900 rounded-3xl p-6 text-white">
          <p className="text-[9px] text-amber-500 font-black uppercase tracking-widest mb-4">MTD Analytics Preview · Anchor: {formatDate(endDate)}</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {[
              { label: 'Net Tonnage', r1: fmt3(mtd.s1.netWt), r2: fmt3(mtd.s2.netWt), unit: 'MT' },
              { label: 'Total Trips', r1: fmt0(mtd.s1.trips), r2: fmt0(mtd.s2.trips), unit: '' },
              { label: 'Shortage', r1: fmt3(mtd.s1.shortage), r2: fmt3(mtd.s2.shortage), unit: 'MT' },
            ].map(m => (
              <div key={m.label} className="bg-white/5 rounded-2xl p-4">
                <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest mb-2">{m.label}</p>
                <div className="flex gap-4">
                  <div>
                    <p className="text-[8px] text-amber-400 font-bold">{mtd.r1Label}</p>
                    <p className="text-xl font-black font-mono">{m.r1} <span className="text-xs text-slate-400">{m.unit}</span></p>
                  </div>
                  <div className="w-px bg-white/10" />
                  <div>
                    <p className="text-[8px] text-emerald-400 font-bold">{mtd.r2Label}</p>
                    <p className="text-xl font-black font-mono">{m.r2} <span className="text-xs text-slate-400">{m.unit}</span></p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Live Data Preview Table ─────────────────────────────────────────── */}
      <div className="bg-white rounded-3xl border border-slate-100 overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-slate-50 flex items-center justify-between">
          <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest">
            Data Preview <span className="text-amber-500 ml-2">{filteredLogs.length} trips</span>
          </h3>
          <span className="text-[9px] text-slate-400 font-bold">(Showing first 50 rows)</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[10px]">
            <thead className="bg-slate-900 text-slate-300 font-black uppercase tracking-widest">
              <tr>
                {activeColumns.map(k => (
                  <th key={k} className="px-4 py-3 whitespace-nowrap text-left">{COLUMN_LABELS[k]}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredLogs.slice(0, 50).map((log, i) => {
                const row = buildRow(log);
                return (
                  <tr key={log.id} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}>
                    {row.map((cell, ci) => (
                      <td key={ci} className={`px-4 py-2.5 whitespace-nowrap font-medium ${
                        activeColumns[ci] === 'shortage' && parseFloat(cell) > 0.01 ? 'text-rose-600 font-black' :
                        activeColumns[ci] === 'netWt' ? 'font-black text-slate-900' :
                        activeColumns[ci] === 'vehicle' ? 'font-black font-mono text-slate-900' :
                        'text-slate-600'
                      }`}>{cell || '—'}</td>
                    ))}
                  </tr>
                );
              })}
              {filteredLogs.length === 0 && (
                <tr><td colSpan={activeColumns.length} className="py-16 text-center text-slate-300 font-black uppercase tracking-widest">No data matches your filters</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default MiningReports;
