"use client";

import { useState, useRef, useMemo } from "react";
import { formatNumber } from "@/lib/formatters";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip,
  ResponsiveContainer, Cell as RechartsCell
} from "recharts";

interface CellMetrics {
  pe: number | null;
  cape: number | null;
  pb: number | null;
  pe_pct: number | null;
  cape_pct: number | null;
  pb_pct: number | null;
  composite: number | null;
}

interface HeatmapGridProps {
  countries: string[];
  sectors: string[];
  matrix: (number | null)[][];
  counts: number[][];
  companies: Record<string, any[]>;
  metric: string;
  momentumMatrix?: (number | null)[][] | null;
  colorMode: "metric" | "momentum";
  title?: string;
  universeCompanies?: Record<string, any[]>;
  focusActive?: boolean;
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

/** 2c: Single-color intensity for focus mode — shades of blue (all cheap) */
function getFocusIntensityColor(value: number | null, allValues: number[]): string {
  if (value === null) return "bg-gray-50 text-gray-400";
  const sorted = [...allValues].sort((a, b) => a - b);
  const idx = sorted.findIndex((v) => v >= value);
  const pct = sorted.length > 1 ? idx / (sorted.length - 1) : 0.5;
  // Lower = cheaper = darker blue
  if (pct <= 0.2) return "bg-blue-800 text-white";
  if (pct <= 0.4) return "bg-blue-600 text-white";
  if (pct <= 0.6) return "bg-blue-400 text-white";
  if (pct <= 0.8) return "bg-blue-200 text-blue-900";
  return "bg-blue-100 text-blue-800";
}

function getMomentumColor(percentile: number | null): string {
  if (percentile === null) return "bg-gray-50 text-gray-400";
  if (percentile >= 80) return "bg-green-600 text-white";
  if (percentile >= 60) return "bg-green-200 text-green-900";
  if (percentile >= 40) return "bg-gray-100 text-gray-700";
  if (percentile >= 20) return "bg-orange-200 text-orange-900";
  return "bg-red-500 text-white";
}

const METRIC_NAMES: Record<string, string> = {
  pe_ratio: "P/E", pb_ratio: "P/B", cape: "CAPE",
  ev_ebitda: "EV/EBITDA", roe: "ROE", net_margin: "Net Margin",
  ev_ebit_avg: "EV/EBIT Avg", ev_nopat_avg: "EV/NOPAT Avg",
  ev_sales: "EV/Sales", ebitda_margin: "EBITDA Margin",
  net_debt_ebitda: "ND/EBITDA",
};

export default function HeatmapGrid({
  countries, sectors, matrix, counts, companies, metric, momentumMatrix, colorMode, title, universeCompanies, focusActive,
}: HeatmapGridProps) {
  const [drillDown, setDrillDown] = useState<{ country: string; sector: string } | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; country: string; sector: string; value: number | null; count: number; metrics: CellMetrics } | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  // Collect all non-null values for color scaling
  const allValues = matrix.flat().filter((v): v is number => v !== null);

  // Pre-compute per-cell average P/E, CAPE, P/B and percentiles
  const cellMetricsMap: Record<string, CellMetrics> = {};
  const allCellPE: number[] = [];
  const allCellCAPE: number[] = [];
  const allCellPB: number[] = [];

  for (const key of Object.keys(companies)) {
    const comps = companies[key];
    if (!comps?.length) continue;
    const avg = (arr: (number | null | undefined)[]) => {
      const valid = arr.filter((v): v is number => v != null && v > 0);
      return valid.length > 0 ? valid.reduce((a, b) => a + b, 0) / valid.length : null;
    };
    const pe = avg(comps.map((c: any) => c.pe_ratio));
    const cape = avg(comps.map((c: any) => c.cape));
    const pb = avg(comps.map((c: any) => c.pb_ratio));
    cellMetricsMap[key] = { pe, cape, pb, pe_pct: null, cape_pct: null, pb_pct: null, composite: null };
    if (pe != null && pe > 0) allCellPE.push(pe);
    if (cape != null && cape > 0) allCellCAPE.push(cape);
    if (pb != null && pb > 0) allCellPB.push(pb);
  }

  const pctRank = (val: number | null, arr: number[]) => {
    if (val == null || arr.length === 0) return null;
    const sorted = [...arr].sort((a, b) => a - b);
    const idx = sorted.filter((v) => v <= val).length;
    return Math.round(((idx - 1) / Math.max(sorted.length - 1, 1)) * 100);
  };

  for (const key of Object.keys(cellMetricsMap)) {
    const m = cellMetricsMap[key];
    m.pe_pct = pctRank(m.pe, allCellPE);
    m.cape_pct = pctRank(m.cape, allCellCAPE);
    m.pb_pct = pctRank(m.pb, allCellPB);
    const pcts = [m.pe_pct, m.cape_pct, m.pb_pct].filter((v): v is number => v != null);
    m.composite = pcts.length > 0 ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : null;
  }

  // Pre-compute per-company percentiles across the full heatmap universe
  const pctSource = universeCompanies || companies;
  const allCompanies: any[] = [];
  for (const comps of Object.values(pctSource)) {
    if (comps?.length) allCompanies.push(...comps);
  }

  const VALUATION_METRICS = new Set(["pe_ratio", "pb_ratio", "cape", "ev_ebitda", "ps_ratio", "ev_sales", "ev_ebit", "ev_fcf"]);

  const universeArrays: Record<string, number[]> = {};
  const COMPANY_METRICS = ["pe_ratio", "pb_ratio", "cape", "roe", "net_margin"] as const;
  for (const m of COMPANY_METRICS) {
    universeArrays[m] = allCompanies
      .map((c: any) => c[m])
      .filter((v): v is number => v != null && (VALUATION_METRICS.has(m) ? v > 0 : true))
      .sort((a, b) => a - b);
  }

  const companyPctRank = (val: number | null | undefined, metricKey: string): number | null => {
    if (val == null) return null;
    if (VALUATION_METRICS.has(metricKey) && val <= 0) return null;
    const arr = universeArrays[metricKey];
    if (!arr || arr.length === 0) return null;
    const idx = arr.filter((v) => v <= val).length;
    return Math.round(((idx - 1) / Math.max(arr.length - 1, 1)) * 100);
  };

  const HIGHER_IS_BETTER = new Set(["roe", "net_margin"]);

  const pctBadgeClass = (pct: number | null, metricKey: string): string => {
    if (pct == null) return "";
    const effective = HIGHER_IS_BETTER.has(metricKey) ? 100 - pct : pct;
    if (effective <= 25) return "bg-green-100 text-green-700";
    if (effective <= 50) return "bg-green-50 text-green-600";
    if (effective <= 75) return "bg-orange-50 text-orange-600";
    return "bg-red-100 text-red-700";
  };

  const drillDownCompanies = drillDown
    ? companies[`${drillDown.country}_${drillDown.sector}`] || []
    : [];

  // 2f: Bar chart data for drill-down
  const drillDownBarData = useMemo(() => {
    if (!drillDown || drillDownCompanies.length === 0) return [];
    return drillDownCompanies
      .filter((c: any) => c.metric_value != null)
      .sort((a: any, b: any) => (a.metric_value || 0) - (b.metric_value || 0))
      .map((c: any) => ({
        ticker: c.ticker,
        value: c.metric_value,
        name: c.company_name,
      }));
  }, [drillDown, drillDownCompanies]);

  return (
    <div>
      {title && (
        <h3 className="font-serif text-lg font-semibold text-ba-navy mb-3">{title}</h3>
      )}
      <div className="overflow-x-auto relative" ref={gridRef}>
        <table className="w-full text-[11px] border-collapse table-fixed">
          <thead>
            <tr>
              <th className="sticky left-0 bg-white z-10 text-left py-1 px-1.5 text-ba-navy font-semibold border-b-2 border-ba-navy w-[100px]">
                Country
              </th>
              {sectors.map((s) => (
                <th key={s} className="py-1 px-0.5 text-ba-navy font-medium border-b-2 border-ba-navy truncate" title={s}>
                  {s}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {countries.map((country, ci) => (
              <tr key={country}>
                <td className="sticky left-0 bg-white z-10 py-1 px-1.5 font-medium text-ba-navy border-b border-gray-100 whitespace-nowrap truncate" title={country}>
                  {country}
                </td>
                {sectors.map((sector, si) => {
                  const value = matrix[ci]?.[si];
                  const count = counts[ci]?.[si] || 0;
                  const momPct = momentumMatrix?.[ci]?.[si];

                  const colorClass =
                    colorMode === "momentum" && momentumMatrix
                      ? getMomentumColor(momPct ?? null)
                      : focusActive
                        ? getFocusIntensityColor(value, allValues)
                        : getMetricColor(value, allValues);

                  return (
                    <td
                      key={sector}
                      className={`py-1 px-0.5 text-center border-b border-gray-100 cursor-pointer transition-all hover:ring-2 hover:ring-ba-accent ${colorClass}`}
                      onClick={() => count > 0 && setDrillDown({ country, sector })}
                      onMouseEnter={(e) => {
                        if (count === 0) return;
                        const rect = e.currentTarget.getBoundingClientRect();
                        const parentRect = gridRef.current?.getBoundingClientRect() || rect;
                        setTooltip({
                          x: rect.left - parentRect.left + rect.width / 2,
                          y: rect.top - parentRect.top,
                          country, sector, value, count,
                          metrics: cellMetricsMap[`${country}_${sector}`] || { pe: null, cape: null, pb: null, pe_pct: null, cape_pct: null, pb_pct: null, composite: null },
                        });
                      }}
                      onMouseLeave={() => setTooltip(null)}
                    >
                      {value != null ? (
                        <div>
                          <div className="font-medium leading-tight">{formatNumber(value, 1)}</div>
                          <div className="opacity-60 leading-tight">{count}</div>
                        </div>
                      ) : count > 0 ? (
                        <div className="opacity-40">{count}</div>
                      ) : (
                        <span className="text-gray-200">-</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>

        {/* Custom tooltip */}
        {tooltip && (
          <div
            className="absolute z-20 pointer-events-none bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-xs"
            style={{
              left: tooltip.x,
              top: tooltip.y - 4,
              transform: "translate(-50%, -100%)",
              minWidth: 200,
            }}
          >
            <div className="font-semibold text-ba-navy mb-1.5">{tooltip.country} / {tooltip.sector}</div>
            <div className="text-gray-500 mb-1.5">{tooltip.count} companies</div>
            <table className="w-full">
              <thead>
                <tr className="text-gray-400 border-b border-gray-100">
                  <th className="text-left pb-0.5 font-medium">Metric</th>
                  <th className="text-right pb-0.5 font-medium">Avg</th>
                  <th className="text-right pb-0.5 font-medium">%ile</th>
                </tr>
              </thead>
              <tbody>
                {([
                  { label: "P/E", val: tooltip.metrics.pe, pct: tooltip.metrics.pe_pct },
                  { label: "CAPE", val: tooltip.metrics.cape, pct: tooltip.metrics.cape_pct },
                  { label: "P/B", val: tooltip.metrics.pb, pct: tooltip.metrics.pb_pct },
                ] as const).map((row) => (
                  <tr key={row.label} className="border-b border-gray-50">
                    <td className="py-0.5 text-gray-600">{row.label}</td>
                    <td className="py-0.5 text-right font-mono">{row.val != null ? formatNumber(row.val, 1) : "–"}</td>
                    <td className="py-0.5 text-right">
                      {row.pct != null ? (
                        <span className={`inline-block w-8 text-center rounded px-1 ${
                          row.pct <= 25 ? "bg-green-100 text-green-700" :
                          row.pct <= 50 ? "bg-green-50 text-green-600" :
                          row.pct <= 75 ? "bg-orange-50 text-orange-600" :
                          "bg-red-100 text-red-700"
                        }`}>{row.pct}</span>
                      ) : "–"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {tooltip.metrics.composite != null && (
              <div className="mt-1.5 pt-1.5 border-t border-gray-200 flex justify-between items-center">
                <span className="font-semibold text-ba-navy">Composite</span>
                <span className={`font-mono font-semibold px-1.5 py-0.5 rounded ${
                  tooltip.metrics.composite <= 25 ? "bg-green-100 text-green-700" :
                  tooltip.metrics.composite <= 50 ? "bg-green-50 text-green-600" :
                  tooltip.metrics.composite <= 75 ? "bg-orange-50 text-orange-600" :
                  "bg-red-100 text-red-700"
                }`}>{tooltip.metrics.composite}th</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Drill-down modal */}
      {drillDown && (() => {
        const cellKey = `${drillDown.country}_${drillDown.sector}`;
        const cellM = cellMetricsMap[cellKey] || { pe: null, cape: null, pb: null, pe_pct: null, cape_pct: null, pb_pct: null, composite: null };

        return (
          <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={() => setDrillDown(null)}>
            <div className="bg-white rounded-lg shadow-xl max-w-5xl w-full max-h-[85vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
              <div className="p-4 border-b border-gray-200 flex items-center justify-between">
                <h3 className="font-serif text-lg font-semibold text-ba-navy">
                  {drillDown.country} — {drillDown.sector}
                </h3>
                <button onClick={() => setDrillDown(null)} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
              </div>

              {/* Cell summary metrics */}
              <div className="px-4 pt-4 pb-2">
                <div className="flex items-center gap-6 text-sm">
                  <span className="text-gray-500">{drillDownCompanies.length} companies</span>
                  <div className="flex gap-4">
                    {([
                      { label: "P/E", val: cellM.pe, pct: cellM.pe_pct },
                      { label: "CAPE", val: cellM.cape, pct: cellM.cape_pct },
                      { label: "P/B", val: cellM.pb, pct: cellM.pb_pct },
                    ] as const).map((row) => (
                      <div key={row.label} className="flex items-center gap-1.5">
                        <span className="text-gray-400 text-xs">{row.label}:</span>
                        <span className="font-mono text-ba-navy">{row.val != null ? formatNumber(row.val, 1) : "–"}</span>
                        {row.pct != null && (
                          <span className={`text-xs px-1.5 py-0.5 rounded ${
                            row.pct <= 25 ? "bg-green-100 text-green-700" :
                            row.pct <= 50 ? "bg-green-50 text-green-600" :
                            row.pct <= 75 ? "bg-orange-50 text-orange-600" :
                            "bg-red-100 text-red-700"
                          }`}>{row.pct}th</span>
                        )}
                      </div>
                    ))}
                  </div>
                  {cellM.composite != null && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-gray-400 text-xs">Composite:</span>
                      <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${
                        cellM.composite <= 25 ? "bg-green-100 text-green-700" :
                        cellM.composite <= 50 ? "bg-green-50 text-green-600" :
                        cellM.composite <= 75 ? "bg-orange-50 text-orange-600" :
                        "bg-red-100 text-red-700"
                      }`}>{cellM.composite}th</span>
                    </div>
                  )}
                </div>
              </div>

              {/* 2f: Bar chart for drill-down */}
              {drillDownBarData.length > 0 && (
                <div className="px-4 pt-2 pb-4">
                  <p className="text-xs text-gray-400 mb-2">{METRIC_NAMES[metric] || metric} by company</p>
                  <div style={{ height: Math.max(200, drillDownBarData.length * 28) }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={drillDownBarData} layout="vertical" margin={{ left: 60, right: 20, top: 5, bottom: 5 }}>
                        <XAxis type="number" tick={{ fontSize: 10 }} />
                        <YAxis type="category" dataKey="ticker" tick={{ fontSize: 10 }} width={55} />
                        <RechartsTooltip
                          formatter={(value: number) => [formatNumber(value, 1), METRIC_NAMES[metric] || metric]}
                          labelFormatter={(label: string) => {
                            const item = drillDownBarData.find((d) => d.ticker === label);
                            return item?.name || label;
                          }}
                        />
                        <Bar dataKey="value" radius={[0, 3, 3, 0]}>
                          {drillDownBarData.map((_, i) => {
                            const pct = drillDownBarData.length > 1 ? i / (drillDownBarData.length - 1) : 0.5;
                            const color = pct <= 0.33 ? "#16a34a" : pct <= 0.66 ? "#6b7280" : "#dc2626";
                            return <RechartsCell key={i} fill={color} />;
                          })}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              <div className="p-4 pt-2">
                {drillDownCompanies.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200">
                          <th className="text-left py-2 px-2">Ticker</th>
                          <th className="text-left py-2 px-2">Name</th>
                          <th className="text-left py-2 px-2">Industry</th>
                          <th className="text-right py-2 px-2">P/E</th>
                          <th className="text-right py-2 px-2">P/B</th>
                          <th className="text-right py-2 px-2">CAPE</th>
                          <th className="text-right py-2 px-2">ROE</th>
                          <th className="text-right py-2 px-2">Net %</th>
                          {momentumMatrix && <th className="text-right py-2 px-2">Mom %</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {drillDownCompanies
                          .sort((a: any, b: any) => (a.metric_value || 999) - (b.metric_value || 999))
                          .map((c: any) => (
                            <tr key={c.ticker} className="border-b border-gray-50 hover:bg-ba-light">
                              <td className="py-1.5 px-2 font-medium text-ba-navy whitespace-nowrap">{c.ticker}</td>
                              <td className="py-1.5 px-2 max-w-[180px] truncate">{c.company_name}</td>
                              <td className="py-1.5 px-2 text-gray-500 max-w-[140px] truncate">{c.industry || "—"}</td>
                              {(["pe_ratio", "pb_ratio", "cape", "roe", "net_margin"] as const).map((mKey) => {
                                const val = c[mKey];
                                const pct = companyPctRank(val, mKey);
                                const isPercent = mKey === "roe" || mKey === "net_margin";
                                return (
                                  <td key={mKey} className="py-1.5 px-2 text-right">
                                    {val != null ? (
                                      <div className="flex items-center justify-end gap-1">
                                        <span>{formatNumber(val, 1)}{isPercent ? "%" : ""}</span>
                                        {pct != null && (
                                          <span className={`text-[10px] px-1 py-0.5 rounded ${pctBadgeClass(pct, mKey)}`}>
                                            {pct}
                                          </span>
                                        )}
                                      </div>
                                    ) : "—"}
                                  </td>
                                );
                              })}
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
                  </div>
                ) : (
                  <p className="text-gray-400 text-center py-8">No companies in this cell</p>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
