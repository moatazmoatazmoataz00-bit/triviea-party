/**
 * client.js - Shared Socket.IO Client Logic
 * Manages WebSocket connection and core event handling
 */

class GameClient {
  constructor() {
    this.socket = null;
    this.roomCode = null;
    this.username = null;
    this.isHost = false;
    this.currentPage = null;
    this.listeners = new Map();
  }

  /**
   * Initialize socket connection
   */
  connect() {
    return new Promise((resolve, reject) => {
      this.socket = io();

      this.socket.on('connect', () => {
        console.log('[SOCKET] Connected:', this.socket.id);
        resolve();
      });

      this.socket.on('connect_error', (error) => {
        console.error('[SOCKET] Connection error:', error);
        reject(error);
      });

      this.socket.on('disconnect', () => {
        console.log('[SOCKET] Disconnected');
      });

      // Generic error handler
      this.socket.on('error', (data) => {
        console.error('[SOCKET] Error:', data);
        this.showError(data.message || 'An error occurred');
      });
    });
  }

  /**
   * Emit an event to server
   */
  emit(event, data = {}) {
    if (!this.socket) {
      console.error('[SOCKET] Socket not connected');
      return;
    }
    this.socket.emit(event, data);
  }

  /**
   * Listen for an event
   */
  on(event, callback) {
    if (!this.socket) {
      console.error('[SOCKET] Socket not connected');
      return;
    }
    
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    
    this.listeners.get(event).push(callback);
    this.socket.on(event, callback);
  }

  /**
   * Remove listener
   */
  off(event, callback) {
    if (this.socket) {
      this.socket.off(event, callback);
    }
  }

  /**
   * Create a room
   */
  createRoom(username) {
    this.username = username;
    this.emit('create-room', { username });
  }

  /**
   * Join a room
   */
  joinRoom(username, roomCode) {
    this.username = username;
    this.roomCode = roomCode;
    this.emit('join-room', { username, roomCode });
  }

  /**
   * Leave the current room
   */
  leaveRoom() {
    if (this.roomCode) {
      this.emit('leave-room', { roomCode: this.roomCode });
      this.roomCode = null;
    }
  }

  /**
   * Start game (host only)
   */
  startGame(category = '') {
    if (!this.isHost) {
      console.error('Only host can start game');
      return;
    }
    this.emit('start-game', { 
      roomCode: this.roomCode,
      category: category
    });
  }

  /**
   * Submit answer
   */
  submitAnswer(answerIndex, timeElapsed) {
    this.emit('submit-answer', {
      roomCode: this.roomCode,
      answerIndex,
      timeElapsed
    });
  }

  /**
   * Update game settings
   */
  updateSettings(totalRounds) {
    if (!this.isHost) {
      console.error('Only host can update settings');
      return;
    }
    this.emit('update-settings', {
      roomCode: this.roomCode,
      totalRounds
    });
  }

  /**
   * Get lobby state
   */
  getLobbyState() {
    this.emit('get-lobby-state', { roomCode: this.roomCode });
  }

  /**
   * Show error message
   */
  showError(message) {
    const modal = document.getElementById('errorModal');
    const messageEl = document.getElementById('errorMessage');
    
    if (modal && messageEl) {
      messageEl.textContent = message;
      modal.classList.remove('hidden');
    } else {
      alert(message);
    }
  }

  /**
   * Navigate to page
   */
  navigateTo(page) {
    const pages = {
      'landing': 'index.html',
      'lobby': 'lobby.html',
      'game': 'game.html',
      'results': 'results.html'
    };

    const url = pages[page] || 'index.html';
    window.location.href = url;
  }
}

// Global client instance
const gameClient = new GameClient();

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
  try {
    await gameClient.connect();
    console.log('[APP] Connected to server');

    // Setup global error handlers
    setupErrorHandlers();
  } catch (error) {
    console.error('[APP] Failed to connect:', error);
    document.body.innerHTML = `
      <div class="container">
        <div style="background: white; padding: 2rem; border-radius: 1rem; text-align: center;">
          <h2>Connection Error</h2>
          <p>Failed to connect to server. Please refresh the page.</p>
          <button onclick="location.reload()" class="btn btn-primary" style="margin-top: 1rem;">Retry</button>
        </div>
      </div>
    `;
  }
});

/**
 * Setup global error modal handlers
 */
function setupErrorHandlers() {
  const errorModal = document.getElementById('errorModal');
  const closeErrorBtn = document.getElementById('closeErrorBtn');
  const errorOkBtn = document.getElementById('errorOkBtn');

  if (closeErrorBtn) {
    closeErrorBtn.addEventListener('click', () => {
      if (errorModal) {
        errorModal.classList.add('hidden');
      }
    });
  }

  if (errorOkBtn) {
    errorOkBtn.addEventListener('click', () => {
      if (errorModal) {
        errorModal.classList.add('hidden');
      }
    });
  }

  // Close on background click
  if (errorModal) {
    errorModal.addEventListener('click', (e) => {
      if (e.target === errorModal) {
        errorModal.classList.add('hidden');
      }
    });
  }
}

/**
 * Format number with commas
 */
function formatNumber(num) {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Format time remaining
 */
function formatTime(seconds) {
  return Math.max(0, Math.ceil(seconds)).toString().padStart(2, '0');
}
