import React from 'react';
import { motion } from 'framer-motion';

// Avatar animé avec anneau LED réactif à l'état de l'assistant.
const STATE_COLORS = {
  idle: '#6366f1',
  listening: '#22d3ee',
  thinking: '#f59e0b',
  speaking: '#34d399',
  error: '#ef4444',
};

const STATE_LABELS = {
  idle: 'En veille',
  listening: 'À l’écoute…',
  thinking: 'Réflexion…',
  speaking: 'Réponse…',
  error: 'Erreur',
};

export default function Avatar({ state = 'idle' }) {
  const color = STATE_COLORS[state] ?? STATE_COLORS.idle;
  const active = state === 'listening' || state === 'speaking';

  return (
    <div className="flex flex-col items-center justify-center gap-5">
      <div className="relative flex h-44 w-44 items-center justify-center">
        {/* Anneaux LED pulsants */}
        {active &&
          [0, 0.6, 1.2].map((delay) => (
            <span
              key={delay}
              className="absolute h-40 w-40 rounded-full"
              style={{
                border: `2px solid ${color}`,
                animation: `pulseRing 1.8s ease-out ${delay}s infinite`,
              }}
            />
          ))}

        {/* Noyau de l'avatar */}
        <motion.div
          className="relative flex h-32 w-32 items-center justify-center rounded-full"
          style={{
            background: `radial-gradient(circle at 35% 30%, ${color}, #0b0f1a 75%)`,
            boxShadow: `0 0 60px ${color}66`,
          }}
          animate={{ scale: active ? [1, 1.06, 1] : 1 }}
          transition={{ duration: 1.4, repeat: active ? Infinity : 0 }}
        >
          <motion.div
            className="h-20 w-20 rounded-full"
            style={{ background: `${color}22`, border: `2px solid ${color}` }}
            animate={{ rotate: state === 'thinking' ? 360 : 0 }}
            transition={{
              duration: 2,
              repeat: state === 'thinking' ? Infinity : 0,
              ease: 'linear',
            }}
          />
        </motion.div>
      </div>

      <div className="text-center">
        <p className="text-sm font-medium" style={{ color }}>
          ● {STATE_LABELS[state] ?? STATE_LABELS.idle}
        </p>
      </div>
    </div>
  );
}
