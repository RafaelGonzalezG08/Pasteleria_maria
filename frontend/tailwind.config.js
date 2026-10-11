/** @type {import('tailwindcss').Config} */

// Cada color es un triplete R G B en una variable CSS (ver index.css). Asi
// "bg-copper-500/20" sigue funcionando y el modo oscuro solo cambia las
// variables, no las clases de cada pantalla.
const c = (nombre) => `rgb(var(--c-${nombre}) / <alpha-value>)`;

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Sora', 'Inter', 'system-ui', 'sans-serif'],
        // Serif con cursiva de verdad, para el lema bajo la marca.
        lema: ['Fraunces', 'Georgia', 'serif'],
      },
      colors: {
        espresso: {
          950: c('espresso-950'),
          900: c('espresso-900'),
          800: c('espresso-800'),
          700: c('espresso-700'),
        },
        // Fondo neumorfico: el MISMO tono para pagina y tarjetas; el relieve lo
        // hacen las sombras (shadow-neu / shadow-neu-inset), no los bordes.
        // 50 = "papel" blanco real (facturas). side = barra lateral (tono aparte).
        porcelain: {
          50: c('porcelain-50'),
          100: c('porcelain-100'),
          200: c('porcelain-200'),
          300: c('porcelain-300'),
          side: c('porcelain-side'),
        },
        // Acento principal: la paleta rosa del cliente (#e57d90 … #ffcdd4).
        copper: {
          50: c('copper-50'),
          100: c('copper-100'),
          200: c('copper-200'),
          300: c('copper-300'),
          400: c('copper-400'),
          500: c('copper-500'),
          600: c('copper-600'),
          700: c('copper-700'),
        },
        // Esmeralda (exito / saldado) — distinto del rosa a proposito.
        sage: {
          100: c('sage-100'),
          500: c('sage-500'),
          600: c('sage-600'),
          700: c('sage-700'),
        },
        // Vino / borgona (alertas, deuda).
        brick: {
          100: c('brick-100'),
          500: c('brick-500'),
          600: c('brick-600'),
          700: c('brick-700'),
        },
        // Rosa cuarzo — acento secundario.
        rose: {
          100: c('rose-100'),
          400: c('rose-400'),
          500: c('rose-500'),
          600: c('rose-600'),
        },
        ink: c('ink'),
        muted: c('muted'),
      },
      boxShadow: {
        neu: '6px 6px 14px rgb(var(--neu-lo)), -6px -6px 14px rgb(var(--neu-hi))',
        'neu-sm': '4px 4px 10px rgb(var(--neu-lo)), -4px -4px 10px rgb(var(--neu-hi))',
        'neu-inset': 'inset 3px 3px 7px rgb(var(--neu-lo)), inset -3px -3px 7px rgb(var(--neu-hi))',
        'neu-pressed': 'inset 2px 2px 5px rgb(var(--neu-lo)), inset -2px -2px 5px rgb(var(--neu-hi))',
        ticket: '5px 5px 12px rgb(var(--neu-lo)), -5px -5px 12px rgb(var(--neu-hi))',
      },
      borderRadius: {
        xl2: '1.25rem',
      },
    },
  },
  plugins: [],
};
