import { useState } from 'react'
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
  useSwitchChain,
} from 'wagmi'
import { erc20Abi } from 'viem'
import { ConnectKitButton } from 'connectkit'
import { ExternalLink, Loader2, CheckCircle2, ShoppingBag, AlertCircle } from 'lucide-react'
import { TokenUSDC } from '@web3icons/react'
import { getUsdc, buildTxExplorerUrl } from '@/onchain-facts'
import { Amount, usdcDecimalsFor } from '@/onchain-money'
import { parseUnitsExact } from '@/onchain-money'

// ─── Constants ───────────────────────────────────────────────────────────────

const TARGET_CHAIN_ID = 5042002 // Arc Testnet
const USDC = getUsdc(TARGET_CHAIN_ID)!
const USDC_DECIMALS = usdcDecimalsFor(TARGET_CHAIN_ID)

// Glass style tokens
const glass = {
  card: {
    background: 'var(--surface-strong)',
    backdropFilter: 'blur(24px) saturate(180%)',
    WebkitBackdropFilter: 'blur(24px) saturate(180%)',
    border: '1px solid var(--border)',
  },
  inner: {
    background: 'var(--surface-muted)',
    border: '1px solid var(--border)',
  },
}

// Spectral strip (consumer money flow indicator)
const spectralGradient =
  'linear-gradient(90deg, #6366f1 0%, #8b5cf6 20%, #ec4899 40%, #f59e0b 60%, #10b981 80%, #3b82f6 100%)'

// ─── Order items ─────────────────────────────────────────────────────────────

const ORDER_ITEMS = [
  { label: 'Arc Studio Pro — 1 month', amount: '4.99' },
  { label: 'Onchain Starter Pack', amount: '0.99' },
]

const ORDER_TOTAL = ORDER_ITEMS.reduce(
  (sum, item) => sum + parseFloat(item.amount),
  0,
).toFixed(2)

// Merchant address — replace with your own before going live
const MERCHANT_ADDRESS = '0x5B12Ce46C7194aD57d143bC22847224047b1Ef42'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatAddress(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

function parseOnchainError(error: unknown): string {
  const message = (error as { message?: string })?.message?.toLowerCase() ?? ''
  if (message.includes('user rejected') || (error as { code?: number })?.code === 4001)
    return 'Transaction cancelled.'
  if (message.includes('insufficient funds') || message.includes('exceeds balance'))
    return 'Insufficient USDC balance.'
  if (message.includes('reverted')) return 'Transaction failed. Please try again.'
  if (message.includes('network') || message.includes('timeout'))
    return 'Network error. Please retry.'
  return 'Something went wrong. Please try again.'
}

// ─── Component ───────────────────────────────────────────────────────────────

type Step = 'idle' | 'approving' | 'approved' | 'paying' | 'done'

export default function CheckoutCard() {
  const { address, isConnected, chainId } = useAccount()
  const { switchChain, isPending: isSwitching } = useSwitchChain()
  const [step, setStep] = useState<Step>('idle')
  const [txError, setTxError] = useState<string | null>(null)

  const wrongChain = isConnected && chainId !== TARGET_CHAIN_ID

  // ── USDC balance ────────────────────────────────────────────────────────────
  const { data: rawBalance } = useReadContract({
    address: USDC.address as `0x${string}`,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [address!],
    chainId: TARGET_CHAIN_ID,
    query: { enabled: !!address },
  })

  const formattedBalance = rawBalance != null
    ? Amount.fromRaw(rawBalance, USDC_DECIMALS).toFixed(2)
    : null

  // ── Allowance ───────────────────────────────────────────────────────────────
  const { data: rawAllowance, refetch: refetchAllowance } = useReadContract({
    address: USDC.address as `0x${string}`,
    abi: erc20Abi,
    functionName: 'allowance',
    args: [address!, MERCHANT_ADDRESS as `0x${string}`],
    chainId: TARGET_CHAIN_ID,
    query: { enabled: !!address },
  })

  const requiredRaw = parseUnitsExact(ORDER_TOTAL, USDC_DECIMALS)
  const hasAllowance = rawAllowance != null && rawAllowance >= requiredRaw

  // ── Approve write ────────────────────────────────────────────────────────────
  const {
    writeContract: writeApprove,
    data: approveHash,
    isPending: isApprovePending,
    error: approveWriteError,
  } = useWriteContract()

  const { isLoading: isApproveConfirming, isSuccess: isApproveSuccess } =
    useWaitForTransactionReceipt({ hash: approveHash })

  // ── Transfer write ───────────────────────────────────────────────────────────
  const {
    writeContract: writeTransfer,
    data: payHash,
    isPending: isPayPending,
    error: payWriteError,
  } = useWriteContract()

  const { isLoading: isPayConfirming, isSuccess: isPaySuccess } =
    useWaitForTransactionReceipt({ hash: payHash })

  // ── Effect: advance step after approve confirms ──────────────────────────────
  const handleApprove = () => {
    if (!address) return
    setTxError(null)
    setStep('approving')
    writeApprove(
      {
        address: USDC.address as `0x${string}`,
        abi: erc20Abi,
        functionName: 'approve',
        args: [MERCHANT_ADDRESS as `0x${string}`, requiredRaw],
        chainId: TARGET_CHAIN_ID,
      },
      {
        onError: (err) => {
          setTxError(parseOnchainError(err))
          setStep('idle')
        },
        onSuccess: () => {
          // wait for receipt via isApproveSuccess
        },
      },
    )
  }

  // Called after user clicks "Pay now"
  const handlePay = () => {
    if (!address) return
    setTxError(null)
    setStep('paying')
    writeTransfer(
      {
        address: USDC.address as `0x${string}`,
        abi: erc20Abi,
        functionName: 'transferFrom',
        args: [address, MERCHANT_ADDRESS as `0x${string}`, requiredRaw],
        chainId: TARGET_CHAIN_ID,
      },
      {
        onError: (err) => {
          setTxError(parseOnchainError(err))
          setStep(hasAllowance ? 'approved' : 'idle')
        },
      },
    )
  }

  // Advance step reactively
  if (isApproveSuccess && step === 'approving') {
    void refetchAllowance()
    setStep('approved')
  }
  if (isPaySuccess && step === 'paying') {
    setStep('done')
  }

  // ── Derived display values ───────────────────────────────────────────────────
  const activeStep =
    step === 'done' ? 'done'
    : isPaySuccess ? 'done'
    : step === 'paying' || isPayPending || isPayConfirming ? 'paying'
    : step === 'approved' || hasAllowance ? 'approved'
    : step === 'approving' || isApprovePending || isApproveConfirming ? 'approving'
    : 'idle'

  const anyError = txError
    ?? (approveWriteError ? parseOnchainError(approveWriteError) : null)
    ?? (payWriteError ? parseOnchainError(payWriteError) : null)

  const explorerTxUrl = payHash
    ? buildTxExplorerUrl(TARGET_CHAIN_ID, payHash)
    : approveHash
    ? buildTxExplorerUrl(TARGET_CHAIN_ID, approveHash)
    : null

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div
      className="min-h-dvh flex items-center justify-center px-4 py-10"
      style={{ background: 'var(--bg-gradient)' }}
    >
      <div className="w-full max-w-md space-y-3">

        {/* Header */}
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <div
              className="flex size-8 items-center justify-center rounded-xl"
              style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}
            >
              <ShoppingBag className="size-4" style={{ color: 'var(--ink)' }} />
            </div>
            <span className="display text-base font-semibold" style={{ color: 'var(--ink)' }}>
              Checkout
            </span>
          </div>
          <ConnectKitButton />
        </div>

        {/* Main card */}
        <div className="rounded-3xl overflow-hidden shadow-sm" style={glass.card}>
          {/* Spectral strip */}
          <div className="h-1" style={{ background: spectralGradient }} />

          <div className="p-6 space-y-5">

            {/* Order summary */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest mb-3"
                style={{ color: 'var(--muted)', letterSpacing: '0.08em' }}>
                Order summary
              </p>
              <div className="space-y-2">
                {ORDER_ITEMS.map((item) => (
                  <div key={item.label} className="flex items-center justify-between">
                    <span className="text-sm" style={{ color: 'var(--ink-2)' }}>
                      {item.label}
                    </span>
                    <span className="text-sm font-semibold tabular-nums" style={{ color: 'var(--ink)' }}>
                      ${item.amount}
                    </span>
                  </div>
                ))}
              </div>
              <div
                className="mt-3 pt-3 flex items-center justify-between"
                style={{ borderTop: '1px solid var(--border)' }}
              >
                <span className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Total</span>
                <div className="flex items-center gap-1.5">
                  <TokenUSDC variant="branded" size={18} />
                  <span className="display text-xl font-bold tabular-nums" style={{ color: 'var(--ink)' }}>
                    ${ORDER_TOTAL}
                  </span>
                  <span className="text-sm" style={{ color: 'var(--subtle)' }}>USDC</span>
                </div>
              </div>
            </div>

            {/* Balance */}
            {isConnected && (
              <div
                className="rounded-2xl px-4 py-3 flex items-center justify-between"
                style={glass.inner}
              >
                <span className="text-xs" style={{ color: 'var(--muted)' }}>Your USDC balance</span>
                <span className="text-sm font-semibold tabular-nums" style={{ color: 'var(--ink)' }}>
                  {formattedBalance != null ? `$${formattedBalance}` : '…'}
                </span>
              </div>
            )}

            {/* Merchant */}
            <div
              className="rounded-2xl px-4 py-3 flex items-center justify-between"
              style={glass.inner}
            >
              <span className="text-xs" style={{ color: 'var(--muted)' }}>Paying to</span>
              <span
                className="mono text-xs font-medium"
                style={{ color: 'var(--ink-2)' }}
                title={MERCHANT_ADDRESS}
              >
                {formatAddress(MERCHANT_ADDRESS)}
              </span>
            </div>

            {/* Step progress pills */}
            {isConnected && !wrongChain && activeStep !== 'done' && (
              <div className="flex items-center gap-2">
                {(['approving', 'approved'] as const).includes(activeStep as 'approving' | 'approved') || activeStep === 'idle' ? (
                  <StepPill
                    number={1}
                    label="Approve"
                    active={activeStep === 'approving'}
                    done={activeStep === 'approved' || hasAllowance}
                  />
                ) : null}
                <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
                <StepPill
                  number={2}
                  label="Pay"
                  active={activeStep === 'paying'}
                  done={isPaySuccess}
                />
              </div>
            )}

            {/* Error */}
            {anyError && (
              <div
                className="flex items-start gap-2 rounded-xl px-3 py-2.5 text-xs"
                style={{
                  background: 'rgba(186,43,76,0.07)',
                  border: '1px solid rgba(186,43,76,0.2)',
                  color: 'var(--danger)',
                }}
              >
                <AlertCircle className="size-3.5 mt-0.5 shrink-0" />
                <span>{anyError}</span>
              </div>
            )}

            {/* Success receipt */}
            {activeStep === 'done' && (
              <div
                className="rounded-2xl px-4 py-4 space-y-2"
                style={{
                  background: 'rgba(26,128,71,0.07)',
                  border: '1px solid rgba(26,128,71,0.2)',
                }}
              >
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="size-4" style={{ color: 'var(--success)' }} />
                  <span className="text-sm font-semibold" style={{ color: 'var(--success)' }}>
                    Payment confirmed
                  </span>
                </div>
                <p className="text-xs" style={{ color: 'var(--muted)' }}>
                  ${ORDER_TOTAL} USDC sent to {formatAddress(MERCHANT_ADDRESS)}
                </p>
                {explorerTxUrl && (
                  <a
                    href={explorerTxUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-medium"
                    style={{ color: 'var(--accent-hover)' }}
                  >
                    View on ArcScan <ExternalLink className="size-3" />
                  </a>
                )}
              </div>
            )}

            {/* CTA */}
            {activeStep !== 'done' && (
              <ActionButton
                isConnected={isConnected}
                wrongChain={wrongChain}
                isSwitching={isSwitching}
                activeStep={activeStep}
                hasAllowance={hasAllowance}
                isApprovePending={isApprovePending}
                isApproveConfirming={isApproveConfirming}
                isPayPending={isPayPending}
                isPayConfirming={isPayConfirming}
                onSwitchChain={() => switchChain({ chainId: TARGET_CHAIN_ID })}
                onApprove={handleApprove}
                onPay={handlePay}
              />
            )}

            {/* Testnet note */}
            <p className="text-center text-xs" style={{ color: 'var(--subtle)' }}>
              Arc Testnet · USDC · Get test funds from the Arc Studio sidebar
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StepPill({
  number,
  label,
  active,
  done,
}: {
  number: number
  label: string
  active: boolean
  done: boolean
}) {
  return (
    <div className="flex items-center gap-1.5">
      <div
        className="flex size-5 items-center justify-center rounded-full text-xs font-bold transition-colors"
        style={{
          background: done
            ? 'var(--success)'
            : active
            ? 'var(--accent)'
            : 'var(--surface-muted)',
          color: done || active ? 'white' : 'var(--muted)',
          border: done || active ? 'none' : '1px solid var(--border)',
        }}
      >
        {done ? <CheckCircle2 className="size-3" /> : number}
      </div>
      <span
        className="text-xs font-medium"
        style={{ color: done ? 'var(--success)' : active ? 'var(--ink)' : 'var(--muted)' }}
      >
        {label}
      </span>
    </div>
  )
}

function ActionButton({
  isConnected,
  wrongChain,
  isSwitching,
  activeStep,
  hasAllowance,
  isApprovePending,
  isApproveConfirming,
  isPayPending,
  isPayConfirming,
  onSwitchChain,
  onApprove,
  onPay,
}: {
  isConnected: boolean
  wrongChain: boolean
  isSwitching: boolean
  activeStep: Exclude<Step, 'done'>
  hasAllowance: boolean
  isApprovePending: boolean
  isApproveConfirming: boolean
  isPayPending: boolean
  isPayConfirming: boolean
  onSwitchChain: () => void
  onApprove: () => void
  onPay: () => void
}) {
  const busy =
    isSwitching ||
    isApprovePending ||
    isApproveConfirming ||
    isPayPending ||
    isPayConfirming

  let label: React.ReactNode = 'Connect wallet'
  let onClick: (() => void) | undefined = undefined
  let disabled = busy

  if (!isConnected) {
    label = 'Connect wallet'
    disabled = false
    // ConnectKitButton handles the click; we wrap it instead
  } else if (wrongChain) {
    label = isSwitching ? (
      <span className="flex items-center justify-center gap-2">
        <Loader2 className="size-4 animate-spin" /> Switching…
      </span>
    ) : (
      'Switch to Arc Testnet'
    )
    onClick = onSwitchChain
  } else if (!hasAllowance && (activeStep === 'idle' || activeStep === 'approving')) {
    label =
      isApprovePending ? (
        <span className="flex items-center justify-center gap-2">
          <Loader2 className="size-4 animate-spin" /> Confirm in wallet…
        </span>
      ) : isApproveConfirming ? (
        <span className="flex items-center justify-center gap-2">
          <Loader2 className="size-4 animate-spin" /> Approving USDC…
        </span>
      ) : (
        'Approve USDC'
      )
    onClick = onApprove
  } else {
    label =
      isPayPending ? (
        <span className="flex items-center justify-center gap-2">
          <Loader2 className="size-4 animate-spin" /> Confirm in wallet…
        </span>
      ) : isPayConfirming ? (
        <span className="flex items-center justify-center gap-2">
          <Loader2 className="size-4 animate-spin" /> Confirming payment…
        </span>
      ) : (
        `Pay $${ORDER_TOTAL} USDC`
      )
    onClick = onPay
  }

  if (!isConnected) {
    return (
      <ConnectKitButton.Custom>
        {({ show }) => (
          <button
            onClick={show}
            className="w-full rounded-2xl py-3.5 text-sm font-semibold text-white transition-all hover:scale-[1.01] active:scale-[0.99]"
            style={{ background: 'var(--accent)' }}
          >
            Connect wallet
          </button>
        )}
      </ConnectKitButton.Custom>
    )
  }

  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className="w-full rounded-2xl py-3.5 text-sm font-semibold text-white transition-all hover:scale-[1.01] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
      style={{ background: 'var(--accent)' }}
    >
      {label}
    </button>
  )
}
