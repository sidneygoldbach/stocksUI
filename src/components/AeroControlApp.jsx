import React, { useEffect, useMemo, useRef, useState } from 'react'
import ControlPanel from './ControlPanel.jsx'
import LanguageSelector from './LanguageSelector.jsx'
import { useTranslation } from 'react-i18next'

// Efeitos 3D intensificados e tema aeronáutico dedicado
export default function AeroControlApp() {
  // Sons opcionais via WebAudio (sem arquivos)
  const [audioCtx, setAudioCtx] = useState(null)
  const [soundOn, setSoundOn] = useState(true)
  const [ambientLight, setAmbientLight] = useState(0.7)
  const [accentHue, setAccentHue] = useState(220)

  const cpRef = useRef(null)
  const ensureAudioCtx = () => {
    if (!audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext
      if (Ctx) setAudioCtx(new Ctx())
    }
  }

  const playBeep = (freq = 520, duration = 0.08, volume = 0.08) => {
    if (!soundOn) return
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) return
    const ctx = audioCtx || new Ctx()
    if (!audioCtx) setAudioCtx(ctx)
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = freq
    gain.gain.setValueAtTime(0, ctx.currentTime)
    gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + duration)
  }

  const onAnyClick = () => {
    ensureAudioCtx()
    playBeep(520, 0.09, 0.12)
  }

  const { t } = useTranslation()
  return (
    <div
      className="min-h-screen bg-gray-50"
    >
      {/* Iluminação direcional desativada */}
      <div className="hidden pointer-events-none absolute inset-0">
        {/* ... */}
      </div>

      {/* Container principal simples */}
      <div className="relative z-10 mx-auto max-w-5xl px-6 py-8">
        <div
          className="relative rounded-lg p-6 bg-white border border-gray-200 shadow-sm"
          style={{}}
        >
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold tracking-tight text-gray-900">
              {t('aero.title')}
            </h1>
            <LanguageSelector />
          </div>
          <p className="mt-2 text-gray-600 text-sm">
            {t('aero.subtitle')}
          </p>

          {/* Botões tradicionais */}
          <div className="mt-6 flex flex-wrap gap-3">
            {[
              { key: 'start', label: t('aero.start') },
              { key: 'pause', label: t('aero.pause') },
              { key: 'reset', label: t('aero.reset') }
            ].map((btn) => (
              <button
                key={btn.key}
                onClick={(e) => { e.preventDefault(); if (btn.key==='start') cpRef.current?.startRun?.(); if (btn.key==='pause') cpRef.current?.pauseRun?.(); if (btn.key==='reset') cpRef.current?.resetRun?.(); }}
                className="chrome-pill-btn text-sm"
              >
                {btn.label}
              </button>
            ))}
          </div>

          {/* Sliders decorativos ocultos para simplicidade */}
          <div className="hidden">
            {/* ... knobs/sliders removidos visualmente ... */}
          </div>

          {/* ControlPanel integrado e visível */}
          <div className="mt-8">
            <ControlPanel ref={cpRef} />
          </div>
        </div>
      </div>
    </div>
  )
}