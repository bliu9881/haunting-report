/** The building page carries the geocoder's label and the user's query, for the "not this building?" link. */
export function buildingHref(bbl: string, address: string, q?: string): string {
  const params = new URLSearchParams({ address });
  if (q) params.set("q", q);
  return `/building/${bbl}?${params}`;
}

export function neighborhoodHref(ntaCode: string): string {
  return `/neighborhood/${encodeURIComponent(ntaCode)}`;
}
