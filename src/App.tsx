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
import PartyLedger from './components/PartyLedger';
import UserManagement from './components/UserManagement';
import { dbService } from './services/dbService';
import { authService } from './services/authService';
import { FleetState, User, Tire, MiningLog, CoalLog } from './types';

const App: React.FC = () => {
  const [state, setState] = useState<FleetState | null>(null);
  const [activeView, setActiveView] = useState('dashboard');
  const [selectedTruckId, setSelectedTruckId] = useState<string | null>(null);
  const [navParams, setNavParams] = useState<{ truckId?: string; date?: string; stationId?: string; partyId?: string } | null>(null);
  const [ledgerTab, setLedgerTab] = useState<'STATIONS' | 'TANKERS' | 'PARTIES'>('STATIONS');
  const [loading, setLoading] = useState(true);
  const [loadingView, setLoadingView] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'completed'>('idle');
  const [diagnosticMessage, setDiagnosticMessage] = useState<string | null>(null);
  const [editingMiningLog, setEditingMiningLog] = useState<MiningLog | null>(null);
  const [editingCoalLog, setEditingCoalLog] = useState<CoalLog | null>(null);
  const initialLoadDone = useRef(false);
  const stateRef = useRef<FleetState | null>(null);
  const [canLoadMore, setCanLoadMore] = useState<Record<string, boolean>>({
    coal: true,
    mining: true,
    fuel: true
  });

  // Sync stateRef with state
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const refreshState = useCallback(async () => {
    try {
      // Use latest state in a way that doesn't trigger loops
      const data = await dbService.getInitialState();
      if (!data) return;

      setState(prev => {
        if (!prev) return data;
        return { 
          ...data, 
          // Preserve large logs already loaded
          coalLogs: prev.coalLogs,
          miningLogs: prev.miningLogs,
          fuelLogs: prev.fuelLogs
        };
      });
    } catch (err) {
      console.error("Failed to refresh state:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  // -----------------------------------------------------------------------
  // Syncs party BORROW transactions whenever a fuel log is updated.
  // Covers three transition cases:
  //   A → A (same party, update amount/price)   → update linked tx
  //   A → B (party changed)                      → delete old tx, create new
  //   A → Station (party removed)                → delete old tx
  //   Station → A (party added)                  → create new tx
  // -----------------------------------------------------------------------
  const handleUpdateFuelLog = useCallback(async (newLog: import('./types').FuelLog) => {
    const currentState = stateRef.current;
    if (!currentState) { await dbService.updateFuelLog(newLog); await refreshState(); return; }

    const oldLog = currentState.fuelLogs.find(l => l.id === newLog.id);
    const oldPartyId = oldLog?.partyId || null;
    const newPartyId = newLog.partyId || null;

    await dbService.updateFuelLog(newLog);

    const oldTx = currentState.partyDieselTransactions.find(t => t.fuelLogId === newLog.id);

    if (oldPartyId && oldPartyId !== newPartyId) {
      // Remove old party's BORROW
      if (oldTx) await dbService.deletePartyTransaction(oldTx.id);
    }

    if (newPartyId && newPartyId !== oldPartyId) {
      // New party chosen — create fresh BORROW
      const liters = newLog.fuelLiters || 0;
      const price = newLog.dieselPrice || 0;
      await dbService.addPartyTransaction({
        id: crypto.randomUUID(),
        partyId: newPartyId,
        date: newLog.date,
        type: 'BORROW',
        fuelLiters: liters,
        dieselPrice: price,
        amount: liters * price,
        fuelLogId: newLog.id,
        remarks: `Fleet Fueling (edited)`
      });
    } else if (newPartyId && newPartyId === oldPartyId && oldTx) {
      // Same party — update the linked BORROW to reflect new liters/price
      const liters = newLog.fuelLiters || 0;
      const price = newLog.dieselPrice || 0;
      await dbService.updatePartyTransaction({
        ...oldTx,
        fuelLiters: liters,
        dieselPrice: price,
        amount: liters * price,
        date: newLog.date
      });
    }

    // Refresh: patch fuelLogs in place + reload fresh partyDieselTransactions from DB
    const freshLedger = await dbService.getLedgerData();
    setState(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        // Patch the single updated log in place so the Party Ledger sees new price/partyId
        fuelLogs: prev.fuelLogs.map(l => l.id === newLog.id ? newLog : l),
        // Fresh party transactions straight from DB
        partyDieselTransactions: freshLedger.partyTransactions,
        miscFuelEntries: freshLedger.miscFuelEntries,
        stationPayments: freshLedger.stationPayments,
      };
    });
  }, []);

  const handleDeleteFuelLog = useCallback(async (logId: string) => {
    const currentState = stateRef.current;
    if (!currentState) { 
      await dbService.deleteFuelLog(logId); 
      await refreshState(); 
      return; 
    }

    const log = currentState.fuelLogs.find(l => l.id === logId);
    if (!log) return;

    // 1. If it's a party fuel entry, delete the linked BORROW transaction
    if (log.partyId) {
      const tx = currentState.partyDieselTransactions.find(t => t.fuelLogId === logId);
      if (tx) await dbService.deletePartyTransaction(tx.id);
    }

    // 2. Delete the fuel log itself (this also handles daily odo removal in dbService)
    await dbService.deleteFuelLog(logId);

    // 3. Refresh State
    await refreshState();
    
    // Also refresh the specific view lists if they are loaded
    const freshFuel = await dbService.getFuelLogs(100);
    setState(prev => prev ? { ...prev, fuelLogs: freshFuel.fuelLogs } : null);
  }, [refreshState]);

  const handleGlobalRefresh = useCallback(async () => {
    setSyncStatus('syncing');
    try {
      // 1. Reset initial state (Master data, etc)
      const data = await dbService.getInitialState();
      if (!data) {
        setSyncStatus('idle');
        return;
      }

      // 2. Load fresh pages of ALL operational logs
      const [
        { fuelLogs },
        coalLogs,
        miningLogs
      ] = await Promise.all([
        dbService.getFuelLogs(100),
        dbService.getCoalLogs(100),
        dbService.getMiningLogs(100)
      ]);

      setState({
        ...data,
        fuelLogs,
        coalLogs,
        miningLogs
      });
      
      setCanLoadMore({ coal: true, mining: true, fuel: true });
      setSyncStatus('completed');
      setTimeout(() => setSyncStatus('idle'), 3000);
    } catch (err) {
      console.error("Global refresh failed:", err);
      setSyncStatus('idle');
    }
  }, []);

  const handleLoadMore = useCallback(async (type: 'coal' | 'mining' | 'fuel') => {
    if (!state) return;
    setLoadingView(true);
    try {
      let newLogs = [];
      let offset = 0;
      
      if (type === 'coal') {
        offset = state.coalLogs.length;
        newLogs = await dbService.getCoalLogs(100, offset);
        if (newLogs.length < 100) setCanLoadMore(prev => ({ ...prev, coal: false }));
        setState(prev => prev ? { ...prev, coalLogs: [...prev.coalLogs, ...newLogs] } : null);
      } else if (type === 'mining') {
        offset = state.miningLogs.length;
        newLogs = await dbService.getMiningLogs(100, offset);
        if (newLogs.length < 100) setCanLoadMore(prev => ({ ...prev, mining: false }));
        setState(prev => prev ? { ...prev, miningLogs: [...prev.miningLogs, ...newLogs] } : null);
      } else if (type === 'fuel') {
        offset = state.fuelLogs.length;
        const { fuelLogs } = await dbService.getFuelLogs(100, offset);
        if (fuelLogs.length < 100) setCanLoadMore(prev => ({ ...prev, fuel: false }));
        setState(prev => prev ? { ...prev, fuelLogs: [...prev.fuelLogs, ...fuelLogs] } : null);
      }
    } catch (err) {
      console.error(`Failed to load more ${type} logs:`, err);
    } finally {
      setLoadingView(false);
    }
  }, [state]);
  
  const loadViewData = useCallback(async (view: string) => {
    const currentState = stateRef.current;
    if (!currentState) return;

    // Helper to check if we already have data
    const hasData = (arr: any[]) => arr && arr.length > 0;

    let needsFetch = false;
    let needsFuelLogs = false;

    if ((view === 'coal-entry' || view === 'coal-transport')) {
      if (!hasData(currentState.coalLogs)) needsFetch = true;
      if (!hasData(currentState.fuelLogs)) needsFuelLogs = true;
    } else if ((view === 'mining-entry' || view === 'mining-ops')) {
      if (!hasData(currentState.miningLogs)) needsFetch = true;
      if (!hasData(currentState.fuelLogs)) needsFuelLogs = true;
    } else if (['fuel-entry', 'fuel-history', 'fuel-agent', 'party-ledger', 'station-ledger', 'station-ledgers', 'fuel-analytics'].includes(view)) {
      if (!hasData(currentState.fuelLogs)) needsFuelLogs = true;
    }

    if (!needsFetch && !needsFuelLogs) return;

    setLoadingView(true);
    try {
      let asyncUpdates: Partial<FleetState> = {};
      
      const fetchFuel = async () => {
        const { fuelLogs } = await dbService.getFuelLogs(100);
        return fuelLogs;
      };

      if (needsFuelLogs) {
        asyncUpdates.fuelLogs = await fetchFuel();
      }

      if (view === 'coal-entry' || view === 'coal-transport') {
        asyncUpdates.coalLogs = await dbService.getCoalLogs(100);
      } else if (view === 'mining-entry' || view === 'mining-ops') {
        asyncUpdates.miningLogs = await dbService.getMiningLogs(100);
      }

      if (Object.keys(asyncUpdates).length > 0) {
        setState(current => current ? { ...current, ...asyncUpdates } : null);
      }
    } catch (err) {
      console.error(`Failed to load data for view ${view}:`, err);
    } finally {
      setLoadingView(false);
    }
  }, []);

  useEffect(() => {
    if (activeView !== 'dashboard') {
      loadViewData(activeView);
    }
  }, [activeView, loadViewData]);

  const [currentUser, setCurrentUser] = useState<User | null>(null);

  useEffect(() => {
    // Safety timeout: stop loading after 10 seconds no matter what
    const safetyTimeout = setTimeout(async () => {
      console.warn("⚠️ App initialization is taking too long. Running diagnostics...");
      const diag = await authService.getCurrentUser().catch(() => null);
      if (!diag) {
        setDiagnosticMessage("Slow connection or database unreachable. Please check your internet.");
      }
      setLoading(false);
    }, 15000);

    if (initialLoadDone.current) return;
    initialLoadDone.current = true;

    const initialize = async () => {
      console.log("🛠️ Initializing application...");
      try {
        await refreshState();
      } catch (err) {
        console.error("❌ Failed to fetch initial state:", err);
      }

      try {
        const user = await authService.getCurrentUser();
        if (user) {
          handleLoginSuccess(user);
        }
      } catch (err) {
        console.error("❌ Auth check failed:", err);
      } finally {
        setLoading(false);
        clearTimeout(safetyTimeout);
      }
    };

    initialize();
    return () => clearTimeout(safetyTimeout);
  }, [refreshState]);

  const handleLoginSuccess = useCallback((user: User) => {
    setCurrentUser(user);
    setState(prev => prev ? { ...prev, currentUser: user } : null);
    refreshState(); // Trigger data fetch as soon as user is authenticated
    if (user.role === 'FUEL_AGENT') {
      setActiveView('fuel-agent');
    }
  }, [refreshState]);

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
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center gap-6 p-4 text-center">
        <div className="w-12 h-12 border-4 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
        <div className="space-y-4 max-w-sm">
          <p className="text-slate-400 text-sm font-medium animate-pulse">Initializing fleet management system...</p>
          
          <div className="pt-8 border-t border-slate-800 space-y-4">
             <div className="bg-slate-800/50 p-4 rounded-2xl border border-slate-700/50 shadow-inner">
                <p className="text-slate-500 text-[9px] uppercase tracking-widest font-black mb-2">Connection Status</p>
                <p className="text-slate-300 text-[11px] font-medium leading-relaxed">
                   {diagnosticMessage || "Checking secure connection to Supabase..."}
                </p>
                {!diagnosticMessage && (
                  <p className="text-slate-500 text-[9px] mt-2 italic">This may take a moment on slow networks</p>
                )}
             </div>

            <button 
              onClick={() => {
                localStorage.clear();
                sessionStorage.clear();
                for (let i = 0; i < localStorage.length; i++) {
                   const key = localStorage.key(i);
                   if (key?.startsWith('sb-')) localStorage.removeItem(key);
                }
                window.location.href = window.location.origin;
              }}
              className="w-full px-6 py-4 bg-amber-500 hover:bg-amber-400 text-slate-900 text-[11px] font-black uppercase tracking-widest rounded-2xl transition-all shadow-[0_10px_20px_rgba(245,158,11,0.2)] active:scale-95 flex items-center justify-center gap-2"
            >
              <span>🔄</span> Force Reset & Restart
            </button>
            
            <div className="bg-slate-950/50 p-3 rounded-xl">
               <p className="text-slate-600 text-[9px] font-bold uppercase tracking-tight">
                  Pro-Tip: If you're using a public WiFi, you might need to change your DNS to 8.8.8.8
               </p>
            </div>
          </div>
        </div>
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
    if (role === 'FUEL_AGENT' && !['fuel-agent', 'fuel-history', 'station-ledger', 'station-ledgers'].includes(activeView)) {
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
          onUpdateLog={handleUpdateFuelLog}
          onDeleteLog={handleDeleteFuelLog}
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
        return <Dashboard state={state} onRefresh={handleGlobalRefresh} syncStatus={syncStatus} />;
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
        return <CoalTransport 
          logs={state.coalLogs} 
          trucks={state.trucks} 
          drivers={state.drivers} 
          fuelLogs={state.fuelLogs}
          onUpdateLogs={async (logs) => { await dbService.updateCoalLogs(logs); refreshState(); }}
          onEdit={async (log) => { await dbService.updateCoalLog(log); refreshState(); }}
          onDelete={async (id) => { await dbService.deleteCoalLog(id); refreshState(); }}
          onAddLogs={async (logs) => { await dbService.addCoalLogs(logs); refreshState(); }}
          onAddTrigger={() => setActiveView('coal-entry')}
          navParams={navParams}
          onClearNav={() => setNavParams(null)}
          onLoadMore={() => handleLoadMore('coal')}
          hasMore={canLoadMore.coal}
          currentUser={currentUser}
          role={currentUser?.role || null}
        />;
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
        return <MiningOperations 
          logs={state.miningLogs} 
          trucks={state.trucks} 
          drivers={state.drivers} 
          fuelLogs={state.fuelLogs}
          masterData={state.masterData}
          onEdit={async (log) => { await dbService.updateMiningLog(log); refreshState(); }}
          onDelete={async (id) => { await dbService.deleteMiningLog(id); refreshState(); }}
          onAddLogs={async (logs) => { await dbService.addMiningLogs(logs); refreshState(); }}
          onAddTrigger={() => setActiveView('mining-entry')}
          onLoadMore={() => handleLoadMore('mining')}
          hasMore={canLoadMore.mining}
          navParams={navParams}
          onClearNav={() => setNavParams(null)}
          currentUser={currentUser}
          role={currentUser?.role || null}
        />;
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
            dieselParties={state.dieselParties}
            users={state.users}
            onAddLog={async (log) => { await dbService.addFuelLog(log); refreshState(); }}
            onUpdateLog={handleUpdateFuelLog}
            onDeleteLog={handleDeleteFuelLog}
            onNavigate={(view, params) => {
              if (params) setNavParams(params);
              setActiveView(view);
            }}
          />
        );
      case 'station-ledgers': {
        return (
          <div className="space-y-8 animate-fadeIn">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
              <div>
                <h2 className="text-2xl sm:text-3xl font-black text-slate-900 uppercase tracking-tight flex items-center gap-3">
                  <span className="text-3xl">📒</span> Ledgers
                </h2>
                <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-1">Settlement & Liability Management</p>
              </div>
              <div className="flex bg-slate-100 p-1 rounded-2xl w-full sm:w-auto self-stretch sm:self-auto gap-1">
                <button 
                  onClick={() => setLedgerTab('STATIONS')}
                  className={`flex-1 sm:px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${ledgerTab === 'STATIONS' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  ⛽ Stations
                </button>
                <button 
                  onClick={() => setLedgerTab('TANKERS')}
                  className={`flex-1 sm:px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${ledgerTab === 'TANKERS' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400 hover:text-blue-500'}`}
                >
                  🛢️ Tankers
                </button>
                <button 
                  onClick={() => setLedgerTab('PARTIES')}
                  className={`flex-1 sm:px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${ledgerTab === 'PARTIES' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-400 hover:text-emerald-500'}`}
                >
                  🤝 Parties
                </button>
              </div>
            </div>

            {ledgerTab === 'STATIONS' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {state.masterData.fuelStations.filter(s => !s.isInternal).map(s => (
                  <button
                    key={s.id}
                    onClick={() => {
                      setNavParams({ stationId: s.id });
                      setActiveView('station-ledger');
                    }}
                    className="bg-white border border-slate-100 rounded-[2rem] p-6 text-left shadow-sm hover:shadow-xl hover:border-amber-200 active:scale-95 transition-all group"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <span className="text-4xl">⛽</span>
                      <span className="text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full border bg-amber-50 text-amber-600 border-amber-100">
                        PETROLEUM PUMP
                      </span>
                    </div>
                    <h3 className="font-black text-slate-900 uppercase tracking-tight text-xl leading-tight group-hover:text-amber-600 transition-colors line-clamp-1">{s.name}</h3>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">{s.location || 'Location Not Set'}</p>
                    <div className="mt-6 pt-4 border-t border-amber-50 flex items-center justify-between">
                      <span className="text-[10px] font-black text-slate-300 uppercase tracking-[0.2em] group-hover:text-amber-500 transition-colors">Manage Ledger</span>
                      <span className="text-xl group-hover:translate-x-1 transition-transform">→</span>
                    </div>
                  </button>
                ))}
              </div>
            ) : ledgerTab === 'TANKERS' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {state.masterData.fuelStations.filter(s => s.isInternal).map(s => (
                  <button
                    key={s.id}
                    onClick={() => {
                      setNavParams({ stationId: s.id });
                      setActiveView('station-ledger');
                    }}
                    className="bg-white border border-slate-100 rounded-[2rem] p-6 text-left shadow-sm hover:shadow-xl hover:border-blue-200 active:scale-95 transition-all group"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <span className="text-4xl">🛢️</span>
                      <span className="text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full border bg-blue-50 text-blue-600 border-blue-100">
                        INTERNAL TANKER
                      </span>
                    </div>
                    <h3 className="font-black text-slate-900 uppercase tracking-tight text-xl leading-tight group-hover:text-blue-600 transition-colors line-clamp-1">{s.name}</h3>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">{s.location || 'Location Not Set'}</p>
                    <div className="mt-6 pt-4 border-t border-blue-50 flex items-center justify-between">
                      <span className="text-[10px] font-black text-slate-300 uppercase tracking-[0.2em] group-hover:text-blue-500 transition-colors">Manage Ledger</span>
                      <span className="text-xl group-hover:translate-x-1 transition-transform">→</span>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {state.dieselParties?.map(p => (
                  <button
                    key={p.id}
                    onClick={() => {
                      setNavParams({ partyId: p.id });
                      setActiveView('party-ledger');
                    }}
                    className="bg-white border border-slate-100 rounded-[2rem] p-6 text-left shadow-sm hover:shadow-xl hover:border-emerald-200 active:scale-95 transition-all group"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <span className="text-4xl">🤝</span>
                      <span className="bg-emerald-50 text-emerald-600 border border-emerald-100 text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full">
                        {p.type} ACCOUNT
                      </span>
                    </div>
                    <h3 className="font-black text-slate-900 uppercase tracking-tight text-xl leading-tight group-hover:text-emerald-600 transition-colors line-clamp-1">{p.name}</h3>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">{p.phone || p.contact || 'No Contact Info'}</p>
                    <div className="mt-6 pt-4 border-t border-emerald-50 flex items-center justify-between">
                      <span className="text-[10px] font-black text-slate-300 uppercase tracking-[0.2em] group-hover:text-emerald-500 transition-colors">View Transactions</span>
                      <span className="text-xl group-hover:translate-x-1 transition-transform">→</span>
                    </div>
                  </button>
                ))}
                {(!state.dieselParties || state.dieselParties.length === 0) && (
                  <div className="col-span-full py-20 text-center bg-white border border-slate-100 border-dashed rounded-[2rem] space-y-3">
                    <p className="font-black text-slate-300 uppercase tracking-widest text-xs">No Diesel Parties configured</p>
                    <button onClick={() => setActiveView('settings')} className="text-[10px] font-black uppercase text-amber-600 hover:underline">Add Parties in Settings</button>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      }
      case 'party-ledger': {
        const party = state.dieselParties?.find(p => p.id === navParams?.partyId);
        if (!party) return <div className="p-8 text-center font-bold text-slate-400">Party not found. <button onClick={() => setActiveView('station-ledgers')} className="text-slate-900 underline">Back</button></div>;
        return (
          <PartyLedger 
            party={party}
            allParties={state.dieselParties}
            transactions={state.partyDieselTransactions}
            fuelLogs={state.fuelLogs}
            masterData={state.masterData}
            miscFuelEntries={state.miscFuelEntries}
            trucks={state.trucks}
            onUpdate={refreshState}
            onAddMiscFuelEntry={async (e) => { await dbService.addMiscFuelEntry(e); refreshState(); }}
            onDeleteTransaction={async (tx) => {
              if (tx.fuelLogId) {
                await dbService.deleteFuelLog(tx.fuelLogId);
              }
              if (tx.bridgeEntryId) {
                await dbService.deleteMiscFuelEntry(tx.bridgeEntryId);
              }
              await dbService.deletePartyTransaction(tx.id);
              refreshState();
            }}
            onBack={() => setActiveView('station-ledgers')}
            onNavigateToParty={(partyId) => {
              setNavParams({ partyId });
              setActiveView('station-ledgers');
              setTimeout(() => setActiveView('party-ledger'), 0);
            }}
          />
        );
      }
      case 'station-ledger': {
        const station = state.masterData.fuelStations.find(s => s.id === navParams?.stationId);
        if (!station) return <div className="p-8 text-center font-bold text-slate-400">Station not found. <button onClick={() => setActiveView('station-ledgers')} className="text-slate-900 underline">View all stations</button></div>;
        return (
          <StationLedger 
            station={station}
            allStations={state.masterData.fuelStations}
            fuelLogs={state.fuelLogs}
            payments={state.stationPayments}
            trucks={state.trucks}
            miscFuelEntries={state.miscFuelEntries}
            partyDieselTransactions={state.partyDieselTransactions}
            dieselParties={state.dieselParties}
            onAddMiscFuelEntry={async (e) => { await dbService.addMiscFuelEntry(e); refreshState(); }}
            onDeleteMiscFuelEntry={async (id) => { 
              const tx = state.partyDieselTransactions.find(t => t.bridgeEntryId === id);
              if (tx) await dbService.deletePartyTransaction(tx.id);
              await dbService.deleteMiscFuelEntry(id); 
              refreshState(); 
            }}
            onAddPayment={async (p) => { await dbService.addStationPayment(p); refreshState(); }}
            onDeletePayment={async (id) => { await dbService.deleteStationPayment(id); refreshState(); }}
            onAddPartyTransaction={async (tx) => { await dbService.addPartyTransaction(tx); refreshState(); }}
            onBack={() => setActiveView('station-ledgers')}
            onNavigateToStation={(stationId) => {
              setNavParams({ stationId });
              // activeView stays 'station-ledger', just navParams changes — force re-render
              setActiveView('station-ledgers');
              setTimeout(() => setActiveView('station-ledger'), 0);
            }}
          />
        );
      }
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
          onLoadMore={() => handleLoadMore('fuel')}
          hasMore={canLoadMore.fuel}
          onDeleteLog={handleDeleteFuelLog}
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
        return <Dashboard state={state} onRefresh={handleGlobalRefresh} syncStatus={syncStatus} />;
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
        onRefresh={handleGlobalRefresh}
        syncStatus={syncStatus}
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