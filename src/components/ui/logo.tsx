import Image from 'next/image';
import { cn } from '@/lib/utils';

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
  const dimensions = sizes[size];
  
  const logoSrc = variant === 'login' 
    ? "/nathcorp-logo-large.png"    // Using PNG for login page
    : "/nathcorp-logo-small.svg";   // Keep SVG for dashboard header
  
  return (
    <div className={cn(
      "relative flex items-center justify-center",
      variant === 'login' && "p-6 rounded-2xl bg-white/10 dark:bg-white/20 border border-white/20 dark:border-white/30",
      className
    )}>
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