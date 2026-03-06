export function formatNumber(value: number | null | undefined, decimals: number = 2): string {
  if (value === null || value === undefined) return "N/A";
  return value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function formatPercent(value: number | null | undefined, decimals: number = 1): string {
  if (value === null || value === undefined) return "N/A";
  return `${value.toFixed(decimals)}%`;
}

export function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined) return "N/A";
  if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e3) return `$${(value / 1e3).toFixed(2)}K`;
  return `$${value.toFixed(2)}`;
}

export function formatRatio(value: number | null | undefined, decimals: number = 1): string {
  if (value === null || value === undefined) return "N/A";
  return value.toFixed(decimals) + "x";
}

export function formatPercentile(percentile: number | null | undefined): string {
  if (percentile === null || percentile === undefined) return "N/A";
  return `${Math.round(percentile)}%`;
}

export function getMomentumColor(percentile: number | null | undefined): string {
  if (percentile === null || percentile === undefined) return "bg-gray-100";
  if (percentile >= 80) return "bg-green-600 text-white";
  if (percentile >= 60) return "bg-green-200 text-green-900";
  if (percentile >= 40) return "bg-gray-100 text-gray-700";
  if (percentile >= 20) return "bg-orange-200 text-orange-900";
  return "bg-red-500 text-white";
}

export function getPercentileBadgeClass(percentile: number | null | undefined): string {
  if (percentile === null || percentile === undefined) return "bg-gray-100 text-gray-500";
  if (percentile >= 75) return "bg-green-100 text-green-800";
  if (percentile >= 50) return "bg-blue-100 text-blue-800";
  return "bg-red-100 text-red-800";
}
