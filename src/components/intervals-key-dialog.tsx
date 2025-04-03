import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, Eye, EyeOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface IntervalsKeyDialogProps {
  open: boolean;
  onSubmit: (apiKey: string) => Promise<void>;
  onClose: () => void;
  existingApiKey?: string | null;
  isManualOpen?: boolean;
}

export function IntervalsKeyDialog({ 
  open, 
  onSubmit, 
  onClose, 
  existingApiKey,
  isManualOpen = false
}: IntervalsKeyDialogProps) {
  const [apiKey, setApiKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [hasAttemptedFetch, setHasAttemptedFetch] = useState(false);
  const { toast } = useToast();

  // Update apiKey when existingApiKey changes
  useEffect(() => {
    if (existingApiKey) {
      setApiKey(existingApiKey);
    }
  }, [existingApiKey]);

  // Add a function to fetch the API key from the server only when needed
  useEffect(() => {
    const fetchApiKey = async () => {
      // Only fetch if the dialog is explicitly opened, we don't have a key, and haven't tried fetching yet
      // Don't auto-close if manually opened
      if (open && !existingApiKey && !apiKey && !hasAttemptedFetch && !isManualOpen) {
        setHasAttemptedFetch(true);
        try {
          const response = await fetch('/api/user/data');
          if (response.ok) {
            const data = await response.json();
            if (data.users && data.users.length > 0 && data.users[0].intervalsApiKey) {
              setApiKey(data.users[0].intervalsApiKey);
              // If we found a key and dialog wasn't manually opened, close it
              if (data.users[0].intervalsApiKey && !isManualOpen) {
                // Use setTimeout to avoid immediate state changes
                setTimeout(() => {
                  onClose();
                }, 0);
              }
            }
          }
        } catch (error) {
          console.error('Error fetching API key:', error);
        }
      }
    };

    fetchApiKey();
  }, [open, existingApiKey, apiKey, hasAttemptedFetch, onClose, isManualOpen]);

  // Reset the fetch attempt state when dialog closes
  useEffect(() => {
    if (!open) {
      setHasAttemptedFetch(false);
    }
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      await onSubmit(apiKey);
      setApiKey('');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to validate API key';
      setError(errorMessage);
      toast({
        variant: "destructive",
        title: "Error",
        description: errorMessage,
        duration: 5000,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog 
      open={open} 
      onOpenChange={(isOpen) => {
        // Allow closing if manually opened or if there's an existing API key
        if ((isManualOpen || existingApiKey) && !isOpen) {
          onClose();
        }
      }}
    >
      <DialogContent onInteractOutside={(e) => {
        // Prevent closing on clicking outside if no existing API key and not manually opened
        if (!existingApiKey && !isManualOpen) {
          e.preventDefault();
        }
      }}>
        <DialogHeader>
          <DialogTitle>Intervals API Access Token</DialogTitle>
          <DialogDescription className="space-y-2">
            {existingApiKey 
              ? "Update your Intervals API Access Token or click Close to keep the existing token."
              : (
                <div className="space-y-2">
                  <div className="font-medium text-destructive">
                    An Intervals API Access Token is required to continue.
                  </div>
                  <div>To get your Intervals API Access Token:</div>
                  <ol className="ml-4 list-decimal text-sm space-y-1">
                    <li>Go to Intervals and log into your account</li>
                    <li>Navigate to My Account -&gt; API Access under Options</li>
                    <li>Generate or view your API Access Token (11-character code like: a78828gq6t4)</li>
                    <li>Copy and paste your token below</li>
                  </ol>
                </div>
              )
            }
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            
            <div className="grid gap-2">
              <Label htmlFor="apiKey">API Access Token</Label>
              <div className="relative">
                <Input
                  id="apiKey"
                  type={showPassword ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Enter your Intervals API Access Token"
                  required
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  ) : (
                    <Eye className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  )}
                  <span className="sr-only">
                    {showPassword ? "Hide API Access Token" : "Show API Access Token"}
                  </span>
                </Button>
              </div>
            </div>
          </div>

          <DialogFooter>
            {/* Show Close button if manually opened or if there's an existing key */}
            {(existingApiKey || isManualOpen) && (
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={submitting}
              >
                Close
              </Button>
            )}
            <Button type="submit" disabled={submitting}>
              {submitting ? (
                <>
                  <AlertCircle className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Key'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
} 