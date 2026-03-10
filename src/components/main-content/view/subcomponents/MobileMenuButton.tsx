import { ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { MobileMenuButtonProps } from '../../types/types';
import { useMobileMenuHandlers } from '../../hooks/useMobileMenuHandlers';

export default function MobileMenuButton({
  onMenuClick,
  compact = false,
  floating = false,
}: MobileMenuButtonProps) {
  const { handleMobileMenuClick, handleMobileMenuTouchEnd } = useMobileMenuHandlers(onMenuClick);
  const { t } = useTranslation('common');

  const ariaLabel = t('versionUpdate.ariaLabels.showSidebar');

  const buttonClasses = floating
    ? 'flex h-11 w-8 items-center justify-center rounded-r-md border border-l-0 border-border/60 bg-background/95 text-muted-foreground shadow-lg transition-colors hover:bg-accent/80 hover:text-foreground touch-manipulation pwa-menu-button'
    : compact
      ? 'rounded-lg p-1.5 text-muted-foreground hover:bg-accent/60 hover:text-foreground pwa-menu-button'
      : 'flex-shrink-0 rounded-lg p-1.5 text-muted-foreground hover:bg-accent/60 hover:text-foreground touch-manipulation active:scale-95 pwa-menu-button';

  return (
    <button
      type="button"
      onClick={handleMobileMenuClick}
      onTouchEnd={handleMobileMenuTouchEnd}
      className={buttonClasses}
      aria-label={ariaLabel}
      title={ariaLabel}
    >
      {floating ? (
        <ChevronRight className="h-5 w-5" />
      ) : (
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      )}
    </button>
  );
}
