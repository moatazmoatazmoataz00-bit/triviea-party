/**
 * landing.js - Landing Page Logic
 * Handles room creation and joining
 */

document.addEventListener('DOMContentLoaded', () => {
  const usernameInput = document.getElementById('usernameInput');
  const usernameError = document.getElementById('usernameError');
  const createRoomBtn = document.getElementById('createRoomBtn');
  const joinRoomBtn = document.getElementById('joinRoomBtn');
  const joinRoomForm = document.getElementById('joinRoomForm');
  const roomCodeInput = document.getElementById('roomCodeInput');
  const roomCodeError = document.getElementById('roomCodeError');
  const confirmJoinBtn = document.getElementById('confirmJoinBtn');
  const cancelJoinBtn = document.getElementById('cancelJoinBtn');
  const loadingState = document.getElementById('loadingState');
  const loadingText = document.getElementById('loadingText');

  // Focus username input on load
  usernameInput.focus();

  /**
   * Validate username
   */
  function validateUsername() {
    const username = usernameInput.value.trim();
    if (!username) {
      usernameError.textContent = 'Username is required';
      return false;
    }
    if (username.length < 2) {
      usernameError.textContent = 'Username must be at least 2 characters';
      return false;
    }
    if (username.length > 20) {
      usernameError.textContent = 'Username must not exceed 20 characters';
      return false;
    }
    usernameError.textContent = '';
    return true;
  }

  /**
   * Validate room code
   */
  function validateRoomCode() {
    const code = roomCodeInput.value.trim().toUpperCase();
    if (!code) {
      roomCodeError.textContent = 'Room code is required';
      return false;
    }
    if (code.length !== 6) {
      roomCodeError.textContent = 'Room code must be 6 characters';
      return false;
    }
    roomCodeError.textContent = '';
    return true;
  }

  /**
   * Show loading state
   */
  function showLoading(text) {
    loadingText.textContent = text;
    loadingState.classList.remove('hidden');
    usernameInput.disabled = true;
    roomCodeInput.disabled = true;
    createRoomBtn.disabled = true;
    joinRoomBtn.disabled = true;
    confirmJoinBtn.disabled = true;
  }

  /**
   * Hide loading state
   */
  function hideLoading() {
    loadingState.classList.add('hidden');
    usernameInput.disabled = false;
    roomCodeInput.disabled = false;
    createRoomBtn.disabled = false;
    joinRoomBtn.disabled = false;
    confirmJoinBtn.disabled = false;
  }

  /**
   * Create room button
   */
  createRoomBtn.addEventListener('click', () => {
    if (!validateUsername()) return;

    showLoading('Creating room...');
    gameClient.createRoom(usernameInput.value.trim());
  });

  /**
   * Join room button
   */
  joinRoomBtn.addEventListener('click', () => {
    if (!validateUsername()) return;

    joinRoomForm.classList.toggle('hidden');
    if (!joinRoomForm.classList.contains('hidden')) {
      roomCodeInput.focus();
    }
  });

  /**
   * Cancel join
   */
  cancelJoinBtn.addEventListener('click', () => {
    joinRoomForm.classList.add('hidden');
    roomCodeInput.value = '';
    roomCodeError.textContent = '';
  });

  /**
   * Confirm join
   */
  confirmJoinBtn.addEventListener('click', () => {
    if (!validateUsername()) return;
    if (!validateRoomCode()) return;

    showLoading('Joining room...');
    gameClient.joinRoom(
      usernameInput.value.trim(),
      roomCodeInput.value.trim().toUpperCase()
    );
  });

  /**
   * Allow pressing Enter to submit
   */
  usernameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !joinRoomForm.classList.contains('hidden')) {
      confirmJoinBtn.click();
    }
  });

  roomCodeInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      confirmJoinBtn.click();
    }
  });

  // Convert room code to uppercase
  roomCodeInput.addEventListener('input', (e) => {
    e.target.value = e.target.value.toUpperCase();
  });

  /**
   * Listen for room creation response
   */
  gameClient.on('room-created', (data) => {
    hideLoading();
    gameClient.roomCode = data.roomCode;
    gameClient.isHost = true;
    // Store in session storage so it persists across page navigation
    sessionStorage.setItem('roomCode', data.roomCode);
    sessionStorage.setItem('isHost', 'true');
    sessionStorage.setItem('username', usernameInput.value.trim());
    console.log('[LANDING] Room created:', data.roomCode);
    gameClient.navigateTo('lobby');
  });

  /**
   * Listen for room join response
   */
  gameClient.on('room-joined', (data) => {
    hideLoading();
    gameClient.roomCode = data.roomCode;
    gameClient.isHost = data.role === 'HOST';
    // Store in session storage so it persists across page navigation
    sessionStorage.setItem('roomCode', data.roomCode);
    sessionStorage.setItem('isHost', data.role === 'HOST' ? 'true' : 'false');
    sessionStorage.setItem('username', usernameInput.value.trim());
    console.log('[LANDING] Joined room:', data.roomCode, 'Role:', data.role);
    gameClient.navigateTo('lobby');
  });

  /**
   * Listen for errors during join/create
   * Prevent navigation if there's an error
   */
  gameClient.on('error', (data) => {
    hideLoading();
    const message = data.message || data || 'An error occurred';
    console.error('[LANDING] Error during room operation:', message);
    if (joinRoomForm.classList.contains('hidden')) {
      // Error during create room - show in username section
      usernameError.textContent = message;
    } else {
      // Error during join - show in room code section
      roomCodeError.textContent = message;
    }
  });

  /**
   * Clear error on input
   */
  usernameInput.addEventListener('input', () => {
    usernameError.textContent = '';
  });

  roomCodeInput.addEventListener('input', () => {
    roomCodeError.textContent = '';
  });
});
