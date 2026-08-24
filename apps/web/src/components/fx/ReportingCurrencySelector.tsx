"use client";

import React, { useState } from "react";
import { SUPPORTED_CURRENCIES } from "@pocketlens/shared";
import { Globe } from "lucide-react";

interface ReportingCurrencySelectorProps {
  currentCurrency: string;
  onCurrencyChange: (newCurrency: string) => void;
  className?: string;
}

export const ReportingCurrencySelector: React.FC<ReportingCurrencySelectorProps> = ({
  currentCurrency,
  onCurrencyChange,
  className = "",
}) => {
  const [isUpdating, setIsUpdating] = useState(false);

  const handleChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newCode = e.target.value;
    setIsUpdating(true);
    try {
      await fetch("/api/proxy/fx/reporting-currency", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportingCurrency: newCode }),
      }).catch(() => {});
      onCurrencyChange(newCode);
    } catch {
      onCurrencyChange(newCode);
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className={`flex items-center gap-2 bg-slate-800/80 border border-slate-700/80 rounded-lg px-2.5 py-1.5 ${className}`}>
      <Globe className="w-4 h-4 text-emerald-400" />
      <span className="text-xs text-slate-400 font-medium">Reporting:</span>
      <select
        value={currentCurrency}
        onChange={handleChange}
        disabled={isUpdating}
        className="bg-transparent text-xs font-semibold text-white focus:outline-none cursor-pointer"
        aria-label="Select preferred reporting currency"
      >
        {SUPPORTED_CURRENCIES.map((c) => (
          <option key={c.code} value={c.code} className="bg-slate-900 text-white">
            {c.code} ({c.symbol})
          </option>
        ))}
      </select>
    </div>
  );
};
