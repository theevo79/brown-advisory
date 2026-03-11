"use client";

import { useState, useCallback } from "react";

// Log scale: slider position 0–100 maps to $100M–$3T
const LOG_MIN = Math.log10(100e6);   // $100M
const LOG_MAX = Math.log10(3000e9);  // $3T

function posToValue(pos: number): number {
  const log = LOG_MIN + (pos / 100) * (LOG_MAX - LOG_MIN);
  return Math.pow(10, log);
}

function valueToPos(value: number): number {
  if (value <= 0) return 0;
  const log = Math.log10(value);
  return Math.max(0, Math.min(100, ((log - LOG_MIN) / (LOG_MAX - LOG_MIN)) * 100));
}

function formatMcap(value: number): string {
  if (value >= 1e12) return `$${(value / 1e12).toFixed(1)}T`;
  if (value >= 1e9) return `$${(value / 1e9).toFixed(value >= 10e9 ? 0 : 1)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(0)}M`;
  return `$${value.toFixed(0)}`;
}

interface MarketCapSliderProps {
  minValue: number;        // current min in dollars
  maxValue: number | null; // current max in dollars, null = no max
  onChange: (min: number | undefined, max: number | undefined) => void;
}

export default function MarketCapSlider({ minValue, maxValue, onChange }: MarketCapSliderProps) {
  const [lowPos, setLowPos] = useState(() => valueToPos(minValue || 100e6));
  const [highPos, setHighPos] = useState(() => maxValue ? valueToPos(maxValue) : 100);

  const handleLowChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const pos = Math.min(parseFloat(e.target.value), highPos - 1);
    setLowPos(pos);
    const val = posToValue(pos);
    // If low is at the absolute minimum, treat as "no min"
    const newMin = pos <= 0.5 ? undefined : val;
    const newMax = highPos >= 99.5 ? undefined : posToValue(highPos);
    onChange(newMin, newMax);
  }, [highPos, onChange]);

  const handleHighChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const pos = Math.max(parseFloat(e.target.value), lowPos + 1);
    setHighPos(pos);
    const val = posToValue(pos);
    const newMin = lowPos <= 0.5 ? undefined : posToValue(lowPos);
    // If high is at the absolute maximum, treat as "no max"
    const newMax = pos >= 99.5 ? undefined : val;
    onChange(newMin, newMax);
  }, [lowPos, onChange]);

  const lowVal = posToValue(lowPos);
  const highVal = posToValue(highPos);

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-ba-navy">
          {lowPos <= 0.5 ? "No min" : formatMcap(lowVal)}
        </span>
        <span className="text-xs font-medium text-ba-navy">
          {highPos >= 99.5 ? "No max" : formatMcap(highVal)}
        </span>
      </div>
      <div className="relative h-6">
        {/* Track background */}
        <div className="absolute top-1/2 -translate-y-1/2 w-full h-1.5 bg-gray-200 rounded" />
        {/* Active range */}
        <div
          className="absolute top-1/2 -translate-y-1/2 h-1.5 bg-ba-navy rounded"
          style={{ left: `${lowPos}%`, width: `${highPos - lowPos}%` }}
        />
        {/* Low thumb */}
        <input
          type="range"
          min={0}
          max={100}
          step={0.5}
          value={lowPos}
          onChange={handleLowChange}
          className="absolute w-full top-0 h-6 appearance-none bg-transparent pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-ba-navy [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:shadow [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:bg-ba-navy [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:shadow"
          style={{ zIndex: lowPos > 50 ? 5 : 3 }}
        />
        {/* High thumb */}
        <input
          type="range"
          min={0}
          max={100}
          step={0.5}
          value={highPos}
          onChange={handleHighChange}
          className="absolute w-full top-0 h-6 appearance-none bg-transparent pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-ba-accent [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:shadow [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:bg-ba-accent [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:shadow"
          style={{ zIndex: highPos < 50 ? 5 : 3 }}
        />
      </div>
      {/* Scale labels */}
      <div className="flex justify-between mt-0.5 text-[10px] text-gray-400">
        <span>$100M</span>
        <span>$1B</span>
        <span>$10B</span>
        <span>$100B</span>
        <span>$3T</span>
      </div>
    </div>
  );
}
