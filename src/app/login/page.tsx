'use client';

import { Logo } from '@/components/ui/logo';
import { signIn } from 'next-auth/react';
import { Button } from '@/components/ui/button';

export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 relative">
      <Logo size="lg" className="mb-8" />
      <Button 
        size="lg"
        onClick={() => signIn('azure-ad')}
      >
        Sign in with Microsoft
      </Button>
      
      <footer className="fixed bottom-0 left-0 right-0 py-2 text-center text-xs text-muted-foreground bg-background border-t">
        <span className="opacity-70">v2.2.0  Powered by GPT-4.1  © 2025 NathCorp Inc.</span>
      </footer>
    </div>
  );
} 