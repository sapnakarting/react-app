import React, { useState, useEffect, useCallback, useRef } from 'react';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import TruckRegistry from './components/TruckRegistry';
import TireInventory from './components/TireInventory';
import CoalTransport from './components/CoalTransport';
import MiningOperations from './components/MiningOperations';
import FuelAgentView from './components/FuelAgentView';
import FuelAnalytics from './components/FuelAnalytics';
import Settings from './components/Settings';
import Login from './components/Login';
import Reports from './components/Reports';
import DriverManagement from './components/DriverManagement';
import FuelHistory from './components/FuelHistory';
import CoalEntryForm from './components/CoalEntryForm';
import MiningEntryForm from './components/MiningEntryForm';
import BulkUpload from './components/BulkUpload';
import StationLedger from './components/StationLedger';
import UserManagement from './components/UserManagement';
import { dbService } from './services/dbService';
import { authService } from './services/authService';
import { FleetState, User, Tire, MiningLog, CoalLog } from './types';

const App: React.FC = () => {
  const [state, setState] = useState<FleetState | null>(null);
  const [activeView, setActiveView] = useState('dashboard');
  const [selectedTruckId, setSelectedTruckId] = useState<string | null>(null);
  const [navParams, setNavParams] = useState<{ truckId?: string; date?: string; stationId?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingMiningLog, setEditingMiningLog] = useState<MiningLog | null>(null);
  const [editingCoalLog, setEditingCoalLog] = useState<CoalLog | null>(null);
  const initialLoadDone = useRef(false);

  const refreshState = useCallback(async () => {
    const data = await dbService.getInitialState();
    if (data) {
      if (!data.masterData.benchmarks) {
        data.masterData.benchmarks = {
          coalLitersPerTrip: [40, 60],
          miningKmPerLiter: [1.5, 3.0],
          miningLitersPerTrip: [30, 45],
          globalLitersPerTon: [0.5, 1.5]
        };
      }
      setState(prev => {
        if (!prev) return data;
        return { 
          ...data, 
          currentUser: prev.currentUser 
        };
      });
    }
    setLoading(false);
  }, []);

  const [currentUser, setCurrentUser] = useState<User | null>(null);

  useEffect(() => {
    if (initialLoadDone.current) return;
    initialLoadDone.current = true;

    refreshState();
    const checkSession = async () => {
      const user = await authService.getCurrentUser();
      if (user) {
        handleLoginSuccess(user);
      }
    };
    checkSession();
  }, [refreshState]);

  const handleLoginSuccess = (user: User) => {
    setCurrentUser(user);
    setState(prev => prev ? { ...prev, currentUser: user } : null);
    if (user.role === 'FUEL_AGENT') {
      setActiveView('fuel-agent');
    }
  };

  const handleLogout = async () => {
    await authService.signOut();
    setCurrentUser(null);
    setState(prev => prev ? { ...prev, currentUser: null } : null);
    setActiveView('dashboard');
    setSelectedTruckId(null);
  };

  const handleNavigateToTruck = (truckId: string) => {
    setSelectedTruckId(truckId);
    setActiveView('fleet');
  };

  const handleUpdateTireStatus = async (tireId: string, status: Tire['status'], scrappedReason?: string, mileage?: number) => {
    const tire = [...(state?.tireInventory || []), ...(state?.trucks.flatMap(t => t.tires) || [])].find(t => t.id === tireId);
    if (!tire) return;

    const newHistory = [
      ...(tire.history || []),
      {
        date: new Date().toISOString().split('T')[0],
        event: 'Lifecycle Updated',
        description: `Manual update. State: ${status}${scrappedReason ? ` | Reason: ${scrappedReason}` : ''}. Recorded Mileage: ${mileage || 'N/A'} KM`
      }
    ];

    await dbService.updateTire(tireId, {
      status,
      scrappedReason,
      mileage,
      history: newHistory
    });

    await refreshState();
  };

  const handleReplaceTire = async (truckId: string, position: string, spareId: string | null, unmountData: any, mountKm: number, mountRemarks?: string) => {
    const truck = state?.trucks.find(t => t.id === truckId);
    const oldTire = truck?.tires.find(t => t.position?.toUpperCase() === position.toUpperCase());
    
    if (oldTire) {
      const newHistory = [
        ...(oldTire.history || []),
        {
          date: new Date().toISOString().split('T')[0],
          event: 'Unmounted',
          description: `Unmounted from ${truck?.plateNumber} at ${unmountData.unmountOdometer || 'unknown'} KM. Destination state: ${unmountData.status}${unmountData.scrappedReason ? ` | Reason: ${unmountData.scrappedReason}` : ''}`
        }
      ];
      
      await dbService.updateTire(oldTire.id, { 
        status: unmountData.status, 
        scrappedReason: unmountData.scrappedReason, 
        mileage: unmountData.mileage,
        truckId: null as any,
        position: null as any,
        history: newHistory
      });
    }

    if (spareId) {
      const spare = [...(state?.tireInventory || []), ...(state?.trucks.flatMap(t => t.tires) || [])].find(t => t.id === spareId);
      const newHistory = [
        ...(spare?.history || []),
        {
          date: new Date().toISOString().split('T')[0],
          event: 'Mounted',
          description: `Mounted to ${truck?.plateNumber} at position ${position.toUpperCase()}. Truck ODO: ${mountKm} KM${mountRemarks ? ` | Note: ${mountRemarks}` : ''}`
        }
      ];
      await dbService.updateTire(spareId, {
        status: 'MOUNTED',
        truckId: truckId,
        position: position.toUpperCase(),
        mountedAtOdometer: mountKm,
        history: newHistory
      });
    }

    await refreshState();
  };

  /* Mobile Menu State */
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!currentUser) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  const renderView = () => {
    if (!state) return null;
    const role = currentUser?.role;
    
    // Role-based view filtering (RBAC)
    if (role === 'FUEL_AGENT' && !['fuel-agent', 'fuel-history', 'station-ledger'].includes(activeView)) {
      return (
        <FuelAgentView 
          currentUser={currentUser}
          role={currentUser.role}
          trucks={state.trucks} 
          drivers={state.drivers} 
          fuelLogs={state.fuelLogs} 
          coalLogs={state.coalLogs}
          miningLogs={state.miningLogs}
          dailyOdo={state.dailyOdo}
          masterData={state.masterData}
          users={state.users}
          onAddLog={async (log) => { await dbService.addFuelLog(log); refreshState(); }}
          onUpdateLog={async (log) => { await dbService.updateFuelLog(log); refreshState(); }}
          onNavigate={(view, params) => {
            if (params) setNavParams(params);
            setActiveView(view);
          }}
        />
      );
    }

    if (role === 'COAL_ENTRY' && !['coal-transport', 'coal-entry'].includes(activeView)) {
      setActiveView('coal-transport');
      return null; // Side effect will trigger re-render
    }

    if (role === 'MINING_ENTRY' && !['mining-ops', 'mining-entry', 'mining-bulk'].includes(activeView)) {
      setActiveView('mining-ops');
      return null; // Side effect will trigger re-render
    }

    switch (activeView) {
      case 'dashboard':
        return <Dashboard state={state} />;
      case 'reports':
        return <Reports state={state} />;
      case 'fleet':
        return (
          <TruckRegistry 
            trucks={state.trucks} 
            spareTires={state.tireInventory} 
            onReplaceTire={handleReplaceTire}
            onUpdateTruck={async (t) => { await dbService.updateTruck(t); refreshState(); }}
            onAddTruck={async (t) => { await dbService.addTruck(t); refreshState(); }}
            initialSelectedId={selectedTruckId}
            onClearSelection={() => setSelectedTruckId(null)}
          />
        );
      case 'drivers':
        return (
          <DriverManagement 
            drivers={state.drivers} 
            onAddDriver={async (d) => { await dbService.addDriver(d); refreshState(); }}
            onUpdateDriver={async (d) => { await dbService.updateDriver(d); refreshState(); }}
          />
        );
      case 'tires':
        return (
          <TireInventory 
            state={state} 
            onAddTire={async (t) => { await dbService.addTire(t); refreshState(); }}
            onUpdateTire={async (id, u) => { await dbService.updateTire(id, u); refreshState(); }}
            onUpdateTireStatus={handleUpdateTireStatus}
            onNavigateToTruck={handleNavigateToTruck}
          />
        );
      case 'coal-transport':
        return (
          <CoalTransport 
            logs={state.coalLogs} 
            trucks={state.trucks} 
            drivers={state.drivers} 
            fuelLogs={state.fuelLogs} 
            onEdit={async (log) => { await dbService.updateCoalLog(log); refreshState(); }} 
            onUpdateLogs={async (logs) => { await dbService.updateCoalLogs(logs); refreshState(); }} 
            onDelete={async (id) => { await dbService.deleteCoalLog(id); refreshState(); }}
            onAddLogs={async (logs) => { await dbService.addCoalLogs(logs); refreshState(); }}
            onAddTrigger={() => setActiveView('coal-entry')}
            currentUser={currentUser}
            role={currentUser.role}
            navParams={navParams}
            onClearNav={() => setNavParams(null)}
          />
        );
      case 'coal-entry':
        return (
          <div className="space-y-6">
            <button onClick={() => setActiveView('coal-transport')} className="text-slate-400 hover:text-slate-900 font-black text-xs uppercase tracking-widest">← BACK TO COAL SUMMARY</button>
            <CoalEntryForm 
              trucks={state.trucks} 
              drivers={state.drivers} 
              fuelLogs={state.fuelLogs} 
              masterData={state.masterData} 
              currentUser={currentUser}
              onAddLog={async (l) => {
                const logs = Array.isArray(l) ? l : [l];
                await dbService.addCoalLogs(logs);
                refreshState();
              }}
              navParams={navParams}
              onClearNav={() => setNavParams(null)}
            />
          </div>
        );
      case 'mining-ops':
        return (
          <MiningOperations 
            logs={state.miningLogs} 
            trucks={state.trucks} 
            drivers={state.drivers} 
            fuelLogs={state.fuelLogs} 
            masterData={state.masterData}
            onDelete={async (id) => { await dbService.deleteMiningLog(id); refreshState(); }}
            onBulkUploadTrigger={() => setActiveView('mining-bulk')}
            onAddTrigger={() => setActiveView('mining-entry')}
            currentUser={currentUser}
            role={currentUser.role}
            onEdit={(log) => { setEditingMiningLog(log); setActiveView('mining-entry'); }}
            navParams={navParams}
            onClearNav={() => setNavParams(null)}
          />
        );
      case 'mining-entry':
        return (
          <div className="space-y-6">
            <button onClick={() => setActiveView('mining-ops')} className="text-slate-400 hover:text-slate-900 font-black text-xs uppercase tracking-widest">← BACK TO MINING SUMMARY</button>
            <MiningEntryForm 
              trucks={state.trucks} 
              drivers={state.drivers} 
              fuelLogs={state.fuelLogs} 
              masterData={state.masterData}
              editLog={editingMiningLog}
              currentUser={currentUser}
              onAddLog={async (log) => { await dbService.addMiningLogs([log]); refreshState(); }}
              onUpdateLog={async (log) => { await dbService.updateMiningLog(log); setEditingMiningLog(null); setActiveView('mining-ops'); refreshState(); }}
              onAddMasterDataItem={async (key, list) => { await dbService.updateMasterData(key, list); refreshState(); }}
              navParams={navParams}
              onClearNav={() => setNavParams(null)}
            />
          </div>
        );
      case 'mining-bulk':
        return <BulkUpload 
          trucks={state.trucks} 
          drivers={state.drivers} 
          currentUser={currentUser}
          onSave={async (logs) => { await dbService.addMiningLogs(logs); setActiveView('mining-ops'); refreshState(); }} 
          onCancel={() => setActiveView('mining-ops')} 
        />;
      case 'fuel-agent':
        return (
          <FuelAgentView 
            currentUser={currentUser}
            role={currentUser.role}
            trucks={state.trucks} 
            drivers={state.drivers} 
            fuelLogs={state.fuelLogs} 
            coalLogs={state.coalLogs}
            miningLogs={state.miningLogs}
            dailyOdo={state.dailyOdo}
            masterData={state.masterData}
            users={state.users}
            onAddLog={async (log) => { await dbService.addFuelLog(log); refreshState(); }}
            onUpdateLog={async (log) => { await dbService.updateFuelLog(log); refreshState(); }}
            onNavigate={(view, params) => {
              if (params) setNavParams(params);
              setActiveView(view);
            }}
          />
        );
      case 'station-ledger':
        const station = state.masterData.fuelStations.find(s => s.id === navParams?.stationId);
        if (!station) return <div className="p-8 text-center font-bold text-slate-400">Station not found. <button onClick={() => setActiveView('fuel-agent')} className="text-slate-900 underline">Go Back</button></div>;
        return (
          <StationLedger 
            station={station}
            fuelLogs={state.fuelLogs}
            payments={state.stationPayments}
            trucks={state.trucks}
            onAddPayment={async (p) => { await dbService.addStationPayment(p); refreshState(); }}
            onDeletePayment={async (id) => { await dbService.deleteStationPayment(id); refreshState(); }}
            onBack={() => setActiveView('fuel-agent')}
          />
        );
      case 'fuel-analytics':
        return <FuelAnalytics 
          state={state} 
          onNavigate={(view, params) => {
            if (params) setNavParams(params);
            setActiveView(view);
          }}
        />;
      case 'fuel-history':
        return <FuelHistory 
          logs={state.fuelLogs} 
          trucks={state.trucks} 
          drivers={state.drivers} 
          role={currentUser.role}
          currentUser={currentUser}
          users={state.users}
        />;
      case 'settings':
        return <Settings masterData={state.masterData} onUpdate={async (k, l) => { 
           if (k === 'benchmarks' as any) {
              await dbService.updateMasterData('benchmarks' as any, l as any);
           } else {
              await dbService.updateMasterData(k, l); 
           }
           refreshState(); 
        }} />;
      case 'user-management':
        return (
          <UserManagement 
            users={state.users}
            fuelLogs={state.fuelLogs}
            coalLogs={state.coalLogs}
            miningLogs={state.miningLogs}
            onRefresh={refreshState}
          />
        );
      default:
        return <Dashboard state={state} />;
    }
  };

  return (
    <div className="flex bg-slate-50 min-h-screen relative overflow-x-hidden">
      <Sidebar 
        role={currentUser.role} 
        activeView={activeView} 
        setActiveView={(v) => { setActiveView(v); if (v !== 'fleet') setSelectedTruckId(null); }} 
        onLogout={handleLogout} 
        isOpen={isMobileMenuOpen}
        onClose={() => setIsMobileMenuOpen(false)}
      />
      
      {/* Main Content Area */}
      <main className="flex-1 lg:ml-64 transition-all duration-300 min-h-screen flex flex-col">
        
        {/* Mobile Top Bar - Fixed to ensure it sticks */}
        <div className="lg:hidden bg-slate-900 text-white p-4 flex justify-between items-center fixed top-0 left-0 right-0 z-[99] shadow-md h-16">
           <div onClick={() => setActiveView('dashboard')} className="cursor-pointer">
              <h1 className="text-lg font-black tracking-tighter italic">SAPNA <span className="text-amber-500">CARTING</span></h1>
           </div>
           <button 
             onClick={() => setIsMobileMenuOpen(true)}
             className="p-2 -mr-2 text-white/80 hover:text-white"
           >
             <span className="text-2xl">☰</span>
           </button>
        </div>

        {/* View Container - Added top padding for mobile fixed header */}
        <div className="p-4 pt-20 lg:p-10 lg:pt-10 flex-1">
          {renderView()}
        </div>
      </main>
    </div>
  );
};

export default App;