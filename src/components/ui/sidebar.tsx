import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Menu, X, LayoutDashboard, Calendar, Clock, Settings2, ChevronLeft, ChevronRight, FileCheck, Book } from 'lucide-react';
import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';

// Custom AI Icon component (Two stars - sparkle design)
const AIChipIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    {/* Main center star (4-pointed) - bigger */}
    <path
      d="M14 2L17 11L24 14L17 17L14 23L11 17L4 14L11 11L14 2Z"
      fill="#64748b"
      stroke="#64748b"
      strokeWidth="0.5"
    />

    {/* North-west star - top left bigger */}
    <path
      d="M5 1L6 5L10 6L6 7L5 11L4 7L1 6L4 5L5 1Z"
      fill="#64748b"
      stroke="#64748b"
      strokeWidth="0.4"
    />
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
  disabled?: boolean;
}

export function Sidebar({ currentView, onViewChange, className, disabled = false }: SidebarProps) {
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
                !isExpanded && "justify-center px-2",
                disabled && "cursor-not-allowed opacity-50"
              )}
              onClick={() => !disabled && onViewChange(item.view)}
              disabled={disabled}
            >
              {item.icon === AIChipIcon ? (
                <Icon className="shrink-0 h-5 w-5" />
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