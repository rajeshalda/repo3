import { Button } from './ui/button';
import { ExternalLink } from 'lucide-react';

export function UserManual() {
  return (
    <Button 
      variant="outline" 
      size="sm"
      asChild
    >
      <a 
        href="https://nathcorp1-my.sharepoint.com/:w:/g/personal/vishal_kumar_nathcorp_com/ET8dvmUJziBLiGl-7nCIqs4BLUxxMWZiH0BopEovIS8gCQ?e=afd0ip" 
        target="_blank" 
        rel="noopener noreferrer"
        className="flex items-center gap-2"
      >
        <ExternalLink className="h-4 w-4" />
        User Manual
      </a>
    </Button>
  );
}