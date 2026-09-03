'use client'

import React from 'react'
import { Sparkles } from 'lucide-react'
import { CategorySuggestionResponse } from '@pocketlens/shared'

interface CategorySuggestionBadgeProps {
  suggestion: CategorySuggestionResponse
  onApply: (categoryId: string) => void
  className?: string
}

export const CategorySuggestionBadge: React.FC<
  CategorySuggestionBadgeProps
> = ({ suggestion, onApply, className = '' }) => {
  if (!suggestion.categoryId || suggestion.confidence === 'NONE') return null

  const confidenceBadge = {
    HIGH: {
      label: 'High Confidence',
      bg: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    },
    MEDIUM: {
      label: 'Likely',
      bg: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
    },
    LOW: {
      label: 'Suggested',
      bg: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
    },
  }[suggestion.confidence]

  return (
    <button
      type="button"
      onClick={() => onApply(suggestion.categoryId!)}
      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-all duration-150 hover:scale-105 active:scale-95 ${confidenceBadge.bg} ${className}`}
      title={suggestion.reason}
    >
      <Sparkles className="w-3 h-3 animate-pulse" />
      <span>
        Suggest:{' '}
        <strong className="font-semibold">{suggestion.categoryName}</strong>
      </span>
      <span className="text-[10px] opacity-75 font-normal">
        ({confidenceBadge.label})
      </span>
    </button>
  )
}
