
import React, { useState, useMemo } from 'react';
import { Driver } from '../types';

interface DriverProps {
  drivers: Driver[];
  onAddDriver: (driver: Driver) => void;
  onUpdateDriver: (driver: Driver) => void;
}

const DriverManagement: React.FC<DriverProps> = ({ drivers, onAddDriver, onUpdateDriver }) => {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [newDriver, setNewDriver] = useState({ name: '', license: '', phone: '', status: 'ON Duty' as Driver['status'], type: 'Permanent' as Driver['type'] });
  const [editingDriver, setEditingDriver] = useState<Driver | null>(null);

  const filteredDrivers = useMemo(() => {
    const s = search.toLowerCase();
    return drivers.filter(d => 
      d.name.toLowerCase().includes(s) || 
      d.phone.toLowerCase().includes(s) || 
      d.licenseNumber.toLowerCase().includes(s)
    );
  }, [drivers, search]);

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDriver.name || !newDriver.license) return;
    
    onAddDriver({
      id: crypto.randomUUID(),
      name: newDriver.name,
      licenseNumber: newDriver.license.toUpperCase(),
      phone: newDriver.phone,
      status: newDriver.status,
      type: newDriver.type
    });
    setNewDriver({ name: '', license: '', phone: '', status: 'ON Duty', type: 'Permanent' });
    setIsAddModalOpen(false);
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingDriver) {
      onUpdateDriver(editingDriver);
      setIsEditModalOpen(false);
      setEditingDriver(null);
    }
  };

  const openEditModal = (driver: Driver) => {
    setEditingDriver({ ...driver });
    setIsEditModalOpen(true);
  };

  return (
    <div className="space-y-6 animate-fadeIn w-full max-w-full">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 px-1">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 tracking-tight">Operator Management</h2>
          <p className="text-slate-500 text-sm font-medium uppercase tracking-widest italic opacity-60">Managing {drivers.length} registered mining operators</p>
        </div>
        <div className="flex gap-4 w-full sm:w-auto">
          <input 
            type="text" 
            placeholder="Search by name, phone or DL..." 
            className="w-full sm:w-64 pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-amber-500 font-bold text-sm shadow-sm"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <button 
            onClick={() => setIsAddModalOpen(true)}
            className="whitespace-nowrap bg-amber-500 hover:bg-amber-600 text-white px-8 py-3 rounded-2xl font-black transition-all shadow-xl border-b-4 border-amber-700 uppercase tracking-widest"
          >
            + Add New Driver
          </button>
        </div>
      </div>

      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden overflow-x-auto">
        <table className="w-full text-left min-w-[800px]">
          <thead className="bg-slate-900 text-slate-300">
            <tr className="text-[10px] font-black uppercase tracking-widest">
              <th className="px-6 py-6 w-12 text-center">#</th>
              <th className="px-6 py-6">Name</th>
              <th className="px-6 py-6">License (DL) #</th>
              <th className="px-6 py-6">Phone</th>
              <th className="px-6 py-6">Status</th>
              <th className="px-6 py-6">Driver Type</th>
              <th className="px-6 py-6 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredDrivers.map((driver, idx) => (
              <tr key={driver.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-6 py-4 font-black text-rose-500 text-xs text-center">{idx + 1}</td>
                <td className="px-6 py-4 font-bold text-slate-900">{driver.name}</td>
                <td className="px-6 py-4 text-slate-600 font-mono text-sm">{driver.licenseNumber}</td>
                <td className="px-6 py-4 text-slate-500 font-mono">{driver.phone || 'N/A'}</td>
                <td className="px-6 py-4">
                  <span className={`px-4 py-1 rounded-full text-[10px] font-black uppercase border ${
                    driver.status === 'ON Duty' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-rose-50 text-rose-700 border-rose-100'
                  }`}>{driver.status}</span>
                </td>
                <td className="px-6 py-4">
                   <span className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase border ${
                     driver.type === 'Permanent' ? 'bg-blue-50 text-blue-700 border-blue-100' : 'bg-amber-50 text-amber-700 border-amber-100'
                   }`}>
                     {driver.type === 'Permanent' ? '⭐ PAYROLL' : '🗓️ TEMPORARY'}
                   </span>
                </td>
                <td className="px-6 py-4 text-right">
                  <button onClick={() => openEditModal(driver)} className="text-amber-600 hover:text-amber-700 font-black text-xs uppercase transition-colors">Update Profile</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Register Operator Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[200] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-md overflow-hidden animate-scaleIn">
            <div className="bg-slate-900 p-8 text-white flex justify-between items-center">
              <h3 className="text-xl font-bold uppercase tracking-tight">Register Operator</h3>
              <button onClick={() => setIsAddModalOpen(false)} className="text-white text-3xl transition-colors font-light">&times;</button>
            </div>
            <form onSubmit={handleAddSubmit} className="p-8 space-y-5">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase">Full Name</label>
                <input type="text" required placeholder="FULL NAME" className="w-full p-4 bg-slate-50 border rounded-2xl font-bold uppercase" value={newDriver.name} onChange={e => setNewDriver({...newDriver, name: e.target.value.toUpperCase()})} />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase">License (DL) Number</label>
                <input type="text" required placeholder="DL NUMBER" className="w-full p-4 bg-slate-50 border rounded-2xl font-mono font-bold uppercase" value={newDriver.license} onChange={e => setNewDriver({...newDriver, license: e.target.value.toUpperCase()})} />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase">Mobile Number</label>
                <input type="tel" required placeholder="MOBILE NUMBER" className="w-full p-4 bg-slate-50 border rounded-2xl font-bold" value={newDriver.phone} onChange={e => setNewDriver({...newDriver, phone: e.target.value})} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase">Driver Category</label>
                  <select className="w-full p-4 bg-slate-50 border rounded-2xl font-bold uppercase text-xs" value={newDriver.type} onChange={e => setNewDriver({...newDriver, type: e.target.value as any})}>
                    <option value="Permanent">PERMANENT</option>
                    <option value="Temporary">TEMPORARY</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase">Duty Status</label>
                  <select className="w-full p-4 bg-slate-50 border rounded-2xl font-bold uppercase text-xs" value={newDriver.status} onChange={e => setNewDriver({...newDriver, status: e.target.value as any})}>
                    <option value="ON Duty">ON DUTY</option>
                    <option value="OFF Duty">OFF DUTY</option>
                  </select>
                </div>
              </div>
              <button type="submit" className="w-full py-5 bg-amber-500 text-white rounded-[2rem] font-black text-lg shadow-xl uppercase">Register Driver</button>
            </form>
          </div>
        </div>
      )}

      {/* Edit Operator Modal */}
      {isEditModalOpen && editingDriver && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[200] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-md overflow-hidden animate-scaleIn">
            <div className="bg-slate-900 p-8 text-white flex justify-between items-center">
              <h3 className="text-xl font-bold uppercase tracking-tight">Update Operator</h3>
              <button onClick={() => setIsEditModalOpen(false)} className="text-white text-3xl transition-colors font-light">&times;</button>
            </div>
            <form onSubmit={handleEditSubmit} className="p-8 space-y-5">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase">Full Name</label>
                <input type="text" required className="w-full p-4 bg-slate-50 border rounded-2xl font-bold uppercase" value={editingDriver.name} onChange={e => setEditingDriver({...editingDriver, name: e.target.value.toUpperCase()})} />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase">License (DL) Number</label>
                <input type="text" required className="w-full p-4 bg-slate-50 border rounded-2xl font-mono font-bold uppercase" value={editingDriver.licenseNumber} onChange={e => setEditingDriver({...editingDriver, licenseNumber: e.target.value.toUpperCase()})} />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase">Mobile Number</label>
                <input type="tel" required className="w-full p-4 bg-slate-50 border rounded-2xl font-bold" value={editingDriver.phone} onChange={e => setEditingDriver({...editingDriver, phone: e.target.value})} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase">Driver Category</label>
                  <select className="w-full p-4 bg-slate-50 border rounded-2xl font-bold uppercase text-xs" value={editingDriver.type} onChange={e => setEditingDriver({...editingDriver, type: e.target.value as any})}>
                    <option value="Permanent">PERMANENT</option>
                    <option value="Temporary">TEMPORARY</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase">Duty Status</label>
                  <select className="w-full p-4 bg-slate-50 border rounded-2xl font-bold uppercase text-xs" value={editingDriver.status} onChange={e => setEditingDriver({...editingDriver, status: e.target.value as any})}>
                    <option value="ON Duty">ON DUTY</option>
                    <option value="OFF Duty">OFF DUTY</option>
                    <option value="Suspended">SUSPENDED</option>
                  </select>
                </div>
              </div>
              <button type="submit" className="w-full py-5 bg-slate-900 text-white rounded-[2rem] font-black text-lg shadow-xl uppercase">Save Changes</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default DriverManagement;