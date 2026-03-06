"use client";

import { useState } from "react";
import { formatNumber } from "@/lib/formatters";

interface HeatmapGridProps {
  countries: string[];
  sectors: string[];
  matrix: (number | null)[][];
  counts: number[][];
  companies: Record<string, any[]>;
  metric: string;
  momentumMatrix?: (number | null)[][] | null;
  colorMode: "metric" | "momentum";
}

function getMetricColor(value: number | null, allValues: number[]): string {
  if (value === null) return "bg-gray-50";
  const sorted = [...allValues].sort((a, b) => a - b);
  const idx = sorted.findIndex((v) => v >= value);
  const pct = sorted.length > 1 ? idx / (sorted.length - 1) : 0.5;
  // Lower metric value = cheaper = greener (for valuation metrics)
  if (pct <= 0.2) return "bg-green-600 text-white";
  if (pct <= 0.4) return "bg-green-200 text-green-900";
  if (pct <= 0.6) return "bg-gray-100 text-gray-700";
  if (pct <= 0.8) return "bg-orange-200 text-orange-900";
  return "bg-red-500 text-white";
}

function getMomentumColor(percentile: number | null): string {
  if (percentile === null) return "bg-gray-50 text-gray-400";
  if (percentile >= 80) return "bg-green-600 text-white";
  if (percentile >= 60) return "bg-green-200 text-green-900";
  if (percentile >= 40) return "bg-gray-100 text-gray-700";
  if (percentile >= 20) return "bg-orange-200 text-orange-900";
  return "bg-red-500 text-white";
}

export default function HeatmapGrid({
  countries, sectors, matrix, counts, companies, metric, momentumMatrix, colorMode,
}: HeatmapGridProps) {
  const [drillDown, setDrillDown] = useState<{ country: string; sector: string } | null>(null);

  // Collect all non-null values for color scaling
  const allValues = matrix.flat().filter((v): v is number => v !== null);

  const drillDownCompanies = drillDown
    ? companies[`${drillDown.country}_${drillDown.sector}`] || []
    : [];

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="text-xs border-collapse">
          <thead>
            <tr>
              <th className="sticky left-0 bg-white z-10 text-left py-2 px-3 text-ba-navy font-semibold border-b-2 border-ba-navy">
                Country
              </th>
              {sectors.map((s) => (
                <th key={s} className="py-2 px-2 text-ba-navy font-medium border-b-2 border-ba-navy whitespace-nowrap max-w-[100px] truncate" title={s}>
                  {s}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {countries.map((country, ci) => (
              <tr key={country}>
                <td className="sticky left-0 bg-white z-10 py-1.5 px-3 font-medium text-ba-navy border-b border-gray-100 whitespace-nowrap">
                  {country}
                </td>
                {sectors.map((sector, si) => {
                  const value = matrix[ci]?.[si];
                  const count = counts[ci]?.[si] || 0;
                  const momPct = momentumMatrix?.[ci]?.[si];

                  const colorClass =
                    colorMode === "momentum" && momentumMatrix
                      ? getMomentumColor(momPct)
                      : getMetricColor(value, allValues);

                  return (
                    <td
                      key={sector}
                      className={`py-1.5 px-2 text-center border-b border-gray-100 cursor-pointer transition-all hover:ring-2 hover:ring-ba-accent ${colorClass}`}
                      onClick={() => count > 0 && setDrillDown({ country, sector })}
                      title={`${country} / ${sector}: ${value != null ? formatNumber(value, 1) : "N/A"} (${count} co.)`}
                    >
                      {value != null ? (
                        <div>
                          <div className="font-medium">{formatNumber(value, 1)}</div>
                          <div className="opacity-60">{count}</div>
                        </div>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Drill-down modal */}
      {drillDown && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={() => setDrillDown(null)}>
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="font-serif text-lg font-semibold text-ba-navy">
                {drillDown.country} — {drillDown.sector}
              </h3>
              <button onClick={() => setDrillDown(null)} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
            </div>
            <div className="p-4">
              {drillDownCompanies.length > 0 ? (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-2 px-2">Ticker</th>
                      <th className="text-left py-2 px-2">Name</th>
                      <th className="text-left py-2 px-2">Industry</th>
                      <th className="text-right py-2 px-2">{metric.toUpperCase()}</th>
                      {momentumMatrix && <th className="text-right py-2 px-2">Momentum %</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {drillDownCompanies
                      .sort((a: any, b: any) => (a.metric_value || 999) - (b.metric_value || 999))
                      .map((c: any) => (
                        <tr key={c.ticker} className="border-b border-gray-50 hover:bg-ba-light">
                          <td className="py-1.5 px-2 font-medium text-ba-navy">{c.ticker}</td>
                          <td className="py-1.5 px-2 max-w-[200px] truncate">{c.company_name}</td>
                          <td className="py-1.5 px-2 text-gray-500">{c.industry || "—"}</td>
                          <td className="py-1.5 px-2 text-right">{c.metric_value != null ? formatNumber(c.metric_value, 1) : "—"}</td>
                          {momentumMatrix && (
                            <td className="py-1.5 px-2 text-right">
                              {c.momentum != null ? (
                                <span className={`px-1.5 py-0.5 rounded text-xs ${getMomentumColor(c.momentum)}`}>
                                  {Math.round(c.momentum)}%
                                </span>
                              ) : "—"}
                            </td>
                          )}
                        </tr>
                      ))}
                  </tbody>
                </table>
              ) : (
                <p className="text-gray-400 text-center py-8">No companies in this cell</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
