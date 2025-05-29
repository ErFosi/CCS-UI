
"use client";

import { useState, useEffect } from 'react'; // Added useEffect here
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertTriangle } from 'lucide-react';

interface AccountDeletionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmDeletion: () => Promise<void>; // Returns a promise to handle async operations
  username?: string; // Optional: to personalize message
}

export function AccountDeletionDialog({ isOpen, onClose, onConfirmDeletion, username }: AccountDeletionDialogProps) {
  const [confirmationText, setConfirmationText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const expectedConfirmationText = "DELETE";

  const handleConfirm = async () => {
    if (confirmationText !== expectedConfirmationText) {
      setError(`Please type "${expectedConfirmationText}" to confirm.`);
      return;
    }
    setError(null);
    setIsDeleting(true);
    try {
      await onConfirmDeletion();
      // onClose will likely be called by the parent component after logout or other actions
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred during account deletion.");
    } finally {
      setIsDeleting(false);
      // Do not close dialog here; parent component should handle it after logout.
      // If deletion is successful, parent will typically call logout then close.
      // If it fails, user might want to see error and retry or cancel.
    }
  };

  // Reset state when dialog is closed/opened
  useEffect(() => {
    if (isOpen) {
      setConfirmationText('');
      setError(null);
      setIsDeleting(false);
    }
  }, [isOpen]);


  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center text-destructive">
            <AlertTriangle className="mr-2 h-6 w-6 text-destructive" />
            Delete Account
          </DialogTitle>
          <DialogDescription className="mt-2">
            This is a permanent action and cannot be undone. All your videos and associated data
            will be deleted from our servers. Your user account in Keycloak will also be requested for deletion.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <p>
            To confirm, please type "<strong>{expectedConfirmationText}</strong>" in the box below.
          </p>
          <div>
            <Label htmlFor="delete-confirmation" className="sr-only">
              Type DELETE to confirm
            </Label>
            <Input
              id="delete-confirmation"
              type="text"
              value={confirmationText}
              onChange={(e) => setConfirmationText(e.target.value)}
              placeholder={expectedConfirmationText}
              className={error && confirmationText !== expectedConfirmationText ? "border-destructive ring-destructive focus-visible:ring-destructive" : ""}
              autoFocus
            />
            {error && <p className="mt-1 text-sm text-destructive">{error}</p>}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-end">
          <DialogClose asChild>
            <Button type="button" variant="outline" onClick={onClose} disabled={isDeleting}>
              Cancel
            </Button>
          </DialogClose>
          <Button
            type="button"
            variant="destructive"
            onClick={handleConfirm}
            disabled={confirmationText !== expectedConfirmationText || isDeleting}
          >
            {isDeleting ? "Deleting..." : `Yes, Delete My Account`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
