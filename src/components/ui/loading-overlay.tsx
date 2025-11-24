'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';

interface LoadingOverlayProps {
  isLoading: boolean;
  title?: string;
  extendedMessage?: string;
}

export function LoadingOverlay({
  isLoading,
  title = "Fetching your meetings...",
  extendedMessage = "This may take a moment if you have many meetings"
}: LoadingOverlayProps) {
  const [showExtendedMessage, setShowExtendedMessage] = useState(false);

  useEffect(() => {
    if (isLoading) {
      // Show extended message after 2 seconds
      const timer = setTimeout(() => {
        setShowExtendedMessage(true);
      }, 2000);

      return () => {
        clearTimeout(timer);
        setShowExtendedMessage(false);
      };
    } else {
      setShowExtendedMessage(false);
    }
  }, [isLoading]);

  if (!isLoading) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-background border shadow-lg rounded-lg p-8 max-w-sm w-full mx-4 animate-in zoom-in-95 duration-200">
        <div className="flex flex-col items-center justify-center space-y-4">
          {/* Spinner */}
          <Loader2 className="h-12 w-12 animate-spin text-primary" />

          {/* Loading Text */}
          <div className="text-center space-y-2">
            <p className="text-lg font-semibold">{title}</p>

            {/* Extended message after 2 seconds */}
            {showExtendedMessage && extendedMessage && (
              <p className="text-sm text-muted-foreground animate-in fade-in slide-in-from-top-2 duration-300">
                {extendedMessage}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
