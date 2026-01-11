"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, createConfig, http } from "wagmi";
import { mantleSepoliaTestnet, mantle } from "wagmi/chains";
import { injected, coinbaseWallet } from "wagmi/connectors";
import { useState } from "react";

const config = createConfig({
  chains: [mantleSepoliaTestnet, mantle],
  connectors: [
    injected({
      shimDisconnect: true,
    }),
    coinbaseWallet({
      appName: "mPass",
    }),
  ],
  transports: {
    [mantleSepoliaTestnet.id]: http("https://rpc.sepolia.mantle.xyz"),
    [mantle.id]: http("https://rpc.mantle.xyz"),
  },
});

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  );
}
