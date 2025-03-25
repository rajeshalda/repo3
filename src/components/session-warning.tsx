'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { toast } from 'sonner';

const SESSION_WARNING_THRESHOLD = 5 * 60 * 1000; // 5 minutes in milliseconds
const CHECK_INTERVAL = 60 * 1000; // Check every minute

export function SessionWarning() {
  const { data: session } = useSession();
  const [hasShownWarning, setHasShownWarning] = useState(false);
  const [isExpired, setIsExpired] = useState(false);

  // Function to check if session is expired
  const isSessionExpired = () => {
    if (!session?.expires) return false;
    const expiryTime = new Date(session.expires).getTime();
    return Date.now() >= expiryTime;
  };

  // Function to show session expired notification
  const showSessionExpiredNotification = () => {
    toast.error("Your session has expired. Please refresh the page to continue.", {
      duration: 0, // Keep the toast until user dismisses it
      position: "top-center",
      style: {
        backgroundColor: "#fee2e2",
        color: "#b91c1c",
        fontSize: "16px",
        borderRadius: "8px",
        padding: "12px 24px",
        border: "1px solid #ef4444"
      }
    });
  };

  useEffect(() => {
    if (!session) return;

    const checkSessionExpiry = () => {
      const expiryTime = session.expires ? new Date(session.expires).getTime() : null;
      if (!expiryTime) return;

      const now = new Date().getTime();
      const timeUntilExpiry = expiryTime - now;

      // Check if session is expired
      if (timeUntilExpiry <= 0) {
        setIsExpired(true);
        if (!hasShownWarning) {
          showSessionExpiredNotification();
          setHasShownWarning(true);
        }
        return;
      }

      // Show warning when session is about to expire in 5 minutes
      if (timeUntilExpiry <= SESSION_WARNING_THRESHOLD && !hasShownWarning) {
        toast.warning("Your session will expire soon. Please save your work and refresh the page.", {
          duration: 0, // Keep the toast until user dismisses it
          position: "top-center",
          style: {
            backgroundColor: "#fef3c7",
            color: "#92400e",
            fontSize: "16px",
            borderRadius: "8px",
            padding: "12px 24px",
            border: "1px solid #f59e0b"
          }
        });
        setHasShownWarning(true);
      }
    };

    // Initial check
    checkSessionExpiry();

    // Set up periodic checks
    const intervalId = setInterval(checkSessionExpiry, CHECK_INTERVAL);

    return () => {
      clearInterval(intervalId);
    };
  }, [session, hasShownWarning]);

  // Add event listeners to detect user interactions after session expiry
  useEffect(() => {
    if (!isExpired) return;

    const handleUserInteraction = () => {
      if (isSessionExpired()) {
        showSessionExpiredNotification();
      }
    };

    // Add listeners for common user interactions
    window.addEventListener('click', handleUserInteraction);
    window.addEventListener('keydown', handleUserInteraction);
    window.addEventListener('mousemove', handleUserInteraction);
    window.addEventListener('scroll', handleUserInteraction);

    return () => {
      window.removeEventListener('click', handleUserInteraction);
      window.removeEventListener('keydown', handleUserInteraction);
      window.removeEventListener('mousemove', handleUserInteraction);
      window.removeEventListener('scroll', handleUserInteraction);
    };
  }, [isExpired]);

  return null; // This is a utility component that doesn't render anything
} 