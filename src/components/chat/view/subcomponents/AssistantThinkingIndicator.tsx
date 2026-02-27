import { useEffect, useState } from 'react';
import { SessionProvider } from '../../../../types/app';
import SessionProviderLogo from '../../../llm-logo-provider/SessionProviderLogo';

type AssistantThinkingIndicatorProps = {
  selectedProvider: SessionProvider;
  status?: {
    text?: string;
    tokens?: number;
    can_interrupt?: boolean;
  } | null;
  onAbort?: () => void;
};

const PARTICLES = [
  { size: 4, delay: 0, color: 'bg-blue-400' },
  { size: 5, delay: 0.15, color: 'bg-blue-400' },
  { size: 5, delay: 0.3, color: 'bg-cyan-400' },
  { size: 6, delay: 0.45, color: 'bg-cyan-400' },
  { size: 5, delay: 0.6, color: 'bg-violet-400' },
  { size: 5, delay: 0.75, color: 'bg-violet-400' },
  { size: 4, delay: 0.9, color: 'bg-purple-400' },
];

const STATUS_WORDS = ['Thinking', 'Analyzing', 'Reasoning'];

export default function AssistantThinkingIndicator({ selectedProvider, status, onAbort }: AssistantThinkingIndicatorProps) {
  const [wordIndex, setWordIndex] = useState(0);
  const [fadeIn, setFadeIn] = useState(true);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [fakeTokens, setFakeTokens] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setFadeIn(false);
      setTimeout(() => {
        setWordIndex((prev) => (prev + 1) % STATUS_WORDS.length);
        setFadeIn(true);
      }, 300);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  // Elapsed time & fake token counter
  useEffect(() => {
    const startTime = Date.now();
    const tokenRate = 30 + Math.random() * 20;
    const timer = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      setElapsedTime(elapsed);
      setFakeTokens(Math.floor(elapsed * tokenRate));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const providerName = selectedProvider === 'cursor' ? 'Cursor' : selectedProvider === 'codex' ? 'Codex' : 'Claude';
  const tokens = status?.tokens || fakeTokens;
  const canInterrupt = status?.can_interrupt !== false;

  return (
    <div className="chat-message assistant">
      <div className="w-full">
        {/* Header: Logo + name + status meta */}
        <div className="flex items-center space-x-3 mb-3">
          <div className="relative w-8 h-8 flex-shrink-0">
            <div className="absolute inset-0 rounded-full animate-thinking-glow" />
            <div className="relative w-full h-full rounded-full flex items-center justify-center p-1 bg-transparent">
              <SessionProviderLogo provider={selectedProvider} className="w-full h-full" />
            </div>
          </div>
          <div className="text-sm font-medium text-gray-900 dark:text-white">
            {providerName}
          </div>

          {/* Inline status: time · tokens · stop */}
          <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500">
            <span className="opacity-30">·</span>
            <span className="tabular-nums">{elapsedTime}s</span>
            {tokens > 0 && (
              <>
                <span className="opacity-30">·</span>
                <span className="tabular-nums">{tokens.toLocaleString()} tokens</span>
              </>
            )}
            {canInterrupt && onAbort && (
              <>
                <span className="opacity-30">·</span>
                <button
                  onClick={onAbort}
                  className="text-red-400 hover:text-red-300 transition-colors cursor-pointer"
                >
                  stop
                </button>
              </>
            )}
          </div>
        </div>

        {/* Floating particles */}
        <div className="pl-3 sm:pl-0">
          <div className="flex items-center gap-[6px] h-6 mb-2">
            {PARTICLES.map((p, i) => (
              <span
                key={i}
                className={`rounded-full ${p.color} animate-thinking-float`}
                style={{
                  width: p.size,
                  height: p.size,
                  animationDelay: `${p.delay}s`,
                }}
              />
            ))}
          </div>

          {/* Rotating status text */}
          <div className="text-xs text-gray-400 dark:text-gray-500 h-4">
            <span
              className={`inline-block transition-all duration-300 ${
                fadeIn ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-1'
              }`}
            >
              {STATUS_WORDS[wordIndex]}...
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
