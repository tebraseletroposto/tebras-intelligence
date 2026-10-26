import { OBJECTIVES, OCCUPANCY, PROPERTY_STATUS, PROPERTY_TYPES } from "@/server/intel/properties";

export const propertyFormOptions = () => ({
  types: { ...PROPERTY_TYPES } as Record<string, string>,
  occupancy: { ...OCCUPANCY } as Record<string, string>,
  objectives: { ...OBJECTIVES } as Record<string, string>,
  statuses: Object.fromEntries(Object.entries(PROPERTY_STATUS).map(([k, v]) => [k, v.label])),
});
