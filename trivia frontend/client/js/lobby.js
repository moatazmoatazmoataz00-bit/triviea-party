/**
 * lobby.js - Lobby Page Logic
 * Handles player list, host settings, and game start
 */

document.addEventListener('DOMContentLoaded', async () => {
  const roomCodeDisplay = document.getElementById('roomCodeDisplay');
  const playersList = document.getElementById('playersList');
  const settingsSection = document.getElementById('settingsSection');
  const waitingSection = document.getElementById('waitingSection');
  const roundsSelect = document.getElementById('roundsSelect');
  const categorySelect = document.getElementById('categorySelect');
  const startGameBtn = document.getElementById('startGameBtn');
  const leaveRoomBtn = document.getElementById('leaveRoomBtn');

  // Wait for gameClient to be initialized (created in client.js)
  // This ensures socket connection is ready before we try to use it
  let attempts = 0;
  while (!gameClient || !gameClient.socket) {
    await new Promise(resolve => setTimeout(resolve, 50));
    attempts++;
    if (attempts > 100) {
      console.error('[LOBBY] Timeout waiting for gameClient');
      gameClient.navigateTo('landing');
      return;
    }
  }

  console.log('[LOBBY] GameClient is ready');

  // Restore from session storage if needed
  const storedRoomCode = sessionStorage.getItem('roomCode');
  const storedIsHost = sessionStorage.getItem('isHost');
  const storedUsername = sessionStorage.getItem('username');
  
  if (storedRoomCode) {
    gameClient.roomCode = storedRoomCode;
    gameClient.isHost = storedIsHost === 'true';
  }

  // Display room code
  if (gameClient.roomCode) {
    roomCodeDisplay.textContent = gameClient.roomCode;
  } else {
    // Room code not found - navigate back to landing
    gameClient.navigateTo('landing');
    gameClient.showError('Room code not found. Please create or join a room.');
    return;
  }

  // Show settings if host
  if (gameClient.isHost) {
    settingsSection.style.display = 'block';
    waitingSection.style.display = 'none';
  } else {
    settingsSection.style.display = 'none';
    waitingSection.style.display = 'block';
  }

  /**
   * Render player list
   */
  function renderPlayers(players) {
    console.log('[LOBBY] renderPlayers called with:', players);
    playersList.innerHTML = '';

    if (!players || players.length === 0) {
      console.warn('[LOBBY] No players to render!');
    }

    players.forEach((player) => {
      const playerEl = document.createElement('div');
      playerEl.className = 'player-item';
      
      const avatar = player.username.charAt(0).toUpperCase();
      const colors = ['🟢', '🔵', '🟡', '🔴', '🟣', '🟠'];
      const colorIndex = player.username.charCodeAt(0) % colors.length;
      const color = colors[colorIndex];

      playerEl.innerHTML = `
        <div class="player-avatar">${color}</div>
        <div class="player-info">
          <div class="player-name">${escapeHtml(player.username)}</div>
          <div class="player-role">${player.isHost ? 'Host' : ''}</div>
        </div>
        <div style="text-align: right; font-weight: 600;">
          <span class="text-primary">${formatNumber(player.score)}</span> pts
        </div>
      `;

      playersList.appendChild(playerEl);
      console.log('[LOBBY] Rendered player:', player.username, 'isHost:', player.isHost);
    });
  }

  /**
   * Update lobby state
   */
  function updateLobby(data) {
    renderPlayers(data.players);
    
    // Update host status if changed
    if (data.newHost) {
      gameClient.isHost = data.newHost.id === gameClient.socket.id;
      
      if (gameClient.isHost) {
        settingsSection.style.display = 'block';
        waitingSection.style.display = 'none';
      }
    }
  }

  /**
   * Get initial lobby state
   * Wait for socket to be connected first
   * If host is returning, emit host-rejoin instead
   * If regular player is returning, emit player-rejoin instead
   */
  function initLobby() {
    if (!gameClient.roomCode) {
      console.error('[LOBBY] No room code found');
      gameClient.navigateTo('landing');
      return;
    }

    // For returning hosts, emit host-rejoin to replace socket ID
    if (gameClient.isHost && storedUsername) {
      console.log('[LOBBY] Host rejoining:', gameClient.roomCode, 'with username:', storedUsername);
      gameClient.socket.emit('host-rejoin', { 
        roomCode: gameClient.roomCode,
        username: storedUsername
      });
    } else if (storedUsername && !gameClient.isHost) {
      // For regular players returning, emit player-rejoin
      console.log('[LOBBY] Player rejoining:', gameClient.roomCode, 'with username:', storedUsername);
      gameClient.socket.emit('player-rejoin', { 
        roomCode: gameClient.roomCode,
        username: storedUsername
      });
    } else {
      // First-time player in lobby (shouldn't normally happen, but fallback to get-lobby-state)
      console.log('[LOBBY] Fetching lobby state for room:', gameClient.roomCode);
      gameClient.getLobbyState();
    }
  }

  // Always wait for socket to be ready, even if it appears connected
  // This ensures the emit happens on a fully initialized connection
  if (gameClient.socket && gameClient.socket.connected) {
    console.log('[LOBBY] Socket already connected, initializing lobby');
    initLobby();
  } else {
    console.log('[LOBBY] Waiting for socket connection...');
    // Use once() to avoid multiple listeners
    gameClient.socket.once('connect', () => {
      console.log('[LOBBY] Socket connected, initializing lobby');
      initLobby();
    });
  }

  /**
   * Listen for lobby state
   */
  gameClient.on('lobby-state', (data) => {
    roomCodeDisplay.textContent = data.roomCode;
    renderPlayers(data.players);
    roundsSelect.value = data.totalRounds;
    console.log('[LOBBY] Lobby state:', data);
  });

  /**
   * Listen for player list updates - primary event for player synchronization
   */
  gameClient.on('player-list-updated', (players) => {
    console.log('[LOBBY] Player list updated:', players);
    renderPlayers(players);
  });

  /**
   * Listen for player joined (legacy support)
   */
  gameClient.on('player-joined', (data) => {
    console.log('[LOBBY] Player joined:', data);
    if (data.players) {
      renderPlayers(data.players);
    }
    updateLobby(data);
  });

  /**
   * Listen for player left
   */
  gameClient.on('player-left', (data) => {
    updateLobby(data);
    console.log('[LOBBY]', data.message);
  });

  /**
   * Listen for settings updated
   */
  gameClient.on('settings-updated', (data) => {
    roundsSelect.value = data.totalRounds;
  });

  /**
   * Update rounds setting
   */
  roundsSelect.addEventListener('change', (e) => {
    const rounds = parseInt(e.target.value);
    gameClient.updateSettings(rounds);
  });

  /**
   * Track category selection
   */
  let selectedCategory = '';
  categorySelect.addEventListener('change', (e) => {
    selectedCategory = e.target.value;
    console.log('[LOBBY] Category selected:', selectedCategory);
  });

  /**
   * Start game button
   */
  startGameBtn.addEventListener('click', () => {
    if (gameClient.isHost) {
      startGameBtn.disabled = true;
      startGameBtn.textContent = '🚀 Starting...';
      console.log('[LOBBY] Starting game with category:', selectedCategory);
      gameClient.startGame(selectedCategory);
    }
  });

  /**
   * Listen for game start
   */
  gameClient.on('game-started', (data) => {
    console.log('[LOBBY] Game starting:', data);
    setTimeout(() => {
      gameClient.navigateTo('game');
    }, 1000);
  });

  /**
   * Handle start game errors - reset button state
   */
  const handleStartGameError = (errorData) => {
    const message = errorData.message || errorData || 'Failed to start game';
    if (message.includes('at least') || message.includes('players') || message.includes('start')) {
      console.log('[LOBBY] Start game error:', message);
      startGameBtn.disabled = false;
      startGameBtn.textContent = '🚀 Start Game';
      gameClient.showError(message);
    }
  };

  // Listen for error events
  gameClient.socket.on('error', (data) => {
    handleStartGameError(data);
  });

  /**
   * Leave room button
   */
  leaveRoomBtn.addEventListener('click', () => {
    if (confirm('Are you sure you want to leave the room?')) {
      gameClient.leaveRoom();
      setTimeout(() => {
        gameClient.navigateTo('landing');
      }, 500);
    }
  });

  /**
   * Handle disconnection
   */
  gameClient.on('left-room', () => {
    gameClient.navigateTo('landing');
  });

  /**
   * Handle disconnect
   */
  gameClient.socket.on('disconnect', () => {
    gameClient.showError('Connection lost. You have been disconnected from the room.');
    setTimeout(() => {
      gameClient.navigateTo('landing');
    }, 2000);
  });
});

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}
