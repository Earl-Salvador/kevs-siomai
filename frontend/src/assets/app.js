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
import { Icons } from './icons.js';

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
  charts: {},
  reviewsData: { reviews: [], stats: {} },
  reviewsFilter: 'all',
  reviewsStarFilter: 'all',
  reviewsSearchQuery: '',
  reviewReplyingId: null
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
    btn.innerHTML = theme === 'light' ? Icons.moon({ size: 16 }) : Icons.sun({ size: 16 });
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
  const icon = type === 'success' 
    ? Icons.checkCircle({ size: 20, color: 'var(--emerald-400)' }) 
    : type === 'error' 
    ? Icons.xCircle({ size: 20, color: 'var(--red-400)' }) 
    : type === 'warning' 
    ? Icons.alert({ size: 20, color: 'var(--yellow-400)' }) 
    : Icons.info({ size: 20, color: 'var(--blue-400)' });

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
// ── Socket.IO Connection & Real-time Synchronization ────────────────────────
function initSocket() {
  if (state.socket) return;
  const socketUrl = window.location.port === '5000' ? window.location.origin : 'http://localhost:5000';

  if (typeof io !== 'undefined') {
    // Use polling transport without upgrade to ensure 100% stable connection on Flask/Werkzeug
    state.socket = io(socketUrl, { transports: ['polling'], upgrade: false, timeout: 10000 });

    state.socket.on('connect', () => {
      console.log('[Socket.IO] Realtime connection active');
    });

    state.socket.on('disconnect', () => {
      console.log('[Socket.IO] Realtime disconnected, falling back to background heartbeat');
    });

    const refreshActiveView = (data, isNew = false, newOrder = null) => {
      if (data && data.queue) {
        state.queueData = {
          queue: data.queue || {},
          orders: data.orders || [],
          stats: data.stats || {}
        };
        const newOrders = data.orders || [];
        const newQueue = data.queue || {};
        state._orderSignature = `${newQueue.current_queue_no}_${newQueue.now_serving}_${newOrders.length}_${newOrders.map(o => `${o.id}:${o.status}`).join(',')}`;
      }

      playBeep();
      updateNavbarQueuePill();

      if (isNew && newOrder) {
        const cust = newOrder.customer_name || 'Customer';
        const qNum = newOrder.queue_no ? `#${newOrder.queue_no}` : (newOrder.queue_number ? `#${newOrder.queue_number}` : `#${newOrder.id}`);
        const total = Number(newOrder.total_amount || newOrder.total || 0).toFixed(2);
        showToast('success', '🥟 Bagong Order Pumasok!', `${cust} (${qNum}) — ₱${total}`);
        state.queuePage = 1;
      }

      if (state.activeTab === 'queue') {
        renderQueueTab(false);
      } else if (state.activeTab === 'analytics') {
        renderAnalyticsTab();
      } else if (state.activeTab === 'inventory') {
        renderInventoryTab();
      } else if (state.activeTab === 'simulator') {
        updateSimulatorOLED();
      }
    };

    state.socket.on('queue_updated', (data) => refreshActiveView(data));
    state.socket.on('new_order', (newOrder) => {
      api.getQueue().then(res => {
        if (res && res.data) {
          refreshActiveView(res.data, true, newOrder);
        }
      }).catch(() => {});
    });
    state.socket.on('sales_updated', () => {
      if (state.activeTab === 'analytics') {
        renderAnalyticsTab();
      } else if (state.activeTab === 'queue') {
        renderQueueTab(false);
      }
    });

    state.socket.on('review_created', (review) => {
      playBeep();
      showToast('info', '⭐ New Customer Review!', `${review.customer_name || 'A customer'} rated ${review.rating} star(s)`);
      if (state.activeTab === 'reviews') {
        loadAndDisplayReviews();
      }
    });

    state.socket.on('review_updated', () => {
      if (state.activeTab === 'reviews') {
        loadAndDisplayReviews();
      }
    });
  }

  // ── Auto-Refresh Dashboard Every 2 Seconds ──
  if (state.realtimeHeartbeat) {
    clearInterval(state.realtimeHeartbeat);
    state.realtimeHeartbeat = null;
  }

  state.realtimeHeartbeat = setInterval(async () => {
    if (!state.user) return;
    try {
      const [qRes, statsRes] = await Promise.all([
        api.getQueue().catch(() => null),
        api.getDashboardStats().catch(() => null)
      ]);

      if (qRes && qRes.data) {
        const newOrders = qRes.data.orders || [];
        const newQueue = qRes.data.queue || {};
        const newStats = statsRes?.data || qRes.data.stats || {};

        const prevOrders = (state.queueData && state.queueData.orders) || [];
        const prevLen = prevOrders.length;
        const isNewIncomingOrder = prevLen > 0 && newOrders.length > prevLen;

        state.queueData = {
          queue: newQueue,
          orders: newOrders,
          stats: newStats
        };

        const currentSignature = `${newQueue.current_queue_no}_${newQueue.now_serving}_${newOrders.length}_${newOrders.map(o => `${o.id}:${o.status}`).join(',')}`;
        const hasChanged = state._orderSignature !== currentSignature;
        state._orderSignature = currentSignature;

        updateNavbarQueuePill();

        if (isNewIncomingOrder) {
          playBeep();
          const latestOrder = newOrders[0];
          const cust = latestOrder?.customer_name || 'Customer';
          const qNum = latestOrder?.queue_no ? `#${latestOrder.queue_no}` : `#${latestOrder?.id}`;
          const total = Number(latestOrder?.total_amount || latestOrder?.total || 0).toFixed(2);
          showToast('success', '🥟 Bagong Order Pumasok!', `${cust} (${qNum}) — ₱${total}`);
          state.queuePage = 1; // display top of page so latest order is immediately visible
        }

        // Unconditionally refresh live queue dashboard every 2 seconds
        if (state.activeTab === 'queue') {
          renderQueueTab(false);
        } else if (state.activeTab === 'analytics' && hasChanged) {
          renderAnalyticsTab();
        } else if (state.activeTab === 'simulator' && hasChanged) {
          updateSimulatorOLED();
        }
      }
      await refreshPendingCount();
    } catch (e) {
      // Silent fail for polling errors
    }
  }, 2000);
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
          <div style="width: 40px; height: 40px; border-radius: 12px; background: linear-gradient(135deg, var(--brand-500), var(--brand-700)); display: flex; align-items: center; justify-content: center; color: #fff;">
            ${Icons.siomai({ size: 22, strokeWidth: 2.2 })}
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
            ${Icons.queue({ size: 16 })} <span>Queue</span>
          </button>
          <button class="nav-tab ${state.activeTab === 'inventory' ? 'active' : ''}" data-tab="inventory">
            ${Icons.package({ size: 16 })} <span>Inventory</span>
          </button>
          <button class="nav-tab ${state.activeTab === 'analytics' ? 'active' : ''}" data-tab="analytics">
            ${Icons.analytics({ size: 16 })} <span>Analytics</span>
          </button>
          <button class="nav-tab ${state.activeTab === 'simulator' ? 'active' : ''}" data-tab="simulator">
            ${Icons.hardware({ size: 16 })} <span>Hardware</span>
          </button>
          <button class="nav-tab ${state.activeTab === 'firewall' ? 'active' : ''}" data-tab="firewall">
            ${Icons.shield({ size: 16 })} <span>Firewall</span>
            <span class="waf-pulse" style="margin-left: 4px;"></span>
          </button>
          <button class="nav-tab ${state.activeTab === 'reviews' ? 'active' : ''}" data-tab="reviews">
            ${Icons.star({ size: 16 })} <span>Reviews</span>
          </button>
        </nav>

        <!-- Right Utilities -->
        <div class="flex items-center gap-3 ml-auto">
          <!-- Light / Dark Mode Toggle Button -->
          <button id="btn-toggle-theme" class="theme-toggle-btn" title="${state.theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}">
            ${state.theme === 'light' ? Icons.moon({ size: 16 }) : Icons.sun({ size: 16 })}
          </button>

          <!-- Audio Toggle -->
          <button id="btn-toggle-audio" class="btn btn-ghost" title="Toggle audio chime">
            ${state.audioEnabled ? Icons.volume({ size: 16 }) : Icons.volumeMute({ size: 16 })}
          </button>

          <!-- Manual Sync Button -->
          <button id="btn-manual-sync" class="btn btn-secondary flex items-center gap-1.5" style="font-size: 12px; padding: 6px 12px;" title="Sync offline orders">
            ${Icons.refresh({ size: 14 })} <span id="sync-btn-label">Sync</span>
          </button>

          <!-- Network Status -->
          <div class="flex items-center gap-2" style="font-size: 12px; color: var(--dark-300);">
            <span id="net-status-dot" class="status-dot" style="background: ${state.isOnline ? 'var(--emerald-500)' : 'var(--red-500)'};"></span>
            <span id="net-status-text">${state.isOnline ? 'Online' : 'Offline'}</span>
          </div>

          <!-- User & Logout -->
          <div class="flex items-center gap-2" style="border-left: 1px solid var(--dark-600); padding-left: 12px;">
            <span style="font-size: 13px; font-weight: 600;" class="text-white">${escapeHtml(state.user.full_name || state.user.username)}</span>
            <button id="btn-logout" class="btn btn-ghost flex items-center gap-1" style="padding: 4px 8px; font-size: 12px; color: var(--red-400);" title="Logout">
              ${Icons.logout({ size: 14 })} Logout
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
      btnAudio.innerHTML = state.audioEnabled ? Icons.volume({ size: 16 }) : Icons.volumeMute({ size: 16 });
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
  } else if (state.activeTab === 'reviews') {
    renderReviewsTab();
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
          <div class="login-logo-wrap glow-orange" style="display:flex;align-items:center;justify-content:center;color:#fff;">
            ${Icons.siomai({ size: 36, strokeWidth: 2.2 })}
          </div>
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

          <button type="submit" id="btn-login-submit" class="btn btn-primary w-full justify-center py-3 text-base mt-4 flex items-center gap-2">
            ${Icons.check({ size: 16 })} Sign In
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
    btnSubmit.innerHTML = 'Signing in...';

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

function renderActiveBannerHtml(activeOrder) {
  if (!activeOrder) {
    return `
      <div class="card p-5 mb-6 text-center" style="border: 1px dashed var(--dark-600); background: rgba(15,23,42,0.4);">
        <div style="margin-bottom: 8px; color: var(--brand-400);">${Icons.siomai({ size: 36, strokeWidth: 1.8 })}</div>
        <div class="text-base font-bold text-dark-300">No orders yet!</div>
        <div class="text-xs text-dark-400 mt-1">Create a new walk-in order to start the queue.</div>
      </div>
    `;
  }
  return `
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
          <button class="btn btn-secondary btn-buzz-order flex items-center gap-1.5" data-id="${activeOrder.id}">
            ${Icons.bellRing({ size: 15 })} Buzz
          </button>
          <button class="btn btn-success btn-complete-order flex items-center gap-1.5" data-id="${activeOrder.id}">
            ${Icons.checkCircle({ size: 15 })} Mark Completed
          </button>
        </div>
      </div>
    </div>
  `;
}

async function renderQueueTab(showSpinner = true) {
  const container = document.getElementById('tab-content');
  if (!container) return;

  const ordersContainer = document.getElementById('orders-container');
  const isExistingDom = !showSpinner && ordersContainer !== null;

  if (showSpinner) {
    container.innerHTML = `
      <div class="flex items-center justify-center p-8">
        <div class="spinner"></div>
      </div>
    `;
    await refreshQueue();
    await refreshPendingCount();
  } else if (!state.queueData || !state.queueData.orders) {
    await refreshQueue();
    await refreshPendingCount();
  }

  const q = state.queueData.queue || {};
  let orders = state.queueData.orders || [];
  // Ensure active orders are sorted newest first so they immediately show on page 1 without refresh
  orders = [...orders].sort((a, b) => {
    const aActive = !['completed', 'delivered', 'cancelled'].includes(a.status);
    const bActive = !['completed', 'delivered', 'cancelled'].includes(b.status);
    if (aActive !== bActive) return bActive ? 1 : -1;
    return (b.id || 0) - (a.id || 0);
  });
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

  // Fast In-Place Real-Time DOM Update (Zero Flicker & Preserves Focus/State)
  if (isExistingDom) {
    const elNowServing = document.getElementById('stat-now-serving-val');
    if (elNowServing) elNowServing.textContent = hasActive ? '#' + nowServingNum : '—';
    const elNowServingSub = document.getElementById('stat-now-serving-sub');
    if (elNowServingSub) elNowServingSub.textContent = hasActive ? 'Ticket in progress' : 'No orders yet!';

    const elWaiting = document.getElementById('stat-waiting-val');
    if (elWaiting) elWaiting.textContent = waitingCount;
    const elWaitingSub = document.getElementById('stat-waiting-sub');
    if (elWaitingSub) elWaitingSub.textContent = waitingCount === 0 ? 'No orders in line' : 'Orders in line';

    const elCompleted = document.getElementById('stat-completed-val');
    if (elCompleted) elCompleted.textContent = completedToday;

    const elRevenue = document.getElementById('stat-revenue-val');
    if (elRevenue) elRevenue.textContent = '₱' + Number(todayRevenue).toFixed(2);

    const btnCallNext = document.getElementById('btn-call-next');
    if (btnCallNext) btnCallNext.innerHTML = `${Icons.bullhorn({ size: 16 })} Call Next (#${Number(nowServingNum) + 1})`;

    const bannerBox = document.getElementById('active-serving-banner-box');
    if (bannerBox) bannerBox.innerHTML = renderActiveBannerHtml(activeOrder);

    // Update tab badges
    document.querySelectorAll('.tab-btn').forEach(btn => {
      const filter = btn.getAttribute('data-filter');
      const countEl = btn.querySelector('.tab-count');
      if (filter && countEl) {
        if (filter === 'All') countEl.textContent = orders.length;
        else countEl.textContent = orders.filter(o => mapStage(o.status) === filter.toLowerCase()).length;
      }
    });

    ordersContainer.innerHTML = renderOrderCards(orders);
    bindQueueCardActions();
    return;
  }

  const searchInput = document.getElementById('queue-search');
  const isSearchFocused = searchInput && document.activeElement === searchInput;
  const cursorSelectionStart = isSearchFocused ? searchInput.selectionStart : null;
  const cursorSelectionEnd = isSearchFocused ? searchInput.selectionEnd : null;

  container.innerHTML = `
    <!-- Top Action Bar & Stat Cards -->
    <div class="flex flex-wrap items-center justify-between gap-4 mb-6">
      <div>
        <h1 class="text-2xl font-bold text-white">Live Queue Dashboard</h1>
        <p class="text-dark-300 text-sm">Real-time order tracking & queue processing</p>
      </div>

      <div class="flex items-center gap-3">
        <button id="btn-open-order-modal" class="btn btn-primary flex items-center gap-1.5">
          ${Icons.plus({ size: 16 })} New Walk-in Order
        </button>
        <button id="btn-call-next" class="btn btn-success flex items-center gap-1.5">
          ${Icons.bullhorn({ size: 16 })} Call Next (#${Number(nowServingNum) + 1})
        </button>
        <button id="btn-reset-queue" class="btn btn-secondary text-red-400 flex items-center gap-1.5" title="Reset today's queue count">
          ${Icons.alert({ size: 15 })} Reset
        </button>
        <button id="btn-refresh-queue" class="btn btn-secondary flex items-center gap-1.5">
          ${Icons.refresh({ size: 15 })} Refresh
        </button>
      </div>
    </div>

    <!-- Stat Cards Bar -->
    <div class="grid-4 mb-6">
      <div class="card stat-card">
        <div class="stat-icon" style="background: rgba(249,115,22,0.2); color: var(--brand-400); display: flex; align-items: center; justify-content: center;">
          ${Icons.bullhorn({ size: 24 })}
        </div>
        <div>
          <div class="text-xs text-dark-300 font-medium">NOW SERVING</div>
          <div id="stat-now-serving-val" class="text-3xl font-bold text-white">${hasActive ? '#' + nowServingNum : '—'}</div>
          <div id="stat-now-serving-sub" class="text-xs text-brand-400 mt-1">${hasActive ? 'Ticket in progress' : 'No orders yet!'}</div>
        </div>
      </div>

      <div class="card stat-card">
        <div class="stat-icon" style="background: rgba(234,179,8,0.2); color: var(--yellow-400); display: flex; align-items: center; justify-content: center;">
          ${Icons.clock({ size: 24 })}
        </div>
        <div>
          <div class="text-xs text-dark-300 font-medium">WAITING IN QUEUE</div>
          <div id="stat-waiting-val" class="text-3xl font-bold text-white">${waitingCount}</div>
          <div id="stat-waiting-sub" class="text-xs text-yellow-400 mt-1">${waitingCount === 0 ? 'No orders in line' : 'Orders in line'}</div>
        </div>
      </div>

      <div class="card stat-card">
        <div class="stat-icon" style="background: rgba(16,185,129,0.2); color: var(--emerald-400); display: flex; align-items: center; justify-content: center;">
          ${Icons.checkCircle({ size: 24 })}
        </div>
        <div>
          <div class="text-xs text-dark-300 font-medium">COMPLETED TODAY</div>
          <div id="stat-completed-val" class="text-3xl font-bold text-white">${completedToday}</div>
          <div id="stat-completed-sub" class="text-xs text-emerald-400 mt-1">${completedToday === 0 ? 'None yet today' : 'Orders served today'}</div>
        </div>
      </div>

      <div class="card stat-card">
        <div class="stat-icon" style="background: rgba(59,130,246,0.2); color: var(--blue-400); display: flex; align-items: center; justify-content: center;">
          ${Icons.coins({ size: 24 })}
        </div>
        <div>
          <div class="text-xs text-dark-300 font-medium">TODAY'S REVENUE</div>
          <div id="stat-revenue-val" class="text-3xl font-bold text-white">₱${Number(todayRevenue).toFixed(2)}</div>
          <div id="stat-revenue-sub" class="text-xs text-blue-400 mt-1">${todayRevenue === 0 ? 'No sales yet today' : 'Total sales today'}</div>
        </div>
      </div>
    </div>

    <!-- Active Now Serving Banner Box -->
    <div id="active-serving-banner-box">
      ${renderActiveBannerHtml(activeOrder)}
    </div>

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

  if (isSearchFocused) {
    const newSearchInput = document.getElementById('queue-search');
    if (newSearchInput) {
      newSearchInput.focus();
      if (cursorSelectionStart !== null) {
        newSearchInput.setSelectionRange(cursorSelectionStart, cursorSelectionEnd);
      }
    }
  }
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

const ASSET_VERSION = '20261005_v3';

function getFreshImageUrl(url) {
  if (!url) return '';
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}v=${ASSET_VERSION}`;
}

function getProductImageUrl(name) {
  if (!name) return getFreshImageUrl('/images/hotspot_siomai.jpg');
  const n = String(name).toLowerCase();
  if (n.includes('siomai')) return getFreshImageUrl('/images/hotspot_siomai.jpg');
  if (n.includes('coke') || n.includes('coca')) return getFreshImageUrl('/images/coke.jpg');
  if (n.includes('royal')) return getFreshImageUrl('/images/royal.jpg');
  if (n.includes('sprite')) return getFreshImageUrl('/images/sprite.jpg');
  if (n.includes('chilli') || n.includes('chili')) return getFreshImageUrl('/images/chilli_garlic.jpg');
  if (n.includes('soy')) return getFreshImageUrl('/images/soy_sauce.jpg');
  if (n.includes('calamansi')) return getFreshImageUrl('/images/calamansi.jpg');
  return getFreshImageUrl('/images/hotspot_siomai.jpg');
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
            if (container) {
              container.innerHTML = renderOrderCards(state.queueData.orders || []);
              bindQueueCardActions();
            }
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
        <div style="margin-bottom: 8px; color: var(--brand-400);">${Icons.siomai({ size: 40, strokeWidth: 1.5 })}</div>
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
              <button class="btn btn-secondary btn-action-status flex items-center gap-1" data-id="${order.id}" data-status="preparing" style="font-size: 12px; padding: 4px 10px;">
                ${Icons.cook({ size: 14 })} Prepare
              </button>
            ` : order.status === 'preparing' ? `
              <button class="btn btn-secondary btn-action-status flex items-center gap-1" data-id="${order.id}" data-status="ready_pickup" style="font-size: 12px; padding: 4px 10px;">
                ${Icons.bellRing({ size: 14 })} Ready
              </button>
            ` : order.status === 'ready_pickup' || order.status === 'ready' ? `
              <button class="btn btn-success btn-action-status flex items-center gap-1" data-id="${order.id}" data-status="completed" style="font-size: 12px; padding: 4px 10px;">
                ${Icons.check({ size: 14 })} Complete
              </button>
            ` : ''}

            ${!['completed', 'delivered', 'cancelled'].includes(order.status) ? `
              <button class="btn btn-ghost text-red-400 btn-action-status flex items-center gap-1" data-id="${order.id}" data-status="cancelled" style="font-size: 12px; padding: 4px 8px;">
                ${Icons.xCircle({ size: 13 })} Cancel
              </button>
            ` : ''}
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function bindQueueCardActions() {
  document.querySelectorAll('.btn-action-status').forEach(btn => {
    btn.onclick = async (e) => {
      const orderId = e.currentTarget.getAttribute('data-id');
      const nextStatus = e.currentTarget.getAttribute('data-status');
      if (!orderId || !nextStatus) return;

      e.currentTarget.disabled = true;
      try {
        await api.updateOrderStatus(orderId, { status: nextStatus });
        showToast('success', 'Updated', `Order marked as ${nextStatus}`);
        await renderQueueTab(false);
      } catch (err) {
        showToast('error', 'Update Failed', err.message);
        e.currentTarget.disabled = false;
      }
    };
  });

  document.querySelectorAll('.btn-complete-order').forEach(btn => {
    btn.onclick = async (e) => {
      const id = e.currentTarget.getAttribute('data-id');
      if (!id) return;
      e.currentTarget.disabled = true;
      try {
        await api.updateOrderStatus(id, { status: 'completed' });
        showToast('success', 'Order Completed', 'Customer order fulfilled!');
        await renderQueueTab(false);
      } catch (err) {
        showToast('error', 'Failed', err.message);
        e.currentTarget.disabled = false;
      }
    };
  });

  document.querySelectorAll('.btn-buzz-order').forEach(btn => {
    btn.onclick = () => {
      playBeep();
      showToast('info', 'Calling Customer', 'Audible alert triggered for order!');
    };
  });
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
        if (container) {
          container.innerHTML = renderOrderCards(state.queueData.orders || []);
          bindQueueCardActions();
        }
      }
    });
  });

  const searchInput = document.getElementById('queue-search');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      state.searchQuery = e.target.value;
      state.queuePage = 1; // reset pagination when searching
      const container = document.getElementById('orders-container');
      if (container) {
        container.innerHTML = renderOrderCards(state.queueData.orders || []);
        bindQueueCardActions();
      }
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

  // Bind card and banner action buttons
  bindQueueCardActions();
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
          <h2 class="text-xl font-bold text-white flex items-center gap-2">
            ${Icons.plusCircle({ size: 20, color: 'var(--brand-400)' })} Create Walk-in Order
          </h2>
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

          <div id="gcash-qr-modal-preview" style="display: none; margin-bottom: 14px; padding: 12px; background: rgba(0, 125, 254, 0.08); border: 1px solid rgba(0, 125, 254, 0.3); border-radius: 12px; text-align: center;">
            <div style="font-size: 13px; font-weight: bold; color: #60a5fa; margin-bottom: 6px; display: flex; align-items: center; justify-content: center; gap: 6px;">
              <span>📱 Customer Scan to Pay via GCash QR</span>
            </div>
            <img src="/images/gcash_qr.png" alt="GCash QR" style="max-height: 200px; margin: 0 auto; border-radius: 10px; border: 2px solid #fff; box-shadow: 0 4px 12px rgba(0,0,0,0.3); display: block;" />
            <div style="font-size: 12px; color: #e2e8f0; font-weight: 600; margin-top: 8px;">
              Account: JO*N LL**D C. &bull; +63 921 296 &bull;&bull;&bull;&bull;
            </div>
            <div style="font-size: 11px; color: #94a3b8; margin-top: 2px;">
              Scan QR code with GCash App to transfer payment.
            </div>
          </div>

          <div>
            <label class="block text-xs text-dark-300 font-medium mb-2">Select Items</label>
            <div class="space-y-2" style="max-height: 250px; overflow-y: auto; padding-right: 4px;">
              ${products.map(p => {
                const isActive = p.is_active !== false;
                return `
                <div class="card-sm p-3 flex items-center justify-between" style="background: var(--dark-800); ${!isActive ? 'opacity: 0.55; border: 1px dashed rgba(239,68,68,0.3);' : ''}">
                  <div style="display: flex; align-items: center; gap: 10px; min-width: 0; flex: 1;">
                    ${p.image_url ? `<img src="${escapeHtml(getFreshImageUrl(p.image_url))}" alt="${escapeHtml(p.name)}" style="width: 36px; height: 36px; object-fit: cover; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1); flex-shrink: 0; ${!isActive ? 'filter: grayscale(100%);' : ''}" onerror="this.style.display='none'">` : ''}
                    <div style="min-width: 0; flex: 1;">
                      <div class="font-bold text-sm text-white flex items-center gap-2 truncate">
                        ${escapeHtml(p.name)}
                        ${!isActive ? '<span class="badge badge-red" style="font-size: 10px; padding: 1px 6px; flex-shrink: 0;">🚫 Disabled</span>' : ''}
                      </div>
                      <div class="text-xs text-brand-400 font-semibold">₱${Number(p.price).toFixed(2)}</div>
                    </div>
                  </div>
                  <div class="flex items-center gap-2" style="flex-shrink: 0; margin-left: 8px;">
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

  const custPaymentSelect = document.getElementById('order-cust-payment');
  const gcashModalPreview = document.getElementById('gcash-qr-modal-preview');
  if (custPaymentSelect && gcashModalPreview) {
    custPaymentSelect.addEventListener('change', () => {
      gcashModalPreview.style.display = custPaymentSelect.value === 'GCash' ? 'block' : 'none';
    });
  }

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
        <button id="btn-add-product" class="btn btn-primary flex items-center gap-1.5">
          ${Icons.plus({ size: 16 })} Add Product
        </button>
        <button id="btn-refresh-inv" class="btn btn-secondary flex items-center gap-1.5">
          ${Icons.refresh({ size: 15 })} Refresh
        </button>
      </div>
    </div>

    <!-- Inventory Stat Cards -->
    <div class="grid-4 mb-6">
      <div class="card stat-card">
        <div class="stat-icon" style="background: rgba(59,130,246,0.2); color: var(--blue-400); display: flex; align-items: center; justify-content: center;">
          ${Icons.package({ size: 24 })}
        </div>
        <div>
          <div class="text-xs text-dark-300 font-medium">TOTAL PRODUCTS</div>
          <div class="text-3xl font-bold text-white">${products.length}</div>
          <div class="text-xs text-blue-400 mt-1">Catalog items</div>
        </div>
      </div>

      <div class="card stat-card">
        <div class="stat-icon" style="background: rgba(16,185,129,0.2); color: var(--emerald-400); display: flex; align-items: center; justify-content: center;">
          ${Icons.checkCircle({ size: 24 })}
        </div>
        <div>
          <div class="text-xs text-dark-300 font-medium">ACTIVE FOR SALE</div>
          <div class="text-3xl font-bold text-emerald-400">${activeProducts.length}</div>
          <div class="text-xs text-emerald-400 mt-1">Visible to customers</div>
        </div>
      </div>

      <div class="card stat-card">
        <div class="stat-icon" style="background: rgba(239,68,68,0.2); color: var(--red-400); display: flex; align-items: center; justify-content: center;">
          ${Icons.xCircle({ size: 24 })}
        </div>
        <div>
          <div class="text-xs text-dark-300 font-medium">DISABLED / HIDDEN</div>
          <div class="text-3xl font-bold ${disabledProducts.length > 0 ? 'text-red-400' : 'text-white'}">${disabledProducts.length}</div>
          <div class="text-xs text-red-400 mt-1">Blocked from ordering</div>
        </div>
      </div>

      <div class="card stat-card">
        <div class="stat-icon" style="background: rgba(234,179,8,0.2); color: var(--yellow-400); display: flex; align-items: center; justify-content: center;">
          ${Icons.alert({ size: 24 })}
        </div>
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
                      ${p.image_url ? `<img src="${escapeHtml(getFreshImageUrl(p.image_url))}" alt="${escapeHtml(p.name)}" style="width: 38px; height: 38px; object-fit: cover; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1); ${!isActive ? 'filter: grayscale(80%); opacity: 0.65;' : ''}" onerror="this.style.display='none'">` : ''}
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
          <h2 class="text-xl font-bold text-white flex items-center gap-2">
            ${Icons.package({ size: 20, color: 'var(--brand-400)' })} Add New Product
          </h2>
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

  const totalRev = Number(desc.total_sales ?? desc.summary?.total_revenue ?? 0);
  const todayRev = Number(desc.summary?.today_sales ?? desc.summary?.today_revenue ?? 0);
  const cashRev = Number(desc.summary?.cash_revenue ?? (desc.channel_breakdown?.payment?.find(p => p.name === 'Cash')?.value ?? 0));
  const gcashRev = Number(desc.summary?.gcash_revenue ?? (desc.channel_breakdown?.payment?.find(p => p.name === 'GCash')?.value ?? 0));
  const totalOrders = Number(desc.total_orders ?? desc.summary?.total_orders ?? 0);
  const totalCompleted = Number(desc.total_completed ?? desc.summary?.total_completed ?? 0);
  const avgOrderVal = Number(desc.average_order_value ?? (totalCompleted > 0 ? totalRev / totalCompleted : (totalOrders > 0 ? totalRev / totalOrders : 0)));

  const topProducts = desc.top_products || [];
  const topRevenueProduct = topProducts.length > 0
    ? [...topProducts].sort((a, b) => (Number(b.revenue) || 0) - (Number(a.revenue) || 0))[0]
    : null;
  const topVolumeProduct = desc.top_selling_product?.name || (topProducts.length > 0 ? topProducts[0].name : (totalRev > 0 ? 'HotSpot Siomai' : 'No sales recorded yet'));
  const hasDbSales = totalRev > 0 || topProducts.length > 0;

  container.innerHTML = `
    <div class="flex flex-wrap items-center justify-between gap-4 mb-6">
      <div>
        <h1 class="text-2xl font-bold text-white">Revenue & Sales Analytics</h1>
        <p class="text-dark-300 text-sm">Real-time financial performance, revenue tracking & predictive demand</p>
      </div>
      <button id="btn-refresh-analytics" class="btn btn-secondary flex items-center gap-1.5">
        ${Icons.refresh({ size: 15 })} Refresh Data
      </button>
    </div>

    <!-- Database Connection & Revenue Status Banner -->
    ${hasDbSales ? `
      <div class="card p-4 mb-6 flex flex-wrap items-center justify-between gap-4" style="background: rgba(16,185,129,0.08); border: 1px solid rgba(16,185,129,0.3);">
        <div class="flex items-center gap-3">
          <div style="display:flex;align-items:center;justify-content:center;">${Icons.coins({ size: 26, color: 'var(--emerald-400)' })}</div>
          <div>
            <div class="text-sm font-semibold text-emerald-400">Live Database Connected (kevs_siomai)</div>
            <div class="text-xs text-dark-300">
              Accurately calculated from active database records. Reflecting <strong>₱${totalRev.toFixed(2)}</strong> total revenue (Cash: <strong>₱${cashRev.toFixed(2)}</strong> &bull; GCash: <strong>₱${gcashRev.toFixed(2)}</strong>) across <strong>${totalOrders} order(s)</strong>.
            </div>
          </div>
        </div>
        <span class="badge badge-success">● Synchronized with Database</span>
      </div>
    ` : `
      <div class="card p-4 mb-6 flex flex-wrap items-center justify-between gap-4" style="background: rgba(234,179,8,0.08); border: 1px solid rgba(234,179,8,0.3);">
        <div class="flex items-center gap-3">
          <div style="display:flex;align-items:center;justify-content:center;">${Icons.info({ size: 26, color: 'var(--yellow-400)' })}</div>
          <div>
            <div class="text-sm font-semibold text-yellow-400">Database Status: No Completed Sales Recorded Yet</div>
            <div class="text-xs text-dark-300">
              There are currently 0 completed sales transactions stored in the database. When customer orders are confirmed and served, your actual shop revenue, peak hours, and product volumes will dynamically appear here.
            </div>
          </div>
        </div>
        <span class="badge badge-warning">Awaiting Sales Data</span>
      </div>
    `}

    <!-- Primary Revenue Metric Cards -->
    <div class="grid-4 mb-6">
      <div class="card stat-card" style="border-left: 4px solid var(--emerald-500);">
        <div class="stat-icon" style="background: rgba(16,185,129,0.2); color: var(--emerald-400); display:flex;align-items:center;justify-content:center;">
          ${Icons.coins({ size: 24 })}
        </div>
        <div>
          <div class="text-xs text-dark-300 font-medium">TOTAL REVENUE</div>
          <div class="text-2xl font-bold text-white">₱${totalRev.toFixed(2)}</div>
          <div class="text-xs text-emerald-400 mt-1">${hasDbSales ? 'All-time shop sales' : 'No sales yet'}</div>
        </div>
      </div>

      <div class="card stat-card" style="border-left: 4px solid var(--blue-500);">
        <div class="stat-icon" style="background: rgba(59,130,246,0.2); color: var(--blue-400); display:flex;align-items:center;justify-content:center;">
          ${Icons.clock({ size: 24 })}
        </div>
        <div>
          <div class="text-xs text-dark-300 font-medium">TODAY'S REVENUE</div>
          <div class="text-2xl font-bold text-white">₱${todayRev.toFixed(2)}</div>
          <div class="text-xs text-blue-400 mt-1">${todayRev > 0 ? 'Earned today' : 'No sales today yet'}</div>
        </div>
      </div>

      <div class="card stat-card" style="border-left: 4px solid var(--brand-500);">
        <div class="stat-icon" style="background: rgba(249,115,22,0.2); color: var(--brand-400); display:flex;align-items:center;justify-content:center;">
          ${Icons.coins({ size: 24 })}
        </div>
        <div>
          <div class="text-xs text-dark-300 font-medium">CASH REVENUE</div>
          <div class="text-2xl font-bold text-white">₱${cashRev.toFixed(2)}</div>
          <div class="text-xs text-brand-400 mt-1">${totalRev > 0 ? Math.round((cashRev / totalRev) * 100) + '% of total revenue' : 'Cash payments'}</div>
        </div>
      </div>

      <div class="card stat-card" style="border-left: 4px solid var(--purple-500);">
        <div class="stat-icon" style="background: rgba(168,85,247,0.2); color: var(--purple-400); display:flex;align-items:center;justify-content:center;">
          ${Icons.coins({ size: 24 })}
        </div>
        <div>
          <div class="text-xs text-dark-300 font-medium">GCASH REVENUE</div>
          <div class="text-2xl font-bold text-white">₱${gcashRev.toFixed(2)}</div>
          <div class="text-xs text-purple-400 mt-1">${totalRev > 0 ? Math.round((gcashRev / totalRev) * 100) + '% of total revenue' : 'Digital payments'}</div>
        </div>
      </div>
    </div>

    <!-- Secondary Operational Cards -->
    <div class="grid-4 mb-6">
      <div class="card stat-card">
        <div class="stat-icon" style="background: rgba(59,130,246,0.2); color: var(--blue-400); display:flex;align-items:center;justify-content:center;">
          ${Icons.queue({ size: 24 })}
        </div>
        <div>
          <div class="text-xs text-dark-300 font-medium">TOTAL ORDERS</div>
          <div class="text-2xl font-bold text-white">${totalOrders}</div>
          <div class="text-xs text-blue-400 mt-1">${totalCompleted} completed / served</div>
        </div>
      </div>

      <div class="card stat-card">
        <div class="stat-icon" style="background: rgba(234,179,8,0.2); color: var(--yellow-400); display:flex;align-items:center;justify-content:center;">
          ${Icons.analytics({ size: 24 })}
        </div>
        <div>
          <div class="text-xs text-dark-300 font-medium">AVG ORDER VALUE</div>
          <div class="text-2xl font-bold text-white">₱${avgOrderVal.toFixed(2)}</div>
          <div class="text-xs text-yellow-400 mt-1">Average ticket size</div>
        </div>
      </div>

      <div class="card stat-card">
        <div class="stat-icon" style="background: rgba(16,185,129,0.2); color: var(--emerald-400); display:flex;align-items:center;justify-content:center;">
          ${Icons.star({ size: 24 })}
        </div>
        <div>
          <div class="text-xs text-dark-300 font-medium">TOP REVENUE ITEM</div>
          <div class="text-lg font-bold text-white truncate" style="max-width: 140px;" title="${topRevenueProduct ? escapeHtml(topRevenueProduct.name) : 'None'}">
            ${topRevenueProduct ? escapeHtml(topRevenueProduct.name) : 'None'}
          </div>
          <div class="text-xs text-emerald-400 mt-1">${topRevenueProduct ? '₱' + Number(topRevenueProduct.revenue).toFixed(2) + ' generated' : 'No sales yet'}</div>
        </div>
      </div>

      <div class="card stat-card">
        <div class="stat-icon" style="background: rgba(192,132,252,0.2); color: var(--purple-400); display:flex;align-items:center;justify-content:center;">
          ${Icons.package({ size: 24 })}
        </div>
        <div>
          <div class="text-xs text-dark-300 font-medium">TOP VOLUME SELLER</div>
          <div class="text-lg font-bold text-white truncate" style="max-width: 140px;" title="${escapeHtml(topVolumeProduct)}">
            ${escapeHtml(topVolumeProduct)}
          </div>
          <div class="text-xs text-purple-400 mt-1">${desc.top_selling_product?.quantity ? `${desc.top_selling_product.quantity} sold` : (hasDbSales ? 'Highest volume' : 'No sales yet')}</div>
        </div>
      </div>
    </div>

    <!-- Revenue Trend Chart (Full Width) -->
    <div class="card p-6 mb-6">
      <div class="flex flex-wrap items-center justify-between gap-4 mb-4">
        <div>
          <h3 class="text-base font-bold text-white flex items-center gap-2">
            <span>📈</span> Daily Revenue Timeline (Last 14 Days)
          </h3>
          <p class="text-xs text-dark-300">Daily shop earnings recorded from confirmed transactions</p>
        </div>
        <div class="flex items-center gap-3">
          <span class="text-xs font-semibold px-3 py-1 rounded-full" style="background: rgba(16,185,129,0.15); color: var(--emerald-400); border: 1px solid rgba(16,185,129,0.3);">
            Recorded Revenue: ₱${totalRev.toFixed(2)}
          </span>
        </div>
      </div>
      <div class="chart-container" style="height: 250px;">
        <canvas id="revenueChart"></canvas>
      </div>
    </div>

    <!-- Demand & Product Revenue Share Row -->
    <div class="grid-2 mb-6">
      <div class="card p-6">
        <h3 class="text-base font-bold text-white mb-4">📊 Peak Hours Demand Profile</h3>
        <div class="chart-container" style="height: 260px;">
          <canvas id="salesChart"></canvas>
        </div>
      </div>

      <div class="card p-6">
        <h3 class="text-base font-bold text-white mb-4">🥧 Product Revenue Contribution</h3>
        <div class="chart-container" style="height: 260px;">
          <canvas id="productChart"></canvas>
        </div>
      </div>
    </div>

    <!-- Product Revenue Breakdown Table -->
    <div class="card p-6 mb-6 overflow-hidden">
      <div class="flex items-center justify-between mb-4">
        <div>
          <h3 class="text-base font-bold text-white flex items-center gap-2">
            <span>🧾</span> Revenue by Product Breakdown
          </h3>
          <p class="text-xs text-dark-300">Detailed sales volume and revenue generated per menu item</p>
        </div>
        <span class="text-xs text-dark-300">${topProducts.length} item(s) sold</span>
      </div>

      <div style="overflow-x: auto;">
        <table style="width: 100%; border-collapse: collapse; text-align: left;">
          <thead>
            <tr style="border-bottom: 1px solid var(--dark-600); color: var(--dark-400); font-size: 12px; text-transform: uppercase;">
              <th class="py-3 px-4">Menu Item</th>
              <th class="py-3 px-4 text-center">Units Sold</th>
              <th class="py-3 px-4 text-right">Revenue Generated</th>
              <th class="py-3 px-4 text-center">Revenue Share</th>
              <th class="py-3 px-4 text-center">Status</th>
            </tr>
          </thead>
          <tbody>
            ${topProducts.length > 0 ? topProducts.map(p => {
              const pRev = Number(p.revenue || 0);
              const pQty = Number(p.quantity || 0);
              const sharePct = totalRev > 0 ? Math.round((pRev / totalRev) * 100) : 0;
              const isTop = topRevenueProduct && topRevenueProduct.name === p.name && pRev > 0;

              return `
                <tr style="border-bottom: 1px solid var(--dark-600); font-size: 14px;">
                  <td class="py-3 px-4 font-bold text-white">
                    <div style="display: flex; align-items: center; gap: 8px;">
                      <span>${pRev > 0 ? '🥟' : '🥢'}</span>
                      <span>${escapeHtml(p.name)}</span>
                    </div>
                  </td>
                  <td class="py-3 px-4 text-center text-dark-200 font-semibold">${pQty} pcs</td>
                  <td class="py-3 px-4 text-right font-bold text-emerald-400">₱${pRev.toFixed(2)}</td>
                  <td class="py-3 px-4 text-center">
                    <div style="display: flex; align-items: center; justify-content: center; gap: 6px;">
                      <div style="width: 60px; height: 6px; background: rgba(255,255,255,0.1); border-radius: 999px; overflow: hidden;">
                        <div style="width: ${sharePct}%; height: 100%; background: var(--emerald-500); border-radius: 999px;"></div>
                      </div>
                      <span class="text-xs text-dark-300 font-semibold">${sharePct}%</span>
                    </div>
                  </td>
                  <td class="py-3 px-4 text-center">
                    ${isTop ? '<span class="badge badge-success" style="font-size: 11px;">👑 Top Earner</span>' : (pRev > 0 ? '<span class="badge" style="background: rgba(59,130,246,0.15); color: var(--blue-400); font-size: 11px;">Active</span>' : '<span class="badge" style="background: rgba(148,163,184,0.15); color: #94a3b8; font-size: 11px;">Add-on</span>')}
                  </td>
                </tr>
              `;
            }).join('') : `
              <tr>
                <td colspan="5" class="py-6 text-center text-dark-400 text-sm">
                  No completed product sales recorded in the database yet.
                </td>
              </tr>
            `}
          </tbody>
        </table>
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
          <div class="text-xl font-bold text-white">
            ${pred.predicted_sales && Number(pred.predicted_sales) > 0
              ? `~₱${Number(pred.predicted_sales).toFixed(2)}`
              : (totalRev > 0 ? `~₱${totalRev.toFixed(2)}` : 'Awaiting Data')}
          </div>
          <div class="text-xs text-dark-300 mt-1">
            ${pred.predicted_sales && Number(pred.predicted_sales) > 0
              ? `Expected ${pred.predicted_orders ?? 1} orders`
              : (totalRev > 0 ? `Based on initial ${totalOrders} order(s)` : 'Requires 3+ days for ML')}
          </div>
        </div>

        <div class="p-4 rounded-xl" style="background: rgba(0,0,0,0.3);">
          <div class="text-xs text-yellow-400 font-semibold mb-1">⏰ ESTIMATED PEAK HOURS</div>
          <div class="text-xl font-bold text-white">
            ${desc.peak_hours && desc.peak_hours.some(h => h.orders > 0)
              ? desc.peak_hours.filter(h => h.orders > 0).map(h => h.label).slice(0, 2).join(' • ')
              : '11:00 AM • 6:00 PM'}
          </div>
          <div class="text-xs text-dark-300 mt-1">
            ${desc.peak_hours && desc.peak_hours.some(h => h.orders > 0)
              ? 'Based on customer order timestamps'
              : 'Typical lunch & dinner rush window'}
          </div>
        </div>

        <div class="p-4 rounded-xl" style="background: rgba(0,0,0,0.3);">
          <div class="text-xs text-emerald-400 font-semibold mb-1">🥟 PREPARATION ADVICE</div>
          <div class="text-base font-bold text-white">
            ${topVolumeProduct && topVolumeProduct !== 'No sales recorded yet'
              ? `Pre-steam ${escapeHtml(topVolumeProduct)}`
              : 'Prepare standard inventory'}
          </div>
          <div class="text-xs text-dark-300 mt-1">
            ${topVolumeProduct && topVolumeProduct !== 'No sales recorded yet'
              ? 'Highest demand item in your shop'
              : 'Maintain safety stock for walk-ins'}
          </div>
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
  if (state.charts.revenue) state.charts.revenue.destroy();
  if (state.charts.sales) state.charts.sales.destroy();
  if (state.charts.products) state.charts.products.destroy();

  // 1. Revenue Timeline Chart
  const revenueCanvas = document.getElementById('revenueChart');
  if (revenueCanvas) {
    const rawLabels = desc.daily_sales?.labels || [];
    const rawData = desc.daily_sales?.data || [];

    // Slice last 14 days for optimal readability
    const displayLabels = rawLabels.slice(-14).map(l => {
      try {
        const parts = l.split('-');
        if (parts.length === 3) {
          const mNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
          return `${mNames[parseInt(parts[1], 10) - 1]} ${parseInt(parts[2], 10)}`;
        }
      } catch (e) {}
      return l;
    });
    const displayData = rawData.slice(-14);

    const ctx = revenueCanvas.getContext('2d');
    let gradient = null;
    if (ctx) {
      gradient = ctx.createLinearGradient(0, 0, 0, 240);
      gradient.addColorStop(0, 'rgba(16, 185, 129, 0.35)');
      gradient.addColorStop(1, 'rgba(16, 185, 129, 0.0)');
    }

    state.charts.revenue = new Chart(revenueCanvas, {
      type: 'line',
      data: {
        labels: displayLabels.length > 0 ? displayLabels : ['No Data'],
        datasets: [{
          label: 'Revenue (₱)',
          data: displayData.length > 0 ? displayData : [0],
          borderColor: '#10b981',
          borderWidth: 2.5,
          backgroundColor: gradient || 'rgba(16, 185, 129, 0.1)',
          fill: true,
          tension: 0.3,
          pointBackgroundColor: '#10b981',
          pointBorderColor: '#ffffff',
          pointBorderWidth: 1.5,
          pointHoverRadius: 6,
          pointRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (context) => ` Revenue: ₱${Number(context.raw || 0).toFixed(2)}`
            }
          }
        },
        scales: {
          x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8' } },
          y: {
            beginAtZero: true,
            ticks: {
              color: '#94a3b8',
              callback: (value) => `₱${value}`
            },
            grid: { color: 'rgba(255,255,255,0.05)' }
          }
        }
      }
    });
  }

  // 2. Sales Chart from Peak Hours or Daily Sales
  const salesCanvas = document.getElementById('salesChart');
  if (salesCanvas) {
    let hours = [];
    let salesData = [];

    if (desc.peak_hours && desc.peak_hours.length > 0) {
      // Filter shop operating hours (7am to 10pm)
      const filteredHours = desc.peak_hours.filter(h => h.hour >= 7 && h.hour <= 22);
      hours = filteredHours.map(h => h.label);
      salesData = filteredHours.map(h => h.orders);
    } else {
      hours = ['08:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00', '22:00'];
      salesData = [0, 0, 0, 0, 0, 0, 0, 0];
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
          y: { 
            beginAtZero: true,
            ticks: { color: '#94a3b8', stepSize: 1 }, 
            grid: { color: 'rgba(255,255,255,0.05)' } 
          }
        }
      }
    });
  }

  // 3. Product Revenue Share Chart
  const productCanvas = document.getElementById('productChart');
  if (productCanvas) {
    let labels = [];
    let revValues = [];
    let bgColors = ['#10b981', '#3b82f6', '#f97316', '#a855f7', '#eab308', '#ec4899', '#06b6d4'];

    const topProductsWithRev = (desc.top_products || []).filter(p => Number(p.revenue || 0) > 0);

    if (topProductsWithRev.length > 0) {
      labels = topProductsWithRev.map(p => `${p.name} (₱${Number(p.revenue).toFixed(2)})`);
      revValues = topProductsWithRev.map(p => Number(p.revenue));
    } else if (desc.top_products && desc.top_products.length > 0) {
      labels = desc.top_products.map(p => `${p.name} (${p.quantity} sold)`);
      revValues = desc.top_products.map(p => p.quantity);
    } else {
      labels = ['No Completed Sales Recorded'];
      revValues = [1];
      bgColors = ['rgba(148, 163, 184, 0.2)'];
    }

    state.charts.products = new Chart(productCanvas, {
      type: 'doughnut',
      data: {
        labels: labels,
        datasets: [{
          data: revValues,
          backgroundColor: bgColors.slice(0, revValues.length),
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { color: '#94a3b8', boxWidth: 12 } },
          tooltip: {
            callbacks: {
              label: (context) => ` ${context.label}`
            }
          }
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
            ${Icons.hardware({ size: 18, color: 'var(--emerald-400)' })} SSD1306 Virtual OLED Screen (128x64)
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
          <button id="btn-sim-press-walkin" class="btn btn-primary flex-1 justify-center flex items-center gap-1.5">
            ${Icons.plusCircle({ size: 16 })} Press Walk-in Ticket Button
          </button>
          <button id="btn-sim-call-next" class="btn btn-success flex-1 justify-center flex items-center gap-1.5">
            ${Icons.bullhorn({ size: 16 })} Call Next Ticket
          </button>
          <button id="btn-sim-beep" class="btn btn-secondary justify-center flex items-center gap-1.5">
            ${Icons.bellRing({ size: 16 })} Test Buzzer
          </button>
        </div>
      </div>

      <!-- ESP32 Serial Monitor Log -->
      <div class="card p-6">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-base font-bold text-white flex items-center gap-2">
            ${Icons.hardware({ size: 18, color: 'var(--blue-400)' })} ESP32 UART Serial Monitor (115200 baud)
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
          <div style="width: 56px; height: 56px; border-radius: 16px; background: rgba(16, 185, 129, 0.2); border: 1px solid rgba(16, 185, 129, 0.4); display: flex; align-items: center; justify-content: center; color: var(--emerald-400);">
            ${Icons.shield({ size: 30, color: 'var(--emerald-400)' })}
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
          <button id="btn-refresh-waf" class="btn btn-secondary flex items-center gap-1.5">
            ${Icons.refresh({ size: 15 })} Refresh Status
          </button>
        </div>
      </div>
    </div>

    <!-- 4 Firewall Stat Metrics -->
    <div class="grid-4 mb-6">
      <div class="card stat-card">
        <div class="stat-icon" style="background: rgba(59,130,246,0.2); color: var(--blue-400); display: flex; align-items: center; justify-content: center;">
          ${Icons.analytics({ size: 24 })}
        </div>
        <div>
          <div class="text-xs text-dark-300 font-medium">REQUESTS SCANNED</div>
          <div class="text-3xl font-bold text-white">${stats.total_scanned || 0}</div>
          <div class="text-xs text-blue-400 mt-1">Full DPI inspection</div>
        </div>
      </div>

      <div class="card stat-card">
        <div class="stat-icon" style="background: rgba(239,68,68,0.2); color: var(--red-400); display: flex; align-items: center; justify-content: center;">
          ${Icons.xCircle({ size: 24 })}
        </div>
        <div>
          <div class="text-xs text-dark-300 font-medium">THREATS INTERCEPTED</div>
          <div class="text-3xl font-bold text-red-400">${stats.total_blocked || 0}</div>
          <div class="text-xs text-red-400 mt-1">HTTP 403 Forbidden</div>
        </div>
      </div>

      <div class="card stat-card">
        <div class="stat-icon" style="background: rgba(234,179,8,0.2); color: var(--yellow-400); display: flex; align-items: center; justify-content: center;">
          ${Icons.shield({ size: 24 })}
        </div>
        <div>
          <div class="text-xs text-dark-300 font-medium">BANNED ATTACKER IPS</div>
          <div class="text-3xl font-bold text-white">${(stats.banned_ips_count || 0) + (stats.blacklisted_ips_count || 0)}</div>
          <div class="text-xs text-yellow-400 mt-1">Jailed in auto-quarantine</div>
        </div>
      </div>

      <div class="card stat-card">
        <div class="stat-icon" style="background: rgba(16,185,129,0.2); color: var(--emerald-400); display: flex; align-items: center; justify-content: center;">
          ${Icons.checkCircle({ size: 24 })}
        </div>
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
        ${Icons.hardware({ size: 16, color: 'var(--amber-400)' })} Active Inspection Engines
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

// ==============================================================================
// 6. CUSTOMER REVIEWS & STORE FEEDBACK (HTML & JS)
// ==============================================================================
async function renderReviewsTab() {
  const container = document.getElementById('tab-content');
  if (!container) return;

  container.innerHTML = `
    <div class="space-y-6 animate-fade-in">
      <!-- Top Title and Bar -->
      <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 class="text-2xl font-black text-white flex items-center gap-3">
            <span class="flex items-center gap-2">${Icons.star({ size: 22, color: '#f59e0b' })} Customer Reviews & Feedback</span>
            <span id="reviews-count-badge" class="badge badge-amber font-mono text-sm px-2.5 py-1">0 reviews</span>
          </h2>
          <p class="text-dark-300 text-sm mt-1">
            Real customer ratings submitted from the mobile app. View reviews, post official store replies, and toggle public visibility.
          </p>
        </div>

        <div class="flex items-center gap-3 w-full sm:w-auto">
          <button id="btn-refresh-reviews" class="btn btn-secondary flex items-center gap-2">
            ${Icons.refresh({ size: 16 })} <span>Refresh</span>
          </button>
          <button id="btn-clear-reviews" class="btn btn-danger flex items-center gap-2" title="Clear all customer reviews">
            ${Icons.trash({ size: 16 })} <span>Clear All Reviews</span>
          </button>
        </div>
      </div>

      <!-- Stats Metric Cards -->
      <div id="reviews-stats-container" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <!-- Rendered dynamically -->
      </div>

      <!-- Filters & Search Toolbar -->
      <div class="card p-4 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        <!-- Status Filter Pills -->
        <div class="flex flex-wrap items-center gap-2" id="reviews-status-filter">
          <button class="filter-pill ${state.reviewsFilter === 'all' ? 'active' : ''}" data-filter="all">
            All Reviews
          </button>
          <button class="filter-pill ${state.reviewsFilter === 'active' ? 'active' : ''}" data-filter="active">
            <span class="inline-block w-2 h-2 rounded-full bg-emerald-400 mr-1.5"></span>Active (Visible)
          </button>
          <button class="filter-pill ${state.reviewsFilter === 'disabled' ? 'active' : ''}" data-filter="disabled">
            <span class="inline-block w-2 h-2 rounded-full bg-red-400 mr-1.5"></span>Disabled (Hidden)
          </button>
          <button class="filter-pill ${state.reviewsFilter === 'replied' ? 'active' : ''}" data-filter="replied">
            ${Icons.message({ size: 13, className: 'mr-1' })} Replied
          </button>
          <button class="filter-pill ${state.reviewsFilter === 'pending_reply' ? 'active' : ''}" data-filter="pending_reply">
            ${Icons.clock({ size: 13, className: 'mr-1' })} Needs Reply
          </button>
        </div>

        <!-- Rating Filter & Search -->
        <div class="flex items-center gap-3">
          <select id="reviews-star-select" class="form-input" style="width: auto; padding: 6px 12px; font-size: 13px;">
            <option value="all">★ All Star Ratings</option>
            <option value="5" ${state.reviewsStarFilter === '5' ? 'selected' : ''}>★★★★★ (5 Stars)</option>
            <option value="4" ${state.reviewsStarFilter === '4' ? 'selected' : ''}>★★★★☆ (4 Stars)</option>
            <option value="3" ${state.reviewsStarFilter === '3' ? 'selected' : ''}>★★★☆☆ (3 Stars)</option>
            <option value="2" ${state.reviewsStarFilter === '2' ? 'selected' : ''}>★★☆☆☆ (2 Stars)</option>
            <option value="1" ${state.reviewsStarFilter === '1' ? 'selected' : ''}>★☆☆☆☆ (1 Star)</option>
          </select>

          <input
            type="text"
            id="reviews-search-input"
            class="form-input"
            placeholder="Search comment or customer..."
            value="${escapeHtml(state.reviewsSearchQuery || '')}"
            style="width: 220px; padding: 6px 12px; font-size: 13px;"
          />
        </div>
      </div>

      <!-- Reviews Feed List -->
      <div id="reviews-list-container" class="space-y-4">
        <div class="text-center py-12 text-dark-300">
          <div class="mb-2 text-brand-400 flex justify-center">${Icons.spinner({ size: 28 })}</div>
          Loading reviews...
        </div>
      </div>
    </div>
  `;

  bindReviewsToolbarEvents();
  await loadAndDisplayReviews();
}

function bindReviewsToolbarEvents() {
  const refreshBtn = document.getElementById('btn-refresh-reviews');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', async () => {
      refreshBtn.disabled = true;
      refreshBtn.innerHTML = `${Icons.spinner({ size: 14 })} <span>Refreshing...</span>`;
      await loadAndDisplayReviews();
      refreshBtn.disabled = false;
      refreshBtn.innerHTML = `${Icons.refresh({ size: 16 })} <span>Refresh</span>`;
      showToast('info', 'Reviews Refreshed', 'Loaded latest customer reviews.');
    });
  }

  // Clear All Reviews
  const clearBtn = document.getElementById('btn-clear-reviews');
  if (clearBtn) {
    clearBtn.addEventListener('click', async () => {
      const currentCount = state.reviewsData?.stats?.total_all || 0;
      if (currentCount === 0) {
        showToast('info', 'Reviews Empty', 'There are no reviews to clear.');
        return;
      }
      if (!confirm(`Are you sure you want to permanently clear all ${currentCount} customer reviews?`)) return;
      clearBtn.disabled = true;
      clearBtn.innerHTML = `${Icons.spinner({ size: 14 })} <span>Clearing...</span>`;
      try {
        const res = await api.clearAllReviews();
        showToast('success', 'Reviews Cleared', res.data?.message || 'All reviews have been removed.');
        await loadAndDisplayReviews();
      } catch (err) {
        showToast('error', 'Clear Failed', err.message);
      } finally {
        clearBtn.disabled = false;
        clearBtn.innerHTML = `${Icons.trash({ size: 16 })} <span>Clear All Reviews</span>`;
      }
    });
  }

  // Status Filter Pills
  document.querySelectorAll('#reviews-status-filter .filter-pill').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const f = e.currentTarget.getAttribute('data-filter');
      state.reviewsFilter = f;
      document.querySelectorAll('#reviews-status-filter .filter-pill').forEach(b => b.classList.remove('active'));
      e.currentTarget.classList.add('active');
      renderReviewsList();
    });
  });

  // Star Select
  const starSelect = document.getElementById('reviews-star-select');
  if (starSelect) {
    starSelect.addEventListener('change', (e) => {
      state.reviewsStarFilter = e.target.value;
      renderReviewsList();
    });
  }

  // Search Input
  const searchInput = document.getElementById('reviews-search-input');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      state.reviewsSearchQuery = e.target.value.toLowerCase();
      renderReviewsList();
    });
  }
}

async function loadAndDisplayReviews() {
  try {
    const res = await api.getReviews(true);
    state.reviewsData = res.data || { reviews: [], stats: {} };
    renderReviewsStats();
    renderReviewsList();
  } catch (err) {
    console.error('Failed to load reviews:', err);
    showToast('error', 'Reviews Error', 'Could not load reviews: ' + err.message);
    const listContainer = document.getElementById('reviews-list-container');
    if (listContainer) {
      listContainer.innerHTML = `
        <div class="card p-8 text-center text-red-400">
          ⚠️ Failed to load customer reviews. Please check backend connection.
        </div>
      `;
    }
  }
}

function renderReviewsStats() {
  const stats = state.reviewsData?.stats || {};
  const container = document.getElementById('reviews-stats-container');
  const countBadge = document.getElementById('reviews-count-badge');
  if (countBadge) {
    countBadge.textContent = `${stats.total_all ?? 0} reviews`;
  }
  if (!container) return;

  const avg = stats.average_rating ? Number(stats.average_rating).toFixed(1) : '0.0';
  const breakdown = stats.rating_breakdown || { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  const total = stats.total_all || 0;
  const activeCount = stats.total_reviews || 0;
  const disabledCount = stats.total_disabled || 0;

  const reviews = state.reviewsData?.reviews || [];
  const repliedCount = reviews.filter(r => r.reply && r.reply.trim().length > 0).length;
  const responsePct = total > 0 ? Math.round((repliedCount / total) * 100) : 0;

  const fullStars = Math.round(Number(avg));
  const starsGoldHtml = '★'.repeat(fullStars) + '☆'.repeat(5 - fullStars);

  container.innerHTML = `
    <!-- Card 1: Average Rating -->
    <div class="card p-5 border-l-4" style="border-left-color: #f59e0b;">
      <div class="text-xs font-bold text-dark-300 uppercase tracking-wider">Average Rating</div>
      <div class="flex items-baseline gap-3 mt-2">
        <span class="text-4xl font-black text-amber-400">${avg}</span>
        <span class="text-lg text-amber-400 tracking-wider">${starsGoldHtml}</span>
        <span class="text-xs text-dark-300">/ 5.0</span>
      </div>
      <div class="text-xs text-dark-400 mt-2">
        Across ${activeCount} active customer review(s)
      </div>
    </div>

    <!-- Card 2: Rating Breakdown -->
    <div class="card p-5 border-l-4" style="border-left-color: var(--brand-500);">
      <div class="text-xs font-bold text-dark-300 uppercase tracking-wider mb-2">Rating Distribution</div>
      <div class="space-y-1.5" style="font-size: 11px;">
        ${[5, 4, 3, 2, 1].map(stars => {
          const count = breakdown[stars] || 0;
          const pct = total > 0 ? Math.round((count / total) * 100) : 0;
          return `
            <div class="flex items-center gap-2">
              <span class="w-8 font-mono text-dark-300">${stars}★</span>
              <div class="rating-bar-track flex-1" style="height: 6px; background: var(--dark-600); border-radius: 999px; overflow: hidden;">
                <div style="width: ${pct}%; height: 100%; background: #f59e0b; border-radius: 999px;"></div>
              </div>
              <span class="w-6 text-right font-mono text-dark-300">${count}</span>
            </div>
          `;
        }).join('')}
      </div>
    </div>

    <!-- Card 3: Response Rate -->
    <div class="card p-5 border-l-4" style="border-left-color: var(--emerald-500);">
      <div class="text-xs font-bold text-dark-300 uppercase tracking-wider">Store Response Rate</div>
      <div class="flex items-baseline gap-2 mt-2">
        <span class="text-3xl font-black text-emerald-400">${responsePct}%</span>
        <span class="text-xs text-dark-300 font-medium">(${repliedCount}/${total} replied)</span>
      </div>
      <div class="text-xs text-dark-400 mt-2">
        Replying builds customer loyalty and trust
      </div>
    </div>

    <!-- Card 4: Moderation Overview -->
    <div class="card p-5 border-l-4" style="border-left-color: ${disabledCount > 0 ? 'var(--red-500)' : 'var(--emerald-500)'};">
      <div class="text-xs font-bold text-dark-300 uppercase tracking-wider">Visibility Status</div>
      <div class="flex items-center gap-4 mt-2">
        <div>
          <span class="text-2xl font-black text-emerald-400">${activeCount}</span>
          <div class="text-xs text-dark-400">Public</div>
        </div>
        <div style="border-left: 1px solid var(--dark-600); height: 28px;"></div>
        <div>
          <span class="text-2xl font-black ${disabledCount > 0 ? 'text-red-400' : 'text-dark-400'}">${disabledCount}</span>
          <div class="text-xs text-dark-400">Disabled</div>
        </div>
      </div>
      <div class="text-xs text-dark-400 mt-2">
        Disabled reviews are hidden from customer app
      </div>
    </div>
  `;
}

function renderReviewsList() {
  const container = document.getElementById('reviews-list-container');
  if (!container) return;

  const rawReviews = state.reviewsData?.reviews || [];
  const filter = state.reviewsFilter || 'all';
  const starFilter = state.reviewsStarFilter || 'all';
  const query = state.reviewsSearchQuery || '';

  let filtered = rawReviews.filter(r => {
    if (filter === 'active' && r.is_disabled) return false;
    if (filter === 'disabled' && !r.is_disabled) return false;
    if (filter === 'replied' && (!r.reply || !r.reply.trim())) return false;
    if (filter === 'pending_reply' && (r.reply && r.reply.trim())) return false;

    if (starFilter !== 'all' && String(r.rating) !== String(starFilter)) return false;

    if (query) {
      const matchName = (r.customer_name || '').toLowerCase().includes(query);
      const matchComment = (r.comment || '').toLowerCase().includes(query);
      const matchReply = (r.reply || '').toLowerCase().includes(query);
      if (!matchName && !matchComment && !matchReply) return false;
    }

    return true;
  });

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="card p-12 text-center text-dark-300">
        <div class="mb-3 text-amber-400 flex justify-center">${Icons.star({ size: 44, color: '#f59e0b' })}</div>
        <h3 class="text-lg font-bold text-white mb-1">No Reviews Found</h3>
        <p class="text-sm text-dark-400 max-w-md mx-auto">
          ${query || filter !== 'all' || starFilter !== 'all' 
            ? 'No customer reviews match your active filter settings. Try adjusting the search or filters.'
            : 'No reviews have been submitted yet. Customer reviews submitted from the mobile app will appear here.'}
        </p>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(review => {
    const starsHtml = '★'.repeat(review.rating) + '☆'.repeat(5 - review.rating);
    const hasReply = Boolean(review.reply && review.reply.trim());
    const isEditing = state.reviewReplyingId === review.id;
    const initial = (review.customer_name || 'C').charAt(0).toUpperCase();

    return `
      <div class="card p-6 review-card ${review.is_disabled ? 'opacity-85 border-red-900/50' : ''}" id="review-card-${review.id}">
        <!-- Review Card Header -->
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-dark-600">
          <div class="flex items-center gap-3">
            <div class="avatar-circle w-10 h-10 rounded-full flex items-center justify-center font-bold text-white shadow-sm"
                 style="background: linear-gradient(135deg, ${review.is_disabled ? '#64748b, #334155' : '#ea580c, #c2410c'});">
              ${initial}
            </div>
            <div>
              <div class="flex items-center gap-2 flex-wrap">
                <span class="font-bold text-white text-base">${escapeHtml(review.customer_name || 'Anonymous Customer')}</span>
                ${review.customer_phone ? `<span class="text-xs text-dark-400 font-mono">(${escapeHtml(review.customer_phone)})</span>` : ''}
                ${review.order_id ? `<span class="badge badge-gray text-xs">Order #${review.order_id}</span>` : ''}
              </div>
              <div class="text-xs text-dark-400 mt-0.5 flex items-center gap-1.5">
                ${Icons.calendar({ size: 12, className: 'text-dark-400' })}
                <span>${escapeHtml(review.formatted_date || formatOrderDate(review.created_at))}</span>
              </div>
            </div>
          </div>

          <!-- Status Badge & Controls -->
          <div class="flex items-center gap-2">
            ${review.is_disabled
              ? `<span class="badge badge-red font-bold text-xs px-2.5 py-1 flex items-center gap-1.5">
                   <span class="w-1.5 h-1.5 rounded-full bg-red-400"></span>
                   <span>Disabled</span>
                   <span class="text-[10px] text-red-200">(Hidden from App)</span>
                 </span>`
              : `<span class="badge badge-green font-bold text-xs px-2.5 py-1 flex items-center gap-1.5">
                   <span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                   <span>Active</span>
                   <span class="text-[10px] text-emerald-200">(Visible to App)</span>
                 </span>`
            }
          </div>
        </div>

        <!-- Rating & Comment Section -->
        <div class="py-4 space-y-2">
          <div class="flex items-center gap-2">
            <span class="text-xl text-amber-400 tracking-wider font-mono">${starsHtml}</span>
            <span class="text-sm font-black text-amber-400 px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/30">
              ${review.rating}.0 / 5
            </span>
          </div>

          <div class="text-sm text-dark-100 leading-relaxed mt-2" style="font-size: 14.5px;">
            ${review.comment && review.comment.trim()
              ? `"${escapeHtml(review.comment)}"`
              : `<span class="italic text-dark-400">(No written comment — customer submitted a ${review.rating}-star rating only)</span>`
            }
          </div>
        </div>

        <!-- Store Owner Reply Display (if exists) -->
        ${hasReply && !isEditing ? `
          <div class="mt-3 p-4 rounded-xl bg-orange-950/20 border border-orange-700/30 text-sm space-y-1 relative">
            <div class="flex items-center justify-between text-xs text-brand-400 font-bold">
              <span class="flex items-center gap-1.5">
                <span class="flex items-center gap-1">${Icons.siomai({ size: 14, strokeWidth: 2.2, color: 'var(--brand-400)' })} Official Store Reply</span>
                <span class="text-dark-400 font-normal">• ${review.replied_at ? formatOrderDate(review.replied_at) : 'Recently'}</span>
              </span>
              <button class="btn btn-ghost btn-edit-reply text-xs py-0.5 px-2 text-brand-300 hover:text-brand-200 flex items-center gap-1" data-id="${review.id}">
                ${Icons.edit({ size: 12 })} <span>Edit Reply</span>
              </button>
            </div>
            <p class="text-dark-100 text-sm italic pl-2 border-l-2 border-brand-500 mt-1">
              "${escapeHtml(review.reply)}"
            </p>
          </div>
        ` : ''}

        <!-- Inline Reply Form (when active) -->
        ${isEditing ? `
          <div class="mt-4 p-4 rounded-xl card-sm border border-brand-500/40 bg-dark-800 space-y-3">
            <div class="flex items-center justify-between text-xs font-bold text-brand-400">
              <span class="flex items-center gap-1.5">${Icons.message({ size: 14 })} <span>${hasReply ? 'Edit Official Store Reply' : 'Write Reply to Customer'}</span></span>
              <span class="text-dark-400 font-normal">Customer will see this response in the mobile app</span>
            </div>
            <textarea
              id="reply-input-${review.id}"
              class="form-input w-full text-sm"
              rows="3"
              placeholder="Write a polite, helpful reply to ${escapeHtml(review.customer_name || 'customer')}..."
              style="resize: vertical;"
            >${escapeHtml(review.reply || '')}</textarea>
            <div class="flex items-center justify-end gap-2">
              <button class="btn btn-secondary btn-cancel-reply text-xs px-3 py-1.5" data-id="${review.id}">
                Cancel
              </button>
              <button class="btn btn-primary btn-submit-reply text-xs px-4 py-1.5 flex items-center gap-1.5" data-id="${review.id}">
                ${Icons.save({ size: 13 })} <span>Save & Publish Reply</span>
              </button>
            </div>
          </div>
        ` : ''}

        <!-- Bottom Action Buttons -->
        <div class="mt-4 pt-3 border-t border-dark-600/70 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div class="text-dark-400 font-mono">
            Review #${review.id}
          </div>

          <div class="flex items-center gap-2">
            ${!isEditing ? `
              <button class="btn btn-secondary btn-toggle-reply text-xs py-1.5 px-3 flex items-center gap-1.5" data-id="${review.id}">
                ${Icons.message({ size: 13 })} <span>${hasReply ? 'Reply Again' : 'Reply to Review'}</span>
              </button>
            ` : ''}

            <!-- Disable / Enable Toggle Button -->
            <button
              class="btn ${review.is_disabled ? 'btn-success' : 'btn-danger'} btn-toggle-disable text-xs py-1.5 px-3 flex items-center gap-1.5"
              data-id="${review.id}"
              data-disabled="${review.is_disabled ? 'true' : 'false'}"
              title="${review.is_disabled ? 'Enable and make review visible to public' : 'Disable and hide review from public'}"
            >
              ${review.is_disabled ? `${Icons.checkCircle({ size: 13 })} <span>Enable Review</span>` : `${Icons.ban({ size: 13 })} <span>Disable Review</span>`}
            </button>

            <!-- Delete Review Button -->
            <button
              class="btn btn-ghost text-red-400 hover:text-red-300 btn-delete-review text-xs py-1.5 px-2.5 flex items-center gap-1"
              data-id="${review.id}"
              title="Delete this review permanently"
            >
              ${Icons.trash({ size: 13 })} <span>Delete</span>
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  bindReviewActionEvents();
}

function bindReviewActionEvents() {
  // Toggle Disable/Enable
  document.querySelectorAll('.btn-toggle-disable').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = e.currentTarget.getAttribute('data-id');
      const isCurrentlyDisabled = e.currentTarget.getAttribute('data-disabled') === 'true';
      const targetState = !isCurrentlyDisabled;

      e.currentTarget.disabled = true;
      e.currentTarget.innerHTML = `${Icons.spinner({ size: 13 })} <span>Updating...</span>`;

      try {
        await api.toggleReviewStatus(id, targetState);
        const actionLabel = targetState ? 'disabled and hidden from mobile app' : 'enabled and visible to customers';
        showToast('success', targetState ? 'Review Disabled' : 'Review Enabled', `Review #${id} is now ${actionLabel}.`);
        await loadAndDisplayReviews();
      } catch (err) {
        showToast('error', 'Status Update Failed', err.message);
        e.currentTarget.disabled = false;
        e.currentTarget.innerHTML = isCurrentlyDisabled 
          ? `${Icons.checkCircle({ size: 13 })} <span>Enable Review</span>` 
          : `${Icons.ban({ size: 13 })} <span>Disable Review</span>`;
      }
    });
  });

  // Delete Individual Review
  document.querySelectorAll('.btn-delete-review').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = e.currentTarget.getAttribute('data-id');
      if (!confirm(`Are you sure you want to permanently delete Review #${id}?`)) return;
      e.currentTarget.disabled = true;
      try {
        await api.deleteReview(id);
        showToast('info', 'Review Deleted', `Review #${id} has been permanently deleted.`);
        await loadAndDisplayReviews();
      } catch (err) {
        showToast('error', 'Delete Failed', err.message);
        e.currentTarget.disabled = false;
      }
    });
  });

  // Open Reply Form
  document.querySelectorAll('.btn-toggle-reply, .btn-edit-reply').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = parseInt(e.currentTarget.getAttribute('data-id'), 10);
      state.reviewReplyingId = id;
      renderReviewsList();
      const textarea = document.getElementById(`reply-input-${id}`);
      if (textarea) textarea.focus();
    });
  });

  // Cancel Reply Form
  document.querySelectorAll('.btn-cancel-reply').forEach(btn => {
    btn.addEventListener('click', () => {
      state.reviewReplyingId = null;
      renderReviewsList();
    });
  });

  // Submit Reply
  document.querySelectorAll('.btn-submit-reply').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = parseInt(e.currentTarget.getAttribute('data-id'), 10);
      const textarea = document.getElementById(`reply-input-${id}`);
      const replyText = textarea ? textarea.value.trim() : '';

      e.currentTarget.disabled = true;
      e.currentTarget.innerHTML = `${Icons.spinner({ size: 13 })} <span>Saving...</span>`;

      try {
        await api.replyReview(id, replyText);
        state.reviewReplyingId = null;
        showToast('success', 'Reply Saved', `Official store reply for Review #${id} posted successfully.`);
        await loadAndDisplayReviews();
      } catch (err) {
        showToast('error', 'Reply Failed', err.message);
        e.currentTarget.disabled = false;
        e.currentTarget.innerHTML = `${Icons.save({ size: 13 })} <span>Save & Publish Reply</span>`;
      }
    });
  });
}

