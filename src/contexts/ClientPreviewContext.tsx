import { createContext, useContext, useState, ReactNode } from 'react';

export interface ClientPreviewState {
  isActive: boolean;
  clientUserId: string | null;
  clientName: string | null;
  clientEmail: string | null;
  startProjectId: string | null;
  returnPage: string | null;
  returnProjectId: string | null;
}

interface ClientPreviewContextValue {
  preview: ClientPreviewState;
  startPreview: (opts: {
    clientUserId: string;
    clientName: string;
    clientEmail: string;
    startProjectId?: string;
    returnPage?: string;
    returnProjectId?: string;
  }) => void;
  exitPreview: () => void;
}

const DEFAULT_STATE: ClientPreviewState = {
  isActive: false,
  clientUserId: null,
  clientName: null,
  clientEmail: null,
  startProjectId: null,
  returnPage: null,
  returnProjectId: null,
};

const ClientPreviewContext = createContext<ClientPreviewContextValue>({
  preview: DEFAULT_STATE,
  startPreview: () => {},
  exitPreview: () => {},
});

export function ClientPreviewProvider({ children }: { children: ReactNode }) {
  const [preview, setPreview] = useState<ClientPreviewState>(DEFAULT_STATE);

  function startPreview(opts: {
    clientUserId: string;
    clientName: string;
    clientEmail: string;
    startProjectId?: string;
    returnPage?: string;
    returnProjectId?: string;
  }) {
    setPreview({
      isActive: true,
      clientUserId: opts.clientUserId,
      clientName: opts.clientName,
      clientEmail: opts.clientEmail,
      startProjectId: opts.startProjectId ?? null,
      returnPage: opts.returnPage ?? null,
      returnProjectId: opts.returnProjectId ?? null,
    });
  }

  function exitPreview() {
    setPreview(DEFAULT_STATE);
  }

  return (
    <ClientPreviewContext.Provider value={{ preview, startPreview, exitPreview }}>
      {children}
    </ClientPreviewContext.Provider>
  );
}

export function useClientPreview() {
  return useContext(ClientPreviewContext);
}
