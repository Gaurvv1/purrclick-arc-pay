import artifact from '../../contracts/out/PurrclickPay.sol/PurrclickPay.json'
import { getUsdc } from '@/onchain-facts'

// Arc Testnet (kept for reference / local dev)
export const ARC_TESTNET_CHAIN_ID = 5042002

// Arc Mainnet
export const ARC_MAINNET_CHAIN_ID = 5042

// Active chain — mainnet
export const ACTIVE_CHAIN_ID = ARC_MAINNET_CHAIN_ID

export const PURRCLICK_PAY = {
  address: '0xDF7027B92b85e65E258941fC283db199343cBb85' as `0x${string}`,
  abi: artifact.abi,
  chainId: ACTIVE_CHAIN_ID,
} as const

export const USDC = getUsdc(ACTIVE_CHAIN_ID)!

export const LICENCE_API_URL: string = String(import.meta.env.VITE_LICENCE_API_URL ?? '')
