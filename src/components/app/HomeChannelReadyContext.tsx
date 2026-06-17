import { createContext, type ReactNode, useContext } from "react";

const HomeChannelReadyContext = createContext<() => void>(() => {});

export function HomeChannelReadyProvider({
  children,
  onReady,
}: {
  children: ReactNode;
  onReady: () => void;
}) {
  return <HomeChannelReadyContext.Provider value={onReady}>{children}</HomeChannelReadyContext.Provider>;
}

export function useHomeChannelContentReady() {
  return useContext(HomeChannelReadyContext);
}
