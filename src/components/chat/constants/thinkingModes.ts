import { Brain, Zap, Sparkles, Atom } from 'lucide-react';

export const DEFAULT_THINKING_MODE = 'ultrathink';

export const thinkingModes = [
  {
    id: 'none',
    name: 'Standard',
    description: 'Regular Claude response',
    icon: null,
    prefix: '',
    color: 'text-gray-600',
    codexReasoningEffort: 'minimal'
  },
  {
    id: 'think',
    name: 'Think',
    description: 'Basic extended thinking',
    icon: Brain,
    prefix: 'think',
    color: 'text-blue-600',
    codexReasoningEffort: 'low'
  },
  {
    id: 'think-hard',
    name: 'Think Hard',
    description: 'More thorough evaluation',
    icon: Zap,
    prefix: 'think hard',
    color: 'text-purple-600',
    codexReasoningEffort: 'medium'
  },
  {
    id: 'think-harder',
    name: 'Think Harder',
    description: 'Deep analysis with alternatives',
    icon: Sparkles,
    prefix: 'think harder',
    color: 'text-indigo-600',
    codexReasoningEffort: 'high'
  },
  {
    id: 'ultrathink',
    name: 'Ultrathink',
    description: 'Maximum thinking budget',
    icon: Atom,
    prefix: 'ultrathink',
    color: 'text-red-600',
    codexReasoningEffort: 'xhigh'
  }
];
