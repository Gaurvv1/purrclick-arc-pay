import { useState, useCallback } from 'react'
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
  useSwitchChain,
} from 'wagmi'
import { erc20Abi } from 'viem'
import { ConnectKitButton } from 'connectkit'
import { ExternalLink, Loader2, CheckCircle2, AlertCircle, Mail, RefreshCw } from 'lucide-react'
import { TokenUSDC, NetworkArc } from '@web3icons/react'
import { motion, AnimatePresence } from 'framer-motion'
import { Amount, usdcDecimalsFor } from '@/onchain-money'
import { buildTxExplorerUrl } from '@/onchain-facts'
import { PURRCLICK_PAY, USDC, LICENCE_API_URL, ACTIVE_CHAIN_ID } from '@/lib/purrclick-contract'
import { makeOrderId, parseOnchainError } from '@/lib/utils'

const card: React.CSSProperties = {
  background: 'var(--card-bg)',
  border: '1px solid var(--card-border)',
  borderRadius: '20px',
  boxShadow: '0 2px 20px rgba(0,0,0,0.30)',
}

const inner: React.CSSProperties = {
  background: 'var(--inner-bg)',
  border: '1px solid var(--inner-border)',
  borderRadius: '12px',
}

const LS_KEY = 'purrclick_pending_licence'

type Step = 'idle' | 'approving' | 'approved' | 'buying' | 'done'
type LicenceState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; checkoutUrl: string }
  | { status: 'error'; message: string }

interface LicencePayload {
  txHash: string
  orderId: string
  email: string
  ts: number
}

async function postLicence(payload: LicencePayload): Promise<{ checkout_url: string }> {
  const res = await fetch(LICENCE_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const json = await res.json() as Record<string, unknown>
  if (!res.ok) {
    const msg = typeof json['error'] === 'string' ? json['error']
      : typeof json['message'] === 'string' ? json['message']
      : 'Something went wrong. Please try again.'
    throw new Error(msg)
  }
  if (typeof json['checkout_url'] !== 'string') {
    throw new Error('Unexpected response from licence server.')
  }
  return { checkout_url: json['checkout_url'] }
}

export default function CheckoutTab() {
  const { address, isConnected, chainId } = useAccount()
  const { switchChain, isPending: isSwitching } = useSwitchChain()
  const wrongChain = isConnected && chainId !== ACTIVE_CHAIN_ID

  const [email, setEmail] = useState('')
  const [emailError, setEmailError] = useState('')
  const [step, setStep] = useState<Step>('idle')
  const [manualError, setManualError] = useState<string | null>(null)
  const [orderIdHex, setOrderIdHex] = useState<`0x${string}` | null>(null)
  const [ts, setTs] = useState<number | null>(null)
  const [licence, setLicence] = useState<LicenceState>({ status: 'idle' })

  // ── Live price from contract ────────────────────────────────────────────────
  const { data: priceRaw } = useReadContract({
    address: PURRCLICK_PAY.address,
    abi: PURRCLICK_PAY.abi,
    functionName: 'price',
    chainId: ACTIVE_CHAIN_ID,
  })

  const priceFormatted = priceRaw != null
    ? Amount.fromRaw(priceRaw as bigint, usdcDecimalsFor(ACTIVE_CHAIN_ID)).toFixed(2)
    : '...'

  // ── USDC balance ────────────────────────────────────────────────────────────
  const { data: balanceRaw } = useReadContract({
    address: USDC.address as `0x${string}`,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: ACTIVE_CHAIN_ID,
    query: { enabled: !!address },
  })
  const balanceFormatted = balanceRaw != null
    ? Amount.fromRaw(balanceRaw, usdcDecimalsFor(ACTIVE_CHAIN_ID)).toFixed(2)
    : null

  // ── Allowance ───────────────────────────────────────────────────────────────
  const { data: allowanceRaw, refetch: refetchAllowance } = useReadContract({
    address: USDC.address as `0x${string}`,
    abi: erc20Abi,
    functionName: 'allowance',
    args: address && PURRCLICK_PAY.address ? [address, PURRCLICK_PAY.address] : undefined,
    chainId: ACTIVE_CHAIN_ID,
    query: { enabled: !!address && !!PURRCLICK_PAY.address },
  })
  const hasAllowance = priceRaw != null && allowanceRaw != null
    && (allowanceRaw) >= (priceRaw as bigint)

  // ── Approve ─────────────────────────────────────────────────────────────────
  const {
    writeContract: approve,
    data: approveHash,
    isPending: isApprovePending,
    error: approveWriteError,
    reset: resetApprove,
  } = useWriteContract()
  const { isLoading: isApproveConfirming, isSuccess: isApproveSuccess } =
    useWaitForTransactionReceipt({ hash: approveHash })

  // ── Buy ─────────────────────────────────────────────────────────────────────
  const refParam = new URLSearchParams(window.location.search).get('ref') ?? ''
  const referrer: `0x${string}` = refParam.match(/^0x[0-9a-fA-F]{40}$/)
    ? refParam as `0x${string}`
    : '0x0000000000000000000000000000000000000000'

  const {
    writeContract: buy,
    data: buyHash,
    isPending: isBuyPending,
    error: buyWriteError,
    reset: resetBuy,
  } = useWriteContract()
  const { isLoading: isBuyConfirming, isSuccess: isBuySuccess } =
    useWaitForTransactionReceipt({ hash: buyHash })

  // ── Licence POST ─────────────────────────────────────────────────────────────
  const requestLicence = useCallback((payload: LicencePayload) => {
    if (!LICENCE_API_URL) return
    setLicence({ status: 'loading' })
    postLicence(payload)
      .then(({ checkout_url }) => {
        setLicence({ status: 'success', checkoutUrl: checkout_url })
        localStorage.removeItem(LS_KEY)
      })
      .catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : 'Something went wrong. Please try again.'
        setLicence({ status: 'error', message: msg })
      })
  }, [])

  // Advance step when approve confirms
  if (isApproveSuccess && step === 'approving') {
    void refetchAllowance()
    setStep('approved')
  }

  // Advance step when buy confirms — save to localStorage then POST
  if (isBuySuccess && step === 'buying' && buyHash && orderIdHex && ts !== null) {
    setStep('done')
    const payload: LicencePayload = { txHash: buyHash, orderId: orderIdHex, email, ts }
    try { localStorage.setItem(LS_KEY, JSON.stringify(payload)) } catch { /* ignore */ }
    requestLicence(payload)
  }

  const txError = manualError
    ?? (approveWriteError ? parseOnchainError(approveWriteError) : null)
    ?? (buyWriteError ? parseOnchainError(buyWriteError) : null)

  // ── Handlers ─────────────────────────────────────────────────────────────────
  function validateEmail(v: string): boolean {
    if (!v.trim()) { setEmailError('Email is required.'); return false }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) { setEmailError('Enter a valid email address.'); return false }
    setEmailError('')
    return true
  }

  function handleApprove() {
    if (!validateEmail(email)) return
    if (!priceRaw) return
    setManualError(null)
    resetApprove()
    setStep('approving')
    approve({
      address: USDC.address as `0x${string}`,
      abi: erc20Abi,
      functionName: 'approve',
      args: [PURRCLICK_PAY.address, priceRaw as bigint],
    })
  }

  function handleBuy() {
    if (!validateEmail(email)) return
    setManualError(null)
    resetBuy()
    const nowTs = Date.now()
    makeOrderId(email, nowTs).then((oid) => {
      setOrderIdHex(oid)
      setTs(nowTs)
      setStep('buying')
      buy({
        address: PURRCLICK_PAY.address,
        abi: PURRCLICK_PAY.abi,
        functionName: 'buy',
        args: [oid, referrer],
      })
    }).catch((e: unknown) => {
      setManualError(parseOnchainError(e))
      setStep('approved')
    })
  }

  // ── Derived step for display ──────────────────────────────────────────────
  const activeStep: Exclude<Step, 'done'> | 'done' =
    step === 'done' ? 'done'
    : step === 'buying' || isBuyPending || isBuyConfirming ? 'buying'
    : step === 'approved' || hasAllowance ? 'approved'
    : step === 'approving' || isApprovePending || isApproveConfirming ? 'approving'
    : 'idle'

  const explorerUrl = buyHash
    ? buildTxExplorerUrl(ACTIVE_CHAIN_ID, buyHash)
    : null

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-3">

      {/* Product card */}
      <div style={card}>
        <div className="px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <span className="display text-base font-bold" style={{ color: 'var(--ink)' }}>
                  Purrclick for Windows
                </span>
                <span
                  className="text-xs px-2 py-0.5 rounded-full font-semibold"
                  style={{ background: 'rgba(62,207,114,0.12)', color: 'var(--success)', border: '1px solid rgba(62,207,114,0.2)' }}
                >
                  one-time
                </span>
              </div>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--ink-2)', maxWidth: '30ch' }}>
                Cute click and typing sounds, a screen recorder that keeps them in your video, and Fifi the desktop kitten.
              </p>
              <a
                href="https://purrclick.app"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 mt-2 text-xs font-medium"
                style={{ color: 'var(--muted)' }}
              >
                purrclick.app <ExternalLink className="size-3" />
              </a>
            </div>
            <div className="text-right shrink-0">
              <div className="flex items-baseline gap-1 justify-end">
                <span className="display text-3xl font-bold tabular-nums" style={{ color: 'var(--ink)' }}>
                  ${priceFormatted}
                </span>
              </div>
              <div className="flex items-center gap-1 justify-end mt-1">
                <TokenUSDC variant="branded" size={13} />
                <span className="text-xs" style={{ color: 'var(--muted)' }}>USDC</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Checkout form */}
      <div style={card}>
        <div className="px-5 py-5 space-y-4">

          {/* Email */}
          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--muted)', letterSpacing: '0.07em', textTransform: 'uppercase' }}>
              Email
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 size-4" style={{ color: 'var(--subtle)' }} />
              <input
                type="email"
                placeholder="you@example.com"
                value={email}
                disabled={step === 'done'}
                onChange={(e) => { setEmail(e.target.value); if (emailError) validateEmail(e.target.value) }}
                onBlur={(e) => validateEmail(e.target.value)}
                className="w-full py-3 pl-9 pr-4 text-sm outline-none transition-colors disabled:opacity-50"
                style={{
                  ...inner,
                  color: 'var(--ink)',
                  fontFamily: "'DM Sans', sans-serif",
                  caretColor: 'var(--accent)',
                }}
              />
            </div>
            {emailError
              ? <p className="mt-1.5 text-xs" style={{ color: 'var(--danger)' }}>{emailError}</p>
              : <p className="mt-1.5 text-xs" style={{ color: 'var(--subtle)' }}>Your licence key will be sent here.</p>
            }
          </div>

          {/* Info rows */}
          {isConnected && !wrongChain && (
            <div className="space-y-1.5">
              {balanceFormatted != null && (
                <div className="flex items-center justify-between px-3 py-2" style={inner}>
                  <span className="text-xs" style={{ color: 'var(--muted)' }}>USDC balance</span>
                  <div className="flex items-center gap-1.5">
                    <TokenUSDC variant="branded" size={13} />
                    <span className="text-sm font-semibold tabular-nums" style={{ color: 'var(--ink)' }}>
                      {balanceFormatted}
                    </span>
                  </div>
                </div>
              )}
              <div className="flex items-center justify-between px-3 py-2" style={inner}>
                <span className="text-xs" style={{ color: 'var(--muted)' }}>Network</span>
                <div className="flex items-center gap-1.5">
                  <NetworkArc variant="branded" size={13} />
                  <span className="text-xs font-medium" style={{ color: 'var(--ink-2)' }}>Arc</span>
                </div>
              </div>
            </div>
          )}

          {/* Tx error */}
          <AnimatePresence>
            {txError && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="flex items-start gap-2 px-3 py-2.5 text-xs"
                style={{
                  background: 'rgba(240,96,128,0.09)',
                  border: '1px solid rgba(240,96,128,0.22)',
                  borderRadius: '12px',
                  color: 'var(--danger)',
                }}
              >
                <AlertCircle className="size-3.5 mt-0.5 shrink-0" />
                <span>{txError}</span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Step pills */}
          {isConnected && !wrongChain && activeStep !== 'done' && (
            <div className="flex items-center gap-2">
              <StepPill
                number={1} label="Allow"
                active={activeStep === 'approving'}
                done={activeStep === 'approved' || activeStep === 'buying'}
              />
              <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
              <StepPill
                number={2} label="Buy"
                active={activeStep === 'buying'}
                done={isBuySuccess}
              />
            </div>
          )}

          {/* Success receipt + licence block */}
          <AnimatePresence>
            {activeStep === 'done' && explorerUrl && (
              <motion.div
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                className="px-4 py-4 space-y-3"
                style={{
                  background: 'rgba(62,207,114,0.07)',
                  border: '1px solid rgba(62,207,114,0.18)',
                  borderRadius: '14px',
                }}
              >
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="size-4 shrink-0" style={{ color: 'var(--success)' }} />
                  <span className="text-sm font-semibold" style={{ color: 'var(--success)' }}>Payment confirmed</span>
                </div>

                {/* Licence state */}
                {LICENCE_API_URL ? (
                  <LicenceBlock
                    licence={licence}
                    email={email}
                    onRetry={() => {
                      if (buyHash && orderIdHex && ts !== null) {
                        requestLicence({ txHash: buyHash, orderId: orderIdHex, email, ts })
                      }
                    }}
                  />
                ) : null}

                <a
                  href={explorerUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-medium"
                  style={{ color: 'var(--muted)' }}
                >
                  View on explorer.arc.io <ExternalLink className="size-3" />
                </a>
              </motion.div>
            )}
          </AnimatePresence>

          {/* CTA */}
          <CTAButton
            isConnected={isConnected}
            wrongChain={wrongChain}
            isSwitching={isSwitching}
            onSwitch={() => switchChain({ chainId: ACTIVE_CHAIN_ID })}
            activeStep={activeStep}
            hasAllowance={hasAllowance}
            priceFormatted={priceFormatted}
            isApprovePending={isApprovePending}
            isApproveConfirming={isApproveConfirming}
            isBuyPending={isBuyPending}
            isBuyConfirming={isBuyConfirming}
            onApprove={handleApprove}
            onBuy={handleBuy}
          />

          <p className="text-center text-xs" style={{ color: 'var(--subtle)' }}>
            Paid on-chain · no refunds · licence delivered by email
          </p>
          <p className="text-center text-xs">
            <a
              href="https://polar.sh/purrclick/portal"
              target="_blank"
              rel="noreferrer"
              style={{ color: 'var(--subtle)', textDecoration: 'underline', textUnderlineOffset: '3px' }}
            >
              Already paid? Get your key
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}

// ── LicenceBlock ───────────────────────────────────────────────────────────────

function LicenceBlock({
  licence,
  email,
  onRetry,
}: {
  licence: LicenceState
  email: string
  onRetry: () => void
}) {
  const btnBase: React.CSSProperties = {
    width: '100%',
    borderRadius: '12px',
    padding: '12px 18px',
    fontSize: '14px',
    fontWeight: 600,
    fontFamily: "'DM Sans', sans-serif",
    border: 'none',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    lineHeight: 1,
    transition: 'opacity 0.15s',
  }

  if (licence.status === 'loading') {
    return (
      <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--ink-2)' }}>
        <Loader2 className="size-4 animate-spin shrink-0" style={{ color: 'var(--success)' }} />
        Preparing your licence…
      </div>
    )
  }

  if (licence.status === 'success') {
    return (
      <div className="space-y-2">
        <a
          href={licence.checkoutUrl}
          target="_blank"
          rel="noreferrer"
          style={{
            ...btnBase,
            background: '#e8e8ec',
            color: '#18181d',
            textDecoration: 'none',
          }}
        >
          Get your licence <ExternalLink className="size-4" />
        </a>
        <p className="text-xs text-center" style={{ color: 'var(--ink-2)' }}>
          Your licence key will be emailed to{' '}
          <strong style={{ color: 'var(--ink)' }}>{email}</strong>{' '}
          after you complete the free checkout.
        </p>
      </div>
    )
  }

  if (licence.status === 'error') {
    return (
      <div className="space-y-2">
        <div
          className="flex items-start gap-2 px-3 py-2.5 text-xs"
          style={{
            background: 'rgba(240,96,128,0.09)',
            border: '1px solid rgba(240,96,128,0.22)',
            borderRadius: '10px',
            color: 'var(--danger)',
          }}
        >
          <AlertCircle className="size-3.5 mt-0.5 shrink-0" />
          <span>{licence.message}</span>
        </div>
        <button
          onClick={onRetry}
          style={{ ...btnBase, background: 'rgba(255,255,255,0.08)', color: 'var(--ink-2)', border: '1px solid var(--border)' }}
        >
          <RefreshCw className="size-4" /> Try again
        </button>
      </div>
    )
  }

  return null
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function StepPill({ number, label, active, done }: { number: number; label: string; active: boolean; done: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <div
        className="size-5 rounded-full flex items-center justify-center text-xs font-bold transition-all"
        style={{
          background: done ? 'var(--pill-done-bg)' : active ? 'rgba(255,255,255,0.15)' : 'var(--surface-muted)',
          color: done ? 'var(--success)' : active ? 'var(--ink)' : 'var(--subtle)',
          border: `1px solid ${done ? 'rgba(62,207,114,0.3)' : active ? 'rgba(255,255,255,0.2)' : 'var(--border)'}`,
        }}
      >
        {done ? <CheckCircle2 className="size-3" /> : number}
      </div>
      <span className="text-xs font-medium" style={{ color: done ? 'var(--success)' : active ? 'var(--ink)' : 'var(--subtle)' }}>
        {label}
      </span>
    </div>
  )
}

function CTAButton({
  isConnected, wrongChain, isSwitching, onSwitch,
  activeStep, hasAllowance, priceFormatted,
  isApprovePending, isApproveConfirming, isBuyPending, isBuyConfirming,
  onApprove, onBuy,
}: {
  isConnected: boolean
  wrongChain: boolean
  isSwitching: boolean
  onSwitch: () => void
  activeStep: Exclude<Step, 'done'> | 'done'
  hasAllowance: boolean
  priceFormatted: string
  isApprovePending: boolean
  isApproveConfirming: boolean
  isBuyPending: boolean
  isBuyConfirming: boolean
  onApprove: () => void
  onBuy: () => void
}) {
  const btnBase: React.CSSProperties = {
    width: '100%',
    borderRadius: '14px',
    padding: '14px 20px',
    fontSize: '14px',
    fontWeight: 600,
    fontFamily: "'DM Sans', sans-serif",
    border: 'none',
    cursor: 'pointer',
    transition: 'opacity 0.15s, transform 0.1s',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    lineHeight: 1,
  }
  const primaryBtn: React.CSSProperties = { ...btnBase, background: '#e8e8ec', color: '#18181d' }
  const disabledBtn: React.CSSProperties = { ...primaryBtn, opacity: 0.4, cursor: 'not-allowed' }

  if (!isConnected) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <ConnectKitButton label="Connect wallet to buy" />
      </div>
    )
  }
  if (wrongChain) {
    return (
      <button onClick={onSwitch} disabled={isSwitching} style={isSwitching ? disabledBtn : primaryBtn}>
        {isSwitching
          ? <><Loader2 className="size-4 animate-spin" /> Switching…</>
          : 'Switch to Arc'}
      </button>
    )
  }
  if (activeStep === 'done') {
    return (
      <button disabled style={{ ...disabledBtn, background: 'rgba(62,207,114,0.15)', color: 'var(--success)' }}>
        <CheckCircle2 className="size-4" /> Purchase complete
      </button>
    )
  }
  if (!hasAllowance && activeStep !== 'approved') {
    const busy = isApprovePending || isApproveConfirming
    return (
      <button onClick={onApprove} disabled={busy} style={busy ? disabledBtn : primaryBtn}>
        {isApprovePending
          ? <><Loader2 className="size-4 animate-spin" /> Confirm in wallet…</>
          : isApproveConfirming
          ? <><Loader2 className="size-4 animate-spin" /> Confirming…</>
          : 'Allow USDC'}
      </button>
    )
  }
  const busy = isBuyPending || isBuyConfirming
  return (
    <button onClick={onBuy} disabled={busy} style={busy ? disabledBtn : primaryBtn}>
      {isBuyPending
        ? <><Loader2 className="size-4 animate-spin" /> Confirm in wallet…</>
        : isBuyConfirming
        ? <><Loader2 className="size-4 animate-spin" /> Confirming…</>
        : `Buy Purrclick · $${priceFormatted}`}
    </button>
  )
}
