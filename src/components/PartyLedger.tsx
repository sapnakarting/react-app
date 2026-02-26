import React, { useState, useMemo, useEffect } from 'react';
import { DieselParty, PartyDieselTransaction, FuelLog, MasterData, MiscFuelEntry, Truck } from '../types';
import { dbService } from '../services/dbService';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx-js-style';

interface PartyLedgerProps {
  party: DieselParty;
  allParties: DieselParty[];
  transactions: PartyDieselTransaction[];
  fuelLogs: FuelLog[];
  masterData: MasterData;
  miscFuelEntries: MiscFuelEntry[];
  trucks: Truck[];
  onUpdate: () => void;
  onAddMiscFuelEntry: (entry: MiscFuelEntry) => Promise<void>;
  onDeleteTransaction: (tx: PartyDieselTransaction) => Promise<void>;
  onBack: () => void;
  onNavigateToParty: (id: string) => void;
}

const PartyLedger: React.FC<PartyLedgerProps> = ({ 
  party, allParties, transactions, fuelLogs, masterData, miscFuelEntries, trucks, onUpdate, onAddMiscFuelEntry, onDeleteTransaction, onBack, onNavigateToParty 
}) => {
  const [showTxModal, setShowTxModal] = useState(false);
  const [editingTx, setEditingTx] = useState<PartyDieselTransaction | null>(null);
  const [txType, setTxType] = useState<PartyDieselTransaction['type']>('BORROW');
  const [liters, setLiters] = useState('');
  const [price, setPrice] = useState('');
  const [amount, setAmount] = useState('');
  const [sourceId, setSourceId] = useState(''); // Tanker ID for Settlements/Receivals
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [remarks, setRemarks] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Filter States
  const [searchTerm, setSearchTerm] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [filterType, setFilterType] = useState<'ALL' | 'BORROW' | 'SETTLE' | 'RECV'>('ALL');

  const isSupplier = party.type === 'SUPPLIER';

  // Load editing transaction data
  useEffect(() => {
    if (editingTx) {
      setTxType(editingTx.type);
      setLiters(editingTx.fuelLiters?.toString() || '');
      setPrice(editingTx.dieselPrice?.toString() || '');
      setAmount(editingTx.amount?.toString() || '');
      setSourceId(editingTx.sourceId || editingTx.destTankerId || '');
      setDate(editingTx.date);
      setRemarks(editingTx.remarks || '');
    } else {
      setLiters(''); setPrice(''); setAmount(''); setSourceId('');
      setDate(new Date().toISOString().split('T')[0]);
      setRemarks('');
    }
  }, [editingTx, showTxModal]);

  // Combined Ledger logic
  const partyTransactions = useMemo(() => {
    const list = transactions
      .filter(t => t.partyId === party.id)
      .map(t => {
        let desc = '';
        if (t.type === 'BORROW') {
          const log = fuelLogs.find(l => l.id === t.fuelLogId);
          if (log) {
            const truck = trucks.find(tr => tr.id === log.truckId);
            desc = `Fleet Fueling: ${truck?.plateNumber || 'Unknown'}`;
            // Fall back to fuel log's price/liters if the transaction is missing them
            return {
              ...t,
              description: desc,
              dieselPrice: t.dieselPrice || log.dieselPrice,
              fuelLiters: t.fuelLiters || log.fuelLiters,
              amount: t.amount || ((log.fuelLiters || 0) * (log.dieselPrice || 0))
            };
          } else {
            desc = isSupplier ? 'Manual Borrow (Personal/Office)' : 'Stock Received from Customer';
          }
        } else if (t.type === 'SETTLE_LITERS') {
          const tanker = masterData.fuelStations.find(s => s.id === t.sourceId);
          desc = isSupplier ? `Repaid in Liters (from ${tanker?.name || 'Tanker'})` : `Settled Liters (from ${tanker?.name || 'Tanker'})`;
        } else if (t.type === 'SETTLE_CASH') {
          desc = isSupplier ? 'Cash Payment Made' : 'Cash Settlement (Received)';
        } else if (t.type === 'DIESEL_RECEIVED') {
          const tanker = masterData.fuelStations.find(s => s.id === t.destTankerId);
          desc = `Diesel Received (into ${tanker?.name || 'Tanker'})`;
        }
        return { ...t, description: desc };
      });

    return list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [transactions, party.id, fuelLogs, trucks, masterData.fuelStations]);

  const filteredLedger = useMemo(() => {
    return partyTransactions.filter(t => {
      const matchesSearch = t.description.toLowerCase().includes(searchTerm.toLowerCase()) || (t.remarks || '').toLowerCase().includes(searchTerm.toLowerCase());
      const matchesType = filterType === 'ALL' || 
                         (filterType === 'BORROW' && t.type === 'BORROW') ||
                         (filterType === 'SETTLE' && (t.type === 'SETTLE_LITERS' || t.type === 'SETTLE_CASH')) ||
                         (filterType === 'RECV' && t.type === 'DIESEL_RECEIVED');
      const matchesStart = !startDate || new Date(t.date) >= new Date(startDate);
      const matchesEnd = !endDate || new Date(t.date) <= new Date(endDate);
      return matchesSearch && matchesType && matchesStart && matchesEnd;
    });
  }, [partyTransactions, searchTerm, filterType, startDate, endDate]);

  const stats = useMemo(() => {
    const borrowItems = partyTransactions.filter(t => t.type === 'BORROW');
    const settleLiterItems = partyTransactions.filter(t => t.type === 'SETTLE_LITERS');
    const settleCashItems = partyTransactions.filter(t => t.type === 'SETTLE_CASH');
    const receivedItems = partyTransactions.filter(t => t.type === 'DIESEL_RECEIVED');

    let totalDebitLiters = 0, totalDebitAmount = 0;
    let totalCreditLiters = 0, totalCreditAmount = 0;

    // Simplified Accounting Logic for both Supplier & Customer:
    // Debit (+) = Receiving Diesel (BORROW / DIESEL_RECEIVED) - Increases Stock/Asset
    // Credit (-) = Settlement (SETTLE_CASH / SETTLE_LITERS) - Decreases Asset or Liability
    
    totalDebitLiters = borrowItems.reduce((sum, t) => sum + (t.fuelLiters || 0), 0) +
                       receivedItems.reduce((sum, t) => sum + (t.fuelLiters || 0), 0);
    totalDebitAmount = borrowItems.reduce((sum, t) => sum + (t.amount || 0), 0) +
                       receivedItems.reduce((sum, t) => sum + (t.amount || 0), 0);

    // Credit logic (Settlements)
    const cashEquivLiters = settleCashItems.reduce((sum, t) => {
      if (t.fuelLiters) return sum + t.fuelLiters;
      const p = t.dieselPrice || 0;
      return sum + (p > 0 ? (t.amount || 0) / p : 0);
    }, 0);

    totalCreditLiters = settleLiterItems.reduce((sum, t) => sum + (t.fuelLiters || 0), 0) + cashEquivLiters;
    totalCreditAmount = settleLiterItems.reduce((sum, t) => sum + (t.amount || 0), 0) +
                      settleCashItems.reduce((sum, t) => sum + (t.amount || 0), 0);

    // Supplier-specific aggregates
    const totalBorrowedLiters = borrowItems.reduce((sum, t) => sum + (t.fuelLiters || 0), 0);
    const totalReturnedLiters = settleLiterItems.reduce((sum, t) => sum + (t.fuelLiters || 0), 0);
    const totalCashPaid = settleCashItems.reduce((sum, t) => sum + (t.amount || 0), 0);
    const totalBorrowedAmount = borrowItems.reduce((sum, t) => sum + (t.amount || 0), 0);
    const totalReturnedAmount = settleLiterItems.reduce((sum, t) => sum + (t.amount || 0), 0);

    // Customer-specific aggregates
    const totalReceivedLiters = receivedItems.reduce((sum, t) => sum + (t.fuelLiters || 0), 0) +
                                borrowItems.reduce((sum, t) => sum + (t.fuelLiters || 0), 0);
    const totalReceivedAmount = receivedItems.reduce((sum, t) => sum + (t.amount || 0), 0) +
                                borrowItems.reduce((sum, t) => sum + (t.amount || 0), 0);

    return {
      // Table totals
      totalDebitLiters,
      totalDebitAmount,
      totalCreditLiters,
      totalCreditAmount,

      // Supplier metrics
      totalBorrowedLiters,
      totalBorrowedAmount,
      totalReturnedLiters,
      totalReturnedAmount,
      totalCashPaid,
      netLitersOwed: totalDebitLiters - totalCreditLiters,
      netAmountOwed: totalDebitAmount - totalCreditAmount,

      // Customer metrics
      totalReceivedLiters,
      totalReceivedAmount,
    };
  }, [partyTransactions, isSupplier]);

  const handleSaveTransaction = async () => {
    if ((txType !== 'SETTLE_CASH' && !liters) || (txType === 'SETTLE_CASH' && !amount)) return;
    setIsSaving(true);
    try {
      let bridgeEntryId = editingTx?.bridgeEntryId;

      // Handle Bridge logic for MiscFuelEntry
      const isBridgeType = txType === 'SETTLE_LITERS' || txType === 'DIESEL_RECEIVED' || (!isSupplier && txType === 'BORROW');
      
      if (isBridgeType) {
        if (sourceId) {
          const typeLabel = txType === 'DIESEL_RECEIVED' || txType === 'BORROW' ? 'DIESEL_RECEIVED' : 'SETTLE_LITERS';
          const bridgeEntry: MiscFuelEntry = {
            id: bridgeEntryId || crypto.randomUUID(),
            stationId: sourceId, // sourceId is the tanker
            destinationStationId: (txType === 'DIESEL_RECEIVED' || txType === 'BORROW') ? sourceId : undefined,
            date,
            usageType: (txType === 'DIESEL_RECEIVED' || txType === 'BORROW') ? 'BULK_TRANSFER' : 'OTHER',
            fuelLiters: parseFloat(liters),
            dieselPrice: price ? parseFloat(price) : 0,
            amount: parseFloat(liters) * (price ? parseFloat(price) : 0),
            remarks: typeLabel === 'SETTLE_LITERS' 
              ? `Repayment to Supplier: ${party.name}. ${remarks}`
              : `Stock Received from Customer: ${party.name}. ${remarks}`,
            vehicleDescription: typeLabel === 'SETTLE_LITERS' ? 'Supplier Repayment' : 'Customer Inward'
          };

          if (bridgeEntryId) {
            await dbService.updateMiscFuelEntry(bridgeEntry);
          } else {
            bridgeEntryId = bridgeEntry.id;
            await dbService.addMiscFuelEntry(bridgeEntry);
          }
        }
      } else if (bridgeEntryId) {
          // If changed from bridge tx to non-bridge tx, delete the old bridge entry
          await dbService.deleteMiscFuelEntry(bridgeEntryId);
          bridgeEntryId = undefined;
      }

      let calculatedLiters = liters ? parseFloat(liters) : undefined;
      const finalAmount = txType === 'SETTLE_CASH' 
        ? (amount ? parseFloat(amount) : undefined)
        : (liters && price ? parseFloat(liters) * parseFloat(price) : (amount ? parseFloat(amount) : undefined));

      // If it's a cash settlement, calculate liters from amount and price if available
      if (txType === 'SETTLE_CASH' && amount && price) {
        const p = parseFloat(price);
        const a = parseFloat(amount);
        if (p > 0) {
          calculatedLiters = a / p;
        }
      }

      const tx: Partial<PartyDieselTransaction> = {
        id: editingTx?.id || crypto.randomUUID(),
        partyId: party.id,
        date,
        type: txType,
        fuelLiters: calculatedLiters,
        dieselPrice: price ? parseFloat(price) : undefined,
        amount: finalAmount,
        sourceId: txType === 'SETTLE_LITERS' ? sourceId : undefined,
        destTankerId: txType === 'DIESEL_RECEIVED' ? sourceId : undefined,
        bridgeEntryId,
        remarks
      };

      if (editingTx) {
        await dbService.updatePartyTransaction(tx);
      } else {
        await dbService.addPartyTransaction(tx);
      }

      onUpdate();
      setShowTxModal(false);
      setEditingTx(null);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (t: PartyDieselTransaction) => {
    if (!confirm('Are you sure you want to delete this transaction? This will also remove any linked bridge entries.')) return;
    try {
      await onDeleteTransaction(t);
    } catch (err) {
      console.error(err);
      alert('Failed to delete transaction.');
    }
  };

  const handleExportPDF = () => {
    const doc = new jsPDF('l', 'mm', 'a4'); // landscape for more room
    const pageW = doc.internal.pageSize.getWidth();

    // ---- COMPANY HEADER ----
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, pageW, 30, 'F');
    doc.setFontSize(20); doc.setTextColor(255); doc.setFont("helvetica", "bold");
    doc.text("SAPNA CARTING", 14, 18);
    doc.setFontSize(9); doc.setTextColor(200);
    doc.text(`Diesel ${isSupplier ? 'Supplier' : 'Customer'} Ledger Statement`, 14, 25);
    doc.text(`Generated: ${new Date().toLocaleString()}`, pageW - 14, 18, { align: 'right' });

    // ---- PARTY DETAILS ----
    doc.setTextColor(15, 23, 42); doc.setFontSize(16); doc.setFont("helvetica", "bold");
    doc.text(`${party.name}`, 14, 42);
    doc.setFontSize(9); doc.setTextColor(80); doc.setFont("helvetica", "normal");
    doc.text(`Contact: ${party.contact || 'N/A'} | Phone: ${party.phone || 'N/A'} | Type: ${party.type}`, 14, 48);

    // ---- SUMMARY TABLE ----
    const summaryRows = isSupplier ? [
      ['Total Borrowed', `${stats.totalBorrowedLiters.toFixed(2)} L`, `Rs ${stats.totalBorrowedAmount.toLocaleString()}`],
      ['Total Returned (Diesel)', `${stats.totalReturnedLiters.toFixed(2)} L`, `Rs ${stats.totalReturnedAmount.toLocaleString()}`],
      ['Total Cash Paid', `${(stats.totalCreditLiters - stats.totalReturnedLiters).toFixed(2)} L (Equiv)`, `Rs ${stats.totalCashPaid.toLocaleString()}`],
      [stats.netLitersOwed > 0 ? 'Net Liters Owed' : 'Advance Liters', `${Math.abs(stats.netLitersOwed).toFixed(2)} L`, stats.netLitersOwed > 0 ? 'Pending' : 'Advance'],
      [stats.netAmountOwed > 0 ? 'Net Amount Owed' : 'Advance Balance', '--', `Rs ${Math.abs(stats.netAmountOwed).toLocaleString()}${stats.netAmountOwed < 0 ? ' (ADV)' : ''}`]
    ] : [
      ['Diesel Received', `${stats.totalReceivedLiters.toFixed(2)} L`, `Rs ${stats.totalReceivedAmount.toLocaleString()}`],
      ['Cash Paid', `${(stats.totalDebitLiters - stats.totalCreditLiters).toFixed(2)} L (Equiv)`, `Rs ${stats.totalCashPaid.toLocaleString()}`],
      [stats.netLitersOwed > 0 ? 'Net Liter Balance' : 'Advance Balance (L)', `${Math.abs(stats.netLitersOwed).toFixed(2)} L`, stats.netLitersOwed > 0 ? 'Pending' : 'Advance'],
      [stats.netAmountOwed > 0 ? 'Net Amount Owed' : 'Advance Amount', '--', `Rs ${Math.abs(stats.netAmountOwed).toLocaleString()}${stats.netAmountOwed < 0 ? ' (ADV)' : ''}`]
    ];

    autoTable(doc, {
      startY: 54,
      head: [['Metric', 'Liters', 'Amount (Rs)']],
      body: summaryRows,
      theme: 'grid',
      headStyles: { fillColor: [30, 58, 95], fontSize: 8, textColor: 255, fontStyle: 'bold', halign: 'center' },
      bodyStyles: { fontSize: 8, fontStyle: 'bold' },
      columnStyles: { 0: { cellWidth: 60 }, 1: { halign: 'right', cellWidth: 40 }, 2: { halign: 'right', cellWidth: 50 } },
      tableWidth: 150,
      margin: { left: 14 }
    });

    // ---- TRANSACTION TABLE ----
    const finalY = (doc as any).lastAutoTable?.finalY || 90;

    autoTable(doc, {
      startY: finalY + 8,
      head: [['#', 'Date', 'Description', 'Liters', 'Rate (Rs/L)', 'Debit (L & Rs)', 'Credit (L & Rs)', 'Remarks']],
      body: filteredLedger.map((t, i) => {
        const isDebit = t.type === 'BORROW' || t.type === 'DIESEL_RECEIVED';

        const debitCol = isDebit
          ? (t.fuelLiters ? `${t.fuelLiters} L\nRs ${(t.amount || 0).toLocaleString()}` : `Rs ${(t.amount || 0).toLocaleString()}`)
          : '--';
        const creditCol = !isDebit
          ? (t.fuelLiters ? `${t.fuelLiters} L\nRs ${(t.amount || 0).toLocaleString()}` : `Rs ${(t.amount || 0).toLocaleString()}`)
          : '--';

        return [
          (i + 1).toString(),
          t.date,
          t.description,
          t.fuelLiters ? `${t.fuelLiters} L` : '--',
          t.dieselPrice ? `Rs ${t.dieselPrice}` : '--',
          debitCol,
          creditCol,
          t.remarks || '--'
        ];
      }),
      theme: 'striped',
      headStyles: { fillColor: [15, 23, 42], fontSize: 7, textColor: 255, fontStyle: 'bold', halign: 'center' },
      bodyStyles: { fontSize: 7 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { cellWidth: 8, halign: 'center' },
        1: { cellWidth: 22 },
        2: { cellWidth: 55 },
        3: { cellWidth: 20, halign: 'right' },
        4: { cellWidth: 22, halign: 'right' },
        5: { cellWidth: 30, halign: 'right' },
        6: { cellWidth: 30, halign: 'right' },
        7: { cellWidth: 50, fontStyle: 'italic' }
      },
      foot: [[
        '', '', 'GRAND TOTALS', '',  '',
        `${stats.totalDebitLiters.toFixed(2)} L\nRs ${stats.totalDebitAmount.toLocaleString()}`,
        `${stats.totalCreditLiters.toFixed(2)} L\nRs ${stats.totalCreditAmount.toLocaleString()}`,
        ''
      ]],
      footStyles: { fillColor: [30, 41, 59], fontSize: 8, textColor: 255, fontStyle: 'bold', halign: 'right' },
    });

    // ---- FOOTER ----
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(7); doc.setTextColor(150);
      doc.text(`Page ${i} of ${pageCount} | SAPNA CARTING — Confidential`, pageW / 2, doc.internal.pageSize.getHeight() - 5, { align: 'center' });
    }

    doc.save(`${party.name.replace(/\s+/g, '_')}_Ledger_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const handleExportExcel = () => {
    const wb = XLSX.utils.book_new();
    
    // ---- STYLES ----
    const headerStyle = { font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 11 }, fill: { fgColor: { rgb: '0F172A' } }, alignment: { horizontal: 'center' as const } };
    const titleStyle = { font: { bold: true, sz: 18, color: { rgb: '0F172A' } } };
    const subtitleStyle = { font: { bold: true, sz: 10, color: { rgb: '64748B' } } };
    const metricLabel = { font: { bold: true, sz: 9, color: { rgb: '334155' } }, fill: { fgColor: { rgb: 'F1F5F9' } }};
    const metricValue = { font: { bold: true, sz: 10, color: { rgb: '0F172A' } }, alignment: { horizontal: 'right' as const } };
    const dataStyle = { font: { sz: 9 }, alignment: { vertical: 'center' as const, wrapText: true } };
    const debitStyle = { font: { bold: true, sz: 9, color: { rgb: 'DC2626' } }, alignment: { horizontal: 'right' as const } };
    const creditStyle = { font: { bold: true, sz: 9, color: { rgb: '059669' } }, alignment: { horizontal: 'right' as const } };
    const totalRowStyle = { font: { bold: true, sz: 10, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '1E293B' } }, alignment: { horizontal: 'right' as const } };

    // Build rows manually
    const rows: any[][] = [];
    
    // Row 0: Title
    rows.push(['SAPNA CARTING', '', '', '', '', '', '', '']);
    // Row 1: Subtitle
    rows.push([`${isSupplier ? 'Supplier' : 'Customer'} Diesel Ledger — ${party.name}`, '', '', '', '', '', '', '']);
    // Row 2: Contact
    rows.push([`Contact: ${party.contact || 'N/A'} | Phone: ${party.phone || 'N/A'} | Report: ${new Date().toLocaleString()}`, '', '', '', '', '', '', '']);
    // Row 3: blank
    rows.push([]);

    // Row 4: Summary header
    rows.push(['SUMMARY', '', 'LITERS', 'AMOUNT (Rs)']);
    if (isSupplier) {
      rows.push(['Total Borrowed', '', `${stats.totalBorrowedLiters.toFixed(2)}`, `${stats.totalBorrowedAmount}`]);
      rows.push(['Total Returned (Diesel)', '', `${stats.totalReturnedLiters.toFixed(2)}`, `${stats.totalReturnedAmount}`]);
      rows.push(['Total Cash Paid', '', `${(stats.totalCreditLiters - stats.totalReturnedLiters).toFixed(2)} L (Equiv)`, `${stats.totalCashPaid}`]);
      rows.push([stats.netLitersOwed > 0 ? 'Net Liters Owed' : 'Advance Liters', '', `${Math.abs(stats.netLitersOwed).toFixed(2)}`, stats.netLitersOwed > 0 ? 'Pending' : 'Advance']);
      rows.push([stats.netAmountOwed > 0 ? 'Net Amount Owed' : 'Advance Balance', '', '--', `${Math.abs(stats.netAmountOwed).toFixed(2)}`]);
    } else {
      rows.push(['Diesel Received', '', `${stats.totalReceivedLiters.toFixed(2)}`, `${stats.totalReceivedAmount}`]);
      rows.push(['Cash Paid', '', `${stats.totalCreditLiters.toFixed(2)} L (Equiv)`, `${stats.totalCashPaid}`]);
      rows.push(['Net Liter Balance', '', `${Math.abs(stats.totalDebitLiters - stats.totalCreditLiters).toFixed(2)}`, stats.netLitersOwed > 0 ? 'Liters Pending' : 'Liters Advance']);
      rows.push(['Net Amount Owed', '', '--', `${Math.abs(stats.netAmountOwed).toFixed(2)}`]);
    }
    // Blank row
    rows.push([]);

    // Transaction header row
    const txHeaderRow = rows.length;
    rows.push(['#', 'DATE', 'DESCRIPTION', 'LITERS', 'RATE (Rs/L)', 'DEBIT (L & Rs)', 'CREDIT (L & Rs)', 'REMARKS']);

    // Transaction data
    filteredLedger.forEach((t, i) => {
      const isDebit = t.type === 'BORROW' || t.type === 'DIESEL_RECEIVED';

      const debitCol = isDebit
        ? (t.fuelLiters ? `${t.fuelLiters} L / Rs ${(t.amount || 0).toLocaleString()}` : `Rs ${(t.amount || 0).toLocaleString()}`)
        : '--';
      const creditCol = !isDebit
        ? (t.fuelLiters ? `${t.fuelLiters} L / Rs ${(t.amount || 0).toLocaleString()}` : `Rs ${(t.amount || 0).toLocaleString()}`)
        : '--';

      rows.push([
        i + 1,
        t.date,
        t.description,
        t.fuelLiters || '--',
        t.dieselPrice || '--',
        debitCol,
        creditCol,
        t.remarks || '--'
      ]);
    });

    // Grand total row
    const totalRow = rows.length;
    rows.push([
      '', '', 'GRAND TOTALS', '', '',
      `${stats.totalDebitLiters.toFixed(2)} L / Rs ${stats.totalDebitAmount.toLocaleString()}`,
      `${stats.totalCreditLiters.toFixed(2)} L / Rs ${stats.totalCreditAmount.toLocaleString()}`,
      ''
    ]);

    // Create worksheet
    const ws = XLSX.utils.aoa_to_sheet(rows);

    // Apply styles
    // Title
    if (ws['A1']) ws['A1'].s = titleStyle;
    if (ws['A2']) ws['A2'].s = subtitleStyle;
    if (ws['A3']) ws['A3'].s = { font: { sz: 8, color: { rgb: '94A3B8' } } };

    // Summary header
    const summaryStart = 4;
    ['A', 'B', 'C', 'D'].forEach(col => {
      const cell = ws[`${col}${summaryStart + 1}`];
      if (cell) cell.s = { font: { bold: true, sz: 9, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '1E3A5F' } }, alignment: { horizontal: 'center' as const } };
    });

    // Summary rows
    for (let r = summaryStart + 1; r < txHeaderRow; r++) {
      const cellA = ws[`A${r + 1}`];
      if (cellA) cellA.s = metricLabel;
      ['C', 'D'].forEach(col => {
        const cell = ws[`${col}${r + 1}`];
        if (cell) cell.s = metricValue;
      });
    }

    // Transaction header
    ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].forEach(col => {
      const cell = ws[`${col}${txHeaderRow + 1}`];
      if (cell) cell.s = headerStyle;
    });

    // Transaction data rows
    for (let r = txHeaderRow + 1; r < totalRow; r++) {
      ['A', 'B', 'C', 'D', 'E', 'H'].forEach(col => {
        const cell = ws[`${col}${r + 1}`];
        if (cell) cell.s = { ...dataStyle, fill: r % 2 === 0 ? { fgColor: { rgb: 'F8FAFC' } } : undefined };
      });
      const fCell = ws[`F${r + 1}`];
      if (fCell && fCell.v !== '--') fCell.s = debitStyle;
      const gCell = ws[`G${r + 1}`];
      if (gCell && gCell.v !== '--') gCell.s = creditStyle;
    }

    // Grand total row
    ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].forEach(col => {
      const cell = ws[`${col}${totalRow + 1}`];
      if (cell) cell.s = totalRowStyle;
    });

    // Column widths
    ws['!cols'] = [
      { wch: 4 },   // #
      { wch: 12 },  // Date
      { wch: 35 },  // Description
      { wch: 12 },  // Liters
      { wch: 12 },  // Rate
      { wch: 22 },  // Debit
      { wch: 22 },  // Credit
      { wch: 30 },  // Remarks
    ];

    // Merge title cells
    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 7 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 7 } },
      { s: { r: 2, c: 0 }, e: { r: 2, c: 7 } },
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'Ledger');
    XLSX.writeFile(wb, `${party.name.replace(/\s+/g, '_')}_Ledger_${new Date().toISOString().split('T')[0]}.xlsx`);
  };


  return (
    <div className="space-y-6 animate-fadeIn pb-20">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <button onClick={onBack} className="text-slate-400 hover:text-slate-900 font-black text-[10px] uppercase tracking-widest flex items-center gap-1 transition-colors">
              ← All Parties
            </button>
            <span className="text-slate-200 text-xs">|</span>
            <div className="relative flex items-center gap-1">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Switch:</span>
              <select
                className="text-[10px] font-black text-slate-600 bg-slate-100 border-0 rounded-lg px-2 py-1 uppercase tracking-widest outline-none cursor-pointer hover:bg-amber-50 hover:text-amber-700 transition-all"
                value={party.id}
                onChange={e => onNavigateToParty(e.target.value)}
              >
                {allParties.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          </div>
          <h1 className="text-2xl sm:text-4xl font-black text-slate-900 uppercase tracking-tight flex items-center gap-3">
            <span className="text-3xl sm:text-4xl">🤝</span>
            {party.name} <span className="text-slate-300">LEDGER</span>
          </h1>
        </div>
        
        <div className="flex gap-2 w-full sm:w-auto">
          {isSupplier ? (
            <>
              <button 
                onClick={() => { setTxType('BORROW'); setEditingTx(null); setShowTxModal(true); }}
                className="bg-amber-600 hover:bg-amber-700 text-white px-6 py-4 rounded-[1.5rem] font-black uppercase text-xs tracking-widest shadow-xl active:scale-95 transition-all flex-1"
              >
                + Manual Borrow
              </button>
              <button 
                onClick={() => { setTxType('SETTLE_CASH'); setEditingTx(null); setShowTxModal(true); }}
                className="bg-slate-900 text-white px-6 py-4 rounded-[1.5rem] font-black uppercase text-xs tracking-widest shadow-xl active:scale-95 transition-all flex-1"
              >
                Pay Cash
              </button>
            </>
          ) : (
            <>
              <button 
                onClick={() => { setTxType('BORROW'); setEditingTx(null); setShowTxModal(true); }}
                className="bg-amber-600 hover:bg-amber-700 text-white px-6 py-4 rounded-[1.5rem] font-black uppercase text-xs tracking-widest shadow-xl active:scale-95 transition-all flex-1"
              >
                Manual Entry
              </button>
              <button 
                onClick={() => { setTxType('SETTLE_CASH'); setEditingTx(null); setShowTxModal(true); }}
                className="bg-slate-900 text-white px-6 py-4 rounded-[1.5rem] font-black uppercase text-xs tracking-widest shadow-xl active:scale-95 transition-all flex-1"
              >
                Settle Cash
              </button>
            </>
          )}
        </div>
      </div>

      {/* DASHBOARD CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {isSupplier ? (
          <>
            <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Borrowed</p>
              <p className="text-2xl font-black text-slate-900">{stats.totalBorrowedLiters.toFixed(2)} L</p>
              <p className="text-[10px] font-bold text-slate-400 mt-1">₹{stats.totalBorrowedAmount.toLocaleString()}</p>
            </div>
            <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Returned</p>
              <p className="text-2xl font-black text-emerald-600">{stats.totalCreditLiters.toFixed(2)} L</p>
              <p className="text-[10px] font-bold text-emerald-500 mt-1">₹{stats.totalCreditAmount.toLocaleString()} in diesel</p>
            </div>
            <div className={`p-6 rounded-[2rem] border shadow-sm ${stats.netLitersOwed > 0 ? 'bg-rose-50 border-rose-100' : 'bg-emerald-50 border-emerald-100'}`}>
              <p className="text-[10px] font-black opacity-50 uppercase tracking-widest mb-1 text-slate-900">Net Liters Owed</p>
              <p className={`text-2xl font-black ${stats.netLitersOwed > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                {Math.abs(stats.netLitersOwed).toFixed(2)} L
              </p>
              <p className="text-[10px] font-black opacity-40 mt-1 uppercase tracking-widest text-slate-900">
                {stats.netLitersOwed > 0 ? 'Pending Payback' : stats.netLitersOwed < 0 ? 'Advance (Supplier Owes)' : 'Balanced'}
              </p>
            </div>
            <div className={`p-6 rounded-[2rem] border shadow-sm ${stats.netAmountOwed > 0 ? 'bg-rose-50 border-rose-100' : 'bg-emerald-50 border-emerald-100'}`}>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Net ₹ Owed</p>
              <p className={`text-2xl font-black ${stats.netAmountOwed > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                ₹{Math.abs(stats.netAmountOwed).toLocaleString()}
              </p>
              <p className="text-[10px] font-black opacity-40 mt-1 uppercase tracking-widest text-slate-900">
                {stats.netAmountOwed > 0 ? 'Pending Payment' : stats.netAmountOwed < 0 ? 'Advance Balance' : 'Fully Settled'}
              </p>
            </div>
          </>
        ) : (
          <>
            <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Diesel Received (Inward)</p>
              <p className="text-2xl font-black text-slate-900">{stats.totalReceivedLiters.toFixed(2)} L</p>
              <p className="text-[10px] font-bold text-slate-400 mt-1">₹{stats.totalReceivedAmount.toLocaleString()}</p>
            </div>
            <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Settlements (Paid/CN)</p>
              <p className="text-2xl font-black text-emerald-600">₹{stats.totalCashPaid.toLocaleString()}</p>
              <p className="text-[10px] font-bold text-emerald-500 mt-1">Cash/Credit Note</p>
            </div>
            <div className={`p-6 rounded-[2rem] border shadow-sm ${stats.netAmountOwed > 0 ? 'bg-rose-50 border-rose-100' : 'bg-emerald-50 border-emerald-100'}`}>
              <p className="text-[10px] font-black opacity-50 uppercase tracking-widest mb-1 text-slate-900">Net Balance</p>
              <p className={`text-2xl font-black ${stats.netAmountOwed > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                ₹{Math.abs(stats.netAmountOwed).toLocaleString()}
              </p>
              <p className="text-[10px] font-black opacity-40 mt-1 uppercase tracking-widest text-slate-900">
                {stats.netAmountOwed > 0 ? 'Inward Over Credit' : stats.netAmountOwed < 0 ? 'Excess Payment / Advance' : 'Balanced'}
              </p>
            </div>
            <div className="bg-slate-900 p-6 rounded-[2rem] text-white">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Entries</p>
              <p className="text-xl font-bold">{partyTransactions.length}</p>
              <p className="text-[9px] font-black text-amber-500 uppercase tracking-widest mt-1">Activity Log</p>
            </div>
          </>
        )}
      </div>

      {/* TRANSACTIONS TABLE */}
      <div className="bg-white rounded-[2rem] shadow-xl border border-slate-100 overflow-hidden">
        <div className="p-6 sm:p-8 border-b border-slate-50 space-y-6">
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
            <h3 className="font-black text-slate-900 uppercase tracking-widest text-xs">Transaction Audit Trail</h3>
            <div className="flex flex-wrap gap-2 w-full lg:w-auto">
              <div className="relative flex-1 lg:w-64">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔍</span>
                <input 
                  type="text" 
                  placeholder="Search remarks/details..." 
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-xl font-bold text-xs" 
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
              </div>
              <div className="flex gap-2 flex-1 lg:flex-initial">
                <input type="date" className="p-3 bg-slate-50 border border-slate-100 rounded-xl font-bold text-xs" value={startDate} onChange={e => setStartDate(e.target.value)} />
                <input type="date" className="p-3 bg-slate-50 border border-slate-100 rounded-xl font-bold text-xs" value={endDate} onChange={e => setEndDate(e.target.value)} />
              </div>
              <select 
                className="p-3 bg-slate-50 border border-slate-100 rounded-xl font-bold text-xs uppercase"
                value={filterType}
                onChange={e => setFilterType(e.target.value as any)}
              >
                <option value="ALL">ALL TYPES</option>
                <option value="BORROW">TAKEN / BORROW</option>
                <option value="SETTLE">SETTLEMENTS</option>
                <option value="RECV">RECEIVALS</option>
              </select>
              <div className="flex gap-2">
                <button onClick={handleExportExcel} className="px-6 py-3 bg-emerald-50 text-emerald-600 border border-emerald-100 rounded-xl font-black text-[10px] uppercase">Excel</button>
                <button onClick={handleExportPDF} className="px-6 py-3 bg-rose-50 text-rose-600 border border-rose-100 rounded-xl font-black text-[10px] uppercase">PDF</button>
              </div>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-400 font-black uppercase tracking-widest">
              <tr>
                <th className="px-8 py-5 text-[10px]">Date</th>
                <th className="px-8 py-5 text-[10px]">Activity Details</th>
                <th className="px-8 py-5 text-center text-[10px]">Liters / Rate</th>
                <th className="px-8 py-5 text-right text-[10px]">Debit (L & ₹)</th>
                <th className="px-8 py-5 text-right text-[10px]">Credit (L & ₹)</th>
                <th className="px-8 py-5 text-center text-[10px] min-w-[120px]">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredLedger.map((t) => {
                const isDebit = t.type === 'BORROW' || t.type === 'DIESEL_RECEIVED';

                return (
                  <tr key={t.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-8 py-4 font-bold text-slate-500">{t.date}</td>
                    <td className="px-8 py-4">
                      <span className={`font-black uppercase tracking-tighter text-sm ${t.type === 'BORROW' ? 'text-rose-600' : 'text-emerald-600'}`}>
                        {t.description}
                      </span>
                      {t.remarks && <p className="text-[9px] text-slate-400 uppercase font-bold mt-1 max-w-[200px] truncate">{t.remarks}</p>}
                    </td>
                    <td className="px-8 py-4 text-center">
                      {t.fuelLiters ? (
                        <div>
                          <span className="font-black text-slate-900">{t.fuelLiters} L</span>
                          <p className="text-[9px] text-slate-500 font-bold">@ ₹{t.dieselPrice || '--'}</p>
                        </div>
                      ) : '--'}
                    </td>

                    {/* DEBIT COLUMN - Liters + Amount */}
                    <td className="px-8 py-4 text-right">
                      {isDebit ? (
                        <div className="space-y-0.5">
                          {t.fuelLiters && (
                            <div className="font-black text-rose-600 text-md leading-none">
                              {t.fuelLiters} L
                            </div>
                          )}
                          {t.amount && (
                            <div className="font-semibold text-rose-600">₹{t.amount.toLocaleString()}</div>
                          )}
                        </div>
                      ) : '--'}
                    </td>

                    {/* CREDIT COLUMN - Liters + Amount */}
                    <td className="px-8 py-4 text-right">
                      {!isDebit ? (
                        <div className="space-y-0.5">
                          {t.fuelLiters && (
                            <div className="font-black text-emerald-600 text-md leading-none">
                              {t.fuelLiters} L
                            </div>
                          )}
                          {t.amount && (
                            <div className="font-semibold text-emerald-600">₹{t.amount.toLocaleString()}</div>
                          )}
                        </div>
                      ) : '--'}
                    </td>

                    <td className="px-8 py-4 text-center">
                      <div className="flex justify-center gap-1">
                        <button 
                          onClick={() => { setEditingTx(t); setShowTxModal(true); }}
                          className="p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-900 rounded-lg transition-all"
                          title="Edit entry"
                        >
                          ✏️
                        </button>
                        <button 
                          onClick={() => handleDelete(t)}
                          className="p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600 rounded-lg transition-all"
                          title="Delete entry"
                        >
                          🗑️
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredLedger.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-8 py-12 text-center text-slate-400 font-bold uppercase tracking-widest text-xs">
                    No transactions found.
                  </td>
                </tr>
              )}
            </tbody>

            {/* GRAND TOTAL ROW */}
            <tfoot>
              <tr className="bg-slate-100 border-t-4 border-slate-300 font-black">
                <td colSpan={3} className="px-8 py-6 text-right uppercase tracking-widest text-xs text-slate-600">
                  GRAND TOTALS
                </td>
                
                {/* Debit Total */}
                <td className="px-8 py-6 text-right border-r border-slate-200">
                  <div className="space-y-1">
                    <div className="text-rose-600 text-xl leading-none">
                      {stats.totalDebitLiters.toFixed(2)} L
                    </div>
                    <div className="text-rose-600 text-lg font-semibold">
                      ₹{stats.totalDebitAmount.toLocaleString()}
                    </div>
                  </div>
                </td>

                {/* Credit Total */}
                <td className="px-8 py-6 text-right">
                  <div className="space-y-1">
                    <div className="text-emerald-600 text-xl leading-none">
                      {stats.totalCreditLiters.toFixed(2)} L
                    </div>
                    <div className="text-emerald-600 text-lg font-semibold">
                      ₹{stats.totalCreditAmount.toLocaleString()}
                    </div>
                  </div>
                </td>

                <td className="px-8 py-6"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* TRANSACTION MODAL */}
      {showTxModal && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-md z-[2000] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-lg overflow-hidden animate-scaleIn">
             <div className="bg-slate-900 p-8 text-white flex justify-between items-center">
                <div>
                  <h2 className="text-xl font-black uppercase tracking-tight">
                    {editingTx ? 'Edit Entry' : (txType === 'SETTLE_CASH' ? 'Payment / Settlement' : 'Manual Entry')}
                  </h2>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">
                    {txType === 'BORROW' ? 'Personal Use / General Entry' : txType.replace('_', ' ')}
                  </p>
                </div>
                <button onClick={() => { setShowTxModal(false); setEditingTx(null); }} className="text-slate-400 hover:text-white text-2xl font-black">×</button>
             </div>
            <div className="p-8 space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Date</label>
                  <input type="date" className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold" value={date} onChange={e => setDate(e.target.value)} />
                </div>
                {txType !== 'SETTLE_CASH' && (
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Liters</label>
                    <input type="number" className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-black text-lg" value={liters} onChange={e => setLiters(e.target.value)} />
                  </div>
                )}
              </div>

              {(txType === 'SETTLE_LITERS' || txType === 'DIESEL_RECEIVED') && (
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Source / Destination Tanker</label>
                  <select 
                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold transition-all"
                    value={sourceId}
                    onChange={e => setSourceId(e.target.value)}
                  >
                    <option value="">Select Internal Tanker...</option>
                    {masterData.fuelStations.filter(s => s.isInternal).map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {txType === 'SETTLE_CASH' && (
                <div className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Cash Amount (₹)</label>
                    <input type="number" className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-black text-2xl text-emerald-600" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Diesel Price (₹/L)</label>
                    <input type="number" className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold" value={price} onChange={e => setPrice(e.target.value)} placeholder="Today's Price" />
                  </div>
                  {amount && price && parseFloat(price) > 0 && (
                    <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100 animate-fadeIn">
                       <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-1">Equivalent Liters Adjusted</p>
                       <p className="text-xl font-black text-emerald-700">{(parseFloat(amount) / parseFloat(price)).toFixed(2)} L</p>
                    </div>
                  )}
                </div>
              )}

               {txType !== 'SETTLE_CASH' && (
                 <div className="space-y-1">
                   <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Rate (₹/L)</label>
                   <input type="number" className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold" value={price} onChange={e => setPrice(e.target.value)} placeholder="0.00" />
                 </div>
               )}

              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Remarks</label>
                <textarea className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-sm resize-none h-24" value={remarks} onChange={e => setRemarks(e.target.value)}></textarea>
              </div>

              {txType !== 'SETTLE_CASH' && liters && price && (
                <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100 animate-fadeIn">
                   <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest mb-1">Estimated Total Amount</p>
                   <p className="text-xl font-black text-amber-700">₹{(parseFloat(liters) * parseFloat(price)).toLocaleString()}</p>
                </div>
              )}

              <button 
                onClick={handleSaveTransaction}
                disabled={isSaving}
                className={`w-full py-5 rounded-[1.5rem] font-black uppercase text-xs tracking-widest shadow-2xl active:scale-95 transition-all ${editingTx ? 'bg-amber-600' : 'bg-slate-900'} text-white`}
              >
                {isSaving ? 'Processing...' : editingTx ? 'Update Entry' : 'Confirm Entry'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PartyLedger;
