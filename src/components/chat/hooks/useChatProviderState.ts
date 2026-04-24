import { useCallback, useEffect, useRef, useState } from 'react';
import { authenticatedFetch } from '../../../utils/api';
import { CLAUDE_MODELS, CODEX_MODELS, CURSOR_MODELS, GEMINI_MODELS } from '../../../../shared/modelConstants';
import type { PendingPermissionRequest, PermissionMode } from '../types/types';
import type { ProjectSession, LLMProvider } from '../../../types/app';

const DEFAULT_PERMISSION_MODE: PermissionMode = 'bypassPermissions';

const normalizePermissionMode = (value: string | null | undefined): PermissionMode => {
  switch (value) {
    case 'default':
    case 'acceptEdits':
    case 'bypassPermissions':
    case 'plan':
      return value;
    default:
      return DEFAULT_PERMISSION_MODE;
  }
};

const readGlobalPermissionMode = (provider: LLMProvider): PermissionMode => {
  if (typeof window === 'undefined') {
    return DEFAULT_PERMISSION_MODE;
  }

  try {
    if (provider === 'codex') {
      const savedCodexSettings = localStorage.getItem('codex-settings');
      if (savedCodexSettings) {
        const parsed = JSON.parse(savedCodexSettings) as { permissionMode?: string };
        return normalizePermissionMode(parsed.permissionMode);
      }
    }

    if (provider === 'gemini') {
      const savedGeminiSettings = localStorage.getItem('gemini-settings');
      if (savedGeminiSettings) {
        const parsed = JSON.parse(savedGeminiSettings) as { permissionMode?: string };
        switch (parsed.permissionMode) {
          case 'default':
            return 'default';
          case 'auto_edit':
            return 'acceptEdits';
          case 'yolo':
            return 'bypassPermissions';
          default:
            return DEFAULT_PERMISSION_MODE;
        }
      }
    }
  } catch (error) {
    console.error('Error loading permission mode settings:', error);
  }

  return DEFAULT_PERMISSION_MODE;
};

const resolvePermissionMode = (
  sessionId: string | null | undefined,
  provider: LLMProvider,
): PermissionMode => {
  if (typeof window === 'undefined') {
    return DEFAULT_PERMISSION_MODE;
  }

  if (sessionId) {
    const savedMode = localStorage.getItem(`permissionMode-${sessionId}`);
    if (savedMode) {
      return normalizePermissionMode(savedMode);
    }
  }

  return readGlobalPermissionMode(provider);
};

interface UseChatProviderStateArgs {
  selectedSession: ProjectSession | null;
}

export function useChatProviderState({ selectedSession }: UseChatProviderStateArgs) {
  const [provider, setProvider] = useState<LLMProvider>(() => {
    return (localStorage.getItem('selected-provider') as LLMProvider) || 'claude';
  });
  const [permissionMode, setPermissionMode] = useState<PermissionMode>(() => readGlobalPermissionMode(provider));
  const [pendingPermissionRequests, setPendingPermissionRequests] = useState<PendingPermissionRequest[]>([]);
  const [cursorModel, setCursorModel] = useState<string>(() => {
    return localStorage.getItem('cursor-model') || CURSOR_MODELS.DEFAULT;
  });
  const [claudeModel, setClaudeModel] = useState<string>(() => {
    return localStorage.getItem('claude-model') || CLAUDE_MODELS.DEFAULT;
  });
  const [codexModel, setCodexModel] = useState<string>(() => {
    return localStorage.getItem('codex-model') || CODEX_MODELS.DEFAULT;
  });
  const [geminiModel, setGeminiModel] = useState<string>(() => {
    return localStorage.getItem('gemini-model') || GEMINI_MODELS.DEFAULT;
  });

  const lastProviderRef = useRef(provider);

  useEffect(() => {
    const activeProvider = selectedSession?.__provider || provider;
    setPermissionMode(resolvePermissionMode(selectedSession?.id, activeProvider));
  }, [provider, selectedSession?.__provider, selectedSession?.id]);

  useEffect(() => {
    if (!selectedSession?.__provider || selectedSession.__provider === provider) {
      return;
    }

    setProvider(selectedSession.__provider);
    localStorage.setItem('selected-provider', selectedSession.__provider);
  }, [provider, selectedSession]);

  useEffect(() => {
    if (lastProviderRef.current === provider) {
      return;
    }
    setPendingPermissionRequests([]);
    lastProviderRef.current = provider;
  }, [provider]);

  useEffect(() => {
    setPendingPermissionRequests((previous) =>
      previous.filter((request) => !request.sessionId || request.sessionId === selectedSession?.id),
    );
  }, [selectedSession?.id]);

  useEffect(() => {
    if (provider !== 'cursor') {
      return;
    }

    authenticatedFetch('/api/cursor/config')
      .then((response) => response.json())
      .then((data) => {
        if (!data.success || !data.config?.model?.modelId) {
          return;
        }

        const modelId = data.config.model.modelId as string;
        if (!localStorage.getItem('cursor-model')) {
          setCursorModel(modelId);
        }
      })
      .catch((error) => {
        console.error('Error loading Cursor config:', error);
      });
  }, [provider]);

  const cyclePermissionMode = useCallback(() => {
    const modes: PermissionMode[] =
      provider === 'codex'
        ? ['default', 'acceptEdits', 'bypassPermissions']
        : ['default', 'acceptEdits', 'bypassPermissions', 'plan'];

    const currentIndex = modes.indexOf(permissionMode);
    const nextIndex = (currentIndex + 1) % modes.length;
    const nextMode = modes[nextIndex];
    setPermissionMode(nextMode);

    if (selectedSession?.id) {
      localStorage.setItem(`permissionMode-${selectedSession.id}`, nextMode);
    }
  }, [permissionMode, provider, selectedSession?.id]);

  return {
    provider,
    setProvider,
    cursorModel,
    setCursorModel,
    claudeModel,
    setClaudeModel,
    codexModel,
    setCodexModel,
    geminiModel,
    setGeminiModel,
    permissionMode,
    setPermissionMode,
    pendingPermissionRequests,
    setPendingPermissionRequests,
    cyclePermissionMode,
  };
}
