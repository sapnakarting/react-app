/**
 * Generates a unique ID (UUID v4) with fallback for older browsers or non-secure origins.
 * crypto.randomUUID() is only available in secure contexts (HTTPS/localhost) and modern browsers.
 */
export const generateUUID = (): string => {
  try {
    // 1. Try modern secure API
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch (e) {}

  // 2. Fallback for older browsers / HTTP
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

/**
 * Calculates the true KM/L for a given log, handling PARTIAL_FILL lookbacks.
 * Returns null if the entry is PARTIAL_FILL or PER_TRIP because efficiency is unknown or NA.
 */
export const calculateTrueEfficiency = (currentLog: import('./types').FuelLog, allTruckLogs: import('./types').FuelLog[]) => {
  if (currentLog.entryType !== 'FULL_TANK') return null;

  // Sort truck's logs chronologically
  const sortedLogs = [...allTruckLogs].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  
  const currentIndex = sortedLogs.findIndex(l => l.id === currentLog.id);
  if (currentIndex === -1) return null;

  let totalLiters = currentLog.fuelLiters;
  let startOdometer = currentLog.previousOdometer;

  // Look back at previous logs
  for (let i = currentIndex - 1; i >= 0; i--) {
    const prevLog = sortedLogs[i];
    if (prevLog.entryType === 'PARTIAL_FILL') {
      // Accumulate liters from partial fills
      totalLiters += prevLog.fuelLiters;
      // Start odometer gets pushed further back
      startOdometer = prevLog.previousOdometer;
    } else if (prevLog.entryType === 'FULL_TANK') {
      // Stop looking back when we hit the previous FULL_TANK
      startOdometer = prevLog.odometer; // Ensure we start strictly from the end of the last full tank
      break;
    }
  }

  const distance = currentLog.odometer - startOdometer;
  if (distance <= 0 || totalLiters <= 0) return 0;

  return distance / totalLiters;
};
