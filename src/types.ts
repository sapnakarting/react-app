export type Role = 'ADMIN' | 'FUEL_AGENT' | 'COAL_ENTRY' | 'MINING_ENTRY';
export type FleetType = 'MINING' | 'COAL';

export interface User {
  id: string;
  username: string;
  role: Role;
}

export type MaterialType = string;

export interface CoalSite {
  id: string;
  name: string;
  siteType: 'LOADING' | 'UNLOADING';
}

export interface FuelStation {
  id: string;
  name: string;
  location?: string;
  isInternal?: boolean;
}

export interface StationPayment {
  id: string;
  stationId: string;
  date: string;
  amount: number;
  paymentMethod: 'Online Transfer' | 'Cheque' | 'Cash';
  referenceNo?: string;
  remarks?: string;
}

export interface Driver {
  id: string;
  name: string;
  licenseNumber: string;
  phone: string;
  status: 'ON Duty' | 'OFF Duty' | 'Suspended';
  type: 'Permanent' | 'Temporary';
}

export interface TireHistoryEntry {
  date: string;
  event: string;
  description: string;
}

export interface StatusHistoryEntry {
  date: string;
  status: 'ACTIVE' | 'MAINTENANCE' | 'IDLE' | 'BREAKDOWN';
  remarks?: string;
}

export interface Tire {
  id: string;
  serialNumber: string;
  brand: string;
  size: string;
  mileage: number;
  expectedLifespan: number;
  status: 'NEW' | 'MOUNTED' | 'SPARE' | 'SCRAPPED' | 'REPAIR';
  lastInspectionDate: string;
  scrappedReason?: string;
  position?: string;
  truckId?: string;
  manufacturer?: string;
  supplier?: string;
  billNumber?: string;
  history?: TireHistoryEntry[];
  mountedAtOdometer?: number; 
}

export interface TirePurchase {
  id: string;
  tireId: string;
  serialNumber: string;
  purchaseDate: string;
  cost: number;
  supplier: string;
  brand: string;
}

export interface Truck {
  id: string;
  plateNumber: string;
  transporterName?: string;
  model: string;
  wheelConfig: '10 WHEEL' | '12 WHEEL' | '14 WHEEL' | '16 WHEEL';
  currentOdometer: number;
  fuelEfficiency: number;
  status: 'ACTIVE' | 'MAINTENANCE' | 'IDLE' | 'BREAKDOWN';
  remarks?: string;
  fleetType: FleetType;
  subType?: 'DISPATCH' | 'INTERNAL'; // Only for MINING fleet trucks
  tires: Tire[];
  rcExpiry?: string;
  fitnessExpiry?: string;
  insuranceExpiry?: string;
  puccExpiry?: string;
  permitExpiry?: string;
  taxExpiry?: string;
  documents?: Record<string, string>;
  statusHistory?: StatusHistoryEntry[];
}

export interface CoalLog {
  id: string;
  date: string;
  truckId: string;
  driverId: string | null;
  passNo: string;
  grossWeight: number;
  tareWeight: number;
  netWeight: number;
  dieselLiters: number;
  dieselAdjustment: number; // Used for STOCK
  airAdjustment?: number;   // Used for AIR
  dieselAdjType?: 'STOCK' | 'OTHER';
  dieselRate: number;
  adjustment?: number;
  remarks?: string;
  tripRemarks?: string;
  dieselRemarks?: string;
  airRemarks?: string;
  from?: string;
  to?: string;
  staffWelfare?: number;
  rollAmount?: number;
  agentId?: string;
}

export interface MiningLog {
  id: string;
  type: 'DISPATCH' | 'PURCHASE';
  date: string;
  time: string;
  chalanNo: string;
  customerName: string;
  site?: string;
  royaltyName?: string;
  royaltyPassNo: string;
  royaltyNo?: string;          // alphanumeric royalty number
  supplier?: string;            // Supplier field (top of form)
  customerSite?: string;        // Customer site
  truckId: string;
  driverId: string | null;
  cartingAgent: string;
  loader: string;
  material: MaterialType;
  gross: number;
  tare: number;
  net: number;
  // Loading weighbridge fields
  loadingGrossWt?: number;
  loadingTareWt?: number;
  loadingNetWt?: number;
  // Unloading weighbridge fields
  unloadingGrossWt?: number;
  unloadingTareWt?: number;
  unloadingNetWt?: number;
  // Auto-calculated shortage
  shortageWt?: number;
  agentId?: string;
  // Financial and audit tracking fields (mirrored from CoalLog)
  dieselLiters?: number;
  dieselAdjustment?: number; 
  airAdjustment?: number;   
  dieselAdjType?: 'STOCK' | 'OTHER';
  dieselRate?: number;
  adjustment?: number;
  tripRemarks?: string;
  dieselRemarks?: string;
  airRemarks?: string;
  staffWelfare?: number;
  rollAmount?: number;
  advanceFromYesterday?: number;
}

export interface FuelLog {
  id: string;
  truckId: string;
  driverId: string;
  stationId?: string; // New: Tracks which pump issued fuel
  partyId?: string;   // Set when fueled from a diesel party account
  date: string;
  attributionDate: string; // Target Production Date
  entryType: 'PER_TRIP' | 'FULL_TANK' | 'PARTIAL_FILL';
  odometer: number;
  previousOdometer: number;
  fuelLiters: number;
  agentId: string;
  status?: 'IN_PROGRESS' | 'COMPLETED';
  dieselPrice?: number;
  photoProof?: string;
  verificationPhotos?: {
    plate?: string | null;
    odo: string | null;
    pumpStart: string | null;
    pumpEnd: string | null;
    tank: string | null;
  };
  performanceRemarks?: string; // New: Reason for worst performance
}

export interface MiscFuelEntry {
  id: string;
  stationId: string;       // From which station/pump was it bought
  date: string;
  vehicleDescription: string;
  usageType: 'PERSONAL' | 'OFFICE' | 'BULK_TRANSFER' | 'OTHER';
  fuelLiters: number;
  dieselPrice: number;
  amount: number;          // fuelLiters * dieselPrice
  invoiceNo?: string;
  receiverName?: string;
  remarks?: string;
  destinationStationId?: string; // For BULK_TRANSFER: Which internal tanker received it?
}

export interface DieselParty {
  id: string;
  name: string;
  type: 'SUPPLIER' | 'CUSTOMER' | 'OTHER';
  contact?: string;
  phone?: string;
  notes?: string;
}

export interface PartyDieselTransaction {
  id: string;
  partyId: string;
  date: string;
  // BORROW        = party gave us diesel (we owe them litres)
  // SETTLE_LITERS = we repaid them in litres (from our tanker)
  // SETTLE_CASH   = we paid them in ₹ (couldn't give litres)
  // DIESEL_RECEIVED = customer gave us diesel as payment
  type: 'BORROW' | 'SETTLE_LITERS' | 'SETTLE_CASH' | 'DIESEL_RECEIVED';
  fuelLiters?: number;   // litres involved (not for SETTLE_CASH)
  dieselPrice?: number;  // ₹/L at the time (optional)
  amount?: number;       // ₹ value — for SETTLE_CASH; or calculated for others
  fuelLogId?: string;    // links to FuelLog.id when type=BORROW (auto-created by agent)
  sourceId?: string;     // New: stationId/tankerId where diesel was taken from for SETTLE_LITERS
  destTankerId?: string; // links to a FuelStation.id when DIESEL_RECEIVED stocks a tanker
  bridgeEntryId?: string; // New: link to the MiscFuelEntry created for bridge logic
  invoiceNo?: string;
  remarks?: string;
}

export interface TripLog {
  id: string;
  truckId: string;
  driverId: string;
  date: string;
  material?: MaterialType;
  weightMT?: number;
  tripCount: number;
  fleetType: FleetType;
}

export interface DailyOdoEntry {
  truckId: string;
  date: string;
  openingOdometer: number;
  closingOdometer?: number;
}

export interface FuelBenchmarks {
  coalLitersPerTrip: [number, number];
  miningKmPerLiter: [number, number];
  miningLitersPerTrip: [number, number];
  globalLitersPerTon: [number, number];
}

export type MachineType = 'EXCAVATOR' | 'LOADER' | 'JCB' | 'BULLDOZER' | 'CRANE' | 'OTHER';

export interface Machine {
  id: string;
  name: string;
  machineType: MachineType;
  model?: string;
  registrationNo?: string;
  status: 'ACTIVE' | 'MAINTENANCE' | 'IDLE';
  trackingMode: 'HOURS' | 'KM';
  currentHours?: number;
  currentKm?: number;
  remarks?: string;
}

export interface MachineActivity {
  activity: 'LOADING' | 'BLASTING' | 'PATH_MAKING' | 'STOCKPILING' | 'CRUSHING_SUPPORT' | 'OTHER';
  durationHours?: number;
  distanceKm?: number;
  remarks?: string;
}

export interface MachineLog {
  id: string;
  machineId: string;
  date: string;
  openingHours?: number;
  closingHours?: number;
  openingKm?: number;
  closingKm?: number;
  activities: MachineActivity[];
  remarks?: string;
}

export interface MachineFuelEntry {
  id: string;
  machineId: string;
  fuelSourceType: 'STATION' | 'INTERNAL_TANKER' | 'DIESEL_PARTY';
  fuelSourceId: string; // stationId, tankerId, or partyId
  date: string;
  fuelLiters: number;
  dieselPrice: number;
  amount: number;
  currentHours?: number;
  currentKm?: number;
  remarks?: string;
}

export interface MasterData {
  materials: string[];
  agents: string[];
  loaders: Machine[];
  royaltyNames: string[];
  sites: string[];
  suppliers: string[];
  customers: string[];
  tireSuppliers: string[];
  tireBrands: string[];
  coalSites: CoalSite[];
  fuelStations: FuelStation[];
  dieselParties: DieselParty[];
  benchmarks: FuelBenchmarks;
}

export interface FleetState {
  trucks: Truck[];
  drivers: Driver[];
  tireInventory: Tire[];
  fuelLogs: FuelLog[];
  miscFuelEntries: MiscFuelEntry[];
  tripLogs: TripLog[];
  coalLogs: CoalLog[];
  miningLogs: MiningLog[];
  machines: Machine[];
  machineLogs: MachineLog[];
  machineFuelEntries: MachineFuelEntry[];
  dailyOdo: DailyOdoEntry[];
  purchaseHistory: TirePurchase[];
  stationPayments: StationPayment[];
  dieselParties: DieselParty[];
  partyDieselTransactions: PartyDieselTransaction[];
  masterData: MasterData;
  users: User[];
  currentUser: User | null;
}