import { useState, useEffect } from 'react'
import { PROFILE_COLORS, getInitials } from '../contexts/ProfileContext'

const KEYS = ['1','2','3','4','5','6','7','8','9','','0','⌫']

/**
 * mode='enter'  — verify existing PIN. Calls onSuccess(pin) → must return Promise<bool>
 * mode='setup'  — create new PIN (two-step: enter then confirm). Calls onSetup(pin) → Promise<void>
 */
export default function PINModal({ profile, mode = 'enter', onSuccess, onSetup, onCancel }) {
  const [step, setStep]       = useState(1)   // 1 = enter/first, 2 = confirm
  const [digits, setDigits]   = useState([])
  const [firstPin, setFirstPin] = useState('')
  const [error, setError]     = useState('')
  const [shaking, setShaking] = useState(false)
  const [saving, setSaving]   = useState(false)

  const colors = PROFILE_COLORS[profile.color] || PROFILE_COLORS.primary

  const heading = mode === 'setup'
    ? (step === 1 ? 'Create your PIN' : 'Confirm your PIN')
    : 'Enter your PIN'

  const shake = (msg) => {
    setShaking(true)
    setError(msg)
    setTimeout(() => { setShaking(false); setDigits([]) }, 600)
  }

  useEffect(() => {
    if (digits.length !== 4) return

    if (mode === 'enter') {
      onSuccess(digits.join('')).then((ok) => {
        if (!ok) shake('Incorrect PIN')
      })
      return
    }

    // setup mode
    if (step === 1) {
      setFirstPin(digits.join(''))
      setDigits([])
      setStep(2)
      setError('')
      return
    }

    // step 2 — confirm
    if (digits.join('') !== firstPin) {
      setFirstPin('')
      setStep(1)
      shake("PINs don't match — try again")
      return
    }

    // PINs match — save
    setSaving(true)
    onSetup(digits.join('')).finally(() => setSaving(false))
  }, [digits])

  const press = (key) => {
    if (saving) return
    setError('')
    if (key === '⌫') setDigits((d) => d.slice(0, -1))
    else if (key !== '' && digits.length < 4) setDigits((d) => [...d, key])
  }

  useEffect(() => {
    const handler = (e) => {
      if (e.key >= '0' && e.key <= '9') press(e.key)
      if (e.key === 'Backspace') press('⌫')
      if (e.key === 'Escape' && onCancel) onCancel()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [digits, saving])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-surface-container-low rounded-3xl p-8 w-80 flex flex-col items-center gap-6 shadow-2xl">

        {/* Avatar */}
        <div className={`w-16 h-16 rounded-full ${colors.bg} flex items-center justify-center text-2xl font-headline font-bold ${colors.text} shadow-lg`}>
          {getInitials(profile.name)}
        </div>
        <div className="text-center">
          <p className="font-headline font-bold text-on-surface text-lg">{profile.name}</p>
          <p className="text-xs text-on-surface-variant mt-0.5">{heading}</p>
          {mode === 'setup' && (
            <div className="flex justify-center gap-1 mt-2">
              <span className={`w-2 h-2 rounded-full transition-all ${step >= 1 ? colors.bg : 'bg-outline-variant'}`} />
              <span className={`w-2 h-2 rounded-full transition-all ${step >= 2 ? colors.bg : 'bg-outline-variant'}`} />
            </div>
          )}
        </div>

        {/* PIN dots */}
        <div className={`flex gap-4 ${shaking ? 'animate-[shake_0.5s_ease]' : ''}`}>
          {[0,1,2,3].map((i) => (
            <div
              key={i}
              className={`w-4 h-4 rounded-full border-2 transition-all duration-200 ${
                digits[i] !== undefined
                  ? `${colors.bg} border-transparent scale-110`
                  : 'border-outline-variant bg-transparent'
              }`}
            />
          ))}
        </div>

        {error && <p className="text-xs text-error font-semibold -mt-3">{error}</p>}

        {/* Keypad */}
        <div className="grid grid-cols-3 gap-3 w-full">
          {KEYS.map((key, i) => (
            <button
              key={i}
              onClick={() => press(key)}
              disabled={key === '' || saving}
              className={`h-14 rounded-2xl text-lg font-bold transition-all active:scale-95 ${
                key === ''
                  ? 'invisible'
                  : key === '⌫'
                  ? 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high text-base'
                  : 'bg-surface-container-high text-on-surface hover:bg-primary/10 hover:text-primary'
              }`}
            >
              {saving && key !== '⌫' && key !== '' ? '' : key}
            </button>
          ))}
        </div>

        {onCancel && (
          <button onClick={onCancel} className="text-xs text-on-surface-variant hover:text-on-surface font-semibold">
            Cancel
          </button>
        )}
      </div>

      <style>{`
        @keyframes shake {
          0%,100% { transform: translateX(0) }
          20%      { transform: translateX(-8px) }
          40%      { transform: translateX(8px) }
          60%      { transform: translateX(-8px) }
          80%      { transform: translateX(4px) }
        }
      `}</style>
    </div>
  )
}
