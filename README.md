# Purrclick Pay

On-chain USDC checkout for [Purrclick](https://purrclick.app) — cute click sounds, a screen recorder, and Fifi the desktop kitten for Windows.

Built with [Arc Studio](https://studio.arc.io) on the [Arc](https://arc.io) blockchain, where USDC is the native gas token.

---

## What it does

Purrclick Pay is a two-tab web app that lets users buy a Purrclick licence with USDC in two on-chain steps:

1. **Allow** — approve the `PurrclickPay` contract to pull the exact USDC amount.
2. **Buy** — call `buy(orderId, referrer)` on-chain. The contract sends funds directly to the treasury (or splits 80/20 with the referrer) and marks the order as paid.

After a successful payment the app posts `{ txHash, orderId, email }` to a configurable licence-delivery endpoint so the buyer receives their key by email.

A second tab, **Earn with Purrclick**, lets anyone become a referrer: copy your referral link, share it, and earn 20% of every sale that comes through it — paid instantly in USDC on-chain.

---

## Smart contract: PurrclickPay

**Deployed on Arc Testnet:** `0xb35bf640a2cdf26a76a6a022a9f523d2259f5546`

| Function | Who | Description |
|---|---|---|
| `buy(bytes32 orderId, address referrer)` | anyone | Pulls `price` USDC from buyer. Splits 20% to referrer / 80% to treasury if a valid referrer is set, otherwise 100% to treasury. Each `orderId` can only be used once. |
| `setPrice(uint256)` | owner | Update the licence price (in USDC 6-decimal units). |
| `setTreasury(address)` | owner | Update the treasury address. |
| `setReferralBps(uint16)` | owner | Set the referral percentage in basis points (max 3000 = 30%). |
| `pause()` / `unpause()` | owner | Halt or resume purchases. |

Events: `Paid(orderId, buyer, referrer, amount)` on every successful purchase.

No admin function can touch buyers' funds. Funds never sit in the contract — every `buy` call transfers directly from buyer to treasury (and optionally referrer).

---

## Tech stack

| Layer | Technology |
|---|---|
| Blockchain | [Arc Testnet](https://arc.io) (USDC as native gas) |
| Smart contract | Solidity 0.8.20, OpenZeppelin Ownable + Pausable |
| Frontend | React 18, TypeScript, Vite, Tailwind CSS |
| Onchain hooks | wagmi v2, viem, ConnectKit |
| Icons | @web3icons/react, lucide-react |
| Animations | framer-motion |
| Testing | Foundry (forge) — 37 tests, 2 fuzz suites |

---

## Project structure

```
contracts/
  PurrclickPay.sol          # Main contract
  test/
    PurrclickPay.t.sol      # Full unit + fuzz test suite (37 tests)
  test-helpers/
    MockERC20.sol

src/
  App.tsx                   # Shell — tab bar, header
  components/
    CheckoutTab.tsx          # Allow + Buy flow
    ReferralTab.tsx          # Referral link + earnings
  lib/
    purrclick-contract.ts   # ABI, addresses, chain config
    utils.ts                # orderId generation, error parsing
```

---

## Local development

### Prerequisites

- [Bun](https://bun.sh) (package manager)
- [Foundry](https://book.getfoundry.sh) (contract tooling)

### Setup

```bash
bun install
```

Copy `.env.example` to `.env` and fill in:

```env
VITE_PURRCLICK_CONTRACT=0xb35bf640a2cdf26a76a6a022a9f523d2259f5546
VITE_LICENCE_API_URL=https://your-licence-endpoint.com/licences
```

### Run

```bash
bun run dev
```

### Contract tests

```bash
forge test -v
```

### Lint + typecheck

```bash
bun run check
```

---

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `VITE_PURRCLICK_CONTRACT` | Yes | Deployed `PurrclickPay` contract address |
| `VITE_LICENCE_API_URL` | No | POST endpoint for licence key delivery |

Never commit `.env`. It is listed in `.gitignore`.

---

## Deploying a new contract instance

```bash
forge build
```

Then deploy via Circle Smart Contract Platform or your preferred method. Constructor args:

```
initialOwner  address   Your deployer / multisig
treasury      address   Address that receives sale proceeds
price         uint256   Price in USDC (6 decimals), e.g. 3000000 = $3.00
usdc          address   USDC token address on the target chain
```

Arc Testnet USDC: `0x3600000000000000000000000000000000000000`

---

## Built with Arc Studio

This project was scaffolded, contracted, audited, tested, and deployed entirely inside [Arc Studio](https://studio.arc.io) — Circle's AI-powered onchain app builder. Arc Studio wrote the Solidity contract, ran a balanced security audit (no findings), executed 37 unit and fuzz tests, deployed to Arc Testnet, and built the full React frontend — all from a plain-English prompt.

> Arc is Circle's blockchain where USDC is the native gas token, making every transaction denominated in a stable, predictable asset with sub-second finality.
