
import { FleetState, FuelLog, CoalLog, Truck, Driver, Tire, MiningLog, MasterData, User, FuelBenchmarks, DailyOdoEntry, CoalSite, FuelStation, StationPayment, MiscFuelEntry } from '../types';
import { supabase } from './supabaseClient';
import { AUTH_CONFIG } from './authService';

const clean = (val: any) => (val === '' || val === undefined ? null : val);

const masterTableMap: Record<keyof MasterData, string> = {
  materials: 'material_types',
  sites: 'operational_sites',
  agents: 'carting_agents',
  loaders: 'loaders',
  customers: 'customers',
  suppliers: 'suppliers',
  royaltyNames: 'royalty_names',
  tireSuppliers: 'tire_suppliers',
  tireBrands: 'tire_brands',
  coalSites: 'coal_sites',
  fuelStations: 'fuel_stations',
  dieselParties: 'diesel_parties',
  benchmarks: 'system_settings'
};

const DEFAULT_BENCHMARKS: FuelBenchmarks = {
  coalLitersPerTrip: [40, 60],
  miningKmPerLiter: [3.0, 3.5],
  miningLitersPerTrip: [30, 45],
  globalLitersPerTon: [0.5, 1.5]
};

export const dbService = {
  async getInitialState(): Promise<FleetState | null> {
    try {
      const [
        { data: trucks },
        { data: drivers },
        { data: mCoalSites },
        { data: mFuelStations },
        { data: mUsers },
        { data: mProfiles },
        { data: mDieselParties },
        { data: mMaterials }, { data: mSites }, { data: mAgents }, { data: mLoaders }, { data: mCustomers }, { data: mSuppliers }, { data: mRoyalty }, { data: mTireSuppliers }, { data: mTireBrands },
        tireInventory,
        ledgerData,
        { data: dailyOdo }
      ] = await Promise.all([
        supabase.from('trucks').select('*'),
        supabase.from('drivers').select('*'),
        supabase.from('coal_sites').select('*'),
        supabase.from('fuel_stations').select('*'),
        supabase.from('app_users').select('id, username, role'),
        supabase.from('profiles').select('id, username, role'),
        supabase.from('diesel_parties').select('*'),
        supabase.from('material_types').select('name'),
        supabase.from('operational_sites').select('name'),
        supabase.from('carting_agents').select('name'),
        supabase.from('loaders').select('name'),
        supabase.from('customers').select('name'),
        supabase.from('suppliers').select('name'),
        supabase.from('royalty_names').select('name'),
        supabase.from('tire_suppliers').select('name'),
        supabase.from('tire_brands').select('name'),
        this.getTireInventory(),
        this.getLedgerData(),
        supabase.from('daily_odo_registry').select('*')
      ]);

      let benchmarks = DEFAULT_BENCHMARKS;
      try {
        const { data: mSettings, error: sError } = await supabase.from('system_settings').select('*').eq('key', 'benchmarks').maybeSingle();
        if (!sError && mSettings) {
          benchmarks = mSettings.value;
        }
      } catch (e) {
        console.error('System settings fetch failed, using defaults');
      }

      const masterData: MasterData = {
        materials: mMaterials?.map(m => m.name) || [],
        sites: mSites?.map(m => m.name) || [],
        agents: mAgents?.map(m => m.name) || [],
        loaders: mLoaders?.map(m => m.name) || [],
        customers: mCustomers?.map(m => m.name) || [],
        suppliers: mSuppliers?.map(m => m.name) || [],
        royaltyNames: mRoyalty?.map(m => m.name) || [],
        tireSuppliers: mTireSuppliers?.map(m => m.name) || [],
        tireBrands: mTireBrands?.map(m => m.name) || [],
        coalSites: (mCoalSites || []).map(s => ({ id: s.id, name: s.name, siteType: s.site_type })),
        fuelStations: (mFuelStations || []).map(s => ({ id: s.id, name: s.name, location: s.location, isInternal: s.is_internal })),
        dieselParties: (mDieselParties || []).map(p => ({ id: p.id, name: p.name, type: p.type as any, contact: p.contact, phone: p.phone, notes: p.notes })),
        benchmarks
      };

      return {
        trucks: (trucks || []).map(t => ({
          ...t,
          plateNumber: t.plate_number,
          transporterName: t.transporter_name,
          currentOdometer: t.current_odometer,
          wheelConfig: t.wheel_config,
          fleetType: t.fleet_type,
          rcExpiry: t.rc_expiry,
          fitnessExpiry: t.fitness_expiry,
          insuranceExpiry: t.insurance_expiry,
          puccExpiry: t.pucc_expiry,
          taxExpiry: t.tax_expiry,
          permitExpiry: t.permit_expiry,
          statusHistory: t.status_history || [],
          tires: tireInventory.filter(tire => tire.truckId === t.id && tire.status === 'MOUNTED')
        })),
        drivers: (drivers || []).map(d => ({
          ...d,
          licenseNumber: d.license_number,
          type: (d.driver_type as any) || 'Permanent'
        })),
        tireInventory,
        fuelLogs: [],
        partyDieselTransactions: ledgerData.partyTransactions,
        miscFuelEntries: ledgerData.miscFuelEntries,
        coalLogs: [],
        miningLogs: [],
        dailyOdo: (dailyOdo || []).map(d => ({
          truckId: d.truck_id,
          date: d.date,
          openingOdometer: d.opening_odometer,
          closingOdometer: d.closing_odometer
        })),
        stationPayments: ledgerData.stationPayments,
        dieselParties: masterData.dieselParties,
        tripLogs: [],
        purchaseHistory: [],
        masterData,
        users: (AUTH_CONFIG.mode === 'SUPABASE' ? (mProfiles || []) : (mUsers || [])).map(u => ({
          id: u.id,
          username: u.username,
          role: u.role as any
        })),
        currentUser: null
      };
    } catch (error) {
      console.error('Supabase fetch failed:', error);
      return null;
    }
  },

  async getCoalLogs(limit = 100, offset = 0): Promise<CoalLog[]> {
    const { data } = await supabase
      .from('coal_logs')
      .select('*')
      .order('date', { ascending: false })
      .range(offset, offset + limit - 1);
    
    return (data || []).map(c => ({
      ...c,
      truckId: c.truck_id,
      driverId: c.driver_id,
      passNo: c.pass_no,
      grossWeight: c.gross_weight,
      tareWeight: c.tare_weight,
      netWeight: c.net_weight,
      dieselLiters: c.diesel_liters,
      dieselAdjustment: c.diesel_adjustment,
      airAdjustment: c.air_adjustment || 0,
      dieselAdjType: c.diesel_adj_type,
      dieselRate: c.diesel_rate,
      tripRemarks: c.trip_remarks,
      dieselRemarks: c.diesel_remarks,
      airRemarks: c.air_remarks || '',
      from: c.origin_site,
      to: c.destination_site,
      adjustment: c.trip_adjustment || 0,
      staffWelfare: c.staff_welfare || 0,
      rollAmount: c.roll_amount || 0
    }));
  },

  async getMiningLogs(limit = 100, offset = 0): Promise<MiningLog[]> {
    const { data } = await supabase
      .from('mining_logs')
      .select('*')
      .order('date', { ascending: false })
      .range(offset, offset + limit - 1);
    
    return (data || []).map(m => ({
      ...m,
      chalanNo: m.chalan_no,
      customerName: m.customer_name, 
      truckId: m.truck_id,
      driverId: m.driver_id,
      royaltyName: m.royalty_name,
      royaltyPassNo: m.royalty_pass_no,
      cartingAgent: m.carting_agent
    }));
  },

  async getFuelLogs(limit = 100, offset = 0): Promise<{ fuelLogs: FuelLog[], dailyOdo: DailyOdoEntry[] }> {
    const [
      { data: fuelLogs },
      { data: dailyOdo }
    ] = await Promise.all([
      supabase.from('fuel_logs').select('*').order('date', { ascending: false }).range(offset, offset + limit - 1),
      supabase.from('daily_odo_registry').select('*')
    ]);

    return {
      fuelLogs: (fuelLogs || []).map(f => ({
        ...f,
        truckId: f.truck_id,
        driverId: f.driver_id,
        stationId: f.station_id,
        partyId: f.party_id,
        previousOdometer: f.previous_odometer,
        fuelLiters: f.fuel_liters,
        agentId: f.agent_id,
        status: f.status,
        dieselPrice: f.diesel_price,
        verificationPhotos: f.verification_photos,
        performanceRemarks: f.performance_remarks,
        photoProof: f.verification_photos?.odo || null,
        attributionDate: f.attribution_date || f.date,
        entryType: f.entry_type || 'FULL_TANK'
      })),
      dailyOdo: (dailyOdo || []).map(d => ({
        truckId: d.truck_id,
        date: d.date,
        openingOdometer: d.opening_odometer,
        closingOdometer: d.closing_odometer
      }))
    };
  },

  async getLedgerData(): Promise<{ partyTransactions: any[], miscFuelEntries: MiscFuelEntry[], stationPayments: StationPayment[] }> {
    const [
       { data: mPartyTransactions },
       { data: mMiscFuelEntries },
       { data: mStationPayments }
    ] = await Promise.all([
      supabase.from('party_diesel_transactions').select('*').order('date', { ascending: false }),
      supabase.from('misc_fuel_entries').select('*').order('date', { ascending: false }).limit(500),
      supabase.from('fuel_station_payments').select('*')
    ]);

    return {
      partyTransactions: (mPartyTransactions || []).map(t => ({
        id: t.id,
        partyId: t.party_id,
        date: t.date,
        type: t.type as any,
        fuelLiters: t.fuel_liters,
        dieselPrice: t.diesel_price,
        amount: t.amount,
        fuelLogId: t.fuel_log_id,
        sourceId: t.source_id,
        destTankerId: t.dest_tanker_id,
        bridgeEntryId: t.bridge_entry_id,
        invoiceNo: t.invoice_no,
        remarks: t.remarks
      })),
      miscFuelEntries: (mMiscFuelEntries || []).map(m => ({
        id: m.id,
        stationId: m.station_id,
        date: m.date,
        vehicleDescription: m.vehicle_description,
        usageType: m.usage_type as any,
        fuelLiters: m.fuel_liters,
        dieselPrice: m.diesel_price,
        amount: m.amount,
        invoiceNo: m.invoice_no,
        receiverName: m.receiver_name,
        remarks: m.remarks,
        destinationStationId: m.destination_station_id
      })),
      stationPayments: (mStationPayments || []).map(p => ({
        id: p.id,
        stationId: p.station_id,
        date: p.date,
        amount: p.amount,
        paymentMethod: p.payment_method,
        referenceNo: p.reference_no,
        remarks: p.remarks
      }))
    };
  },

  async getTireInventory(): Promise<Tire[]> {
    const { data: tires } = await supabase.from('tire_inventory').select('*');
    return (tires || []).map(tire => ({
      ...tire,
      serialNumber: tire.serial_number,
      truckId: tire.truck_id,
      position: tire.position, 
      expectedLifespan: tire.expected_lifespan,
      billNumber: tire.bill_number,
      mountedAtOdometer: tire.mounted_at_odometer,
      scrappedReason: tire.scrapped_reason,
      history: tire.history || []
    }));
  },

  async addTruck(truck: Truck): Promise<void> {
    const payload: any = {
      id: truck.id,
      plate_number: truck.plateNumber,
      transporter_name: truck.transporterName,
      model: truck.model,
      wheel_config: truck.wheelConfig,
      current_odometer: truck.currentOdometer,
      status: truck.status,
      remarks: truck.remarks,
      fleet_type: truck.fleetType,
      fitness_expiry: clean(truck.fitnessExpiry),
      insurance_expiry: clean(truck.insuranceExpiry),
      pucc_expiry: clean(truck.puccExpiry),
      tax_expiry: clean(truck.taxExpiry),
      permit_expiry: clean(truck.permitExpiry),
      documents: truck.documents,
      status_history: truck.statusHistory || []
    };
    const { error } = await supabase.from('trucks').insert([payload]);
    if (error) throw error;
  },

  async updateTruck(truck: Truck): Promise<void> {
    const { error } = await supabase
      .from('trucks')
      .update({
        plate_number: truck.plateNumber,
        transporter_name: truck.transporterName,
        model: truck.model,
        wheel_config: truck.wheelConfig,
        current_odometer: truck.currentOdometer,
        status: truck.status,
        remarks: truck.remarks,
        fleet_type: truck.fleetType,
        fitness_expiry: clean(truck.fitnessExpiry),
        insurance_expiry: clean(truck.insuranceExpiry),
        pucc_expiry: clean(truck.puccExpiry),
        tax_expiry: clean(truck.taxExpiry),
        permit_expiry: clean(truck.permitExpiry),
        documents: truck.documents,
        status_history: truck.statusHistory || []
      })
      .eq('id', truck.id);
    if (error) throw error;
  },

  async addDriver(driver: Driver): Promise<void> {
    const { error } = await supabase.from('drivers').insert([{
      id: driver.id,
      name: driver.name,
      license_number: driver.licenseNumber,
      phone: driver.phone,
      status: driver.status,
      driver_type: driver.type
    }]);
    if (error) throw error;
  },

  async updateDriver(driver: Driver): Promise<void> {
    const { error } = await supabase.from('drivers').update({
      name: driver.name,
      license_number: driver.licenseNumber,
      phone: driver.phone,
      status: driver.status,
      driver_type: driver.type
    }).eq('id', driver.id);
    if (error) throw error;
  },

  async addTire(tire: Tire | Tire[]): Promise<void> {
    const tires = Array.isArray(tire) ? tire : [tire];
    const payload = tires.map(t => ({
      id: t.id,
      serial_number: t.serialNumber,
      brand: t.brand,
      size: t.size,
      mileage: t.mileage,
      expected_lifespan: t.expectedLifespan,
      status: t.status,
      last_inspection_date: t.lastInspectionDate,
      scrapped_reason: t.scrappedReason,
      manufacturer: t.manufacturer,
      supplier: t.supplier,
      bill_number: t.billNumber,
      history: t.history || []
    }));
    const { error } = await supabase.from('tire_inventory').insert(payload);
    if (error) throw error;
  },

  async updateTire(tireId: string, updates: Partial<Tire>): Promise<void> {
    const dbUpdates: any = {};
    if (updates.serialNumber) dbUpdates.serial_number = updates.serialNumber;
    if (updates.status) dbUpdates.status = updates.status;
    if (updates.mileage !== undefined) dbUpdates.mileage = updates.mileage;
    if (updates.scrappedReason) dbUpdates.scrapped_reason = updates.scrappedReason;
    if (updates.truckId !== undefined) dbUpdates.truck_id = updates.truckId;
    if (updates.position !== undefined) dbUpdates.position = updates.position;
    if (updates.billNumber) dbUpdates.bill_number = updates.billNumber;
    if (updates.expectedLifespan) dbUpdates.expected_lifespan = updates.expectedLifespan;
    if (updates.history) dbUpdates.history = updates.history;
    if (updates.brand) dbUpdates.brand = updates.brand;
    if (updates.size) dbUpdates.size = updates.size;
    if (updates.manufacturer) dbUpdates.manufacturer = updates.manufacturer;
    if (updates.supplier) dbUpdates.supplier = updates.supplier;

    const { error } = await supabase.from('tire_inventory').update(dbUpdates).eq('id', tireId);
    if (error) throw error;
  },

  async addFuelLog(log: FuelLog): Promise<void> {
    const { error: logError } = await supabase.from('fuel_logs').insert([{
      id: log.id,
      truck_id: log.truckId,
      driver_id: clean(log.driverId),
      station_id: clean(log.stationId),
      party_id: clean(log.partyId),
      date: log.date,
      attribution_date: log.attributionDate,
      entry_type: log.entryType,
      odometer: log.odometer,
      previous_odometer: log.previousOdometer,
      fuel_liters: log.fuelLiters,
      agent_id: log.agentId,
      status: log.status || 'COMPLETED',
      diesel_price: log.dieselPrice || 0,
      verification_photos: log.verificationPhotos, // CRITICAL: DO NOT ALTER. Mapping camelCase to snake_case.
      performance_remarks: log.performanceRemarks
    }]);
    if (logError) throw logError;
    
    if (log.status !== 'IN_PROGRESS') {
      await supabase.from('trucks').update({ current_odometer: log.odometer }).eq('id', log.truckId);
      await this.upsertDailyOdo({
        truckId: log.truckId,
        date: log.date,
        openingOdometer: log.previousOdometer,
        closingOdometer: log.odometer
      });
      // Attribution aware backfill
      await this.backFillCoalLogs(log.truckId, log.attributionDate, log.driverId, log.fuelLiters, log.dieselPrice || 90.55);
    }
  },

  async updateFuelLog(log: FuelLog): Promise<void> {
    const { error } = await supabase
      .from('fuel_logs')
      .update({
        truck_id: log.truckId,
        driver_id: log.driverId,
        station_id: clean(log.stationId),
        party_id: clean(log.partyId),
        date: log.date,
        attribution_date: log.attributionDate,
        entry_type: log.entryType,
        odometer: log.odometer,
        fuel_liters: log.fuelLiters,
        diesel_price: log.dieselPrice,
        verification_photos: log.verificationPhotos, // CRITICAL: DO NOT ALTER. Mapping camelCase to snake_case.
        performance_remarks: log.performanceRemarks
      })
      .eq('id', log.id);
    if (error) throw error;

    await supabase.from('trucks').update({ current_odometer: log.odometer }).eq('id', log.truckId);
    
    await this.upsertDailyOdo({
      truckId: log.truckId,
      date: log.date,
      openingOdometer: log.previousOdometer,
      closingOdometer: log.odometer
    });
    await this.backFillCoalLogs(log.truckId, log.attributionDate, log.driverId, log.fuelLiters, log.dieselPrice || 90.55);
  },

  async backFillCoalLogs(truckId: string, attributionDate: string, driverId: string, totalLiters: number, rate: number): Promise<void> {
    const { data: logs } = await supabase
      .from('coal_logs')
      .select('id')
      .eq('truck_id', truckId)
      .eq('date', attributionDate);

    if (logs && logs.length > 0) {
      const litersPerTrip = totalLiters / logs.length;
      await supabase
        .from('coal_logs')
        .update({
          driver_id: driverId,
          diesel_liters: litersPerTrip,
          diesel_rate: rate
        })
        .eq('truck_id', truckId)
        .eq('date', attributionDate);
    }
  },

  async deleteFuelLog(id: string): Promise<void> {
    // Get the log first to know truck/date for ODO removal
    const { data: log } = await supabase.from('fuel_logs').select('truck_id, date').eq('id', id).single();
    
    if (log) {
      await supabase.from('daily_odo_registry').delete().eq('truck_id', log.truck_id).eq('date', log.date);
    }

    const { error } = await supabase.from('fuel_logs').delete().eq('id', id);
    if (error) throw error;
  },

  async upsertDailyOdo(entry: DailyOdoEntry): Promise<void> {
    const { error } = await supabase.from('daily_odo_registry').upsert({
      truck_id: entry.truckId,
      date: entry.date,
      opening_odometer: entry.openingOdometer,
      closing_odometer: entry.closingOdometer
    }, { onConflict: 'truck_id, date' });
    if (error) throw error;
  },

  async addMiscFuelEntry(entry: MiscFuelEntry): Promise<void> {
    const { error } = await supabase.from('misc_fuel_entries').insert([{
      id: entry.id,
      station_id: entry.stationId,
      date: entry.date,
      vehicle_description: entry.vehicleDescription,
      usage_type: entry.usageType,
      fuel_liters: entry.fuelLiters,
      diesel_price: entry.dieselPrice,
      amount: entry.amount,
      invoice_no: entry.invoiceNo,
      receiver_name: entry.receiverName,
      remarks: entry.remarks,
      destination_station_id: entry.destinationStationId
    }]);
    if (error) throw error;
  },

  async updateMiscFuelEntry(entry: MiscFuelEntry): Promise<void> {
    const { error } = await supabase.from('misc_fuel_entries').update({
      station_id: entry.stationId,
      date: entry.date,
      vehicle_description: entry.vehicleDescription,
      usage_type: entry.usageType,
      fuel_liters: entry.fuelLiters,
      diesel_price: entry.dieselPrice,
      amount: entry.amount,
      invoice_no: entry.invoiceNo,
      receiver_name: entry.receiverName,
      remarks: entry.remarks,
      destination_station_id: entry.destinationStationId
    }).eq('id', entry.id);
    if (error) throw error;
  },

  async deleteMiscFuelEntry(id: string): Promise<void> {
    const { error } = await supabase.from('misc_fuel_entries').delete().eq('id', id);
    if (error) throw error;
  },

  async addCoalLogs(logs: CoalLog[]): Promise<void> {
    const payload = logs.map(c => ({
      id: c.id || crypto.randomUUID(),
      truck_id: c.truckId,
      driver_id: clean(c.driverId),
      date: c.date,
      // Fix: Mapped to camelCase property passNo
      pass_no: c.passNo,
      // Fix: Mapped to camelCase property grossWeight
      gross_weight: c.grossWeight,
      // Fix: Mapped to camelCase property tareWeight
      tare_weight: c.tareWeight,
      diesel_liters: c.dieselLiters,
      diesel_adjustment: c.dieselAdjustment,
      // Fix: Mapped to camelCase property airAdjustment
      air_adjustment: c.airAdjustment || 0,
      // Fix: Mapped to camelCase property dieselAdjType
      diesel_adj_type: c.dieselAdjType || 'OTHER',
      diesel_rate: c.dieselRate,
      trip_remarks: c.tripRemarks,
      diesel_remarks: c.dieselRemarks,
      air_remarks: c.airRemarks,
      origin_site: c.from,
      destination_site: c.to,
      trip_adjustment: c.adjustment || 0,
      staff_welfare: c.staffWelfare || 0,
      roll_amount: c.rollAmount || 0
    }));
    const { error = null } = await supabase.from('coal_logs').insert(payload);
    if (error) throw error;
  },

  async updateCoalLog(log: CoalLog): Promise<void> {
    await this.updateCoalLogs([log]);
  },

  async updateCoalLogs(logs: CoalLog[]): Promise<void> {
    const payload = logs.map(c => ({
      id: c.id,
      truck_id: c.truckId,
      driver_id: clean(c.driverId),
      date: c.date,
      pass_no: c.passNo,
      gross_weight: c.grossWeight,
      tare_weight: c.tareWeight,
      diesel_liters: c.dieselLiters,
      diesel_adjustment: c.dieselAdjustment,
      air_adjustment: c.airAdjustment || 0,
      diesel_adj_type: c.dieselAdjType || 'OTHER',
      diesel_rate: c.dieselRate,
      trip_remarks: c.tripRemarks,
      diesel_remarks: c.dieselRemarks,
      air_remarks: c.airRemarks,
      origin_site: c.from,
      destination_site: c.to,
      trip_adjustment: c.adjustment || 0,
      staff_welfare: c.staffWelfare || 0,
      roll_amount: c.rollAmount || 0
    }));
    const { error } = await supabase.from('coal_logs').upsert(payload);
    if (error) throw error;
  },

  async deleteCoalLog(id: string): Promise<void> {
    const { error } = await supabase.from('coal_logs').delete().eq('id', id);
    if (error) throw error;
  },

  async addMiningLogs(logs: MiningLog[]): Promise<void> {
    const payload = logs.map(m => ({
      id: m.id,
      type: m.type,
      date: m.date,
      time: m.time,
      chalan_no: m.chalanNo,
      customer_name: m.customerName, 
      site: m.site,
      royalty_name: m.royaltyName,
      royalty_pass_no: m.royaltyPassNo,
      truck_id: m.truckId,
      driver_id: clean(m.driverId),
      carting_agent: m.cartingAgent,
      loader: m.loader,
      material: m.material,
      gross: m.gross,
      tare: m.tare
    }));
    const { error = null } = await supabase.from('mining_logs').insert(payload);
    if (error) throw error;
  },

  async updateMiningLog(log: MiningLog): Promise<void> {
    const { error } = await supabase
      .from('mining_logs')
      .update({
        type: log.type,
        date: log.date,
        time: log.time,
        chalan_no: log.chalanNo,
        customer_name: log.customerName, 
        site: log.site,
        royalty_name: log.royaltyName,
        royalty_pass_no: log.royaltyPassNo,
        truck_id: log.truckId,
        driver_id: clean(log.driverId),
        carting_agent: log.cartingAgent,
        loader: log.loader,
        material: log.material,
        gross: log.gross,
        tare: log.tare
      })
      .eq('id', log.id);
    if (error) throw error;
  },

  async deleteMiningLog(id: string): Promise<void> {
    const { error } = await supabase.from('mining_logs').delete().eq('id', id);
    if (error) throw error;
  },

  async addStationPayment(payment: StationPayment): Promise<void> {
    const { error } = await supabase.from('fuel_station_payments').insert([{
      id: payment.id,
      station_id: payment.stationId,
      date: payment.date,
      amount: payment.amount,
      payment_method: payment.paymentMethod,
      reference_no: payment.referenceNo,
      remarks: payment.remarks
    }]);
    if (error) throw error;
  },

  async deleteStationPayment(id: string): Promise<void> {
    const { error } = await supabase.from('fuel_station_payments').delete().eq('id', id);
    if (error) throw error;
  },

  async addDieselParty(party: any): Promise<void> {
    const { error } = await supabase.from('diesel_parties').insert([party]);
    if (error) throw error;
  },

  async updateDieselParty(party: any): Promise<void> {
    const { error } = await supabase.from('diesel_parties').update(party).eq('id', party.id);
    if (error) throw error;
  },

  async deleteDieselParty(id: string): Promise<void> {
    const { error } = await supabase.from('diesel_parties').delete().eq('id', id);
    if (error) throw error;
  },

  async addPartyTransaction(tx: any): Promise<void> {
    const payload = {
      id: tx.id,
      party_id: tx.partyId,
      date: tx.date,
      type: tx.type,
      fuel_liters: tx.fuelLiters,
      diesel_price: tx.dieselPrice,
      amount: tx.amount,
      fuel_log_id: tx.fuelLogId,
      source_id: tx.sourceId,
      dest_tanker_id: tx.destTankerId,
      bridge_entry_id: tx.bridgeEntryId,
      invoice_no: tx.invoiceNo,
      remarks: tx.remarks
    };
    const { error } = await supabase.from('party_diesel_transactions').insert([payload]);
    if (error) throw error;
  },

  async updatePartyTransaction(tx: any): Promise<void> {
    const payload = {
      party_id: tx.partyId,
      date: tx.date,
      type: tx.type,
      fuel_liters: tx.fuelLiters,
      diesel_price: tx.dieselPrice,
      amount: tx.amount,
      fuel_log_id: tx.fuelLogId,
      source_id: tx.sourceId,
      dest_tanker_id: tx.destTankerId,
      bridge_entry_id: tx.bridgeEntryId,
      invoice_no: tx.invoiceNo,
      remarks: tx.remarks
    };
    const { error } = await supabase.from('party_diesel_transactions').update(payload).eq('id', tx.id);
    if (error) throw error;
  },

  async deletePartyTransaction(id: string): Promise<void> {
    const { error } = await supabase.from('party_diesel_transactions').delete().eq('id', id);
    if (error) throw error;
  },

  async updateMasterData(key: keyof MasterData, list: any[]): Promise<void> {
    if (key === 'benchmarks') {
      try {
        await supabase.from('system_settings').upsert({ key: 'benchmarks', value: list });
      } catch (e) {
        console.error('Benchmarking persistence in DB failed.');
      }
      return;
    }

    const tableName = masterTableMap[key];
    if (!tableName) return;

    try {
      if (key === 'coalSites' || key === 'fuelStations' || key === 'dieselParties') {
        const newIds = list.map(s => s.id);
        
        // 1. Delete items that were removed from the list
        if (newIds.length > 0) {
          await supabase.from(tableName).delete().filter('id', 'not.in', `(${newIds.join(',')})`);
        } else {
          await supabase.from(tableName).delete().not('id', 'is', null);
        }

        // 2. Upsert remaining items to update/add
        if (key === 'coalSites') {
          const payload = list.map(s => ({ id: s.id, name: s.name, site_type: s.siteType }));
          await supabase.from('coal_sites').upsert(payload);
        } else if (key === 'fuelStations') {
          const payload = list.map(s => ({ id: s.id, name: s.name, location: s.location, is_internal: s.isInternal || false }));
          await supabase.from('fuel_stations').upsert(payload);
        } else if (key === 'dieselParties') {
          const payload = list.map(p => ({ id: p.id, name: p.name, type: p.type, contact: p.contact, phone: p.phone, notes: p.notes }));
          await supabase.from('diesel_parties').upsert(payload);
        }
      } else {
        // For simple string lists, we still use the delete-then-insert pattern
        const { error: deleteError } = await supabase
          .from(tableName)
          .delete()
          .not('name', 'is', null);

        if (!deleteError && list.length > 0) {
          const payload = list.map(name => ({ name }));
          await supabase.from(tableName).insert(payload);
        } else if (deleteError) {
          console.error('Delete phase of master data update failed:', deleteError);
        }
      }
    } catch (e) {
      console.error('Master data update failed for:', tableName, e);
    }
  },

  async signIn(username: string, password: string): Promise<User | null> {
    const { data, error } = await supabase
      .from('app_users')
      .select('id, username, role, password')
      .eq('username', username)
      .single();
    if (error || !data) return null;
    if (data.password === password) {
      return { id: data.id, username: data.username, role: data.role as any };
    }
    return null;
  },

  async addUser(user: User, password: string): Promise<void> {
    const table = AUTH_CONFIG.mode === 'SUPABASE' ? 'profiles' : 'app_users';
    const payload: any = {
      id: user.id,
      username: user.username,
      role: user.role,
    };
    if (AUTH_CONFIG.mode === 'MANUAL') {
      payload.password = password;
    }

    const { error } = await supabase.from(table).insert([payload]);
    if (error) throw error;
  },

  async updateUser(user: User, password?: string): Promise<void> {
    const table = AUTH_CONFIG.mode === 'SUPABASE' ? 'profiles' : 'app_users';
    const updates: any = {
      username: user.username,
      role: user.role
    };
    if (AUTH_CONFIG.mode === 'MANUAL' && password) {
      updates.password = password;
    }
    const { error } = await supabase.from(table).update(updates).eq('id', user.id);
    if (error) throw error;
  },

  async deleteUser(id: string): Promise<void> {
    const table = AUTH_CONFIG.mode === 'SUPABASE' ? 'profiles' : 'app_users';
    const { error } = await supabase.from(table).delete().eq('id', id);
    if (error) throw error;
  }
};
