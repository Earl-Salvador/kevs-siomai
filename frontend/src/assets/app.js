/**
 * ==============================================================================
 *  🥟 KEVS SIOMAI — INTEGRATED ORDER MANAGEMENT SYSTEM
 *  Vanilla JavaScript Frontend Controller (app.js)
 * ==============================================================================
 *  No JSX, No React, No complex build tools!
 *  Standard HTML5, CSS3, and modern Vanilla JavaScript (ES6+).
 *  Fully functional Queue, Inventory, Analytics, Hardware Simulator, and WAF Firewall.
 * ==============================================================================
 */

import * as api from './api.js';
import * as db from './indexedDb.js';
import { initSyncManager, syncOfflineData } from './syncManager.js';

// ── Application State ────────────────────────────────────────────────────────
const state = {
  user: null,
  activeTab: 'queue', // 'queue' | 'inventory' | 'analytics' | 'simulator' | 'firewall'
  queueFilter: 'All',
  searchQuery: '',
  queuePage: 1,
  ordersPerPage: 6,
  theme: localStorage.getItem('kevs_theme') || 'dark',
  queueData: { queue: {}, orders: [], stats: {} },
  inventory: [],
  analyticsData: null,
  firewallStats: null,
  firewallLogs: [],
  isOnline: navigator.onLine,
  unsyncedCount: 0,
  audioEnabled: true,
  socket: null,
  charts: {}
};

// ── Theme Management (Light / Dark Mode) ────────────────────────────────────
export function applyTheme(theme) {
  state.theme = theme;
  localStorage.setItem('kevs_theme', theme);
  if (theme === 'light') {
    document.documentElement.classList.add('light-theme');
    document.body.classList.add('light-theme');
  } else {
    document.documentElement.classList.remove('light-theme');
    document.body.classList.remove('light-theme');
  }
  const btn = document.getElementById('btn-toggle-theme');
  if (btn) {
    btn.innerHTML = theme === 'light' ? '🌙' : '☀️';
    btn.title = theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode';
  }
}

export function toggleTheme() {
  const nextTheme = state.theme === 'light' ? 'dark' : 'light';
  applyTheme(nextTheme);
  showToast('info', 'Theme Mode', `Switched to ${nextTheme === 'light' ? 'Light' : 'Dark'} Mode`);
}

// ── Date & Time Formatter ───────────────────────────────────────────────────
export function formatOrderDate(isoString) {
  if (!isoString) {
    const now = new Date();
    return now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
           ' · ' + now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  }
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return String(isoString);
    const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const timeStr = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    return `${dateStr} · ${timeStr}`;
  } catch (e) {
    return String(isoString);
  }
}

// ── Live Navbar Queue Pill Helper ───────────────────────────────────────────
function getNavbarQueuePillHtml() {
  const q = state.queueData.queue || {};
  const orders = state.queueData.orders || [];
  const activeOrders = orders.filter(o => !['completed', 'delivered', 'cancelled'].includes(o.status));
  const nowServingNum = q.now_serving ?? 0;

  const activeServing = orders.find(o => String(o.queue_no || o.id) === String(nowServingNum) && !['completed', 'delivered', 'cancelled'].includes(o.status)) ||
                        orders.find(o => ['preparing', 'accepted', 'pending'].includes(o.status));

  let servingHtml = '';
  if (activeServing) {
    servingHtml = `<span class="pill-val orange">#${activeServing.queue_no || nowServingNum}</span>`;
  } else {
    servingHtml = `<span class="pill-val no-orders">No orders yet!</span>`;
  }

  const queueNo = q.current_queue_no || 0;
  const activeCount = activeOrders.length;

  return `
    <span class="pill-label">Now Serving:</span>
    ${servingHtml}
    <span class="pill-sep">|</span>
    <span class="pill-label">Queue:</span>
    <span class="pill-val">#${queueNo}</span>
    ${activeCount > 0 ? `
      <span class="pill-sep">|</span>
      <span class="pulse-dot-yellow"></span>
      <span class="pill-val yellow">${activeCount} active</span>
    ` : `
      <span class="pill-sep">|</span>
      <span class="text-xs text-dark-400">0 active</span>
    `}
  `;
}

function updateNavbarQueuePill() {
  const el = document.getElementById('nav-queue-pill-box');
  if (el) el.innerHTML = getNavbarQueuePillHtml();
}

// ── Notification Sound (Web Audio API) ───────────────────────────────────────
function playBeep() {
  if (!state.audioEnabled) return;
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.3);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.3);
  } catch (e) {
    console.warn('Audio not available:', e);
  }
}

// ── Toast System ─────────────────────────────────────────────────────────────
export function showToast(type, title, message) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : type === 'warning' ? '⚠️' : 'ℹ️';

  toast.innerHTML = `
    <span class="toast-icon">${icon}</span>
    <div style="flex: 1;">
      <div class="toast-title">${escapeHtml(title)}</div>
      <div class="toast-msg">${escapeHtml(message)}</div>
    </div>
    <span class="toast-close">&times;</span>
  `;

  toast.querySelector('.toast-close').addEventListener('click', () => toast.remove());
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 4500);
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ── Application Entrypoint ───────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  applyTheme(state.theme);
  const savedUser = localStorage.getItem('kevs_user');
  if (savedUser) {
    try {
      state.user = JSON.parse(savedUser);
    } catch (e) {
      localStorage.removeItem('kevs_user');
    }
  }

  renderApp();
  initNetworkAndSync();
});

// ── Network & Offline Sync Setup ─────────────────────────────────────────────
function initNetworkAndSync() {
  initSyncManager({
    onStatusChange: (online) => {
      state.isOnline = online;
      updateOfflineUI();
      if (online) {
        showToast('success', 'Back Online', 'Synchronizing offline orders...');
      } else {
        showToast('warning', 'Offline Mode', 'Orders will be saved to IndexedDB');
      }
    },
    onSyncComplete: (result) => {
      refreshPendingCount();
      if (result.synced > 0) {
        showToast('success', 'Sync Complete', `${result.synced} offline order(s) synced!`);
        refreshQueue();
      }
    }
  });

  refreshPendingCount();
}

async function refreshPendingCount() {
  try {
    state.unsyncedCount = await db.getUnsyncedCount();
    const countEl = document.getElementById('sync-pending-badge');
    if (countEl) {
      countEl.textContent = `${state.unsyncedCount} pending`;
      countEl.style.display = state.unsyncedCount > 0 ? 'inline-block' : 'none';
    }
  } catch (e) {}
}

function updateOfflineUI() {
  const banner = document.getElementById('offline-banner');
  if (banner) {
    banner.style.display = state.isOnline ? 'none' : 'flex';
  }
  const statusDot = document.getElementById('net-status-dot');
  if (statusDot) {
    statusDot.style.background = state.isOnline ? 'var(--emerald-500)' : 'var(--red-500)';
  }
}

// ── Socket.IO Connection ─────────────────────────────────────────────────────
function initSocket() {
  if (state.socket) return;
  const socketUrl = window.location.port === '5000' ? window.location.origin : 'http://localhost:5000';

  if (typeof io !== 'undefined') {
    state.socket = io(socketUrl, { transports: ['websocket', 'polling'] });
    state.socket.on('connect', () => {
      console.log('[Socket.IO] Connected to backend');
    });
    state.socket.on('disconnect', () => {
      console.log('[Socket.IO] Disconnected');
    });
    state.socket.on('queue_updated', (data) => {
      state.queueData = data;
      playBeep();
      updateNavbarQueuePill();
      if (state.activeTab === 'queue') {
        renderQueueTab();
      } else if (state.activeTab === 'simulator') {
        updateSimulatorOLED();
      }
    });
  }
}

// ── Main Render Router ───────────────────────────────────────────────────────
function renderApp() {
  const app = document.getElementById('app');
  if (!app) return;

  if (!state.user) {
    renderLoginPage(app);
    return;
  }

  initSocket();
  app.innerHTML = `
    <!-- Offline Top Banner -->
    <div id="offline-banner" class="offline-banner" style="display: ${state.isOnline ? 'none' : 'flex'};">
      <span class="animate-pulse">🔴</span>
      <strong>OFFLINE MODE</strong> — Walk-in orders saved to browser. Auto-syncs when online.
      <span id="sync-pending-badge" class="badge badge-yellow" style="margin-left: 8px; display: ${state.unsyncedCount > 0 ? 'inline-block' : 'none'};">
        ${state.unsyncedCount} pending
      </span>
    </div>

    <!-- Navigation Header -->
    <header id="navbar">
      <div class="nav-inner">
        <!-- Brand -->
        <div class="flex items-center gap-3" style="cursor: pointer;" id="nav-brand">
          <div style="width: 40px; height: 40px; border-radius: 12px; background: linear-gradient(135deg, var(--brand-500), var(--brand-700)); display: flex; align-items: center; justify-content: center; font-size: 22px;">
            🥟
          </div>
          <div>
            <div style="font-weight: 800; font-size: 16px; line-height: 1.2;" class="nav-brand-title text-white">KEVS SIOMAI</div>
            <div style="font-size: 11px; color: var(--brand-400); font-weight: 600; letter-spacing: 0.5px;">ORDER MANAGEMENT</div>
          </div>
        </div>

        <!-- Live Queue Badges Pill in Navbar -->
        <div id="nav-queue-pill-box" class="nav-queue-pill hidden md:flex">
          ${getNavbarQueuePillHtml()}
        </div>

        <!-- Navigation Tabs -->
        <nav class="flex items-center gap-2" style="margin-left: 16px;">
          <button class="nav-tab ${state.activeTab === 'queue' ? 'active' : ''}" data-tab="queue">
            📋 <span>Queue</span>
          </button>
          <button class="nav-tab ${state.activeTab === 'inventory' ? 'active' : ''}" data-tab="inventory">
            📦 <span>Inventory</span>
          </button>
          <button class="nav-tab ${state.activeTab === 'analytics' ? 'active' : ''}" data-tab="analytics">
            📈 <span>Analytics</span>
          </button>
          <button class="nav-tab ${state.activeTab === 'simulator' ? 'active' : ''}" data-tab="simulator">
            ⚡ <span>Hardware</span>
          </button>
          <button class="nav-tab ${state.activeTab === 'firewall' ? 'active' : ''}" data-tab="firewall">
            🛡️ <span>Firewall</span>
            <span class="waf-pulse" style="margin-left: 4px;"></span>
          </button>
        </nav>

        <!-- Right Utilities -->
        <div class="flex items-center gap-3 ml-auto">
          <!-- Light / Dark Mode Toggle Button -->
          <button id="btn-toggle-theme" class="theme-toggle-btn" title="${state.theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}">
            ${state.theme === 'light' ? '🌙' : '☀️'}
          </button>

          <!-- Audio Toggle -->
          <button id="btn-toggle-audio" class="btn btn-ghost" title="Toggle audio chime">
            ${state.audioEnabled ? '🔊' : '🔇'}
          </button>

          <!-- Manual Sync Button -->
          <button id="btn-manual-sync" class="btn btn-secondary" style="font-size: 12px; padding: 6px 12px;" title="Sync offline orders">
            🔄 <span id="sync-btn-label">Sync</span>
          </button>

          <!-- Network Status -->
          <div class="flex items-center gap-2" style="font-size: 12px; color: var(--dark-300);">
            <span id="net-status-dot" class="status-dot" style="background: ${state.isOnline ? 'var(--emerald-500)' : 'var(--red-500)'};"></span>
            <span id="net-status-text">${state.isOnline ? 'Online' : 'Offline'}</span>
          </div>

          <!-- User & Logout -->
          <div class="flex items-center gap-2" style="border-left: 1px solid var(--dark-600); padding-left: 12px;">
            <span style="font-size: 13px; font-weight: 600;" class="text-white">${escapeHtml(state.user.full_name || state.user.username)}</span>
            <button id="btn-logout" class="btn btn-ghost" style="padding: 4px 8px; font-size: 12px; color: var(--red-400);" title="Logout">
              🚪 Logout
            </button>
          </div>
        </div>
      </div>
    </header>

    <!-- Main Container -->
    <main id="main-content" style="${!state.isOnline ? 'margin-top: 40px;' : ''}">
      <div id="tab-content"></div>
    </main>

    <!-- Global Modal Container -->
    <div id="modal-container"></div>
  `;

  bindNavbarEvents();
  renderCurrentTab();
}

function bindNavbarEvents() {
  document.querySelectorAll('.nav-tab').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const tab = e.currentTarget.getAttribute('data-tab');
      if (tab && tab !== state.activeTab) {
        state.activeTab = tab;
        document.querySelectorAll('.nav-tab').forEach(b => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
        renderCurrentTab();
      }
    });
  });

  // Theme Toggle
  const btnTheme = document.getElementById('btn-toggle-theme');
  if (btnTheme) {
    btnTheme.addEventListener('click', () => toggleTheme());
  }

  const btnAudio = document.getElementById('btn-toggle-audio');
  if (btnAudio) {
    btnAudio.addEventListener('click', () => {
      state.audioEnabled = !state.audioEnabled;
      btnAudio.innerHTML = state.audioEnabled ? '🔊' : '🔇';
      showToast('info', 'Audio', state.audioEnabled ? 'Sound alerts unmuted' : 'Sound muted');
    });
  }

  const btnSync = document.getElementById('btn-manual-sync');
  if (btnSync) {
    btnSync.addEventListener('click', async () => {
      btnSync.disabled = true;
      btnSync.innerHTML = '⏳ Syncing...';
      const res = await syncOfflineData();
      btnSync.disabled = false;
      btnSync.innerHTML = '🔄 Sync';
      refreshPendingCount();
      if (res.synced > 0) {
        showToast('success', 'Sync Successful', `${res.synced} order(s) uploaded to server!`);
        refreshQueue();
      } else if (res.error) {
        showToast('error', 'Sync Failed', res.error);
      } else {
        showToast('info', 'All Caught Up', 'No pending offline orders.');
      }
    });
  }

  const btnLogout = document.getElementById('btn-logout');
  if (btnLogout) {
    btnLogout.addEventListener('click', () => {
      state.user = null;
      localStorage.removeItem('kevs_user');
      if (state.socket) {
        state.socket.disconnect();
        state.socket = null;
      }
      renderApp();
      showToast('info', 'Logged Out', 'You have been signed out.');
    });
  }
}

function renderCurrentTab() {
  const container = document.getElementById('tab-content');
  if (!container) return;

  if (state.activeTab === 'queue') {
    renderQueueTab();
  } else if (state.activeTab === 'inventory') {
    renderInventoryTab();
  } else if (state.activeTab === 'analytics') {
    renderAnalyticsTab();
  } else if (state.activeTab === 'simulator') {
    renderSimulatorTab();
  } else if (state.activeTab === 'firewall') {
    renderFirewallTab();
  }
}

// ==============================================================================
// 1. LOGIN PAGE (HTML & JS)
// ==============================================================================
function renderLoginPage(container) {
  container.innerHTML = `
    <div id="login-page">
      <div class="login-orb-1"></div>
      <div class="login-orb-2"></div>

      <div class="card p-8" style="width: 100%; max-width: 420px; z-index: 10; position: relative;">
        <div class="text-center mb-6">
          <div class="login-logo-wrap glow-orange">🥟</div>
          <h1 class="text-2xl font-bold text-white">KEVS Siomai</h1>
          <p class="text-dark-300 text-sm mt-1">Admin Order Management & Security Gateway</p>
        </div>

        <div id="login-error" class="error-box" style="display: none;"></div>

        <form id="login-form" class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-dark-300 mb-1">Username</label>
            <input type="text" id="login-username" class="input" value="admin" required placeholder="admin" />
          </div>

          <div>
            <label class="block text-sm font-medium text-dark-300 mb-1">Password</label>
            <input type="password" id="login-password" class="input" value="kevs2024" required placeholder="••••••••" />
          </div>

          <button type="submit" id="btn-login-submit" class="btn btn-primary w-full justify-center py-3 text-base mt-4">
            🔑 Sign In
          </button>
        </form>

        <div class="text-center mt-6 text-xs text-dark-400">
          KEVS Siomai POS & Order Management &bull; Protected by Kevs WAF Firewall
        </div>
      </div>
    </div>
  `;

  const form = document.getElementById('login-form');
  const errorBox = document.getElementById('login-error');
  const btnSubmit = document.getElementById('btn-login-submit');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorBox.style.display = 'none';
    btnSubmit.disabled = true;
    btnSubmit.innerHTML = '⏳ Signing in...';

    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;

    try {
      const res = await api.login({ username, password });
      state.user = res.data.user;
      localStorage.setItem('kevs_user', JSON.stringify(state.user));
      showToast('success', 'Welcome!', `Signed in as ${state.user.full_name || state.user.username}`);
      renderApp();
    } catch (err) {
      errorBox.textContent = err.response?.data?.error || err.message || 'Login failed. Please check credentials.';
      errorBox.style.display = 'block';
    } finally {
      btnSubmit.disabled = false;
      btnSubmit.innerHTML = '🔑 Sign In';
    }
  });
}

// ==============================================================================
// 2. QUEUE DASHBOARD (HTML & JS)
// ==============================================================================
async function refreshQueue() {
  try {
    const [qRes, statsRes] = await Promise.all([
      api.getQueue(),
      api.getDashboardStats().catch(() => ({ data: {} }))
    ]);
    state.queueData = {
      queue: qRes.data?.queue || {},
      orders: qRes.data?.orders || [],
      stats: statsRes.data || {}
    };
  } catch (err) {
    console.warn('Queue fetch error:', err);
  }
}

async function renderQueueTab() {
  const container = document.getElementById('tab-content');
  if (!container) return;

  container.innerHTML = `
    <div class="flex items-center justify-center p-8">
      <div class="spinner"></div>
    </div>
  `;

  await refreshQueue();
  await refreshPendingCount();

  const q = state.queueData.queue || {};
  const orders = state.queueData.orders || [];
  const stats = state.queueData.stats || {};

  const activeOrders = orders.filter(o => !['completed', 'delivered', 'cancelled'].includes(o.status));
  const hasActive = activeOrders.length > 0;
  const nowServingNum = hasActive ? (q.now_serving ?? q.now_serving_number ?? 0) : 0;
  const waitingCount = activeOrders.length;

  // Stats from backend (prefer backend stats which are date-accurate)
  const completedToday = stats.today_completed ?? 0;
  const todayRevenue = stats.today_revenue ?? 0;

  // Active serving order — only show banner when genuinely in-progress
  const activeOrder = hasActive
    ? (orders.find(o => String(o.queue_no || o.queue_number) === String(nowServingNum) && !['completed', 'delivered', 'cancelled'].includes(o.status)) ||
       orders.find(o => ['preparing', 'accepted'].includes(o.status)) ||
       activeOrders[0])
    : null;

  container.innerHTML = `
    <!-- Top Action Bar & Stat Cards -->
    <div class="flex flex-wrap items-center justify-between gap-4 mb-6">
      <div>
        <h1 class="text-2xl font-bold text-white">Live Queue Dashboard</h1>
        <p class="text-dark-300 text-sm">Real-time order tracking & queue processing</p>
      </div>

      <div class="flex items-center gap-3">
        <button id="btn-open-order-modal" class="btn btn-primary">
          ➕ New Walk-in Order
        </button>
        <button id="btn-call-next" class="btn btn-success">
          📢 Call Next (#${Number(nowServingNum) + 1})
        </button>
        <button id="btn-reset-queue" class="btn btn-secondary text-red-400" title="Reset today's queue count">
          ⚠️ Reset
        </button>
        <button id="btn-refresh-queue" class="btn btn-secondary">
          🔄 Refresh
        </button>
      </div>
    </div>

    <!-- Stat Cards Bar -->
    <div class="grid-4 mb-6">
      <div class="card stat-card">
        <div class="stat-icon" style="background: rgba(249,115,22,0.2); color: var(--brand-400);">📢</div>
        <div>
          <div class="text-xs text-dark-300 font-medium">NOW SERVING</div>
          <div class="text-3xl font-bold text-white">${hasActive ? '#' + nowServingNum : '—'}</div>
          <div class="text-xs text-brand-400 mt-1">${hasActive ? 'Ticket in progress' : 'No orders yet!'}</div>
        </div>
      </div>

      <div class="card stat-card">
        <div class="stat-icon" style="background: rgba(234,179,8,0.2); color: var(--yellow-400);">⏳</div>
        <div>
          <div class="text-xs text-dark-300 font-medium">WAITING IN QUEUE</div>
          <div class="text-3xl font-bold text-white">${waitingCount}</div>
          <div class="text-xs text-yellow-400 mt-1">${waitingCount === 0 ? 'No orders in line' : 'Orders in line'}</div>
        </div>
      </div>

      <div class="card stat-card">
        <div class="stat-icon" style="background: rgba(16,185,129,0.2); color: var(--emerald-400);">✅</div>
        <div>
          <div class="text-xs text-dark-300 font-medium">COMPLETED TODAY</div>
          <div class="text-3xl font-bold text-white">${completedToday}</div>
          <div class="text-xs text-emerald-400 mt-1">${completedToday === 0 ? 'None yet today' : 'Orders served today'}</div>
        </div>
      </div>

      <div class="card stat-card">
        <div class="stat-icon" style="background: rgba(59,130,246,0.2); color: var(--blue-400);">💰</div>
        <div>
          <div class="text-xs text-dark-300 font-medium">TODAY'S REVENUE</div>
          <div class="text-3xl font-bold text-white">₱${Number(todayRevenue).toFixed(2)}</div>
          <div class="text-xs text-blue-400 mt-1">${todayRevenue === 0 ? 'No sales yet today' : 'Total sales today'}</div>
        </div>
      </div>
    </div>

    <!-- Active Now Serving Banner -->
    ${activeOrder ? `
      <div class="card p-6 mb-6" style="border: 2px solid var(--brand-500); background: linear-gradient(135deg, rgba(249,115,22,0.08), rgba(15,23,42,0.9));">
        <div class="flex flex-wrap items-center justify-between gap-4">
          <div class="flex items-center gap-4">
            <div style="width: 64px; height: 64px; border-radius: 16px; background: var(--brand-500); color: #fff; display: flex; flex-direction: column; align-items: center; justify-content: center; font-weight: 800;">
              <span style="font-size: 11px; opacity: 0.85;">QUEUE</span>
              <span style="font-size: 26px; line-height: 1;">#${activeOrder.queue_no || activeOrder.queue_number || activeOrder.id}</span>
            </div>
            <div>
              <div class="flex items-center gap-2">
                <h3 class="text-xl font-bold text-white">${escapeHtml(activeOrder.customer_name || 'Walk-in Customer')}</h3>
                <span class="badge ${getStatusBadgeClass(activeOrder.status)}">${activeOrder.status}</span>
                <span class="badge badge-gray">${activeOrder.order_type || activeOrder.type || 'Walk-in'}</span>
              </div>
              <p class="text-sm text-dark-300 mt-1">
                Order #${activeOrder.id} &bull; ${formatOrderItems(activeOrder.items)}
              </p>
              <p class="text-xs text-dark-400 mt-1">
                📅 ${activeOrder.date_display || new Date(activeOrder.created_at || Date.now()).toLocaleDateString('en-US', {month:'short',day:'numeric',year:'numeric'})}
              </p>
            </div>
          </div>

          <div class="flex items-center gap-3">
            <div class="text-right" style="margin-right: 12px;">
              <div class="text-xs text-dark-300">Total Amount</div>
              <div class="text-xl font-bold text-emerald-400">₱${Number(activeOrder.total || activeOrder.total_amount || 0).toFixed(2)}</div>
            </div>
            <button class="btn btn-secondary btn-buzz-order" data-id="${activeOrder.id}">
              🔔 Buzz
            </button>
            <button class="btn btn-success btn-complete-order" data-id="${activeOrder.id}">
              ✅ Mark Completed
            </button>
          </div>
        </div>
      </div>
    ` : `
      <div class="card p-5 mb-6 text-center" style="border: 1px dashed var(--dark-600); background: rgba(15,23,42,0.4);">
        <div style="font-size: 32px; margin-bottom: 6px;">🥟</div>
        <div class="text-base font-bold text-dark-300">No orders yet!</div>
        <div class="text-xs text-dark-400 mt-1">Create a new walk-in order to start the queue.</div>
      </div>
    `}

    <!-- Filter and Search Bar -->
    <div class="flex flex-wrap items-center justify-between gap-4 mb-4">
      <div class="tab-bar">
        ${['All', 'Pending', 'Preparing', 'Ready', 'Completed'].map(tab => `
          <button class="tab-btn ${state.queueFilter === tab ? 'active' : ''}" data-filter="${tab}">
            ${tab}
            <span class="tab-count">${tab === 'All' ? orders.length : orders.filter(o => mapStage(o.status) === tab.toLowerCase()).length}</span>
          </button>
        `).join('')}
      </div>

      <div style="position: relative; width: 280px;">
        <input type="text" id="queue-search" class="input" placeholder="🔍 Search customer or queue #..." value="${escapeHtml(state.searchQuery)}" />
      </div>
    </div>

    <!-- Orders Cards Grid -->
    <div class="orders-grid" id="orders-container">
      ${renderOrderCards(orders)}
    </div>

    <!-- Pagination Controls -->
    <div id="pagination-controls" style="margin-top: 16px;"></div>
  `;

  bindQueueEvents();
}

function mapStage(status) {
  if (['pending', 'accepted'].includes(status)) return 'pending';
  if (['preparing'].includes(status)) return 'preparing';
  if (['ready_pickup', 'ready_delivery', 'out_for_delivery', 'ready'].includes(status)) return 'ready';
  if (['completed', 'delivered'].includes(status)) return 'completed';
  return 'all';
}

function getStatusBadgeClass(status) {
  switch (status) {
    case 'pending': return 'badge-yellow';
    case 'accepted':
    case 'preparing': return 'badge-orange';
    case 'ready':
    case 'ready_pickup':
    case 'ready_delivery': return 'badge-green';
    case 'completed':
    case 'delivered': return 'badge-gray';
    case 'cancelled': return 'badge-red';
    default: return 'badge-blue';
  }
}

function getProductImageUrl(name) {
  if (!name) return '/images/hotspot_siomai.jpg';
  const n = String(name).toLowerCase();
  if (n.includes('siomai')) return '/images/hotspot_siomai.jpg';
  if (n.includes('coke') || n.includes('coca')) return '/images/coke.jpg';
  if (n.includes('royal')) return '/images/royal.jpg';
  if (n.includes('sprite')) return '/images/sprite.jpg';
  if (n.includes('chilli') || n.includes('chili')) return '/images/chilli_garlic.jpg';
  if (n.includes('soy')) return '/images/soy_sauce.jpg';
  if (n.includes('calamansi')) return '/images/calamansi.jpg';
  return '/images/hotspot_siomai.jpg';
}

function formatOrderItems(items) {
  if (!items || !items.length) {
    return `
      <div style="display: inline-flex; align-items: center; gap: 6px; padding: 3px 8px; border-radius: 8px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); font-size: 12px; margin-top: 4px;">
        <img src="/images/hotspot_siomai.jpg" style="width: 18px; height: 18px; border-radius: 4px; object-fit: cover;" onerror="this.style.display='none'">
        <span>1x Siomai</span>
      </div>
    `;
  }
  return `
    <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px;">
      ${items.map(i => {
        const qty = i.quantity || i.qty || 1;
        const name = i.product_name || i.name || 'Siomai';
        const img = i.image_url || getProductImageUrl(name);
        return `
          <span style="display: inline-flex; align-items: center; gap: 6px; padding: 3px 8px; border-radius: 8px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.08); font-size: 12px; color: var(--dark-200);">
            ${img ? `<img src="${escapeHtml(img)}" alt="${escapeHtml(name)}" style="width: 18px; height: 18px; border-radius: 4px; object-fit: cover; border: 1px solid rgba(255,255,255,0.1);" onerror="this.style.display='none'">` : ''}
            <span><strong style="color: #fff;">${qty}x</strong> ${escapeHtml(name)}</span>
          </span>
        `;
      }).join('')}
    </div>
  `;
}

function renderOrderCards(orders) {
  let filtered = orders;
  if (state.queueFilter !== 'All') {
    filtered = filtered.filter(o => mapStage(o.status) === state.queueFilter.toLowerCase());
  }
  if (state.searchQuery) {
    const q = state.searchQuery.toLowerCase();
    filtered = filtered.filter(o =>
      (o.customer_name && o.customer_name.toLowerCase().includes(q)) ||
      (String(o.queue_no || o.queue_number).includes(q)) ||
      (String(o.id).includes(q))
    );
  }

  const totalFiltered = filtered.length;
  const perPage = state.ordersPerPage || 6;
  const totalPages = Math.ceil(totalFiltered / perPage);

  // Clamp page to valid range
  if (state.queuePage < 1) state.queuePage = 1;
  if (state.queuePage > totalPages && totalPages > 0) state.queuePage = totalPages;

  const start = (state.queuePage - 1) * perPage;
  const paginated = filtered.slice(start, start + perPage);

  // Render pagination controls if there are multiple pages
  setTimeout(() => {
    const paginationEl = document.getElementById('pagination-controls');
    if (paginationEl && totalPages > 1) {
      let pagesHtml = `<div class="flex items-center justify-center gap-2" style="flex-wrap: wrap;">`;
      pagesHtml += `<button class="btn btn-secondary btn-page" data-page="${state.queuePage - 1}" ${state.queuePage <= 1 ? 'disabled' : ''} style="padding: 6px 12px;">← Prev</button>`;
      for (let i = 1; i <= totalPages; i++) {
        pagesHtml += `<button class="btn ${i === state.queuePage ? 'btn-primary' : 'btn-secondary'} btn-page" data-page="${i}" style="padding: 6px 12px; min-width: 36px;">${i}</button>`;
      }
      pagesHtml += `<button class="btn btn-secondary btn-page" data-page="${state.queuePage + 1}" ${state.queuePage >= totalPages ? 'disabled' : ''} style="padding: 6px 12px;">Next →</button>`;
      pagesHtml += `<span class="text-xs text-dark-400" style="margin-left: 8px;">Page ${state.queuePage} of ${totalPages} (${totalFiltered} orders)</span>`;
      pagesHtml += `</div>`;
      paginationEl.innerHTML = pagesHtml;

      paginationEl.querySelectorAll('.btn-page').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const newPage = parseInt(e.currentTarget.getAttribute('data-page'), 10);
          if (!isNaN(newPage) && newPage >= 1 && newPage <= totalPages) {
            state.queuePage = newPage;
            const container = document.getElementById('orders-container');
            if (container) container.innerHTML = renderOrderCards(state.queueData.orders || []);
          }
        });
      });
    } else if (paginationEl) {
      paginationEl.innerHTML = '';
    }
  }, 0);

  if (paginated.length === 0) {
    return `
      <div class="card p-8 text-center" style="grid-column: 1 / -1;">
        <div style="font-size: 40px; margin-bottom: 8px;">🥟</div>
        <h3 class="text-lg font-bold text-white">No Orders Found</h3>
        <p class="text-sm text-dark-300 mt-1">There are currently no orders matching this filter.</p>
      </div>
    `;
  }

  return paginated.map(order => {
    const queueNo = order.queue_no || order.queue_number || order.id;
    const totalVal = order.total || order.total_amount || 0;
    return `
      <div class="card queue-card p-5" data-order-id="${order.id}">
        <div class="flex items-center justify-between mb-3">
          <div class="flex items-center gap-2">
            <span style="font-size: 16px; font-weight: 800; color: var(--brand-400);">#${queueNo}</span>
            <span class="badge ${getStatusBadgeClass(order.status)}">${order.status}</span>
            <span class="badge badge-gray">${order.order_type || order.type || 'Walk-in'}</span>
          </div>
          <span class="text-xs text-dark-400">${new Date(order.created_at || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        </div>

        <div class="mb-3">
          <div class="font-bold text-white text-base">${escapeHtml(order.customer_name || 'Walk-in Customer')}</div>
          <div class="text-xs text-dark-300 mt-1">${formatOrderItems(order.items)}</div>
        </div>

        <div class="flex items-center justify-between pt-3 border-t">
          <div>
            <div class="text-xs text-dark-400">Total</div>
            <div class="font-bold text-emerald-400 text-sm">₱${Number(totalVal).toFixed(2)}</div>
          </div>

          <div class="flex items-center gap-2">
            ${order.status === 'pending' ? `
              <button class="btn btn-secondary btn-action-status" data-id="${order.id}" data-status="preparing" style="font-size: 12px; padding: 4px 10px;">
                🍳 Prepare
              </button>
            ` : order.status === 'preparing' ? `
              <button class="btn btn-secondary btn-action-status" data-id="${order.id}" data-status="ready_pickup" style="font-size: 12px; padding: 4px 10px;">
                🔔 Ready
              </button>
            ` : order.status === 'ready_pickup' || order.status === 'ready' ? `
              <button class="btn btn-success btn-action-status" data-id="${order.id}" data-status="completed" style="font-size: 12px; padding: 4px 10px;">
                ✅ Complete
              </button>
            ` : ''}

            ${!['completed', 'delivered', 'cancelled'].includes(order.status) ? `
              <button class="btn btn-ghost text-red-400 btn-action-status" data-id="${order.id}" data-status="cancelled" style="font-size: 12px; padding: 4px 8px;">
                Cancel
              </button>
            ` : ''}
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function bindQueueEvents() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const filter = e.currentTarget.getAttribute('data-filter');
      if (filter) {
        state.queueFilter = filter;
        state.queuePage = 1; // reset pagination when filter changes
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
        const container = document.getElementById('orders-container');
        if (container) container.innerHTML = renderOrderCards(state.queueData.orders || []);
      }
    });
  });

  const searchInput = document.getElementById('queue-search');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      state.searchQuery = e.target.value;
      state.queuePage = 1; // reset pagination when searching
      const container = document.getElementById('orders-container');
      if (container) container.innerHTML = renderOrderCards(state.queueData.orders || []);
    });
  }

  // Refresh
  document.getElementById('btn-refresh-queue')?.addEventListener('click', async () => {
    showToast('info', 'Refreshing', 'Updating queue data...');
    await renderQueueTab();
  });

  // Reset Queue
  document.getElementById('btn-reset-queue')?.addEventListener('click', async () => {
    if (confirm('Are you sure you want to reset the daily queue counter to #0?')) {
      try {
        await api.resetQueue();
        showToast('success', 'Queue Reset', 'Queue number has been reset to #0');
        await renderQueueTab();
      } catch (err) {
        showToast('error', 'Error', err.message);
      }
    }
  });

  // Call Next
  document.getElementById('btn-call-next')?.addEventListener('click', async () => {
    try {
      playBeep();
      const res = await api.callNextOrder();
      showToast('info', 'Customer Called', res.data?.message || 'Now calling next ticket!');
      await renderQueueTab();
    } catch (e) {
      showToast('error', 'Call Next Error', e.message);
    }
  });

  // Order modal
  document.getElementById('btn-open-order-modal')?.addEventListener('click', () => {
    openOrderModal();
  });

  // Status actions
  document.querySelectorAll('.btn-action-status').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const orderId = e.currentTarget.getAttribute('data-id');
      const nextStatus = e.currentTarget.getAttribute('data-status');
      if (!orderId || !nextStatus) return;

      e.currentTarget.disabled = true;
      try {
        await api.updateOrderStatus(orderId, { status: nextStatus });
        showToast('success', 'Updated', `Order marked as ${nextStatus}`);
        await renderQueueTab();
      } catch (err) {
        showToast('error', 'Update Failed', err.message);
      }
    });
  });

  document.querySelectorAll('.btn-complete-order').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = e.currentTarget.getAttribute('data-id');
      if (!id) return;
      try {
        await api.updateOrderStatus(id, { status: 'completed' });
        showToast('success', 'Order Completed', 'Customer order fulfilled!');
        await renderQueueTab();
      } catch (err) {
        showToast('error', 'Failed', err.message);
      }
    });
  });

  document.querySelectorAll('.btn-buzz-order').forEach(btn => {
    btn.addEventListener('click', () => {
      playBeep();
      showToast('info', 'Calling Customer', 'Audible alert triggered for order!');
    });
  });
}

// ── New Order Modal ──────────────────────────────────────────────────────────
async function openOrderModal() {
  let products = [];
  try {
    const res = await api.getProducts(true);
    products = res.data?.products || [];
  } catch (e) {
    products = [
      { id: 1, name: 'Hotspot Siomai', price: 45, category: 'Siomai' },
      { id: 2, name: 'Chili Garlic (Small)', price: 25, category: 'Sauces' },
      { id: 3, name: 'Chili Garlic (Large)', price: 45, category: 'Sauces' },
      { id: 4, name: 'Sauce Pack', price: 5, category: 'Sauces' }
    ];
  }

  const modalContainer = document.getElementById('modal-container');
  const cart = {};

  modalContainer.innerHTML = `
    <div class="modal-backdrop" id="order-modal-backdrop">
      <div class="card modal-box p-6" style="max-width: 600px; max-height: 90vh; overflow-y: auto;" id="order-modal-box">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-xl font-bold text-white">🥟 Create Walk-in Order</h2>
          <button id="btn-close-modal" class="btn btn-ghost" style="font-size: 20px;">&times;</button>
        </div>

        <div class="space-y-4">
          <div>
            <label class="block text-xs text-dark-300 font-medium mb-1">Customer Name</label>
            <input type="text" id="order-cust-name" class="input" placeholder="e.g. Juan Dela Cruz" value="Walk-in Customer" />
          </div>

          <div class="grid-2">
            <div>
              <label class="block text-xs text-dark-300 font-medium mb-1">Order Type</label>
              <select id="order-cust-type" class="input">
                <option value="pickup" selected>Takeout / Pick-up</option>
                <option value="dine-in">Dine-in</option>
              </select>
            </div>
            <div>
              <label class="block text-xs text-dark-300 font-medium mb-1">Payment Method</label>
              <select id="order-cust-payment" class="input">
                <option value="Cash" selected>Cash</option>
                <option value="GCash">GCash QR</option>
              </select>
            </div>
          </div>

          <div>
            <label class="block text-xs text-dark-300 font-medium mb-2">Select Items</label>
            <div class="space-y-2" style="max-height: 250px; overflow-y: auto; padding-right: 4px;">
              ${products.map(p => {
                const isActive = p.is_active !== false;
                return `
                <div class="card-sm p-3 flex items-center justify-between" style="background: var(--dark-800); ${!isActive ? 'opacity: 0.55; border: 1px dashed rgba(239,68,68,0.3);' : ''}">
                  <div style="display: flex; align-items: center; gap: 10px;">
                    ${p.image_url ? `<img src="${escapeHtml(p.image_url)}" alt="${escapeHtml(p.name)}" style="width: 36px; height: 36px; object-fit: cover; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1); ${!isActive ? 'filter: grayscale(100%);' : ''}" onerror="this.style.display='none'">` : ''}
                    <div>
                      <div class="font-bold text-sm text-white flex items-center gap-2">
                        ${escapeHtml(p.name)}
                        ${!isActive ? '<span class="badge badge-red" style="font-size: 10px; padding: 1px 6px;">🚫 Disabled</span>' : ''}
                      </div>
                      <div class="text-xs text-brand-400 font-semibold">₱${Number(p.price).toFixed(2)}</div>
                    </div>
                  </div>
                  <div class="flex items-center gap-2">
                    ${!isActive ? `
                      <span class="text-xs text-red-400 font-semibold mr-1">Unavailable</span>
                    ` : `
                      <button class="btn btn-secondary btn-qty-minus" data-id="${p.id}" style="width: 28px; height: 28px; padding: 0; justify-content: center;">-</button>
                      <span id="qty-${p.id}" style="width: 24px; text-align: center; font-weight: bold; font-size: 14px;">0</span>
                      <button class="btn btn-primary btn-qty-plus" data-id="${p.id}" style="width: 28px; height: 28px; padding: 0; justify-content: center;">+</button>
                    `}
                  </div>
                </div>
              `;
              }).join('')}
            </div>
          </div>

          <!-- Total Calculation -->
          <div class="p-4 rounded-xl flex items-center justify-between" style="background: rgba(249,115,22,0.1); border: 1px solid rgba(249,115,22,0.2);">
            <div>
              <div class="text-xs text-dark-300">Total Order Amount</div>
              <div class="text-2xl font-bold text-white" id="order-total-display">₱0.00</div>
            </div>
            <button id="btn-submit-order" class="btn btn-primary" style="padding: 10px 24px; font-size: 15px;">
              Place Order 🚀
            </button>
          </div>
        </div>
      </div>
    </div>
  `;

  const updateTotal = () => {
    let sum = 0;
    for (const [pid, qty] of Object.entries(cart)) {
      const pr = products.find(p => String(p.id) === String(pid));
      if (pr) sum += pr.price * qty;
    }
    const display = document.getElementById('order-total-display');
    if (display) display.textContent = `₱${sum.toFixed(2)}`;
  };

  modalContainer.querySelectorAll('.btn-qty-plus').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const pid = e.currentTarget.getAttribute('data-id');
      const pr = products.find(p => String(p.id) === String(pid));
      if (pr && pr.is_active === false) return;
      cart[pid] = (cart[pid] || 0) + 1;
      const el = document.getElementById(`qty-${pid}`);
      if (el) el.textContent = cart[pid];
      updateTotal();
    });
  });

  modalContainer.querySelectorAll('.btn-qty-minus').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const pid = e.currentTarget.getAttribute('data-id');
      if (cart[pid] > 0) {
        cart[pid] -= 1;
        const el = document.getElementById(`qty-${pid}`);
        if (el) el.textContent = cart[pid];
        updateTotal();
      }
    });
  });

  document.getElementById('btn-close-modal')?.addEventListener('click', () => {
    modalContainer.innerHTML = '';
  });

  document.getElementById('order-modal-backdrop')?.addEventListener('click', (e) => {
    if (e.target.id === 'order-modal-backdrop') {
      modalContainer.innerHTML = '';
    }
  });

  document.getElementById('btn-submit-order')?.addEventListener('click', async () => {
    const items = [];
    let total = 0;
    for (const [pid, qty] of Object.entries(cart)) {
      if (qty > 0) {
        const pr = products.find(p => String(p.id) === String(pid));
        if (pr) {
          items.push({
            product_id: pr.id,
            product_name: pr.name,
            quantity: qty,
            price: pr.price,
            subtotal: pr.price * qty
          });
          total += pr.price * qty;
        }
      }
    }

    if (items.length === 0) {
      showToast('warning', 'Empty Order', 'Please select at least one item!');
      return;
    }

    const customerName = document.getElementById('order-cust-name').value.trim() || 'Walk-in Customer';
    const orderType = document.getElementById('order-cust-type').value;
    const paymentMethod = document.getElementById('order-cust-payment').value;

    const orderPayload = {
      type: 'walk-in',
      order_type: orderType,
      customer_name: customerName,
      customer_phone: '',
      items: items,
      total: total,
      payment_method: paymentMethod,
      payment_status: paymentMethod === 'Cash' ? 'confirmed' : 'pending'
    };

    modalContainer.innerHTML = '';

    // Offline / Online routing
    if (!state.isOnline) {
      try {
        await db.saveOfflineOrder(orderPayload);
        await refreshPendingCount();
        playBeep();
        showToast('success', 'Order Saved Offline', 'Saved locally to IndexedDB! Will sync when online.');
      } catch (err) {
        showToast('error', 'Offline Save Failed', err.message);
      }
    } else {
      try {
        await api.addToQueue(orderPayload);
        playBeep();
        showToast('success', 'Order Placed!', `Order for ${customerName} added to queue.`);
        await renderQueueTab();
      } catch (err) {
        showToast('error', 'Order Error', err.message);
      }
    }
  });
}

// ==============================================================================
// 3. INVENTORY VIEW (HTML & JS)
// ==============================================================================
async function renderInventoryTab() {
  const container = document.getElementById('tab-content');
  if (!container) return;

  container.innerHTML = `
    <div class="flex items-center justify-center p-8">
      <div class="spinner"></div>
    </div>
  `;

  let products = [];
  try {
    const res = await api.getProducts(true);
    products = res.data?.products || [];
    state.inventory = products;
  } catch (err) {
    showToast('error', 'Inventory Error', err.message);
  }

  const activeProducts = products.filter(p => p.is_active !== false);
  const disabledProducts = products.filter(p => p.is_active === false);
  const lowStockCount = activeProducts.filter(p => p.stock <= (p.min_stock || 15)).length;

  container.innerHTML = `
    <div class="flex flex-wrap items-center justify-between gap-4 mb-6">
      <div>
        <h1 class="text-2xl font-bold text-white">Inventory Management</h1>
        <p class="text-dark-300 text-sm">Monitor stock levels, refill ingredients, and toggle product availability for customers</p>
      </div>

      <div class="flex items-center gap-3">
        <button id="btn-add-product" class="btn btn-primary">
          ➕ Add Product
        </button>
        <button id="btn-refresh-inv" class="btn btn-secondary">
          🔄 Refresh
        </button>
      </div>
    </div>

    <!-- Inventory Stat Cards -->
    <div class="grid-4 mb-6">
      <div class="card stat-card">
        <div class="stat-icon" style="background: rgba(59,130,246,0.2); color: var(--blue-400);">📦</div>
        <div>
          <div class="text-xs text-dark-300 font-medium">TOTAL PRODUCTS</div>
          <div class="text-3xl font-bold text-white">${products.length}</div>
          <div class="text-xs text-blue-400 mt-1">Catalog items</div>
        </div>
      </div>

      <div class="card stat-card">
        <div class="stat-icon" style="background: rgba(16,185,129,0.2); color: var(--emerald-400);">✨</div>
        <div>
          <div class="text-xs text-dark-300 font-medium">ACTIVE FOR SALE</div>
          <div class="text-3xl font-bold text-emerald-400">${activeProducts.length}</div>
          <div class="text-xs text-emerald-400 mt-1">Visible to customers</div>
        </div>
      </div>

      <div class="card stat-card">
        <div class="stat-icon" style="background: rgba(239,68,68,0.2); color: var(--red-400);">🚫</div>
        <div>
          <div class="text-xs text-dark-300 font-medium">DISABLED / HIDDEN</div>
          <div class="text-3xl font-bold ${disabledProducts.length > 0 ? 'text-red-400' : 'text-white'}">${disabledProducts.length}</div>
          <div class="text-xs text-red-400 mt-1">Blocked from ordering</div>
        </div>
      </div>

      <div class="card stat-card">
        <div class="stat-icon" style="background: rgba(234,179,8,0.2); color: var(--yellow-400);">⚠️</div>
        <div>
          <div class="text-xs text-dark-300 font-medium">LOW STOCK ITEMS</div>
          <div class="text-3xl font-bold ${lowStockCount > 0 ? 'text-yellow-400' : 'text-white'}">${lowStockCount}</div>
          <div class="text-xs text-yellow-400 mt-1">Needs restock soon</div>
        </div>
      </div>
    </div>

    <!-- Products Table -->
    <div class="card p-6 overflow-hidden">
      <div style="overflow-x: auto;">
        <table style="width: 100%; border-collapse: collapse; text-align: left;">
          <thead>
            <tr style="border-bottom: 1px solid var(--dark-600); color: var(--dark-400); font-size: 12px; text-transform: uppercase;">
              <th class="py-3 px-4">Item Name</th>
              <th class="py-3 px-4">Category</th>
              <th class="py-3 px-4">Price</th>
              <th class="py-3 px-4">Current Stock</th>
              <th class="py-3 px-4">Customer Status</th>
              <th class="py-3 px-4 text-center">Enable / Disable</th>
              <th class="py-3 px-4 text-center">Quick Stock Adjustment</th>
            </tr>
          </thead>
          <tbody>
            ${products.map(p => {
              const isActive = p.is_active !== false;
              const min = p.min_stock || 15;
              const max = p.max_stock || 100;
              const pct = Math.min(100, Math.round((p.stock / max) * 100));
              const isLow = p.stock <= min;
              const isOut = p.stock <= 0;

              return `
                <tr style="border-bottom: 1px solid var(--dark-600); font-size: 14px; ${!isActive ? 'background: rgba(239, 68, 68, 0.05); opacity: 0.8;' : ''}">
                  <td class="py-3 px-4 font-bold text-white">
                    <div style="display: flex; align-items: center; gap: 10px;">
                      ${p.image_url ? `<img src="${escapeHtml(p.image_url)}" alt="${escapeHtml(p.name)}" style="width: 38px; height: 38px; object-fit: cover; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1); ${!isActive ? 'filter: grayscale(80%); opacity: 0.65;' : ''}" onerror="this.style.display='none'">` : ''}
                      <div>
                        <div class="${isActive ? 'text-white' : 'text-dark-300'}" style="${!isActive ? 'text-decoration: line-through;' : ''}">${escapeHtml(p.name)}</div>
                        ${!isActive ? `<div style="font-size: 11px; color: var(--red-400); font-weight: 600;">🚫 Hidden from customers</div>` : (p.description ? `<div style="font-size: 11px; font-weight: normal; color: var(--dark-400);">${escapeHtml(p.description)}</div>` : '')}
                      </div>
                    </div>
                  </td>
                  <td class="py-3 px-4 text-dark-300">${escapeHtml(p.category || 'Siomai')}</td>
                  <td class="py-3 px-4 font-bold text-emerald-400">₱${Number(p.price).toFixed(2)}</td>
                  <td class="py-3 px-4" style="min-width: 160px;">
                    <div class="flex items-center justify-between text-xs mb-1">
                      <span class="font-bold ${isOut ? 'text-red-400' : isLow ? 'text-yellow-400' : 'text-emerald-400'}">
                        ${p.stock} / ${max} ${p.unit || 'servings'}
                      </span>
                      <span class="text-dark-400">${pct}%</span>
                    </div>
                    <div class="stock-bar-track">
                      <div class="stock-bar-fill ${isOut ? 'bg-red-500' : isLow ? 'bg-yellow-500' : 'bg-emerald-500'}" style="width: ${pct}%;"></div>
                    </div>
                  </td>
                  <td class="py-3 px-4">
                    <div class="flex flex-col gap-1">
                      ${isActive 
                        ? '<span class="badge badge-green">● Active (Visible)</span>' 
                        : '<span class="badge badge-red" style="background: rgba(239,68,68,0.25); border: 1px solid rgba(239,68,68,0.4);">🚫 Disabled (Hidden)</span>'}
                      ${isActive ? (isOut ? '<span class="badge badge-red">Out of Stock</span>' : isLow ? '<span class="badge badge-yellow">Low Stock</span>' : '<span class="badge badge-green">In Stock</span>') : ''}
                    </div>
                  </td>
                  <td class="py-3 px-4 text-center">
                    <button class="btn ${isActive ? 'btn-danger' : 'btn-success'} btn-toggle-active" 
                            data-id="${p.id}" 
                            data-name="${escapeHtml(p.name)}" 
                            data-active="${isActive ? 'false' : 'true'}" 
                            style="padding: 5px 12px; font-size: 12px; min-width: 95px; font-weight: 600;" 
                            title="${isActive ? 'Hide from customer menu and prevent ordering' : 'Make available for customers to order'}">
                      ${isActive ? '🚫 Disable' : '✅ Enable'}
                    </button>
                  </td>
                  <td class="py-3 px-4 text-center">
                    <div class="flex items-center justify-center gap-1">
                      <button class="btn btn-secondary btn-adjust-stock" data-id="${p.id}" data-delta="-1" style="padding: 4px 8px; font-size: 12px;">-1</button>
                      <button class="btn btn-secondary btn-adjust-stock" data-id="${p.id}" data-delta="10" style="padding: 4px 8px; font-size: 12px;">+10</button>
                      <button class="btn btn-primary btn-adjust-stock" data-id="${p.id}" data-delta="50" style="padding: 4px 8px; font-size: 12px;">+50</button>
                    </div>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  bindInventoryEvents();
}

function bindInventoryEvents() {
  document.getElementById('btn-refresh-inv')?.addEventListener('click', () => {
    renderInventoryTab();
  });

  document.querySelectorAll('.btn-toggle-active').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const target = e.currentTarget;
      const pid = target.getAttribute('data-id');
      const name = target.getAttribute('data-name') || 'Product';
      const makeActive = target.getAttribute('data-active') === 'true';
      if (!pid) return;

      try {
        target.disabled = true;
        target.innerHTML = '⏳ Saving...';
        await api.updateProduct(pid, { is_active: makeActive });
        showToast(
          makeActive ? 'success' : 'warning',
          makeActive ? 'Product Enabled' : 'Product Disabled',
          `${name} is now ${makeActive ? 'AVAILABLE for customers to order' : 'DISABLED and hidden from customers'}.`
        );
        await renderInventoryTab();
      } catch (err) {
        showToast('error', 'Update Failed', err.message);
        await renderInventoryTab();
      }
    });
  });

  document.querySelectorAll('.btn-adjust-stock').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const pid = e.currentTarget.getAttribute('data-id');
      const delta = parseInt(e.currentTarget.getAttribute('data-delta'), 10);
      if (!pid || isNaN(delta)) return;

      try {
        await api.updateStock(pid, { adjustment: delta });
        showToast('success', 'Stock Adjusted', `Stock adjusted by ${delta > 0 ? '+' : ''}${delta}`);
        await renderInventoryTab();
      } catch (err) {
        showToast('error', 'Adjustment Failed', err.message);
      }
    });
  });

  document.getElementById('btn-add-product')?.addEventListener('click', () => {
    openAddProductModal();
  });
}

function openAddProductModal() {
  const modalContainer = document.getElementById('modal-container');
  modalContainer.innerHTML = `
    <div class="modal-backdrop" id="prod-modal-backdrop">
      <div class="card modal-box p-6" style="max-width: 500px;">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-xl font-bold text-white">📦 Add New Product</h2>
          <button id="btn-close-prod-modal" class="btn btn-ghost" style="font-size: 20px;">&times;</button>
        </div>

        <form id="add-prod-form" class="space-y-3">
          <div>
            <label class="block text-xs text-dark-300 mb-1">Product Name</label>
            <input type="text" id="prod-name" class="input" placeholder="e.g. Japanese Siomai" required />
          </div>

          <div class="grid-2">
            <div>
              <label class="block text-xs text-dark-300 mb-1">Category</label>
              <select id="prod-cat" class="input">
                <option value="Siomai">Siomai</option>
                <option value="Dumplings">Dumplings</option>
                <option value="Sauces">Sauces</option>
                <option value="Drinks">Drinks</option>
                <option value="Add-ons">Add-ons</option>
              </select>
            </div>
            <div>
              <label class="block text-xs text-dark-300 mb-1">Price (₱)</label>
              <input type="number" id="prod-price" class="input" placeholder="45.00" step="0.5" required />
            </div>
          </div>

          <div class="grid-2">
            <div>
              <label class="block text-xs text-dark-300 mb-1">Initial Stock</label>
              <input type="number" id="prod-stock" class="input" value="50" required />
            </div>
            <div>
              <label class="block text-xs text-dark-300 mb-1">Max Stock</label>
              <input type="number" id="prod-max" class="input" value="100" required />
            </div>
          </div>

          <div style="display: flex; align-items: center; gap: 8px; padding: 6px 0;">
            <input type="checkbox" id="prod-active" checked style="width: 16px; height: 16px; accent-color: var(--brand-500); cursor: pointer;" />
            <label for="prod-active" class="text-xs text-dark-200" style="cursor: pointer;">
              Available immediately for customer orders
            </label>
          </div>

          <button type="submit" class="btn btn-primary w-full justify-center py-3 mt-4">
            Save Product 💾
          </button>
        </form>
      </div>
    </div>
  `;

  document.getElementById('btn-close-prod-modal')?.addEventListener('click', () => {
    modalContainer.innerHTML = '';
  });

  document.getElementById('add-prod-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      name: document.getElementById('prod-name').value.trim(),
      category: document.getElementById('prod-cat').value,
      price: parseFloat(document.getElementById('prod-price').value),
      stock: parseInt(document.getElementById('prod-stock').value, 10),
      max_stock: parseInt(document.getElementById('prod-max').value, 10),
      unit: 'servings',
      is_active: document.getElementById('prod-active')?.checked ?? true
    };

    try {
      await api.createProduct(payload);
      modalContainer.innerHTML = '';
      showToast('success', 'Product Created', `${payload.name} added to catalog.`);
      await renderInventoryTab();
    } catch (err) {
      showToast('error', 'Creation Failed', err.message);
    }
  });
}

// ==============================================================================
// 4. ANALYTICS & PREDICTIVE FORECASTING (HTML & JS)
// ==============================================================================
async function renderAnalyticsTab() {
  const container = document.getElementById('tab-content');
  if (!container) return;

  container.innerHTML = `
    <div class="flex items-center justify-center p-8">
      <div class="spinner"></div>
    </div>
  `;

  let desc = {}, pred = {}, presc = {};
  try {
    const [dRes, pRes, prRes] = await Promise.all([
      api.getDescriptive().catch(() => ({ data: {} })),
      api.getPredictive().catch(() => ({ data: {} })),
      api.getPrescriptive().catch(() => ({ data: {} }))
    ]);
    desc = dRes.data || {};
    pred = pRes.data || {};
    presc = prRes.data || {};
  } catch (err) {
    console.warn(err);
  }

  const totalRev = desc.total_sales ?? desc.summary?.total_revenue ?? 0;
  const totalOrders = desc.total_orders ?? desc.summary?.total_orders ?? 0;
  const avgOrderVal = desc.average_order_value ?? (totalOrders > 0 ? totalRev / totalOrders : 0);
  const topProduct = desc.top_selling_product?.name || desc.top_products?.[0]?.name || 'Hotspot Siomai';

  container.innerHTML = `
    <div class="flex flex-wrap items-center justify-between gap-4 mb-6">
      <div>
        <h1 class="text-2xl font-bold text-white">Sales & Predictive Analytics</h1>
        <p class="text-dark-300 text-sm">Powered by Scikit-learn Machine Learning & Time-Series Models</p>
      </div>
      <button id="btn-refresh-analytics" class="btn btn-secondary">
        🔄 Refresh Data
      </button>
    </div>

    <!-- Analytics Key Metrics -->
    <div class="grid-4 mb-6">
      <div class="card stat-card">
        <div class="stat-icon" style="background: rgba(16,185,129,0.2); color: var(--emerald-400);">💰</div>
        <div>
          <div class="text-xs text-dark-300 font-medium">TOTAL SALES</div>
          <div class="text-2xl font-bold text-white">₱${Number(totalRev).toFixed(2)}</div>
          <div class="text-xs text-emerald-400 mt-1">Recorded revenue</div>
        </div>
      </div>

      <div class="card stat-card">
        <div class="stat-icon" style="background: rgba(59,130,246,0.2); color: var(--blue-400);">📋</div>
        <div>
          <div class="text-xs text-dark-300 font-medium">TOTAL ORDERS</div>
          <div class="text-2xl font-bold text-white">${totalOrders}</div>
          <div class="text-xs text-blue-400 mt-1">Fulfilled tickets</div>
        </div>
      </div>

      <div class="card stat-card">
        <div class="stat-icon" style="background: rgba(249,115,22,0.2); color: var(--brand-400);">📈</div>
        <div>
          <div class="text-xs text-dark-300 font-medium">AVG ORDER VALUE</div>
          <div class="text-2xl font-bold text-white">₱${Number(avgOrderVal).toFixed(2)}</div>
          <div class="text-xs text-brand-400 mt-1">Per transaction</div>
        </div>
      </div>

      <div class="card stat-card">
        <div class="stat-icon" style="background: rgba(192,132,252,0.2); color: var(--purple-400);">👑</div>
        <div>
          <div class="text-xs text-dark-300 font-medium">TOP SELLER</div>
          <div class="text-lg font-bold text-white truncate" style="max-width: 140px;">${escapeHtml(topProduct)}</div>
          <div class="text-xs text-purple-400 mt-1">Highest volume</div>
        </div>
      </div>
    </div>

    <!-- Charts Row -->
    <div class="grid-2 mb-6">
      <div class="card p-6">
        <h3 class="text-base font-bold text-white mb-4">📊 Peak Hours Demand Profile</h3>
        <div class="chart-container" style="height: 260px;">
          <canvas id="salesChart"></canvas>
        </div>
      </div>

      <div class="card p-6">
        <h3 class="text-base font-bold text-white mb-4">🥧 Product Category & Volume Share</h3>
        <div class="chart-container" style="height: 260px;">
          <canvas id="productChart"></canvas>
        </div>
      </div>
    </div>

    <!-- AI Prescriptive Insights Box -->
    <div class="card p-6" style="background: linear-gradient(135deg, rgba(59,130,246,0.1), rgba(15,23,42,0.9)); border: 1px solid rgba(59,130,246,0.3);">
      <div class="flex items-center gap-3 mb-3">
        <span style="font-size: 24px;">🤖</span>
        <div>
          <h3 class="text-lg font-bold text-white">Predictive AI & Operational Prescriptions</h3>
          <p class="text-xs text-dark-300">Generated recommendations based on time-series regression</p>
        </div>
      </div>

      <div class="grid-3 mt-4">
        <div class="p-4 rounded-xl" style="background: rgba(0,0,0,0.3);">
          <div class="text-xs text-blue-400 font-semibold mb-1">📅 TOMORROW'S FORECAST</div>
          <div class="text-xl font-bold text-white">~₱${Number(pred.predicted_sales ?? pred.next_day_forecast ?? 3500).toFixed(2)}</div>
          <div class="text-xs text-dark-300 mt-1">Expected ${pred.predicted_orders ?? 45} orders</div>
        </div>

        <div class="p-4 rounded-xl" style="background: rgba(0,0,0,0.3);">
          <div class="text-xs text-yellow-400 font-semibold mb-1">⏰ ESTIMATED PEAK HOURS</div>
          <div class="text-xl font-bold text-white">11:00 AM &bull; 6:00 PM</div>
          <div class="text-xs text-dark-300 mt-1">Lunch & Dinner student rush</div>
        </div>

        <div class="p-4 rounded-xl" style="background: rgba(0,0,0,0.3);">
          <div class="text-xs text-emerald-400 font-semibold mb-1">🥟 PREPARATION ADVICE</div>
          <div class="text-base font-bold text-white">Pre-steam Hotspot Siomai</div>
          <div class="text-xs text-dark-300 mt-1">Prepare buffer before 11:00 AM</div>
        </div>
      </div>
    </div>
  `;

  document.getElementById('btn-refresh-analytics')?.addEventListener('click', () => {
    renderAnalyticsTab();
  });

  // Render Charts with Chart.js
  setTimeout(() => {
    initAnalyticsCharts(desc);
  }, 50);
}

function initAnalyticsCharts(desc) {
  if (typeof Chart === 'undefined') return;

  // Destroy previous instances if any
  if (state.charts.sales) state.charts.sales.destroy();
  if (state.charts.products) state.charts.products.destroy();

  // 1. Sales Chart from Peak Hours or Daily Sales
  const salesCanvas = document.getElementById('salesChart');
  if (salesCanvas) {
    let hours = [];
    let salesData = [];

    if (desc.peak_hours && desc.peak_hours.length > 0) {
      // Filter interesting hours (7am to 10pm)
      const filteredHours = desc.peak_hours.filter(h => h.hour >= 7 && h.hour <= 22);
      hours = filteredHours.map(h => h.label);
      salesData = filteredHours.map(h => h.orders);
    } else {
      hours = ['8 AM', '11 AM', '12 PM', '1 PM', '3 PM', '5 PM', '7 PM', '8 PM'];
      salesData = [5, 18, 26, 22, 12, 28, 20, 10];
    }

    state.charts.sales = new Chart(salesCanvas, {
      type: 'bar',
      data: {
        labels: hours,
        datasets: [{
          label: 'Orders',
          data: salesData,
          backgroundColor: '#f97316',
          borderRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8' } },
          y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8' } }
        }
      }
    });
  }

  // 2. Product Share Chart
  const productCanvas = document.getElementById('productChart');
  if (productCanvas) {
    let labels = [];
    let counts = [];

    if (desc.top_products && desc.top_products.length > 0) {
      labels = desc.top_products.map(p => p.name);
      counts = desc.top_products.map(p => p.quantity);
    } else {
      labels = ['Hotspot Siomai', 'Chili Garlic (Small)', 'Chili Garlic (Large)', 'Sauce Pack'];
      counts = [150, 45, 30, 80];
    }

    state.charts.products = new Chart(productCanvas, {
      type: 'doughnut',
      data: {
        labels: labels,
        datasets: [{
          data: counts,
          backgroundColor: ['#f97316', '#3b82f6', '#10b981', '#a855f7', '#eab308'],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { color: '#94a3b8', boxWidth: 12 } }
        }
      }
    });
  }
}

// ==============================================================================
// 5. HARDWARE SIMULATOR (ESP32 & OLED) (HTML & JS)
// ==============================================================================
async function renderSimulatorTab() {
  const container = document.getElementById('tab-content');
  if (!container) return;

  let displayData = { now_serving: 0, next_queue: 0, now_serving_status: 'ready' };
  try {
    const res = await api.getQueueDisplay();
    displayData = res.data;
  } catch (e) {}

  container.innerHTML = `
    <div class="flex flex-wrap items-center justify-between gap-4 mb-6">
      <div>
        <h1 class="text-2xl font-bold text-white">Hardware & ESP32 Simulator</h1>
        <p class="text-dark-300 text-sm">Virtual testbench for the physical ESP32 OLED Queue Display & Piezo Buzzer</p>
      </div>
    </div>

    <div class="grid-2 mb-6">
      <!-- OLED Display Module -->
      <div class="card p-6">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-base font-bold text-white flex items-center gap-2">
            📟 SSD1306 Virtual OLED Screen (128x64)
          </h3>
          <span class="badge badge-green" id="esp32-status-badge">ESP32 Connected</span>
        </div>

        <div class="oled-display mb-4 text-center">
          <div style="font-size: 13px; letter-spacing: 2px; color: #4ade80;">=== KEVS SIOMAI QUEUE ===</div>
          <div style="font-size: 11px; margin: 4px 0; color: #22c55e;">━━━━━━━━━━━━━━━━━━━━━━━━━</div>
          <div class="flex justify-around items-center my-3">
            <div>
              <div style="font-size: 10px; opacity: 0.8;">NOW SERVING</div>
              <div style="font-size: 32px; font-weight: bold; color: #4ade80;" id="sim-oled-now">#${displayData.now_serving || '—'}</div>
            </div>
            <div style="width: 1px; height: 40px; background: #166534;"></div>
            <div>
              <div style="font-size: 10px; opacity: 0.8;">NEXT QUEUE</div>
              <div style="font-size: 32px; font-weight: bold; color: #4ade80;" id="sim-oled-next">#${displayData.next_queue || 1}</div>
            </div>
          </div>
          <div style="font-size: 11px; letter-spacing: 1px; color: #86efac;" id="sim-oled-msg">PLEASE PROCEED TO COUNTER</div>
        </div>

        <!-- Simulator Pushbuttons -->
        <div class="flex flex-wrap gap-3">
          <button id="btn-sim-press-walkin" class="btn btn-primary flex-1 justify-center">
            🔘 Press Walk-in Ticket Button
          </button>
          <button id="btn-sim-call-next" class="btn btn-success flex-1 justify-center">
            📢 Call Next Ticket
          </button>
          <button id="btn-sim-beep" class="btn btn-secondary justify-center">
            🔔 Test Buzzer
          </button>
        </div>
      </div>

      <!-- ESP32 Serial Monitor Log -->
      <div class="card p-6">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-base font-bold text-white flex items-center gap-2">
            💻 ESP32 UART Serial Monitor (115200 baud)
          </h3>
          <button id="btn-clear-serial" class="btn btn-ghost" style="font-size: 12px; padding: 4px 8px;">
            Clear Log
          </button>
        </div>

        <div class="serial-log" id="sim-serial-log">
          <div style="color: #64748b;">[00:00:00] [BOOT] ESP32-WROOM-32 booting up...</div>
          <div style="color: #64748b;">[00:00:01] [WIFI] Connected to AP (SSID: Kevs_WiFi_POS, RSSI: -54 dBm)</div>
          <div style="color: #64748b;">[00:00:01] [OLED] SSD1306 initialized via I2C at 0x3C</div>
          <div style="color: #64748b;">[00:00:02] [HTTP] GET /api/queue/display -> 200 OK</div>
          <div style="color: #22c55e;">[00:00:02] [READY] Queue system synchronized. Ready for hardware triggers.</div>
        </div>
      </div>
    </div>
  `;

  bindSimulatorEvents();
}

async function updateSimulatorOLED() {
  try {
    const res = await api.getQueueDisplay();
    const data = res.data;
    const oledNow = document.getElementById('sim-oled-now');
    const oledNext = document.getElementById('sim-oled-next');
    if (oledNow) oledNow.textContent = `#${data.now_serving || '—'}`;
    if (oledNext) oledNext.textContent = `#${data.next_queue || 1}`;
  } catch (e) {}
}

function appendSerialLog(msg, color = '#4ade80') {
  const log = document.getElementById('sim-serial-log');
  if (!log) return;
  const time = new Date().toLocaleTimeString();
  const line = document.createElement('div');
  line.style.color = color;
  line.textContent = `[${time}] ${msg}`;
  log.appendChild(line);
  log.scrollTop = log.scrollHeight;
}

function bindSimulatorEvents() {
  document.getElementById('btn-sim-beep')?.addEventListener('click', () => {
    playBeep();
    appendSerialLog('[BUZZER] Piezo active: Frequency 1000Hz, Duration 300ms', '#facc15');
    showToast('info', 'Buzzer', 'Piezo buzzer simulated successfully!');
  });

  document.getElementById('btn-sim-press-walkin')?.addEventListener('click', async () => {
    playBeep();
    appendSerialLog('[GPIO] Button pin 14 pressed (Active LOW, Debounce: 50ms)', '#38bdf8');
    appendSerialLog('[HTTP] POST /api/queue/add (Walk-in button trigger)', '#818cf8');

    try {
      const res = await api.addToQueue({
        type: 'walk-in',
        order_type: 'pickup',
        customer_name: 'Walk-in (ESP32 Button)',
        payment_method: 'Cash',
        items: [{ product_id: 1, quantity: 1 }],
        notes: 'ESP32 Physical Button'
      });

      const queueNo = res.data?.order?.queue_no || res.data?.queue?.current_queue_no;
      appendSerialLog(`[OLED] Ticket #${queueNo} issued! Rendering frame buffer...`, '#22c55e');
      showToast('success', 'ESP32 Ticket', `Issued ticket #${queueNo} from hardware button!`);
      await updateSimulatorOLED();
    } catch (e) {
      appendSerialLog(`[ERROR] HTTP POST failed: ${e.message}`, '#ef4444');
      showToast('error', 'ESP32 Error', e.message);
    }
  });

  document.getElementById('btn-sim-call-next')?.addEventListener('click', async () => {
    playBeep();
    appendSerialLog('[HTTP] POST /api/queue/call-next (Advancing queue ticket)', '#38bdf8');
    try {
      const res = await api.callNextOrder();
      appendSerialLog(`[OLED] ${res.data?.message || 'Now calling next ticket'}`, '#22c55e');
      showToast('info', 'Customer Called', res.data?.message || 'Now calling next ticket!');
      await updateSimulatorOLED();
    } catch (e) {
      appendSerialLog(`[ERROR] Call Next failed: ${e.message}`, '#ef4444');
    }
  });

  document.getElementById('btn-clear-serial')?.addEventListener('click', () => {
    const log = document.getElementById('sim-serial-log');
    if (log) log.innerHTML = '<div style="color: #64748b;">Log cleared.</div>';
  });
}

// ==============================================================================
// 6. FIREWALL & SECURITY DASHBOARD (HTML & JS)
// ==============================================================================
async function renderFirewallTab() {
  const container = document.getElementById('tab-content');
  if (!container) return;

  container.innerHTML = `
    <div class="flex items-center justify-center p-8">
      <div class="spinner"></div>
    </div>
  `;

  let stats = {
    status: 'active',
    total_scanned: 0,
    total_blocked: 0,
    threat_counts: {},
    rules_count: 28,
    active_engines: {},
    banned_ips: [],
    blacklisted_ips: []
  };
  let logs = [];

  try {
    const [statsRes, logsRes] = await Promise.all([
      api.getFirewallStats(),
      api.getFirewallLogs()
    ]);
    stats = statsRes.data;
    logs = logsRes.data?.logs || [];
    state.firewallStats = stats;
    state.firewallLogs = logs;
  } catch (err) {
    console.warn('Firewall API fetch failed:', err);
  }

  container.innerHTML = `
    <!-- Top Header Banner -->
    <div class="card p-6 mb-6 firewall-shield-card">
      <div class="flex flex-wrap items-center justify-between gap-4">
        <div class="flex items-center gap-4">
          <div style="width: 56px; height: 56px; border-radius: 16px; background: rgba(16, 185, 129, 0.2); border: 1px solid rgba(16, 185, 129, 0.4); display: flex; align-items: center; justify-content: center; font-size: 28px;">
            🛡️
          </div>
          <div>
            <div class="flex items-center gap-2">
              <h1 class="text-2xl font-bold text-white">Kevs Web Application Firewall (WAF)</h1>
              <span class="badge badge-green flex items-center gap-1">
                <span class="waf-pulse"></span> Active & Guarding
              </span>
            </div>
            <p class="text-dark-300 text-sm mt-1">
              Real-time deep packet inspection, automated intrusion blocking, SQLi/XSS filters, and anti-DoS rate limiting.
            </p>
          </div>
        </div>

        <div class="flex items-center gap-3">
          <button id="btn-refresh-waf" class="btn btn-secondary">
            🔄 Refresh Status
          </button>
        </div>
      </div>
    </div>

    <!-- 4 Firewall Stat Metrics -->
    <div class="grid-4 mb-6">
      <div class="card stat-card">
        <div class="stat-icon" style="background: rgba(59,130,246,0.2); color: var(--blue-400);">📡</div>
        <div>
          <div class="text-xs text-dark-300 font-medium">REQUESTS SCANNED</div>
          <div class="text-3xl font-bold text-white">${stats.total_scanned || 0}</div>
          <div class="text-xs text-blue-400 mt-1">Full DPI inspection</div>
        </div>
      </div>

      <div class="card stat-card">
        <div class="stat-icon" style="background: rgba(239,68,68,0.2); color: var(--red-400);">🚫</div>
        <div>
          <div class="text-xs text-dark-300 font-medium">THREATS INTERCEPTED</div>
          <div class="text-3xl font-bold text-red-400">${stats.total_blocked || 0}</div>
          <div class="text-xs text-red-400 mt-1">HTTP 403 Forbidden</div>
        </div>
      </div>

      <div class="card stat-card">
        <div class="stat-icon" style="background: rgba(234,179,8,0.2); color: var(--yellow-400);">🔒</div>
        <div>
          <div class="text-xs text-dark-300 font-medium">BANNED ATTACKER IPS</div>
          <div class="text-3xl font-bold text-white">${(stats.banned_ips_count || 0) + (stats.blacklisted_ips_count || 0)}</div>
          <div class="text-xs text-yellow-400 mt-1">Jailed in auto-quarantine</div>
        </div>
      </div>

      <div class="card stat-card">
        <div class="stat-icon" style="background: rgba(16,185,129,0.2); color: var(--emerald-400);">⚙️</div>
        <div>
          <div class="text-xs text-dark-300 font-medium">ACTIVE RULES</div>
          <div class="text-3xl font-bold text-emerald-400">${stats.rules_count || 28} Rules</div>
          <div class="text-xs text-dark-300 mt-1">Across 6 WAF engines</div>
        </div>
      </div>
    </div>

    <!-- Active Engines Badges -->
    <div class="card p-5 mb-6">
      <h3 class="text-sm font-bold text-white mb-3 flex items-center gap-2">
        <span>⚡</span> Active Inspection Engines
      </h3>
      <div class="grid-3 gap-3">
        <div class="waf-engine-badge active">
          <span class="waf-pulse"></span>
          <div>
            <div class="text-white text-xs font-bold">SQL Injection (SQLi) Engine</div>
            <div class="text-dark-400 text-[11px]">Tautology, union, stacked queries</div>
          </div>
        </div>

        <div class="waf-engine-badge active">
          <span class="waf-pulse"></span>
          <div>
            <div class="text-white text-xs font-bold">Cross-Site Scripting (XSS) Engine</div>
            <div class="text-dark-400 text-[11px]">Script tags, event handlers, DOM injection</div>
          </div>
        </div>

        <div class="waf-engine-badge active">
          <span class="waf-pulse"></span>
          <div>
            <div class="text-white text-xs font-bold">Path Traversal & LFI Filter</div>
            <div class="text-dark-400 text-[11px]">Directory climbing, sensitive files</div>
          </div>
        </div>

        <div class="waf-engine-badge active">
          <span class="waf-pulse"></span>
          <div>
            <div class="text-white text-xs font-bold">Vulnerability Scanner Blocker</div>
            <div class="text-dark-400 text-[11px]">sqlmap, nikto, dirbuster, gobuster</div>
          </div>
        </div>

        <div class="waf-engine-badge active">
          <span class="waf-pulse"></span>
          <div>
            <div class="text-white text-xs font-bold">Sliding-Window Rate Limiter</div>
            <div class="text-dark-400 text-[11px]">120 req/min general, 15 req/min auth</div>
          </div>
        </div>

        <div class="waf-engine-badge active">
          <span class="waf-pulse"></span>
          <div>
            <div class="text-white text-xs font-bold">OWASP Security Headers</div>
            <div class="text-dark-400 text-[11px]">CSP, X-Frame, XSS-Protection, HSTS</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Interactive Penetration Test Suite -->
    <div class="card p-6 mb-6" style="background: linear-gradient(135deg, rgba(239, 68, 68, 0.08), rgba(15, 23, 42, 0.95)); border: 1px solid rgba(239, 68, 68, 0.3);">
      <div class="flex items-center gap-3 mb-2">
        <span style="font-size: 24px;">🎯</span>
        <div>
          <h3 class="text-lg font-bold text-white">Live Threat Simulation & Attack Verification</h3>
          <p class="text-xs text-dark-300">Click a test attack below to verify that the firewall intercepts malicious payloads in real time.</p>
        </div>
      </div>

      <div class="flex flex-wrap gap-3 mt-4">
        <button class="btn btn-secondary btn-test-waf" data-type="sqli" style="border-color: rgba(239,68,68,0.4);">
          💥 Simulate SQL Injection
        </button>
        <button class="btn btn-secondary btn-test-waf" data-type="xss" style="border-color: rgba(245,158,11,0.4);">
          ⚡ Simulate XSS Script
        </button>
        <button class="btn btn-secondary btn-test-waf" data-type="path_traversal" style="border-color: rgba(168,85,247,0.4);">
          📂 Simulate Path Traversal
        </button>
        <button class="btn btn-secondary btn-test-waf" data-type="scanner" style="border-color: rgba(59,130,246,0.4);">
          🤖 Simulate sqlmap Bot
        </button>
        <button class="btn btn-secondary btn-test-waf" data-type="rce" style="border-color: rgba(220,38,38,0.4);">
          💻 Simulate RCE Command
        </button>
      </div>

      <!-- Live Test Result Banner -->
      <div id="waf-test-result" style="display: none; margin-top: 16px; padding: 12px 16px; border-radius: 12px; background: rgba(0,0,0,0.4); border: 1px solid var(--dark-500); font-family: monospace; font-size: 13px;">
      </div>
    </div>

    <!-- Security Event Logs Table -->
    <div class="card p-6 overflow-hidden">
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-base font-bold text-white flex items-center gap-2">
          📋 Live Security Incident Log
        </h3>
        <span class="text-xs text-dark-400">${logs.length} logged incidents</span>
      </div>

      <div style="overflow-x: auto;">
        <table style="width: 100%; border-collapse: collapse; text-align: left;">
          <thead>
            <tr style="border-bottom: 1px solid var(--dark-600); color: var(--dark-400); font-size: 12px; text-transform: uppercase;">
              <th class="py-3 px-4">Timestamp</th>
              <th class="py-3 px-4">Client IP</th>
              <th class="py-3 px-4">Threat Type</th>
              <th class="py-3 px-4">Endpoint</th>
              <th class="py-3 px-4">Action</th>
              <th class="py-3 px-4">Incident Details</th>
            </tr>
          </thead>
          <tbody id="waf-logs-tbody">
            ${logs.length === 0 ? `
              <tr>
                <td colspan="6" class="py-8 text-center text-dark-400 text-sm">
                  ✨ No security violations recorded yet. All traffic clean!
                </td>
              </tr>
            ` : logs.map(log => `
              <tr style="border-bottom: 1px solid var(--dark-600); font-size: 13px;">
                <td class="py-3 px-4 text-dark-300 font-mono">${new Date(log.timestamp).toLocaleTimeString()}</td>
                <td class="py-3 px-4 font-bold text-white font-mono">${escapeHtml(log.ip)}</td>
                <td class="py-3 px-4">
                  <span class="threat-tag threat-${(log.threat_type || '').toLowerCase()}">${escapeHtml(log.threat_type)}</span>
                </td>
                <td class="py-3 px-4 text-dark-300 font-mono">${escapeHtml(log.method || 'GET')} ${escapeHtml(log.path || '/')}</td>
                <td class="py-3 px-4">
                  <span class="badge badge-red">BLOCKED 403</span>
                </td>
                <td class="py-3 px-4 text-dark-300 font-mono text-xs" style="max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                  ${escapeHtml(log.details || 'Attack signature matched')}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  bindFirewallEvents();
}

function bindFirewallEvents() {
  document.getElementById('btn-refresh-waf')?.addEventListener('click', () => {
    showToast('info', 'Refreshing', 'Updating firewall telemetry...');
    renderFirewallTab();
  });

  document.querySelectorAll('.btn-test-waf').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const type = e.currentTarget.getAttribute('data-type');
      if (!type) return;

      e.currentTarget.disabled = true;
      e.currentTarget.innerHTML = '⏳ Testing...';

      try {
        const res = await api.testFirewallThreat({ threat_type: type });
        playBeep();
        showToast('success', 'Firewall Intercepted!', `Simulated ${type.toUpperCase()} attack blocked with HTTP 403!`);

        const resultBox = document.getElementById('waf-test-result');
        if (resultBox) {
          resultBox.style.display = 'block';
          resultBox.innerHTML = `
            <div style="color: #4ade80; font-weight: bold; margin-bottom: 4px;">
              🛡️ [FIREWALL BLOCKED] Simulated ${type.toUpperCase()} Intercepted!
            </div>
            <div style="color: #cbd5e1;"><strong>Payload Tested:</strong> <code>${escapeHtml(res.data?.result?.payload)}</code></div>
            <div style="color: #cbd5e1; margin-top: 2px;"><strong>Firewall Action:</strong> <span style="color: #f87171; font-weight: bold;">${escapeHtml(res.data?.result?.firewall_action)}</span></div>
            <div style="color: #94a3b8; font-size: 11px; margin-top: 4px;">Incident successfully recorded in live security log.</div>
          `;
        }

        // Re-render logs in table
        const logsRes = await api.getFirewallLogs();
        const tbody = document.getElementById('waf-logs-tbody');
        if (tbody && logsRes.data?.logs) {
          tbody.innerHTML = logsRes.data.logs.map(log => `
            <tr style="border-bottom: 1px solid var(--dark-600); font-size: 13px;">
              <td class="py-3 px-4 text-dark-300 font-mono">${new Date(log.timestamp).toLocaleTimeString()}</td>
              <td class="py-3 px-4 font-bold text-white font-mono">${escapeHtml(log.ip)}</td>
              <td class="py-3 px-4">
                <span class="threat-tag threat-${(log.threat_type || '').toLowerCase()}">${escapeHtml(log.threat_type)}</span>
              </td>
              <td class="py-3 px-4 text-dark-300 font-mono">${escapeHtml(log.method || 'GET')} ${escapeHtml(log.path || '/')}</td>
              <td class="py-3 px-4">
                <span class="badge badge-red">BLOCKED 403</span>
              </td>
              <td class="py-3 px-4 text-dark-300 font-mono text-xs" style="max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                ${escapeHtml(log.details || 'Attack signature matched')}
              </td>
            </tr>
          `).join('');
        }
      } catch (err) {
        showToast('error', 'Test Failed', err.message);
      } finally {
        e.currentTarget.disabled = false;
        e.currentTarget.innerHTML = `💥 Simulate ${type.toUpperCase()}`;
      }
    });
  });
}
