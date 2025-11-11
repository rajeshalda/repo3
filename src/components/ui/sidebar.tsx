import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Menu, X, LayoutDashboard, Calendar, Clock, Settings2, ChevronLeft, ChevronRight, FileCheck, Book } from 'lucide-react';
import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';

// Custom Galaxy AI Icon component (Samsung Galaxy AI style with blue gradient)
const AIChipIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    {/* Large main star (4-pointed) - made bigger and bolder */}
    <path
      d="M12 1L14 9L22 11L14 13L12 21L10 13L2 11L10 9L12 1Z"
      fill="url(#sidebarGalaxyGradient1)"
      stroke="url(#sidebarGalaxyGradient1)"
      strokeWidth="0.5"
      className="opacity-95"
    />

    {/* Small accompanying star - positioned better */}
    <path
      d="M18 3L19 6.5L22.5 7.5L19 8.5L18 12L17 8.5L13.5 7.5L17 6.5L18 3Z"
      fill="url(#sidebarGalaxyGradient2)"
      className="opacity-90"
    />

    {/* Smallest accent star - bottom right */}
    <path
      d="M19 15L19.5 16.5L21 17L19.5 17.5L19 19L18.5 17.5L17 17L18.5 16.5L19 15Z"
      fill="url(#sidebarGalaxyGradient3)"
      className="opacity-85"
    />

    {/* Gradient definitions with blue colors matching dashboard */}
    <defs>
      <linearGradient id="sidebarGalaxyGradient1" x1="2" y1="1" x2="22" y2="21">
        <stop offset="0%" stopColor="#60a5fa" />
        <stop offset="50%" stopColor="#3b82f6" />
        <stop offset="100%" stopColor="#2563eb" />
      </linearGradient>
      <linearGradient id="sidebarGalaxyGradient2" x1="13.5" y1="3" x2="22.5" y2="12">
        <stop offset="0%" stopColor="#60a5fa" />
        <stop offset="100%" stopColor="#3b82f6" />
      </linearGradient>
      <linearGradient id="sidebarGalaxyGradient3" x1="17" y1="15" x2="21" y2="19">
        <stop offset="0%" stopColor="#60a5fa" />
        <stop offset="100%" stopColor="#3b82f6" />
      </linearGradient>
    </defs>
  </svg>
);

interface NavigationItem {
  name: string;
  icon: LucideIcon | typeof AIChipIcon;
  view: string;
}

interface SidebarProps {
  currentView: string;
  onViewChange: (view: string) => void;
  className?: string;
}

export function Sidebar({ currentView, onViewChange, className }: SidebarProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  const navigationItems: NavigationItem[] = [
    {
      name: 'Manual',
      icon: Book,
      view: 'dashboard'
    },
    {
      name: 'AI Agent',
      icon: AIChipIcon,
      view: 'ai-agent'
    }
  ];

  return (
    <div
      className={cn(
        "relative flex h-full flex-col border-r bg-background transition-all duration-300",
        isExpanded ? "w-64" : "w-[4.5rem]",
        className
      )}
    >
      {/* Sidebar Toggle Button */}
      <div className="flex justify-end p-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsExpanded(!isExpanded)}
          className="h-8 w-8"
        >
          {isExpanded ? (
            <ChevronLeft className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </Button>
      </div>

      <nav className="flex-1 space-y-2 p-4">
        {navigationItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentView === item.view;

          return (
            <Button
              key={item.name}
              variant={isActive ? "secondary" : "ghost"}
              className={cn(
                "w-full justify-start items-center gap-3 py-3",
                !isExpanded && "justify-center px-2"
              )}
              onClick={() => onViewChange(item.view)}
            >
              {item.icon === AIChipIcon ? (
                <Icon className="shrink-0 !w-7 !h-7" />
              ) : (
                <Icon className="h-5 w-5 shrink-0 text-slate-600" />
              )}
              {isExpanded && <span className="text-left">{item.name}</span>}
            </Button>
          );
        })}
      </nav>
    </div>
  );
} 