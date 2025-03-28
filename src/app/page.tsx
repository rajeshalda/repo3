'use client';

import { signIn } from 'next-auth/react';
import { Logo } from '@/components/ui/logo';
import { useEffect } from 'react';

export default function LoginPage() {
  useEffect(() => {
    document.title = 'Login | Meeting Time Tracker';
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4 sm:px-6">
      <div className="text-center flex flex-col items-center w-full max-w-md mx-auto">
        <Logo size="lg" variant="login" className="mb-6" />
        <div className="space-y-2 mb-6">
          <h1 className="text-xl sm:text-2xl font-bold text-foreground flex items-center justify-center gap-2">
            Meeting Time Tracker
            <span className="inline-flex items-center rounded-[2px] bg-blue-400/10 px-2 py-0 text-[7px] uppercase tracking-wide font-semibold text-blue-400 ring-1 ring-inset ring-blue-400/30 align-middle h-[12px] dark:bg-blue-500/20 dark:text-blue-300 dark:ring-blue-500/30">
              Beta
            </span>
          </h1>
        </div>
        <button
          className="bg-[#0078d4] text-white px-4 py-2.5 rounded-md hover:bg-blue-600 inline-flex items-center justify-center gap-2 text-xs sm:text-sm font-medium w-full transition-colors duration-200 shadow-sm hover:shadow-md"
          onClick={() => signIn('azure-ad', { callbackUrl: '/dashboard' })}
        >
          <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" className="shrink-0">
            <path d="M9.5 3.25H3.25V9.5H9.5V3.25Z" />
            <path d="M9.5 10.5H3.25V16.75H9.5V10.5Z" />
            <path d="M16.75 3.25H10.5V9.5H16.75V3.25Z" />
            <path d="M16.75 10.5H10.5V16.75H16.75V10.5Z" />
          </svg>
          Sign in with NathCorp Organization ID
        </button>
      </div>
    </div>
  );
}
