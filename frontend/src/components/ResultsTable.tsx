"use client";

import { useState } from "react";
import type { CompanyResult, SortConfig } from "@/lib/types";
import { formatNumber, formatCurrency, formatPercentile } from "@/lib/formatters";

interface ResultsTableProps {
  results: CompanyResult[];
  metrics: string[];
  momentumData?: Record<number, any>;
}

const METRIC_LABELS: Record<string, string> = {
  pe_ratio: "P/E", pb_ratio: "P/B", ps_ratio: "P/S",
  ev_ebitda: "EV/EBITDA", ev_sales: "EV/Sales", ev_ebit: "EV/EBIT", ev_fcf: "EV/FCF",
  cape: "CAPE", cape_real: "CAPE (R)", ev_nopat_avg: "EV/NOPAT", ev_ebit_avg: "EV/EBIT Avg",
  ev_nopat_avg_real: "EV/NOPAT (R)", ev_ebit_avg_real: "EV/EBIT (R)",
  roe: "ROE %", roa: "ROA %", ebit_margin: "EBIT %", net_margin: "Net %",
  current_ratio: "CR", debt_to_equity: "D/E",
};

const COLOUR_PERIODS = [
  { value: "12m", label: "12M" },
  { value: "6m", label: "6M" },
  { value: "3m", label: "3M" },
] as const;

type ColourPeriod = typeof COLOUR_PERIODS[number]["value"];

/** Light row background by momentum quintile */
function getRowMomentumBg(percentile: number | null | undefined): string {
  if (percentile == null) return "";
  if (percentile >= 80) return "bg-green-100/70";
  if (percentile >= 60) return "bg-green-50/60";
  if (percentile >= 40) return "";
  if (percentile >= 20) return "bg-orange-50/60";
  return "bg-red-50/70";
}

export default function ResultsTable({ results, metrics, momentumData = {} }: ResultsTableProps) {
  const [sort, setSort] = useState<SortConfig>({ key: "ticker", direction: "asc" });
  const [page, setPage] = useState(0);
  const [colourPeriod, setColourPeriod] = useState<ColourPeriod>("12m");
  const pageSize = 50;

  const hasMomentum = Object.keys(momentumData).length > 0;

  const handleSort = (key: string) => {
    setSort((prev) => ({
      key,
      direction: prev.key === key && prev.direction === "asc" ? "desc" : "asc",
    }));
    setPage(0);
  };

  const sorted = [...results].sort((a, b) => {
    const dir = sort.direction === "asc" ? 1 : -1;
    if (sort.key === "ticker") return a.ticker.localeCompare(b.ticker) * dir;
    if (sort.key === "company_name") return (a.company_name || "").localeCompare(b.company_name || "") * dir;
    if (sort.key === "market_cap") return ((a.market_cap || 0) - (b.market_cap || 0)) * dir;
    if (sort.key === "composite_percentile") return ((a.composite_percentile || 0) - (b.composite_percentile || 0)) * dir;
    if (sort.key.startsWith("mom_")) {
      const period = sort.key.replace("mom_", "return_");
      const aVal = momentumData[a.company_id]?.[period] ?? -Infinity;
      const bVal = momentumData[b.company_id]?.[period] ?? -Infinity;
      return (aVal - bVal) * dir;
    }
    const aVal = a.metrics[sort.key]?.value ?? -Infinity;
    const bVal = b.metrics[sort.key]?.value ?? -Infinity;
    return (aVal - bVal) * dir;
  });

  const paged = sorted.slice(page * pageSize, (page + 1) * pageSize);
  const totalPages = Math.ceil(sorted.length / pageSize);

  const SortIcon = ({ col }: { col: string }) => {
    if (sort.key !== col) return <span className="text-gray-300 ml-1">{"\u2195"}</span>;
    return <span className="ml-1">{sort.direction === "asc" ? "\u2191" : "\u2193"}</span>;
  };

  return (
    <div className="ba-card overflow-hidden">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <p className="text-sm text-gray-500">{results.length} companies</p>

        <div className="flex items-center gap-4">
          {/* Momentum colour toggle */}
          {hasMomentum && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-gray-400">Colour by:</span>
              {COLOUR_PERIODS.map((p) => (
                <button
                  key={p.value}
                  onClick={() => setColourPeriod(p.value)}
                  className={`px-2 py-0.5 text-xs rounded ${
                    colourPeriod === p.value
                      ? "bg-ba-navy text-white"
                      : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                  }`}
                >
                  {p.label}
                </button>
              ))}
              <button
                onClick={() => setColourPeriod("12m")}
                className={`px-2 py-0.5 text-xs rounded ${
                  colourPeriod === "12m" ? "hidden" : ""
                } text-gray-400 hover:text-gray-600`}
                title="Reset to 12M"
              />
            </div>
          )}

          {totalPages > 1 && (
            <div className="flex items-center gap-2">
              <button onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0} className="ba-btn text-xs py-1 px-2 disabled:opacity-30">Prev</button>
              <span className="text-sm text-gray-500">{page + 1} / {totalPages}</span>
              <button onClick={() => setPage(Math.min(totalPages - 1, page + 1))} disabled={page >= totalPages - 1} className="ba-btn text-xs py-1 px-2 disabled:opacity-30">Next</button>
            </div>
          )}
        </div>
      </div>

      {/* Quintile legend */}
      {hasMomentum && (
        <div className="flex items-center gap-3 mb-2 text-[10px] text-gray-400">
          <span>Momentum quintile:</span>
          <span className="px-1.5 py-0.5 rounded bg-red-50/70">Q1 (bottom 20%)</span>
          <span className="px-1.5 py-0.5 rounded bg-orange-50/60">Q2</span>
          <span className="px-1.5 py-0.5 rounded">Q3</span>
          <span className="px-1.5 py-0.5 rounded bg-green-50/60">Q4</span>
          <span className="px-1.5 py-0.5 rounded bg-green-100/70">Q5 (top 20%)</span>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-ba-navy">
              <th className="text-left py-2 px-2 cursor-pointer whitespace-nowrap" onClick={() => handleSort("ticker")}>
                Ticker<SortIcon col="ticker" />
              </th>
              <th className="text-left py-2 px-2 cursor-pointer whitespace-nowrap" onClick={() => handleSort("company_name")}>
                Name<SortIcon col="company_name" />
              </th>
              <th className="text-left py-2 px-2">Country</th>
              <th className="text-left py-2 px-2">Sector</th>
              <th className="text-right py-2 px-2 cursor-pointer whitespace-nowrap" onClick={() => handleSort("market_cap")}>
                Mkt Cap<SortIcon col="market_cap" />
              </th>
              {metrics.map((m) => (
                <th key={m} className="text-right py-2 px-2 cursor-pointer whitespace-nowrap" onClick={() => handleSort(m)}>
                  {METRIC_LABELS[m] || m}<SortIcon col={m} />
                </th>
              ))}
              <th className="text-right py-2 px-2 cursor-pointer whitespace-nowrap" onClick={() => handleSort("composite_percentile")}>
                Comp %<SortIcon col="composite_percentile" />
              </th>
            </tr>
          </thead>
          <tbody>
            {paged.map((r) => {
              const mom = momentumData[r.company_id];
              const colourPercentile = mom?.[`percentile_${colourPeriod}`] ?? null;
              const rowBg = hasMomentum ? getRowMomentumBg(colourPercentile) : "";

              return (
                <tr
                  key={`${r.ticker}-${r.exchange}`}
                  className={`border-b border-gray-100 transition-colors ${rowBg}`}
                >
                  <td className="py-2 px-2 font-medium text-ba-navy">{r.ticker}</td>
                  <td className="py-2 px-2 max-w-[200px] truncate" title={r.company_name}>{r.company_name}</td>
                  <td className="py-2 px-2 text-gray-500">{r.country || "—"}</td>
                  <td className="py-2 px-2 text-gray-500 max-w-[120px] truncate">{r.sector || "—"}</td>
                  <td className="py-2 px-2 text-right">{formatCurrency(r.market_cap)}</td>
                  {metrics.map((m) => {
                    const mv = r.metrics[m];
                    return (
                      <td key={m} className="py-2 px-2 text-right">
                        {mv?.value != null ? (
                          <div className="flex items-center justify-end gap-1">
                            <span>{formatNumber(mv.value, 1)}</span>
                            {mv.percentile != null && (
                              <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">
                                {formatPercentile(mv.percentile)}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="py-2 px-2 text-right">
                    {r.composite_percentile != null ? (
                      <span className="text-xs font-medium px-2 py-1 rounded bg-gray-100 text-gray-500">
                        {formatPercentile(r.composite_percentile)}
                      </span>
                    ) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
