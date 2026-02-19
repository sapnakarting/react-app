
import React, { useState, useRef, useEffect } from 'react';
import { Truck, MiningLog, Driver } from '../types';

interface BulkUploadProps {
  trucks: Truck[];
  drivers: Driver[];
  onSave: (logs: MiningLog[]) => void;
  onCancel: () => void;
  currentUser: any;
}

declare const pdfjsLib: any;
declare const XLSX: any;

const BulkUpload: React.FC<BulkUploadProps> = ({ trucks, drivers, onSave, onCancel, currentUser }) => {
  const [reportType, setReportType] = useState<'DISPATCH' | 'PURCHASE'>('DISPATCH');
  const [pastedText, setPastedText] = useState('');
  const [stagedLogs, setStagedLogs] = useState<MiningLog[]>([]);
  const [step, setStep] = useState<1 | 2>(1);
  const [uploadMode, setUploadMode] = useState<'FILE' | 'TEXT'>('FILE');
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initialize PDF worker correctly for this environment
  useEffect(() => {
    if (typeof pdfjsLib !== 'undefined') {
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }
  }, []);

  const mapVehicle = (plate: string) => {
    if (!plate) return 'UNKNOWN';
    const cleanPlate = plate.replace(/[^A-Z0-9]/g, '').toUpperCase();
    
    // Attempt fuzzy match for plate numbers
    const existing = trucks.find(t => {
      const targetPlate = t.plateNumber.replace(/[^A-Z0-9]/g, '').toUpperCase();
      return targetPlate === cleanPlate || targetPlate.includes(cleanPlate) || cleanPlate.includes(targetPlate);
    });

    if (existing) return existing.id;
    return `NEW_TRUCK_${cleanPlate}`;
  };

  const parseDispatchReport = (text: string) => {
    const lines = text.split('\n').filter(line => line.trim().length > 0);
    const results: MiningLog[] = [];
    lines.forEach((line) => {
      const parts = line.trim().split(/\s+/);
      // Basic heuristic for row validation (e.g., first part is an ID, second looks like a date)
      if (parts.length >= 10 && /^\d+$/.test(parts[0])) {
        const dateVal = parts[1];
        let isoDate = dateVal;
        if (dateVal && dateVal.includes('/')) {
          const [day, month, year] = dateVal.split('/');
          isoDate = `${year}-${month}-${day}`;
        }
        
        const netIdx = parts.length - 4;
        const tareIdx = parts.length - 5;
        const grossIdx = parts.length - 6;
        
        const gross = parseFloat(parts[grossIdx]) || 0;
        const tare = parseFloat(parts[tareIdx]) || 0;
        const net = parseFloat(parts[netIdx]) || 0;
        
        // Find vehicle plate (usually uppercase, alphanumeric)
        const vehicleIdx = parts.findIndex(p => /^[A-Z]{2}\d+[A-Z]*\d+$/.test(p.toUpperCase()));
        const vehicleNo = vehicleIdx !== -1 ? parts[vehicleIdx] : 'UNKNOWN';
        
        results.push({
          id: crypto.randomUUID(),
          type: 'DISPATCH',
          date: isoDate || new Date().toISOString().split('T')[0],
          time: parts[2] || '00:00',
          chalanNo: parts[3] || 'N/A',
          customerName: parts.slice(4, 6).join(' '),
          site: parts[6] || 'Site-1',
          royaltyPassNo: (vehicleIdx !== -1) ? parts[vehicleIdx - 1] : '',
          truckId: mapVehicle(vehicleNo),
          driverId: drivers[0]?.id || 'unknown',
          cartingAgent: '',
          loader: parts[grossIdx - 2] || '',
          material: parts[grossIdx - 1] || 'Aggregate',
          gross,
          tare,
          net,
          agentId: currentUser.username
        });
      }
    });
    return results;
  };

  const parsePurchaseReport = (text: string) => {
    const lines = text.split('\n').filter(line => line.trim().length > 0);
    const results: MiningLog[] = [];
    lines.forEach((line) => {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 8 && /^\d+$/.test(parts[0])) {
        const dateVal = parts[1];
        let isoDate = dateVal;
        if (dateVal && dateVal.includes('/')) {
          const [day, month, year] = dateVal.split('/');
          isoDate = `${year}-${month}-${day}`;
        }
        
        const netIdx = parts.length - 3;
        const grossIdx = parts.length - 4;
        const tareIdx = parts.length - 5;
        
        const net = parseFloat(parts[netIdx]) || 0;
        const gross = parseFloat(parts[grossIdx]) || 0;
        const tare = parseFloat(parts[tareIdx]) || 0;
        
        const vehicleIdx = parts.findIndex(p => /^[A-Z]{2}\d+[A-Z]*\d+$/.test(p.toUpperCase()));
        const vehicleNo = vehicleIdx !== -1 ? parts[vehicleIdx] : 'UNKNOWN';

        results.push({
          id: crypto.randomUUID(),
          type: 'PURCHASE',
          date: isoDate || new Date().toISOString().split('T')[0],
          time: parts[2] || '00:00',
          chalanNo: parts[4] || 'N/A', 
          customerName: 'Supplier-Auto',
          site: 'Mines',
          royaltyPassNo: '',
          truckId: mapVehicle(vehicleNo),
          driverId: drivers[0]?.id || 'unknown',
          cartingAgent: '',
          loader: 'L-01',
          material: 'Lignite',
          gross,
          tare,
          net,
          agentId: currentUser.username
        });
      }
    });
    return results;
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    try {
      const buffer = await file.arrayBuffer();
      let extractedText = '';

      if (file.type === 'application/pdf') {
        const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          extractedText += textContent.items.map((item: any) => item.str).join(' ') + '\n';
        }
      } else if (file.type.includes('spreadsheet') || file.type.includes('excel') || file.name.endsWith('.xlsx')) {
        const workbook = XLSX.read(buffer, { type: 'array' });
        extractedText = XLSX.utils.sheet_to_txt(workbook.Sheets[workbook.SheetNames[0]]);
      } else {
        const reader = new FileReader();
        reader.onload = (event) => handleParse(event.target?.result as string);
        reader.readAsText(file);
        return;
      }
      handleParse(extractedText);
    } catch (err) {
      console.error(err);
      alert('Local parsing error. Please check if the file is a valid PDF or Excel, or try Paste Content mode.');
      setIsProcessing(false);
    }
  };

  const handleParse = (text: string) => {
    if (!text.trim()) {
      setIsProcessing(false);
      return;
    }
    const logs = reportType === 'DISPATCH' ? parseDispatchReport(text) : parsePurchaseReport(text);
    setStagedLogs(logs);
    setStep(2);
    setIsProcessing(false);
  };

  const handleEditStaged = (id: string, field: keyof MiningLog, value: any) => {
    setStagedLogs(prev => prev.map(log => {
      if (log.id !== id) return log;
      const updated = { ...log, [field]: value };
      if (field === 'gross' || field === 'tare') {
        updated.net = parseFloat((parseFloat(updated.gross.toString()) - parseFloat(updated.tare.toString())).toFixed(3));
      }
      return updated;
    }));
  };

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 animate-fadeIn">
      <div className="bg-white rounded-[2.5rem] shadow-2xl border border-slate-100 overflow-hidden">
        <div className="bg-slate-900 p-8 text-white flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold">Mining Bulk Import</h2>
            <p className="text-slate-400 text-sm mt-1 uppercase tracking-widest font-bold">Step {step}: {step === 1 ? 'Source Data' : 'Review Extraction'}</p>
          </div>
          <button onClick={onCancel} className="text-slate-400 hover:text-white transition-colors">Cancel</button>
        </div>

        {step === 1 ? (
          <div className="p-10 space-y-10">
            <div className="flex flex-col md:flex-row justify-between gap-6">
              <div className="flex bg-slate-100 p-2 rounded-2xl w-fit">
                <button onClick={() => setReportType('DISPATCH')} className={`px-8 py-3 rounded-xl font-black text-xs uppercase transition-all ${reportType === 'DISPATCH' ? 'bg-amber-500 text-white shadow-lg' : 'text-slate-500 hover:text-slate-900'}`}>Dispatch Report</button>
                <button onClick={() => setReportType('PURCHASE')} className={`px-8 py-3 rounded-xl font-black text-xs uppercase transition-all ${reportType === 'PURCHASE' ? 'bg-emerald-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-900'}`}>Purchase Report</button>
              </div>
              <div className="flex bg-slate-100 p-2 rounded-2xl w-fit">
                <button onClick={() => setUploadMode('FILE')} className={`px-6 py-3 rounded-xl font-black text-[10px] uppercase transition-all ${uploadMode === 'FILE' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>📁 UPLOAD FILE</button>
                <button onClick={() => setUploadMode('TEXT')} className={`px-6 py-3 rounded-xl font-black text-[10px] uppercase transition-all ${uploadMode === 'TEXT' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>⌨️ PASTE TEXT</button>
              </div>
            </div>

            {isProcessing ? (
              <div className="w-full py-20 flex flex-col items-center justify-center">
                <div className="w-16 h-16 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mb-6"></div>
                <h4 className="text-xl font-black text-slate-800">Local Processing...</h4>
              </div>
            ) : uploadMode === 'FILE' ? (
              <div 
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-20 border-4 border-dashed border-slate-200 rounded-[3rem] bg-slate-50 flex flex-col items-center justify-center cursor-pointer hover:bg-slate-100 hover:border-amber-400 transition-all group"
              >
                <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center shadow-xl mb-6 group-hover:scale-110 transition-transform">
                  <span className="text-4xl">📄</span>
                </div>
                <h4 className="text-xl font-black text-slate-800">Select PDF or Excel File</h4>
                <p className="text-sm text-slate-400 mt-2 font-bold uppercase tracking-widest text-center px-10">Optimized for Suleman Yusuf Motara templates</p>
                <input type="file" ref={fileInputRef} className="hidden" accept=".pdf,.xlsx,.csv" onChange={handleFileUpload} />
              </div>
            ) : (
              <div className="space-y-4">
                <textarea 
                  className="w-full h-80 p-6 bg-slate-50 border-2 border-slate-200 rounded-[2rem] outline-none font-mono text-xs focus:border-amber-500"
                  placeholder="Paste report text here..."
                  value={pastedText}
                  onChange={e => setPastedText(e.target.value)}
                />
                <button onClick={() => handleParse(pastedText)} className="w-full py-6 bg-slate-900 text-white rounded-[2rem] font-black text-xl hover:bg-black transition-all">Start Local Parsing</button>
              </div>
            )}
            
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest text-center italic">100% Client-Side Deterministic Parsing. Fast & Private.</p>
          </div>
        ) : (
          <div className="p-8 space-y-8">
            <div className="bg-amber-50 border border-amber-100 p-6 rounded-[2rem]">
               <p className="text-amber-800 font-black text-lg">Mapped {stagedLogs.length} Records</p>
               <p className="text-amber-600 text-xs font-bold uppercase tracking-widest">Verify tonnage and vehicle mappings below.</p>
            </div>
            <div className="overflow-x-auto rounded-[2rem] border border-slate-100">
              <table className="w-full text-left text-[11px] min-w-[1000px]">
                <thead className="bg-slate-900 text-slate-300 uppercase font-black">
                  <tr>
                    <th className="px-4 py-4">Date</th>
                    <th className="px-4 py-4">Vehicle</th>
                    <th className="px-4 py-4">Chalan</th>
                    <th className="px-4 py-4 text-center">Net (MT)</th>
                    <th className="px-4 py-4 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {stagedLogs.map(log => (
                    <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 font-bold text-slate-600">{log.date}</td>
                      <td className="px-4 py-3">
                        <input className="bg-transparent font-black uppercase outline-none border-b border-transparent focus:border-amber-400" value={log.truckId.startsWith('NEW_TRUCK_') ? log.truckId.replace('NEW_TRUCK_', '') : (trucks.find(t => t.id === log.truckId)?.plateNumber || log.truckId)} onChange={e => handleEditStaged(log.id, 'truckId', mapVehicle(e.target.value))} />
                      </td>
                      <td className="px-4 py-3 font-black text-amber-600">{log.chalanNo}</td>
                      <td className="px-4 py-3 text-center font-black font-mono">{log.net.toFixed(3)}</td>
                      <td className="px-4 py-3 text-right">
                        <span className={`px-2 py-1 rounded-full text-[9px] font-black uppercase ${log.truckId.startsWith('NEW_TRUCK_') ? 'bg-rose-100 text-rose-600' : 'bg-emerald-100 text-emerald-600'}`}>{log.truckId.startsWith('NEW_TRUCK_') ? 'New' : 'Mapped'}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex gap-4">
              <button onClick={() => setStep(1)} className="flex-1 py-5 bg-slate-100 text-slate-500 rounded-[2.5rem] font-black uppercase tracking-widest">Discard</button>
              <button onClick={() => onSave(stagedLogs)} className="flex-[2] py-5 bg-amber-500 text-white rounded-[2.5rem] font-black text-xl hover:bg-amber-600 shadow-xl uppercase tracking-widest">Commit to DB</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default BulkUpload;
