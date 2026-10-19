/**
 * wagmi configuration
 * Built with Arc Studio — https://studio.arc.io
 */

import { http, createConfig } from 'wagmi'
import { mainnet } from 'wagmi/chains'
import { arcTestnet } from 'viem/chains'
import { injected } from 'wagmi/connectors'
import { registerChain } from './tracing'

// Arc mainnet — USDC is the native gas token
export const arcMainnet = {
  id: 5042,
  name: 'Arc',
  nativeCurrency: { name: 'USD Coin', symbol: 'USDC', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc.mainnet.arc.io'] as const },
  },
  blockExplorers: {
    default: { name: 'ArcScan', url: 'https://explorer.arc.io' },
  },
} as const

// Pre-register chain RPC URLs so trace events show correct chain names immediately
registerChain(arcMainnet.id, 'https://rpc.mainnet.arc.io')
registerChain(arcTestnet.id, arcTestnet.rpcUrls.default.http[0])

export const config = createConfig({
  chains: [arcMainnet, arcTestnet, mainnet],
  connectors: [injected()],
  transports: {
    [arcMainnet.id]: http('https://rpc.mainnet.arc.io'),
    [arcTestnet.id]: http(),
    [mainnet.id]: http(), // ENS resolution uses mainnet
  },
})
