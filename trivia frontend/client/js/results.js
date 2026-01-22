/**
 * Show custom styled error message (not browser modal)
 */
function showCustomError(message) {
  console.log('[RESULTS] Showing custom error:', message);
  
  let errorEl = document.getElementById('resultsErrorMessage');
  if (!errorEl) {
    errorEl = document.createElement('div');
    errorEl.id = 'resultsErrorMessage';
    errorEl.style.cssText = `
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: #ef4444;
      border: 3px solid #dc2626;
      color: #fff;
      padding: 1.5rem 2rem;
      border-radius: 0.75rem;
      z-index: 2000;
      max-width: 90%;
      text-align: center;
      font-weight: bold;
      font-size: 1rem;
      box-shadow: 0 8px 16px rgba(0, 0, 0, 0.3);
      animation: slideIn 0.3s ease-out;
    `;
    document.body.appendChild(errorEl);
  }

  errorEl.textContent = message;
  errorEl.style.display = 'block';
  errorEl.style.opacity = '1';

  clearTimeout(errorEl.hideTimeout);
  errorEl.hideTimeout = setTimeout(() => {
    if (errorEl.style.display !== 'none') {
      errorEl.style.opacity = '0';
      errorEl.style.transition = 'opacity 0.3s ease-out';
      setTimeout(() => {
        errorEl.style.display = 'none';
        errorEl.style.transition = '';
      }, 300);
    }
  }, 5000);
}

document.addEventListener('DOMContentLoaded', async () => {
  const winnerCard = document.getElementById('winnerCard');
  const leaderboardBody = document.getElementById('leaderboardBody');
  const playAgainBtn = document.getElementById('playAgainBtn');
  const homeBtn = document.getElementById('homeBtn');

  // Restore room code and host status from session storage
  const storedRoomCode = sessionStorage.getItem('roomCode');
  const storedIsHost = sessionStorage.getItem('isHost');
  const storedUsername = sessionStorage.getItem('username');
  
  if (storedRoomCode) {
    gameClient.roomCode = storedRoomCode;
  }
  
  if (storedIsHost) {
    gameClient.isHost = storedIsHost === 'true';
    console.log('[RESULTS] Restored isHost from session:', gameClient.isHost);
  }

  console.log('[RESULTS] Page loaded, socket state:', {
    hasSocket: !!gameClient.socket,
    connected: gameClient.socket?.connected,
    username: storedUsername
  });

  // Wait for socket to be ready - it might already be connected from client.js
  let socketAttempts = 0;
  while (!gameClient.socket || !gameClient.socket.connected) {
    console.log('[RESULTS] Waiting for socket... attempt', socketAttempts);
    await new Promise(resolve => setTimeout(resolve, 100));
    socketAttempts++;
    if (socketAttempts > 100) {
      console.error('[RESULTS] Timeout waiting for socket - giving up');
      break;
    }
  }

  console.log('[RESULTS] Socket ready after', socketAttempts * 100, 'ms');

  // Track if rejoin was successful
  let rejoinComplete = false;

  // Rejoin the room with the same username so server recognizes us
  if (storedRoomCode && storedUsername && gameClient.socket?.connected) {
    console.log('[RESULTS] Rejoining room as:', storedUsername);
    
    // Wait for lobby-state response which confirms rejoin
    gameClient.socket.once('lobby-state', (data) => {
      console.log('[RESULTS] Rejoin complete - received lobby-state');
      rejoinComplete = true;
      
      // Now enable play-again button
      if (playAgainBtn && isHostUser) {
        playAgainBtn.disabled = false;
        playAgainBtn.style.opacity = '1';
      }
    });
    
    gameClient.emit('player-rejoin', {
      roomCode: storedRoomCode,
      username: storedUsername
    });
  } else {
    console.warn('[RESULTS] Cannot rejoin: missing data or socket not connected', {
      hasRoomCode: !!storedRoomCode,
      hasUsername: !!storedUsername,
      socketConnected: gameClient.socket?.connected
    });
    rejoinComplete = true; // Allow buttons anyway
  }

  // Get data from session storage
  const leaderboardData = sessionStorage.getItem('finalLeaderboard');
  const winnerData = sessionStorage.getItem('winner');

  let leaderboard = [];
  let winner = null;

  if (leaderboardData) {
    leaderboard = JSON.parse(leaderboardData);
  }

  if (winnerData) {
    winner = JSON.parse(winnerData);
  }

  console.log('[RESULTS] Leaderboard data:', leaderboard);
  console.log('[RESULTS] Winner data:', winner);

  /**
   * Display winner card
   */
  if (winner) {
    winnerCard.innerHTML = `
      <div class="winner-name">${escapeHtml(winner.username)}</div>
      <div class="winner-score">${formatNumber(winner.score)} points</div>
    `;
  }

  /**
   * Display leaderboard
   */
  if (leaderboard.length > 0) {
    leaderboard.forEach((player, index) => {
      const row = document.createElement('tr');

      // Add medal emoji
      let medal = '';
      if (index === 0) medal = '🥇';
      else if (index === 1) medal = '🥈';
      else if (index === 2) medal = '🥉';

      row.innerHTML = `
        <td class="rank-col"><strong>${medal || (index + 1)}</strong></td>
        <td class="name-col">${escapeHtml(player.username)}</td>
        <td class="score-col"><strong>${formatNumber(player.score)}</strong></td>
      `;

      leaderboardBody.appendChild(row);
    });
    console.log('[RESULTS] Leaderboard displayed with', leaderboard.length, 'players');
  } else {
    console.warn('[RESULTS] No leaderboard data to display');
  }

  /**
   * Setup socket listeners for play-again and errors
   */
  if (gameClient.socket && gameClient.socket.connected) {
    console.log('[RESULTS] Setting up socket listeners');
    
    /**
     * Listen for return-to-setup event from server
     */
    gameClient.socket.removeAllListeners('return-to-setup');
    gameClient.socket.on('return-to-setup', (data) => {
      console.log('[RESULTS] Received return-to-setup event');
      console.log('[RESULTS] Navigating back to setup screen...');
      
      // Clear game data from session storage but keep room code
      sessionStorage.removeItem('finalLeaderboard');
      sessionStorage.removeItem('winner');
      
      // Navigate to lobby
      setTimeout(() => {
        gameClient.navigateTo('lobby');
      }, 500);
    });
    
    /**
     * Listen for errors on results page
     */
    gameClient.socket.removeAllListeners('error');
    gameClient.socket.on('error', (data) => {
      console.log('[RESULTS] Socket error received:', data);
      
      // Extract message from data
      const message = typeof data === 'string' ? data : (data?.message || 'Unknown error');
      
      // Show custom error
      showCustomError('❌ ' + message);
      
      // Re-enable play again button on error
      if (playAgainBtn) {
        playAgainBtn.disabled = false;
        playAgainBtn.textContent = '🎮 Play Again';
      }
    });
    
    console.log('[RESULTS] Event listeners registered');
  }

  /**
   * Determine if current user is host
   */
  const isHostUser = gameClient.isHost || storedIsHost === 'true';
  console.log('[RESULTS] Final host status - gameClient.isHost:', gameClient.isHost, ', storedIsHost:', storedIsHost, ', isHostUser:', isHostUser);

  /**
   * Play again button (host only)
   */
  if (playAgainBtn) {
    if (!isHostUser) {
      playAgainBtn.disabled = true;
      playAgainBtn.style.opacity = '0.5';
      playAgainBtn.title = 'Only the host can start a new game';
    } else {
      // For hosts, disable until rejoin completes
      playAgainBtn.disabled = true;
      playAgainBtn.style.opacity = '0.5';
      playAgainBtn.title = 'Connecting to room...';
    }

    playAgainBtn.addEventListener('click', () => {
      console.log('[RESULTS] Play Again clicked');
      console.log('[RESULTS] rejoinComplete:', rejoinComplete);
      console.log('[RESULTS] gameClient.isHost =', gameClient.isHost);
      console.log('[RESULTS] storedIsHost =', storedIsHost);
      console.log('[RESULTS] isHostUser =', isHostUser);
      console.log('[RESULTS] roomCode =', sessionStorage.getItem('roomCode'));
      console.log('[RESULTS] socket connected =', gameClient.socket?.connected);
      
      if (!rejoinComplete) {
        console.error('[RESULTS] Rejoin not complete yet');
        showCustomError('❌ Still connecting to room... please wait a moment');
        return;
      }
      
      if (isHostUser) {
        // Check if socket is connected
        if (!gameClient.socket || !gameClient.socket.connected) {
          console.error('[RESULTS] Socket not connected');
          showCustomError('❌ Connection lost. Please refresh the page.');
          return;
        }
        
        playAgainBtn.disabled = true;
        playAgainBtn.textContent = '🔄 Loading...';
        console.log('[RESULTS] Emitting play-again event');

        // Set a timeout to re-enable button if no response
        const timeoutId = setTimeout(() => {
          console.error('[RESULTS] Play again timeout - no response from server');
          playAgainBtn.disabled = false;
          playAgainBtn.textContent = '🎮 Play Again';
          showCustomError('❌ Play again failed. Please try again.');
        }, 5000);

        // Emit play-again event to server
        gameClient.socket.emit('play-again', {
          roomCode: sessionStorage.getItem('roomCode')
        });
        
        // Clear timeout if return-to-setup is received
        const handleReturnToSetup = () => {
          clearTimeout(timeoutId);
          gameClient.socket.removeListener('return-to-setup', handleReturnToSetup);
        };
        gameClient.socket.once('return-to-setup', handleReturnToSetup);
      } else {
        console.log('[RESULTS] Not host, showing error');
        showCustomError('❌ Only the host can start a new game');
      }
    });
  }

  /**
   * Home button
   */
  if (homeBtn) {
    homeBtn.addEventListener('click', () => {
      console.log('[RESULTS] Home button clicked');
      gameClient.leaveRoom();
      sessionStorage.removeItem('finalLeaderboard');
      sessionStorage.removeItem('winner');
      sessionStorage.removeItem('roomCode');
      sessionStorage.removeItem('isHost');
      sessionStorage.removeItem('username');

      setTimeout(() => {
        gameClient.navigateTo('landing');
      }, 500);
    });
  }

  // Log final stats
  console.log('[RESULTS] Final leaderboard:', leaderboard);
  console.log('[RESULTS] Winner:', winner);
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
