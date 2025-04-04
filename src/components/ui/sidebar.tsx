import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Menu, X, LayoutDashboard, Calendar, Clock, Settings2, ChevronLeft, ChevronRight, FileCheck, Book } from 'lucide-react';
import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';

// Custom AIChipIcon component
const AIChipIcon = ({ className }: { className?: string }) => (
  <div className={cn("relative w-4 h-4", className)}>
    <div className="absolute inset-0 border border-current rounded-sm flex items-center justify-center">
      <span className="text-[8px] font-bold">AI</span>
    </div>
    {/* Chip pins */}
    <div className="absolute w-[2px] h-[2px] bg-current -left-[1px] top-1/4"></div>
    <div className="absolute w-[2px] h-[2px] bg-current -left-[1px] top-2/4"></div>
    <div className="absolute w-[2px] h-[2px] bg-current -left-[1px] top-3/4"></div>
    <div className="absolute w-[2px] h-[2px] bg-current -right-[1px] top-1/4"></div>
    <div className="absolute w-[2px] h-[2px] bg-current -right-[1px] top-2/4"></div>
    <div className="absolute w-[2px] h-[2px] bg-current -right-[1px] top-3/4"></div>
    <div className="absolute w-[2px] h-[2px] bg-current -top-[1px] left-1/4"></div>
    <div className="absolute w-[2px] h-[2px] bg-current -top-[1px] left-2/4"></div>
    <div className="absolute w-[2px] h-[2px] bg-current -top-[1px] left-3/4"></div>
    <div className="absolute w-[2px] h-[2px] bg-current -bottom-[1px] left-1/4"></div>
    <div className="absolute w-[2px] h-[2px] bg-current -bottom-[1px] left-2/4"></div>
    <div className="absolute w-[2px] h-[2px] bg-current -bottom-[1px] left-3/4"></div>
  </div>
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
      name: 'Posted Meetings',
      icon: FileCheck,
      view: 'posted-meetings'
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

      <nav className="flex-1 space-y-1 p-4">
        {navigationItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentView === item.view;

          return (
            <Button
              key={item.name}
              variant={isActive ? "secondary" : "ghost"}
              className={cn(
                "w-full justify-start gap-4 py-2",
                !isExpanded && "justify-center px-2"
              )}
              onClick={() => onViewChange(item.view)}
            >
              <Icon className="h-5 w-5 shrink-0" />
              {isExpanded && <span>{item.name}</span>}
            </Button>
          );
        })}
      </nav>
    </div>
  );
} 