# Purrclick Pay

> Built with Arc Studio - money-powered apps in minutes

This is the **project memory** - what Arc Studio remembers about building this app. It helps future agents (or humans) understand and extend the project.

---

## What This App Does

USDC checkout for Purrclick (purrclick.app), a Windows app (cute click sounds, screen recorder, Fifi the desktop kitten). Buyers pay with USDC on Arc Mainnet. Supports a referral split (20% to referrer, 80% to treasury). After purchase, the app POSTs to LICENCE_API_URL to trigger licence delivery by email.

## Deployed Contracts

| Contract | Network | Address | Explorer |
|---|---|---|---|
| PurrclickPay | Arc Mainnet | 0xDF7027B92b85e65E258941fC283db199343cBb85 | https://explorer.arc.io/address/0xDF7027B92b85e65E258941fC283db199343cBb85 |
| PurrclickPay | Arc Testnet (history) | 0xb35bf640a2cdf26a76a6a022a9f523d2259f5546 | https://explorer.testnet.arc.io/address/0xb35bf640a2cdf26a76a6a022a9f523d2259f5546 |

Active chain: Arc Mainnet (chainId 5042). Contract address hardcoded in `src/lib/purrclick-contract.ts`.

## Config

- `VITE_LICENCE_API_URL` — your licence delivery endpoint (fill in .env before shipping)

## Tech Stack

- Frontend: React 18, Vite, TypeScript, Tailwind CSS
- Web3: wagmi v2, viem v2, ConnectKit
- Contracts: Solidity 0.8.28 + Foundry. Sources in `contracts/`, unit tests in `contracts/test/*.t.sol`. Build with `bun run contracts:build` (`forge build`), test with `bun run contracts:test` (`forge test`).
- Wallet: injected (MetaMask, etc.)
- Chain: Arc Mainnet (Chain ID: 5042, defined inline in `src/config.ts` via `defineChain`)
- Token: USDC (6 decimals) (Address: 0x3600000000000000000000000000000000000000, Chain: Arc Testnet)
- Toasts: Sonner

## Key Files

- `src/App.tsx` - Main application logic
- `src/components/` - UI components
- `src/config.ts` - wagmi config (chains, connectors, transports)

## To Run

```bash
bun install
bun run dev
```
