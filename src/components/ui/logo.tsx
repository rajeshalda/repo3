import Image from 'next/image';
import { cn } from '@/lib/utils';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

interface LogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'login' | 'dashboard';
}

const sizes = {
  sm: { width: 60, height: 30 },     // For very small displays
  md: { width: 80, height: 40 },     // For dashboard header
  lg: { width: 240, height: 240 },   // For login page
};

export function Logo({ className, size = 'md', variant = 'dashboard' }: LogoProps) {
  const { theme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const dimensions = sizes[size];
  
  useEffect(() => {
    setMounted(true);
  }, []);

  const logoSrc = variant === 'login' 
    ? (mounted && theme === 'dark' ? "/nathcorp-logo-darkmode.png" : "/nathcorp-logo-large.png")
    : "/nathcorp-logo-small.svg";   // Keep SVG for dashboard header
  
  return (
    <div className={cn("relative flex items-center justify-center", className)}>
      <Image
        src={logoSrc}
        alt="NATHCORP"
        width={dimensions.width}
        height={dimensions.height}
        priority
        className="object-contain"
      />
    </div>
  );
} 