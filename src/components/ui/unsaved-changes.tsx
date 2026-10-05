"use client";

import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// Asks before a form dialog with unsaved edits is closed by Escape, an outside click, the close button
// or Cancel. A long monitor form lost to a stray Escape is otherwise gone without a trace.
export function useUnsavedChangesGuard() {
  const dirtyRef = useRef(false);
  const [pendingClose, setPendingClose] = useState<(() => void) | null>(null);

  const setDirty = useCallback((dirty: boolean) => {
    dirtyRef.current = dirty;
  }, []);

  const guardClose = useCallback((close: () => void) => {
    if (!dirtyRef.current) {
      close();
      return;
    }
    setPendingClose(() => close);
  }, []);

  const confirmDialog = (
    <Dialog open={pendingClose !== null} onOpenChange={(open) => !open && setPendingClose(null)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Discard unsaved changes?</DialogTitle>
          <DialogDescription>The changes you made in this form have not been saved.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setPendingClose(null)} autoFocus>
            Keep editing
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={() => {
              const close = pendingClose;
              dirtyRef.current = false;
              setPendingClose(null);
              close?.();
            }}
          >
            Discard changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return { setDirty, guardClose, confirmDialog };
}
