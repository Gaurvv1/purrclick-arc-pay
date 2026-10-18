import artifact from '../../contracts/out/PurrclickPay.sol/PurrclickPay.json'
import { getUsdc } from '@/onchain-facts'

export const ARC_TESTNET_CHAIN_ID = 5042002

export const PURRCLICK_PAY = {
  address: (import.meta.env.VITE_PURRCLICK_CONTRACT ?? '') as `0x${string}`,
  abi: artifact.abi,
  chainId: ARC_TESTNET_CHAIN_ID,
} as const

export const USDC = getUsdc(ARC_TESTNET_CHAIN_ID)!

export const LICENCE_API_URL: string = String(import.meta.env.VITE_LICENCE_API_URL ?? '')
