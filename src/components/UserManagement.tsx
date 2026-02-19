import React, { useState, useMemo } from 'react';
import { User, FuelLog, CoalLog, MiningLog, Role } from '../types';
import { dbService } from '../services/dbService';
import { AUTH_CONFIG } from '../services/authService';

interface UserManagementProps {
  users: User[];
  fuelLogs: FuelLog[];
  coalLogs: CoalLog[];
  miningLogs: MiningLog[];
  onRefresh: () => void;
}

const UserManagement: React.FC<UserManagementProps> = ({ users, fuelLogs, coalLogs, miningLogs, onRefresh }) => {
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('FUEL_AGENT');
  const [isAdding, setIsAdding] = useState(false);

  const selectedUser = users.find(u => u.id === selectedUserId);

  const userActivity = useMemo(() => {
    if (!selectedUserId) return [];
    const user = users.find(u => u.id === selectedUserId);
    if (!user) return [];

    const activities: any[] = [
      ...fuelLogs.filter(l => l.agentId === user.username).map(l => ({ ...l, module: 'FUELING', desc: `${l.fuelLiters}L filled for ${l.truckId}` })),
      ...coalLogs.filter(l => l.agentId === user.username).map(l => ({ ...l, module: 'COAL', desc: `Pass ${l.passNo} for ${l.truckId}` })),
      ...miningLogs.filter(l => (l as any).agentId === user.username).map(l => ({ ...l, module: 'MINING', desc: `Chalan ${l.chalanNo} for ${l.truckId}` }))
    ];

    return activities.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [selectedUserId, fuelLogs, coalLogs, miningLogs, users]);

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingUser) {
        await dbService.updateUser({ ...editingUser, username, role }, password || undefined);
      } else {
        const id = AUTH_CONFIG.mode === 'SUPABASE' ? prompt("Enter Supabase User UUID (from Dashboard):") : crypto.randomUUID();
        if (AUTH_CONFIG.mode === 'SUPABASE' && !id) return;
        await dbService.addUser({ id: id || crypto.randomUUID(), username, role }, password);
      }
      onRefresh();
      resetForm();
    } catch (error) {
      alert('Failed to save user: ' + (error as any).message);
    }
  };

  const handleDeleteUser = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this user?')) {
      await dbService.deleteUser(id);
      onRefresh();
    }
  };

  const resetForm = () => {
    setEditingUser(null);
    setIsAdding(false);
    setUsername('');
    setPassword('');
    setRole('FUEL_AGENT');
  };

  const startEdit = (user: User) => {
    setEditingUser(user);
    setUsername(user.username);
    setRole(user.role);
    setPassword('');
    setIsAdding(true);
  };

  return (
    <div className="space-y-6 animate-fadeIn pb-20">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 tracking-tight">User Management</h2>
          <p className="text-slate-500 text-sm">Create and manage system users and their permissions</p>
        </div>
        <button 
          onClick={() => setIsAdding(true)}
          className="bg-slate-900 text-white px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-black transition-all shadow-xl active:scale-95"
        >
          Add New User
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* User List */}
        <div className="lg:col-span-1 space-y-4">
          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-50 flex justify-between items-center bg-slate-50/50">
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">System Users</h3>
              <span className="text-[10px] font-bold text-slate-500 bg-white px-2 py-1 rounded-lg border border-slate-100">{users.length} Active</span>
            </div>
            <div className="divide-y divide-slate-50">
              {users.map(u => (
                <div 
                  key={u.id} 
                  onClick={() => setSelectedUserId(u.id)}
                  className={`p-4 flex items-center justify-between cursor-pointer transition-all hover:bg-slate-50 ${selectedUserId === u.id ? 'bg-amber-50 border-r-4 border-amber-500' : ''}`}
                >
                  <div>
                    <p className="font-bold text-slate-900">{u.username}</p>
                    <p className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full inline-block ${
                      u.role === 'ADMIN' ? 'bg-indigo-100 text-indigo-600' : 
                      u.role === 'FUEL_AGENT' ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-600'
                    }`}>
                      {u.role.replace('_', ' ')}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={(e) => { e.stopPropagation(); startEdit(u); }} className="p-2 hover:bg-white rounded-xl text-slate-400 hover:text-amber-600 transition-colors">✎</button>
                    <button onClick={(e) => { e.stopPropagation(); handleDeleteUser(u.id); }} className="p-2 hover:bg-white rounded-xl text-slate-400 hover:text-rose-600 transition-colors">🗑</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Activity or Form */}
        <div className="lg:col-span-2 space-y-6">
          {isAdding ? (
            <div className="bg-white rounded-3xl border border-slate-100 shadow-xl overflow-hidden animate-slideUp">
              <div className="p-6 border-b border-slate-50 bg-slate-900 text-white">
                <h3 className="text-sm font-black uppercase tracking-widest">{editingUser ? 'Edit User' : 'Create New User'}</h3>
              </div>
              <form onSubmit={handleSaveUser} className="p-8 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {AUTH_CONFIG.mode === 'SUPABASE' && (
                    <div className="md:col-span-2 p-4 bg-amber-50 border border-amber-200 rounded-2xl mb-2">
                       <p className="text-[10px] font-black text-amber-800 uppercase tracking-widest mb-1">Supabase Cloud Mode Active</p>
                       <p className="text-[11px] text-amber-700 font-bold leading-relaxed">
                         To add a new user: 1. Create them in the <strong>Supabase Auth Dashboard</strong> first. 2. Use this form to link their <strong>Username</strong> and <strong>Role</strong>.
                       </p>
                    </div>
                  )}
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Username</label>
                    <input 
                      required
                      type="text" 
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold outline-none focus:ring-2 focus:ring-amber-500 transition-all"
                      placeholder="e.g. jdoe"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Role</label>
                    <select 
                      value={role}
                      onChange={(e) => setRole(e.target.value as Role)}
                      className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold outline-none focus:ring-2 focus:ring-amber-500 transition-all"
                    >
                      <option value="ADMIN">Administrator (Full Access)</option>
                      <option value="FUEL_AGENT">Fuel Agent (Limited Access)</option>
                      <option value="COAL_ENTRY">Coal Entry (Limited Access)</option>
                      <option value="MINING_ENTRY">Mining Entry (Limited Access)</option>
                    </select>
                  </div>
                  {AUTH_CONFIG.mode === 'MANUAL' && (
                    <div className="space-y-2 md:col-span-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{editingUser ? 'New Password (Leave blank to keep current)' : 'Password'}</label>
                      <input 
                        required={!editingUser}
                        type="password" 
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold outline-none focus:ring-2 focus:ring-amber-500 transition-all"
                        placeholder="••••••••"
                      />
                    </div>
                  )}
                </div>
                <div className="flex gap-3 pt-4">
                  <button type="submit" className="flex-1 py-4 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-black transition-all">
                    {editingUser ? 'Update Permissions' : 'Create User Account'}
                  </button>
                  <button type="button" onClick={resetForm} className="px-8 py-4 bg-slate-100 text-slate-500 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-slate-200 transition-all">Cancel</button>
                </div>
              </form>
            </div>
          ) : selectedUserId ? (
            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden flex flex-col h-[calc(100vh-250px)] animate-fadeIn">
              <div className="p-6 border-b border-slate-50 bg-slate-50/50 flex justify-between items-center">
                <div>
                  <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">Activity History: {selectedUser?.username}</h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">{selectedUser?.role.replace('_', ' ')} ROLE ACTIVITY</p>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto">
                <table className="w-full text-left">
                  <thead className="sticky top-0 bg-white shadow-sm z-10">
                    <tr>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Date</th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Module</th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Activity Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {userActivity.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="px-6 py-20 text-center">
                          <p className="text-slate-300 font-bold italic">No activity recorded for this user yet.</p>
                        </td>
                      </tr>
                    ) : userActivity.map((activity, idx) => (
                      <tr key={idx} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-4 text-xs font-bold text-slate-500">{activity.date}</td>
                        <td className="px-6 py-4 italic">
                          <span className={`px-2 py-1 rounded-md text-[9px] font-black ${
                            activity.module === 'FUELING' ? 'bg-amber-100 text-amber-600' :
                            activity.module === 'COAL' ? 'bg-indigo-100 text-indigo-600' : 'bg-rose-100 text-rose-600'
                          }`}>
                            {activity.module}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-xs font-black text-slate-700">{activity.desc}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center p-20 bg-slate-50/50 border-2 border-dashed border-slate-100 rounded-3xl text-center">
              <span className="text-6xl mb-6 grayscale opacity-20">👥</span>
              <h3 className="text-xl font-bold text-slate-400">Select a user to view history</h3>
              <p className="text-slate-400 text-sm max-w-xs mt-2 italic">Select a team member from the list on the left to review their system activity across all transport modules.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default UserManagement;
