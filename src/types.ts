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
  site: string;
  royaltyName?: string;
  royaltyPassNo: string;
  truckId: string;
  driverId: string | null;
  cartingAgent: string;
  loader: string;
  material: MaterialType;
  gross: number;
  tare: number;
  net: number;
  agentId?: string;
}

export interface FuelLog {
  id: string;
  truckId: string;
  driverId: string;
  stationId?: string; // New: Tracks which pump issued fuel
  date: string;
  attributionDate: string; // Target Production Date
  entryType: 'PER_TRIP' | 'FULL_TANK';
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

export interface MasterData {
  materials: string[];
  agents: string[];
  loaders: string[];
  royaltyNames: string[];
  sites: string[];
  suppliers: string[];
  customers: string[];
  tireSuppliers: string[];
  tireBrands: string[];
  coalSites: CoalSite[];
  fuelStations: FuelStation[]; // New: Fueling stations master list
  benchmarks: FuelBenchmarks;
}

export interface FleetState {
  trucks: Truck[];
  drivers: Driver[];
  tireInventory: Tire[];
  fuelLogs: FuelLog[];
  tripLogs: TripLog[];
  coalLogs: CoalLog[];
  miningLogs: MiningLog[];
  dailyOdo: DailyOdoEntry[];
  purchaseHistory: TirePurchase[];
  stationPayments: StationPayment[];
  masterData: MasterData;
  users: User[];
  currentUser: User | null;
}