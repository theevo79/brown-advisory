"use client";

import { useState, useCallback, useEffect } from "react";

function parseBillions(text: string): number | undefined {
  const val = parseFloat(text);
  if (isNaN(val) || val < 0) return undefined;
  return val * 1e9;
}

function toBillionsStr(value: number | undefined | null): string {
  if (value === undefined || value === null) return "";
  return (value / 1e9).toFixed(value >= 10e9 ? 0 : 1).replace(/\.0$/, "");
}

interface MarketCapSliderProps {
  minValue: number;
  maxValue: number | null;
  onChange: (min: number | undefined, max: number | undefined) => void;
}

export default function MarketCapSlider({ minValue, maxValue, onChange }: MarketCapSliderProps) {
  const [minText, setMinText] = useState(() => toBillionsStr(minValue || undefined));
  const [maxText, setMaxText] = useState(() => toBillionsStr(maxValue || undefined));

  // Sync external prop changes
  useEffect(() => {
    setMinText(toBillionsStr(minValue || undefined));
  }, [minValue]);

  useEffect(() => {
    setMaxText(toBillionsStr(maxValue || undefined));
  }, [maxValue]);

  const handleMinBlur = useCallback(() => {
    const val = parseBillions(minText);
    const maxVal = parseBillions(maxText);
    onChange(val, maxVal);
  }, [minText, maxText, onChange]);

  const handleMaxBlur = useCallback(() => {
    const minVal = parseBillions(minText);
    const val = parseBillions(maxText);
    onChange(minVal, val);
  }, [minText, maxText, onChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      (e.target as HTMLInputElement).blur();
    }
  }, []);

  return (
    <div>
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <input
            type="text"
            value={minText}
            onChange={(e) => setMinText(e.target.value)}
            onBlur={handleMinBlur}
            onKeyDown={handleKeyDown}
            placeholder="Min"
            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:border-ba-accent focus:ring-1 focus:ring-ba-accent outline-none"
          />
        </div>
        <span className="text-gray-400 text-xs">to</span>
        <div className="flex-1">
          <input
            type="text"
            value={maxText}
            onChange={(e) => setMaxText(e.target.value)}
            onBlur={handleMaxBlur}
            onKeyDown={handleKeyDown}
            placeholder="No max"
            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:border-ba-accent focus:ring-1 focus:ring-ba-accent outline-none"
          />
        </div>
      </div>
      <p className="text-[10px] text-gray-400 mt-1">Values in $B (e.g. 5 = $5B)</p>
    </div>
  );
}
