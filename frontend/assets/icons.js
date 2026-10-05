/**
 * Realistic Vector SVG Icons for KEVS SIOMAI POS & Dashboard
 * Clean, modern, scalable stroke-based SVG icons (Lucide / Heroicons style)
 */

function svg(paths, { size = 18, color = 'currentColor', strokeWidth = 2, className = '' } = {}) {
  return `<svg class="svg-icon ${className}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -2px; display: inline-block;">${paths}</svg>`;
}

export const Icons = {
  // Dumpling / Siomai Food Icon
  siomai: (opts) => svg(`
    <path d="M12 2a4 4 0 0 0-4 4c0 .8.2 1.5.6 2.1C5.3 9.3 3 12.2 3 16c0 3.3 4 5 9 5s9-1.7 9-5c0-3.8-2.3-6.7-5.6-7.9.4-.6.6-1.3.6-2.1a4 4 0 0 0-4-4z" />
    <path d="M8 6c1 2 2.5 3 4 3s3-1 4-3" />
    <path d="M12 9v11" opacity="0.4" />
    <path d="M8 12c.5 2 1.5 4 4 4s3.5-2 4-4" opacity="0.4" />
  `, opts),

  // Clipboard / Queue
  queue: (opts) => svg(`
    <rect width="8" height="4" x="8" y="2" rx="1" ry="1"/>
    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
    <path d="M9 12h6"/>
    <path d="M9 16h6"/>
    <circle cx="7" cy="12" r=".5" fill="currentColor"/>
    <circle cx="7" cy="16" r=".5" fill="currentColor"/>
  `, opts),

  // Package / Inventory Box
  package: (opts) => svg(`
    <path d="M16.5 9.4 7.55 4.24"/>
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
    <polyline points="3.29 7 12 12 20.71 7"/>
    <line x1="12" x2="12" y1="22" y2="12"/>
  `, opts),

  // Bar Chart / Analytics
  analytics: (opts) => svg(`
    <path d="M3 3v18h18"/>
    <path d="m19 9-5 5-4-4-3 3"/>
    <rect width="3" height="7" x="6" y="14" rx="1"/>
    <rect width="3" height="11" x="12" y="10" rx="1"/>
    <rect width="3" height="15" x="17" y="6" rx="1"/>
  `, opts),

  // Microchip / Hardware / Simulator
  hardware: (opts) => svg(`
    <rect width="16" height="16" x="4" y="4" rx="2"/>
    <rect width="6" height="6" x="9" y="9" rx="1"/>
    <path d="M9 1v3"/>
    <path d="M15 1v3"/>
    <path d="M9 20v3"/>
    <path d="M15 20v3"/>
    <path d="M20 9h3"/>
    <path d="M20 14h3"/>
    <path d="M1 9h3"/>
    <path d="M1 14h3"/>
  `, opts),

  // Shield / Security / Firewall
  shield: (opts) => svg(`
    <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>
    <path d="m9 12 2 2 4-4"/>
  `, opts),

  // Star Rating
  star: (opts) => svg(`
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" fill="currentColor" stroke="none"/>
  `, opts),

  // Megaphone / Calling
  bullhorn: (opts) => svg(`
    <path d="m3 11 18-5v12L3 13v-2z"/>
    <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>
  `, opts),

  // Clock / Timer / Waiting
  clock: (opts) => svg(`
    <circle cx="12" cy="12" r="10"/>
    <polyline points="12 6 12 12 16 14"/>
  `, opts),

  // Check Circle / Completed
  checkCircle: (opts) => svg(`
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
    <polyline points="22 4 12 14.01 9 11.01"/>
  `, opts),

  // Coins / Money / Revenue
  coins: (opts) => svg(`
    <circle cx="8" cy="8" r="6"/>
    <path d="M18.09 10.37A6 6 0 1 1 10.34 18"/>
    <path d="M7 6h2"/>
    <path d="M8 5v6"/>
    <path d="M7 10h2"/>
  `, opts),

  // Cooking Pan / Prepare
  cook: (opts) => svg(`
    <path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0"/>
    <path d="M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v2"/>
    <path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8"/>
    <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-16 0v-1"/>
  `, opts),

  // Bell / Ready / Buzzer
  bell: (opts) => svg(`
    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/>
    <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>
  `, opts),

  bellRing: (opts) => svg(`
    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/>
    <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>
    <path d="M4 2C2.8 3.7 2 5.7 2 8"/>
    <path d="M22 8c0-2.3-.8-4.3-2-6"/>
  `, opts),

  // Refresh / Dual Rotate Arrow
  refresh: (opts) => svg(`
    <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
    <path d="M3 3v5h5"/>
    <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/>
    <path d="M16 16h5v5"/>
  `, opts),

  // Plus / New Order
  plus: (opts) => svg(`
    <path d="M5 12h14"/>
    <path d="M12 5v14"/>
  `, opts),

  plusCircle: (opts) => svg(`
    <circle cx="12" cy="12" r="10"/>
    <path d="M8 12h8"/>
    <path d="M12 8v8"/>
  `, opts),

  // Alert Triangle / Reset / Warning
  alert: (opts) => svg(`
    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
    <line x1="12" x2="12" y1="9" y2="13"/>
    <line x1="12" x2="12.01" y1="17" y2="17"/>
  `, opts),

  // Cancel / Cross Circle
  xCircle: (opts) => svg(`
    <circle cx="12" cy="12" r="10"/>
    <line x1="15" x2="9" y1="9" y2="15"/>
    <line x1="9" x2="15" y1="9" y2="15"/>
  `, opts),

  // Moon (Dark Mode)
  moon: (opts) => svg(`
    <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>
  `, opts),

  // Sun (Light Mode)
  sun: (opts) => svg(`
    <circle cx="12" cy="12" r="4"/>
    <path d="M12 2v2"/>
    <path d="M12 20v2"/>
    <path d="m4.93 4.93 1.41 1.41"/>
    <path d="m17.66 17.66 1.41 1.41"/>
    <path d="M2 12h2"/>
    <path d="M20 12h2"/>
    <path d="m6.34 17.66-1.41 1.41"/>
    <path d="m19.07 4.93-1.41 1.41"/>
  `, opts),

  // Volume
  volume: (opts) => svg(`
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
    <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
    <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
  `, opts),

  volumeMute: (opts) => svg(`
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
    <line x1="22" x2="16" y1="9" y2="15"/>
    <line x1="16" x2="22" y1="9" y2="15"/>
  `, opts),

  // Logout
  logout: (opts) => svg(`
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
    <polyline points="16 17 21 12 16 7"/>
    <line x1="21" x2="9" y1="12" y2="12"/>
  `, opts),

  // Search
  search: (opts) => svg(`
    <circle cx="11" cy="11" r="8"/>
    <line x1="21" x2="16.65" y1="21" y2="16.65"/>
  `, opts),

  // Printer
  printer: (opts) => svg(`
    <polyline points="6 9 6 2 18 2 18 9"/>
    <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
    <rect width="12" height="8" x="6" y="14"/>
  `, opts),

  // Info
  info: (opts) => svg(`
    <circle cx="12" cy="12" r="10"/>
    <path d="M12 16v-4"/>
    <path d="M12 8h.01"/>
  `, opts),

  // Check simple
  check: (opts) => svg(`
    <polyline points="20 6 9 17 4 12"/>
  `, opts),

  // Trash
  trash: (opts) => svg(`
    <path d="M3 6h18"/>
    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/>
    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
    <line x1="10" x2="10" y1="11" y2="17"/>
    <line x1="14" x2="14" y1="11" y2="17"/>
  `, opts),

  // Message Square
  message: (opts) => svg(`
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
  `, opts),

  // Edit / Pen
  edit: (opts) => svg(`
    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
  `, opts),

  // Calendar
  calendar: (opts) => svg(`
    <path d="M8 2v4"/>
    <path d="M16 2v4"/>
    <rect width="18" height="18" x="3" y="4" rx="2"/>
    <path d="M3 10h18"/>
  `, opts),

  // Save / Disk
  save: (opts) => svg(`
    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
    <polyline points="17 21 17 13 7 13 7 21"/>
    <polyline points="7 3 7 8 15 8"/>
  `, opts),

  // Ban / Block
  ban: (opts) => svg(`
    <circle cx="12" cy="12" r="10"/>
    <line x1="4.93" x2="19.07" y1="4.93" y2="19.07"/>
  `, opts),

  // Map Pin / Location
  pin: (opts) => svg(`
    <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
    <circle cx="12" cy="10" r="3"/>
  `, opts),

  // Spinner
  spinner: (opts) => svg(`
    <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
  `, { ...opts, className: `${opts?.className || ''} animate-spin` })
};
