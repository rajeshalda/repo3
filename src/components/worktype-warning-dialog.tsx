import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

interface WorktypeWarningDialogProps {
  open: boolean;
  onClose: () => void;
  taskTitle: string;
  projectName: string;
}

export function WorktypeWarningDialog({
  open,
  onClose,
  taskTitle,
  projectName
}: WorktypeWarningDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-600" />
            <DialogTitle>Warning: Worktype Not Available</DialogTitle>
          </div>
          <DialogDescription className="pt-4 space-y-3">
            <p>
              The task <strong>"{taskTitle}"</strong> ({projectName}) does NOT have "India-Meeting" worktype.
            </p>
            <p>
              Please choose a DIFFERENT task that has "India-Meeting" worktype enabled.
            </p>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={onClose} className="w-full">
            OK - Choose Different Task
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
