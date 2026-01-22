/**
 * game.js - Game Page Logic
 * Handles gameplay, timer, answer submission, and scoring
 */

document.addEventListener('DOMContentLoaded', async () => {
  console.log('[GAME PAGE] Loading...');
  
  const questionNumber = document.querySelector('#questionNumber');
  const timerValue = document.getElementById('timerValue');
  const timerDisplay = document.getElementById('timerDisplay');
  const playerScore = document.getElementById('playerScore');
  const categoryBadge = document.getElementById('categoryBadge');
  const questionText = document.getElementById('questionText');
  const answersGrid = document.getElementById('answersGrid');
  const answerBtns = document.querySelectorAll('.answer-btn');
  const liveScoreboard = document.getElementById('liveScoreboard');
  const gameStatus = document.getElementById('gameStatus');
  const resultsModal = document.getElementById('resultsModal');
  const resultsContent = document.getElementById('resultsContent');

  // Restore from session storage if needed
  const storedRoomCode = sessionStorage.getItem('roomCode');
  if (storedRoomCode) {
    gameClient.roomCode = storedRoomCode;
  }

  console.log('[GAME PAGE] Room code:', gameClient.roomCode);
  console.log('[GAME PAGE] Socket ID:', gameClient.socket?.id);
  console.log('[GAME PAGE] Socket connected:', gameClient.socket?.connected);

  // Wait for socket to be ready if not already
  let attempts = 0;
  while (!gameClient.socket || !gameClient.socket.connected) {
    await new Promise(resolve => setTimeout(resolve, 100));
    attempts++;
    if (attempts > 50) {
      console.error('[GAME PAGE] Timeout waiting for socket');
      break;
    }
  }

  console.log('[GAME PAGE] Socket ready after', attempts * 100, 'ms');

  // CRITICAL: Rejoin room with new socket ID (page reload changed socket)
  if (gameClient.roomCode) {
    const storedUsername = sessionStorage.getItem('username');
    console.log('[GAME PAGE] Emitting player-rejoin for socket', gameClient.socket.id, 'username:', storedUsername);
    gameClient.emit('player-rejoin', { 
      roomCode: gameClient.roomCode,
      username: storedUsername
    });
  }

  // Now attach event listeners

  let currentQuestion = null;
  let questionStartTime = null;
  let timeLimit = 30;
  let timerInterval = null;
  let selectedAnswerIndex = null;
  let hasAnswered = false;
  let myScore = 0;
  let currentWager = null;
  let wagerConfirmed = false;
  let usedWagers = new Set(); // Track wagers used in previous questions
  let autoSubmittedDueToTimeout = false; // Track if auto-submitted due to timeout

  // Get wager UI elements
  const wagerSection = document.getElementById('wagerSection');
  const wagerCircles = document.getElementById('wagerCircles');
  const confirmWagerBtn = document.getElementById('confirmWagerBtn');

  /**
   * Create wager circle buttons (1-25) + Lucky Point (?)
   */
  function createWagerCircles() {
    wagerCircles.innerHTML = '';
    for (let i = 1; i <= 25; i++) {
      const circle = document.createElement('button');
      circle.className = 'wager-circle';
      circle.textContent = i;
      circle.dataset.points = i;
      
      // Disable if this wager was already used
      if (usedWagers.has(i)) {
        circle.disabled = true;
        circle.classList.add('used');
      }
      
      circle.addEventListener('click', () => {
        if (circle.disabled) return; // Don't allow clicking disabled circles
        
        // Remove previous selection
        document.querySelectorAll('.wager-circle.selected').forEach(c => {
          c.classList.remove('selected');
        });
        
        // Select this circle
        circle.classList.add('selected');
        currentWager = i;
        confirmWagerBtn.disabled = false;
        console.log('[GAME] Wager selected:', i);
      });
      
      wagerCircles.appendChild(circle);
    }
    
    // Create Lucky Point (?) button
    const luckyBtn = document.createElement('button');
    luckyBtn.className = 'wager-circle wager-lucky';
    luckyBtn.textContent = '?';
    luckyBtn.dataset.points = '?';
    
    // Disable if lucky point was already used
    if (usedWagers.has('?')) {
      luckyBtn.disabled = true;
      luckyBtn.classList.add('used');
    }
    
    luckyBtn.addEventListener('click', () => {
      if (luckyBtn.disabled) return; // Don't allow clicking if already used
      
      // Remove previous selection
      document.querySelectorAll('.wager-circle.selected').forEach(c => {
        c.classList.remove('selected');
      });
      
      // Select lucky button
      luckyBtn.classList.add('selected');
      currentWager = '?';
      confirmWagerBtn.disabled = false;
      console.log('[GAME] Lucky Point (?) selected');
    });
    
    wagerCircles.appendChild(luckyBtn);
  }

  /**
   * Confirm wager button handler
   */
  if (confirmWagerBtn) {
    confirmWagerBtn.addEventListener('click', () => {
      // Accept: numbers 1-25 OR "?" OR null (no wager selected)
      if (currentWager !== null && currentWager !== '?' && (currentWager < 1 || currentWager > 25)) {
        gameStatus.textContent = 'Invalid wager. Select between 1 and 25 or ?.';
        return;
      }

      console.log('[GAME] Confirming wager:', currentWager);

      // Track wager as used so it can't be selected again (both numbers and ?)
      if (currentWager !== null) {
        usedWagers.add(currentWager);
        console.log('[GAME] Added wager to used set. Used wagers:', Array.from(usedWagers));
      }

      // Emit select-points event to server
      gameClient.emit('select-points', {
        roomCode: gameClient.roomCode,
        points: currentWager
      });

      // Mark wager as confirmed and enable answer buttons
      wagerConfirmed = true;
      if (wagerSection) wagerSection.style.display = 'none';
      
      if (answerBtns) {
        answerBtns.forEach((btn) => {
          btn.disabled = false;
          btn.classList.remove('disabled');
        });
      }

      if (gameStatus) gameStatus.textContent = 'Answer the question!';
      console.log('[GAME] Wager confirmed. Answer buttons enabled.');
    });
  }

  /**
   * Start the game (wait for first question)
   */
  gameClient.on('game-started', (data) => {
    console.log('[GAME] Game started:', data);
    gameStatus.textContent = 'Waiting for first question...';
  });

  /**
   * Receive a new question
   */
  gameClient.on('new-question', (data) => {
    console.log('[GAME] ===== NEW QUESTION =====');
    console.log('[GAME] Question:', data.questionNumber, '/', data.totalQuestions);
    console.log('[GAME]', data.questionText);
    
    currentQuestion = data;
    questionStartTime = data.questionStartTime;
    timeLimit = data.timeLimit;
    selectedAnswerIndex = null;
    hasAnswered = false;
    currentWager = null;
    wagerConfirmed = false;
    autoSubmittedDueToTimeout = false; // Reset timeout flag

    // Update UI
    if (questionNumber) questionNumber.textContent = `Question ${data.questionNumber}/${data.totalQuestions}`;
    if (categoryBadge) categoryBadge.textContent = data.category;
    if (questionText) questionText.textContent = data.questionText;

    // Reset wager UI
    createWagerCircles();
    if (wagerSection) wagerSection.style.display = 'block';
    if (confirmWagerBtn) {
      confirmWagerBtn.disabled = true;
      confirmWagerBtn.textContent = 'Confirm Wager';
    }

    // Disable answer buttons until wager is confirmed
    if (answerBtns) {
      answerBtns.forEach((btn) => {
        btn.disabled = true;
        btn.classList.add('disabled');
      });
    }

    // Clear and populate answer buttons with click handlers
    if (answerBtns && answerBtns.length >= 4) {
      answerBtns.forEach((btn, index) => {
        btn.textContent = data.answers[index];
        btn.classList.remove('selected', 'correct', 'incorrect');
        
        // Remove old event listeners
        btn.onclick = null;
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          if (wagerConfirmed) {
            selectAnswer(index);
          }
        }, { once: true });
      });
    }

    if (gameStatus) gameStatus.textContent = 'Select your wager to continue...';

    // Start timer
    startTimer();
  });

  /**
   * Start countdown timer (synchronized with server)
   */
  function startTimer() {
    // Clear any existing interval
    if (timerInterval) clearInterval(timerInterval);

    // Update timer every 100ms based on server timestamp
    timerInterval = setInterval(() => {
      // Calculate time remaining from server's questionStartTime
      const elapsed = (Date.now() - questionStartTime) / 1000;
      const timeRemaining = Math.max(0, timeLimit - elapsed);

      if (timeRemaining <= 0) {
        clearInterval(timerInterval);
        if (!hasAnswered) {
          handleTimeOut();
        }
      } else {
        updateTimerDisplay(timeRemaining);
      }
    }, 100);

    // Update immediately
    const elapsed = (Date.now() - questionStartTime) / 1000;
    const timeRemaining = Math.max(0, timeLimit - elapsed);
    updateTimerDisplay(timeRemaining);
  }

  /**
   * Update timer display
   */
  function updateTimerDisplay(seconds) {
    timerValue.textContent = formatTime(seconds);

    // Add warning animation when < 5 seconds
    if (seconds < 5 && seconds > 0) {
      timerDisplay.classList.add('warning');
    } else {
      timerDisplay.classList.remove('warning');
    }
  }

  /**
   * Handle timeout (auto-submit if not answered)
   */
  function handleTimeOut() {
    if (!hasAnswered) {
      // Auto-select wager if not already selected
      if (!wagerConfirmed) {
        currentWager = 1; // Auto-select 1 point
        usedWagers.add(1);
        gameClient.emit('select-points', {
          roomCode: gameClient.roomCode,
          points: currentWager
        });
        wagerConfirmed = true;
        wagerSection.style.display = 'none';
        console.log('[GAME] Auto-selected wager 1 due to timeout');
        
        // Wait for wager to be confirmed before submitting answer
        setTimeout(() => {
          if (!hasAnswered) {
            submitAutoAnswer();
          }
        }, 200);
      } else {
        // Wager already confirmed, submit answer immediately
        submitAutoAnswer();
      }
    }
  }

  /**
   * Submit answer automatically (called from timeout handler)
   */
  function submitAutoAnswer() {
    const timeElapsed = (Date.now() - questionStartTime) / 1000;
    
    selectedAnswerIndex = 0;
    gameClient.submitAnswer(0, timeElapsed);
    hasAnswered = true;
    autoSubmittedDueToTimeout = true;
    
    // Disable buttons
    disableAnswerButtons();
    
    // Update game status
    gameStatus.textContent = '⏳ Time\'s up! Auto-submitted...';
    
    console.log('[GAME] Auto-submitted answer 0 due to timeout');
  }

  /**
   * Select an answer
   */
  function selectAnswer(index) {
    if (hasAnswered) return;

    selectedAnswerIndex = index;

    // Update UI
    answerBtns.forEach((btn, i) => {
      btn.classList.toggle('selected', i === index);
    });

    // Submit answer
    submitAnswer(index);
  }

  /**
   * Submit answer to server
   */
  function submitAnswer(answerIndex) {
    if (hasAnswered) return;

    const timeElapsed = (Date.now() - questionStartTime) / 1000;

    gameClient.submitAnswer(answerIndex, timeElapsed);
    hasAnswered = true;

    // Disable buttons
    disableAnswerButtons();

    // Update game status
    gameStatus.textContent = '⏳ Waiting for other players...';

    // Timer continues running - don't clear it here
    // It will be cleared when question-results is received

    console.log('[GAME] Answer submitted:', answerIndex, 'Time:', timeElapsed.toFixed(2) + 's');
  }

  /**
   * Disable all answer buttons
   */
  function disableAnswerButtons() {
    answerBtns.forEach(btn => {
      btn.disabled = true;
    });
  }

  /**
   * Update live scoreboard
   */
  function updateScoreboard(scores) {
    liveScoreboard.innerHTML = '';

    // Sort by score
    const sorted = [...scores].sort((a, b) => b.score - a.score);

    sorted.forEach((item, index) => {
      const isMe = item.socketId === gameClient.socket.id;
      const scoreItem = document.createElement('div');
      scoreItem.className = 'scoreboard-item';
      scoreItem.style.fontWeight = isMe ? 'bold' : 'normal';
      scoreItem.style.backgroundColor = isMe ? 'rgba(99, 102, 241, 0.1)' : '';

      scoreItem.innerHTML = `
        <span class="scoreboard-player">${index + 1}. ${escapeHtml(item.username)}${isMe ? ' (You)' : ''}</span>
        <span class="scoreboard-score">${formatNumber(item.score)}</span>
      `;

      liveScoreboard.appendChild(scoreItem);
    });
  }

  /**
   * Listen for answer submitted event
   */
  gameClient.on('answer-submitted', (data) => {
    gameStatus.textContent = `${data.playerAnswered}/${data.totalPlayers} players answered`;
  });

  /**
   * Listen for question results
   */
  gameClient.on('question-results', (data) => {
    console.log('[GAME] ===== QUESTION RESULTS =====');
    console.log('[GAME] Correct answer index:', data.correctAnswerIndex);
    console.log('[GAME] Results:', data.results);
    console.log('[GAME] Scores:', data.playerScores);

    clearInterval(timerInterval);

    // Update scores
    myScore = data.playerScores.find(s => s.socketId === gameClient.socket.id)?.score || myScore;
    playerScore.textContent = formatNumber(myScore);

    // Show results for this question
    const myResult = data.results.find(r => r.socketId === gameClient.socket.id);

    if (myResult) {
      const resultIndex = myResult.answerIndex;
      if (myResult.isCorrect) {
        answerBtns[resultIndex].classList.add('correct');
        // Check if lucky point was used
        const wagerDisplay = myResult.wager === '?' ? `? (lucky: ${myResult.luckyValue > 0 ? '+' : ''}${myResult.luckyValue})` : myResult.wager;
        gameStatus.textContent = `✅ Correct! +${formatNumber(myResult.points)} points (wagered ${wagerDisplay})`;
      } else {
        answerBtns[resultIndex].classList.add('incorrect');
        answerBtns[data.correctAnswerIndex].classList.add('correct');
        const wagerDisplay = myResult.wager === '?' ? '?' : myResult.wager;
        gameStatus.textContent = `❌ Incorrect (wagered ${wagerDisplay}). Correct answer was option ${data.correctAnswerIndex + 1}`;
      }
    }

    // Update scoreboard
    updateScoreboard(data.playerScores);

    // Show results modal briefly
    showResultsModal(data);
  });

  /**
   * Listen for question feedback (shown when player doesn't answer or doesn't wager)
   */
  gameClient.on('question-feedback', (data) => {
    console.log('[GAME] Received question feedback:', data.message);
    
    // Show feedback message at the top of the screen
    showFeedbackMessage(data.message);
  });

  /**
   * Show temporary feedback message
   */
  function showFeedbackMessage(message) {
    console.log('[GAME] Showing feedback message:', message);
    
    // Create feedback element if it doesn't exist
    let feedbackEl = document.getElementById('feedbackMessage');
    if (!feedbackEl) {
      feedbackEl = document.createElement('div');
      feedbackEl.id = 'feedbackMessage';
      feedbackEl.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: #ffd700;
        border: 3px solid #ff9800;
        color: #000;
        padding: 1.5rem 2rem;
        border-radius: 0.75rem;
        z-index: 2000;
        max-width: 90%;
        text-align: center;
        font-weight: bold;
        font-size: 1.1rem;
        box-shadow: 0 8px 16px rgba(0, 0, 0, 0.3);
        animation: slideIn 0.3s ease-out;
      `;
      
      // Add animation keyframes if not already present
      if (!document.getElementById('feedbackAnimation')) {
        const style = document.createElement('style');
        style.id = 'feedbackAnimation';
        style.textContent = `
          @keyframes slideIn {
            from {
              transform: translateX(-50%) translateY(-100px);
              opacity: 0;
            }
            to {
              transform: translateX(-50%) translateY(0);
              opacity: 1;
            }
          }
        `;
        document.head.appendChild(style);
      }
      
      document.body.appendChild(feedbackEl);
    }

    // Update message and show
    feedbackEl.textContent = message;
    feedbackEl.style.display = 'block';
    feedbackEl.style.opacity = '1';

    // Auto-hide after 5 seconds
    clearTimeout(feedbackEl.hideTimeout);
    feedbackEl.hideTimeout = setTimeout(() => {
      if (feedbackEl.style.display !== 'none') {
        feedbackEl.style.opacity = '0';
        feedbackEl.style.transition = 'opacity 0.3s ease-out';
        setTimeout(() => {
          feedbackEl.style.display = 'none';
          feedbackEl.style.transition = '';
        }, 300);
      }
    }, 5000);
  }

  /**
   * Show results modal
   */
  function showResultsModal(data) {
    const myResult = data.results.find(r => r.socketId === gameClient.socket.id);

    // Don't show modal if no result data found
    if (!myResult) {
      console.log('[GAME] No result data found, skipping modal');
      return;
    }

    // Add special message if auto-submitted due to timeout
    console.log('[GAME] autoSubmittedDueToTimeout =', autoSubmittedDueToTimeout);
    const timeoutMessage = autoSubmittedDueToTimeout 
      ? '<p style="font-size: 0.75rem; color: #ef4444; margin-top: 0.75rem; font-weight: bold;">⚠️ You didn\'t select a wager or answer!</p>'
      : '';
    console.log('[GAME] timeoutMessage =', timeoutMessage);

    let resultHTML = '<div style="text-align: center; padding: 1rem;">';

    if (myResult.isCorrect) {
      const wagerDisplay = myResult.wager === '?' 
        ? `? Lucky: ${myResult.luckyValue > 0 ? '+' : ''}${myResult.luckyValue}` 
        : myResult.wager;
      resultHTML += `
        <div style="font-size: 2rem; margin-bottom: 0.5rem;">✅</div>
        <p style="font-size: 1.25rem; margin-bottom: 0.5rem;">Correct!</p>
        <p style="font-size: 1.5rem; color: var(--primary); font-weight: bold;">
          +${formatNumber(myResult.points)}
        </p>
        <p style="font-size: 0.875rem; color: var(--gray); margin-top: 0.5rem;">
          Wagered ${wagerDisplay}
        </p>
        ${timeoutMessage}
      `;
    } else {
      const wagerDisplay = myResult.wager === '?' ? '?' : myResult.wager;
      resultHTML += `
        <div style="font-size: 2rem; margin-bottom: 0.5rem;">❌</div>
        <p style="font-size: 1.25rem; margin-bottom: 0.5rem;">Incorrect</p>
        <p style="font-size: 0.875rem; color: var(--gray); margin-bottom: 0.5rem;">
          Correct answer: ${currentQuestion.answers[data.correctAnswerIndex]}
        </p>
        <p style="font-size: 0.875rem; color: var(--gray);">
          Wagered ${wagerDisplay} (0 earned)
        </p>
        ${timeoutMessage}
      `;
    }

    resultHTML += '</div>';
    console.log('[GAME] resultHTML =', resultHTML);
    resultsContent.innerHTML = resultHTML;
    resultsModal.classList.remove('hidden');

    // Close modal after 3 seconds (will be replaced by next question)
    setTimeout(() => {
      if (!resultsModal.classList.contains('hidden')) {
        resultsModal.classList.add('hidden');
      }
    }, 3000);
  }

  /**
   * Listen for game end
   */
  gameClient.on('game-ended', (data) => {
    console.log('[GAME] ===== GAME ENDED =====');
    console.log('[GAME] Winner:', data.winner);
    console.log('[GAME] Final leaderboard:', data.leaderboard);
    
    clearInterval(timerInterval);

    // Navigate to results page
    setTimeout(() => {
      // Store leaderboard data in session storage for results page
      sessionStorage.setItem('finalLeaderboard', JSON.stringify(data.leaderboard));
      sessionStorage.setItem('winner', JSON.stringify(data.winner));
      gameClient.navigateTo('results');
    }, 2000);
  });

  /**
   * Initial score display
   */
  playerScore.textContent = formatNumber(myScore);
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
