import { Button } from './ui/button';
import { FileText } from 'lucide-react';

export function UserManual() {
  const handleOpenPDF = () => {
    // Open PDF in new browser tab
    window.open('/MTT User Manual doc.pdf', '_blank');
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleOpenPDF}
      className="flex items-center gap-2"
    >
      <FileText className="h-4 w-4" />
      User Manual
    </Button>
  );
}