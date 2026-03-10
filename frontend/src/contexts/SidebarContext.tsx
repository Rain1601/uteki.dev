import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

interface SidebarContextType {
  /** Mobile drawer open state */
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  /** Desktop hover-expanded state (transient) */
  expanded: boolean;
  setExpanded: (v: boolean) => void;
}

const SidebarContext = createContext<SidebarContextType | undefined>(undefined);

export const useSidebar = () => {
  const context = useContext(SidebarContext);
  if (!context) {
    throw new Error('useSidebar must be used within a SidebarProvider');
  }
  return context;
};

interface SidebarProviderProps {
  children: ReactNode;
}

export const SidebarProvider = ({ children }: SidebarProviderProps) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const toggleSidebar = useCallback(() => {
    setSidebarOpen((prev) => !prev);
  }, []);

  const value = {
    sidebarOpen,
    setSidebarOpen,
    toggleSidebar,
    expanded,
    setExpanded,
  };

  return <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>;
};
