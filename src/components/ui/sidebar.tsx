import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Menu, X, LayoutDashboard, Calendar, Clock, Settings2, ChevronLeft, ChevronRight, FileCheck, Book } from 'lucide-react';
import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';

// Custom AI Icon component (Single grey star matching Manual icon style)
const AIChipIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    {/* Single 4-pointed star */}
    <path
      d="M12 1L14 9L22 11L14 13L12 21L10 13L2 11L10 9L12 1Z"
      fill="#64748b"
      stroke="#64748b"
      strokeWidth="0.5"
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