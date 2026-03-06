"use client";

import { formatNumber } from "@/lib/formatters";

interface CorrelationMatrixProps {
  matrix: number[][];
  tickers: string[];
  companyNames: Record<string, string>;
}

function getCorrelationColor(value: number): string {
  // Navy gradient: white at 0, dark navy at 1
  if (value >= 0.8) return "bg-ba-navy text-white";
  if (value >= 0.6) return "bg-blue-700 text-white";
  if (value >= 0.4) return "bg-blue-400 text-white";
  if (value >= 0.2) return "bg-blue-200 text-blue-900";
  if (value >= 0) return "bg-blue-50 text-blue-800";
  if (value >= -0.2) return "bg-orange-50 text-orange-800";
  if (value >= -0.4) return "bg-orange-200 text-orange-900";
  return "bg-red-400 text-white";
}

export default function CorrelationMatrix({ matrix, tickers, companyNames }: CorrelationMatrixProps) {
  return (
    <div className="overflow-x-auto">
      <table className="text-xs border-collapse">
        <thead>
          <tr>
            <th className="sticky left-0 bg-white z-10 py-2 px-2 text-ba-navy font-semibold border-b-2 border-ba-navy"></th>
            {tickers.map((t) => (
              <th
                key={t}
                className="py-2 px-2 text-ba-navy font-medium border-b-2 border-ba-navy whitespace-nowrap"
                title={companyNames[t] || t}
              >
                {t.split(".")[0]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tickers.map((rowTicker, ri) => (
            <tr key={rowTicker}>
              <td
                className="sticky left-0 bg-white z-10 py-1.5 px-2 font-medium text-ba-navy border-b border-gray-100 whitespace-nowrap"
                title={companyNames[rowTicker] || rowTicker}
              >
                {rowTicker.split(".")[0]}
              </td>
              {tickers.map((colTicker, ci) => {
                const value = matrix[ri]?.[ci];
                const isDiagonal = ri === ci;
                return (
                  <td
                    key={colTicker}
                    className={`py-1.5 px-2 text-center border-b border-gray-100 min-w-[48px] ${
                      isDiagonal ? "bg-ba-navy text-white font-bold" : getCorrelationColor(value)
                    }`}
                    title={`${rowTicker.split(".")[0]} / ${colTicker.split(".")[0]}: ${formatNumber(value, 3)}`}
                  >
                    {formatNumber(value, 2)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
