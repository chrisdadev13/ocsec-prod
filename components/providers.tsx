"use client";

import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { RepoPickerDialog } from "@/components/repo-picker";

const NewScanDialogContext = React.createContext<{
  open: boolean;
  setOpen: (open: boolean) => void;
} | null>(null);

export function useNewScanDialog() {
  const ctx = React.useContext(NewScanDialogContext);
  if (!ctx) throw new Error("useNewScanDialog must be used within Providers");
  return ctx;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 60_000 } } }));
  const [open, setOpen] = useState(false);

  return (
    <NewScanDialogContext.Provider value={{ open, setOpen }}>
      <QueryClientProvider client={queryClient}>
        {children}
        <RepoPickerDialog open={open} onOpenChange={setOpen} />
      </QueryClientProvider>
    </NewScanDialogContext.Provider>
  );
}
