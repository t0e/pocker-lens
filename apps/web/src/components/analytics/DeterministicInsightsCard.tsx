import React from "react";
import { SpendingInsight } from "@pocketlens/shared";
import {
  Sparkles,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle,
  Tag,
  CreditCard,
  Percent,
} from "lucide-react";
import Link from "next/link";

interface DeterministicInsightsCardProps {
  insights: SpendingInsight[];
}

export const DeterministicInsightsCard: React.FC<DeterministicInsightsCardProps> = ({
  insights,
}) => {
  if (!insights || insights.length === 0) {
    return (
      <div className="p-6 text-center text-zinc-400 dark:text-zinc-500 text-sm">
        No unusual spending patterns or budget pace alerts detected.
      </div>
    );
  }

  const getIcon = (type: SpendingInsight["type"]) => {
    switch (type) {
      case "CATEGORY_INCREASE":
        return <TrendingUp className="h-4 w-4 text-rose-500 shrink-0" />;
      case "CATEGORY_DECREASE":
        return <TrendingDown className="h-4 w-4 text-emerald-500 shrink-0" />;
      case "BUDGET_PACE":
      case "BUDGET_EXCEEDED":
        return <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />;
      case "SAVINGS_RATE":
        return <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0" />;
      case "NEW_CATEGORY":
        return <Tag className="h-4 w-4 text-blue-500 shrink-0" />;
      case "SUBSCRIPTION_SHARE":
        return <CreditCard className="h-4 w-4 text-purple-500 shrink-0" />;
      case "LARGEST_EXPENSE":
        return <Percent className="h-4 w-4 text-indigo-500 shrink-0" />;
      default:
        return <Sparkles className="h-4 w-4 text-emerald-500 shrink-0" />;
    }
  };

  const getSeverityStyle = (severity: SpendingInsight["severity"]) => {
    switch (severity) {
      case "ALERT":
        return "bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900/60 text-rose-900 dark:text-rose-100";
      case "WARNING":
        return "bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900/60 text-amber-900 dark:text-amber-100";
      case "SUCCESS":
        return "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900/60 text-emerald-900 dark:text-emerald-100";
      case "INFO":
      default:
        return "bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100";
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {insights.map((insight) => (
        <div
          key={insight.id}
          className={`p-4 rounded-xl border flex items-start space-x-3 transition-all ${getSeverityStyle(
            insight.severity
          )}`}
        >
          <div className="mt-0.5">{getIcon(insight.type)}</div>
          <div className="flex-1 space-y-1 min-w-0">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-xs leading-tight">{insight.title}</span>
              {insight.actionUrl && (
                <Link
                  href={insight.actionUrl}
                  className="text-[11px] font-medium underline opacity-80 hover:opacity-100 shrink-0 ml-2"
                >
                  View
                </Link>
              )}
            </div>
            <p className="text-xs opacity-90 leading-relaxed">{insight.description}</p>
          </div>
        </div>
      ))}
    </div>
  );
};
