const statusEl = document.getElementById('status');
const logEl = document.getElementById('log');
const inputEl = document.getElementById('input');
const sendBtn = document.getElementById('send');

const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
const socketUrl = `${protocol}//${location.host}`;
let socket;
let username = null;
let currentMode = 'public';
let currentTarget = null;

function appendMessage(text, className = '') {
  const line = document.createElement('div');
  line.textContent = text;
  if (className) {
    line.classList.add(className);
  }
  logEl.appendChild(line);
  logEl.scrollTop = logEl.scrollHeight;
}

function setStatus(text, color) {
  statusEl.textContent = text;
  statusEl.style.color = color;
}

function updateStatus() {
  if (!username) {
    setStatus('Not logged in — use REGISTER or AUTH', '#ffdd57');
    return;
  }

  let status = `Logged in as ${username}`;
  if (currentMode === 'dm') {
    status += ` | DM with ${currentTarget}`;
  } else if (currentMode === 'group') {
    status += ` | Group with ${currentTarget}`;
  }
  setStatus(status, '#9be5ff');
}

function formatServerMessage(line) {
  if (line.startsWith('OK Welcome ')) {
    username = line.split(' ')[2].replace('!', '');
    updateStatus();
    return line;
  }

  if (line.startsWith('DMMODE ')) {
    currentMode = 'dm';
    currentTarget = line.slice(7);
    updateStatus();
    return [
      `✉️  You are now in DM mode with ${currentTarget}`,
      `Type messages normally to send DMs to ${currentTarget}`,
      `Type /exit or /back to return to public chat`
    ];
  }

  if (line.startsWith('DMEXIT ')) {
    currentMode = 'public';
    const target = line.slice(7);
    currentTarget = null;
    updateStatus();
    return [
      `✓ You have exited DM mode with ${target}`,
      `You are back in public chat`
    ];
  }

  if (line.startsWith('GROUPMODE ')) {
    currentMode = 'group';
    currentTarget = line.slice(10);
    updateStatus();
    return [
      `👥 You are now in group chat mode with ${currentTarget}`,
      `Type messages normally to send to the group`,
      `Type /exit or /back to return to public chat`
    ];
  }

  if (line.startsWith('GROUPEXIT ')) {
    currentMode = 'public';
    const target = line.slice(10);
    currentTarget = null;
    updateStatus();
    return [
      `✓ You have exited group chat with ${target}`,
      `You are back in public chat`
    ];
  }

  return line;
}

function connect() {
  socket = new WebSocket(socketUrl);

  socket.addEventListener('open', () => {
    appendMessage('Connected. Use REGISTER or AUTH to login.', 'system');
    setStatus('Connected to server', '#9be5ff');
  });

  socket.addEventListener('message', (event) => {
    const message = event.data.toString();
    const lines = message.split(/\r?\n/).filter(line => line.length > 0);
    lines.forEach(line => {
      const formatted = formatServerMessage(line);
      if (Array.isArray(formatted)) {
        formatted.forEach((sub) => appendMessage(sub, 'system'));
      } else {
        let style = '';
        if (formatted.startsWith('ERROR')) style = 'error';
        if (formatted.startsWith('OK') || formatted.startsWith('INFO') || formatted.startsWith('COMMANDS') || formatted.startsWith('NOTIFY')) {
          style = 'system';
        }
        appendMessage(formatted, style);
      }
    });
  });

  socket.addEventListener('close', () => {
    setStatus('Disconnected', '#ff8a8a');
    appendMessage('Disconnected from server.', 'error');
    setTimeout(connect, 2000);
  });

  socket.addEventListener('error', () => {
    setStatus('Connection error', '#ff8a8a');
  });
}

function showHelp() {
  appendMessage('Available browser commands:', 'system');
  appendMessage('/users, /who, /online, /list - view online users', 'system');
  appendMessage('/friend <username> - send a friend request', 'system');
  appendMessage('/requests - view incoming friend requests', 'system');
  appendMessage('/accept <username> - accept incoming request', 'system');
  appendMessage('/reject <username> - reject request', 'system');
  appendMessage('/unfriend <username> - remove a friend', 'system');
  appendMessage('/friends - list your friends', 'system');
  appendMessage('/dm <username> - start a direct message session', 'system');
  appendMessage('/group <username1> <username2> ... - start a group chat', 'system');
  appendMessage('/joingroup - join the latest group invite', 'system');
  appendMessage('/sessions - show open sessions', 'system');
  appendMessage('/savesession - save current DM/group session', 'system');
  appendMessage('/saved - list saved sessions', 'system');
  appendMessage('/open <n> - open a saved session', 'system');
  appendMessage('/deletesaved <n> - delete a saved session', 'system');
  appendMessage('/exit or /back - leave the current DM/group chat', 'system');
  appendMessage('Type any other text to send a chat message.', 'system');
}

function sendRaw(raw) {
  socket.send(raw);
  appendMessage(`> ${raw}`, 'command');
}

function handleCommand(text) {
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();

  if (lower === '/help' || lower === '/h') {
    showHelp();
    return;
  }

  if (['/users', '/who', '/online', '/list'].includes(lower)) {
    sendRaw('GETUSERS');
    return;
  }

  if (lower === '/friends') {
    sendRaw('FRIENDS');
    return;
  }

  if (lower === '/requests') {
    sendRaw('REQUESTS');
    return;
  }

  if (lower.startsWith('/friend ')) {
    const target = trimmed.slice(8).trim();
    if (!target) return appendMessage('Usage: /friend <username>', 'error');
    sendRaw(`FRIEND ${target}`);
    return;
  }

  if (lower.startsWith('/accept ')) {
    const target = trimmed.slice(8).trim();
    if (!target) return appendMessage('Usage: /accept <username>', 'error');
    sendRaw(`ACCEPT ${target}`);
    return;
  }

  if (lower.startsWith('/reject ')) {
    const target = trimmed.slice(8).trim();
    if (!target) return appendMessage('Usage: /reject <username>', 'error');
    sendRaw(`REJECT ${target}`);
    return;
  }

  if (lower.startsWith('/unfriend ')) {
    const target = trimmed.slice(10).trim();
    if (!target) return appendMessage('Usage: /unfriend <username>', 'error');
    sendRaw(`UNFRIEND ${target}`);
    return;
  }

  if (lower.startsWith('/dm ')) {
    const target = trimmed.slice(4).trim();
    if (!target) return appendMessage('Usage: /dm <username>', 'error');
    sendRaw(`DM ${target}`);
    return;
  }

  if (lower.startsWith('/group ')) {
    const target = trimmed.slice(7).trim();
    if (!target) return appendMessage('Usage: /group <username1> <username2> ...', 'error');
    sendRaw(`GROUP ${target}`);
    return;
  }

  if (lower === '/joingroup') {
    sendRaw('JOINLAST');
    return;
  }

  if (lower === '/sessions') {
    sendRaw('SESSIONS');
    return;
  }

  if (lower === '/savesession') {
    sendRaw('SAVESESSION');
    return;
  }

  if (lower === '/saved') {
    sendRaw('LISTSAVED');
    return;
  }

  if (lower.startsWith('/open ')) {
    const num = trimmed.slice(6).trim();
    if (!num || isNaN(Number(num))) return appendMessage('Usage: /open <saved-session-number>', 'error');
    sendRaw(`OPENSESSION ${num}`);
    return;
  }

  if (lower.startsWith('/deletesaved ')) {
    const num = trimmed.slice(13).trim();
    if (!num || isNaN(Number(num))) return appendMessage('Usage: /deletesaved <saved-session-number>', 'error');
    sendRaw(`DELETESESSION ${num}`);
    return;
  }

  if (['/exit', '/back', '/exitdm'].includes(lower)) {
    sendRaw('EXIT');
    return;
  }

  if (lower === '/register' || lower === '/auth') {
    appendMessage('Use REGISTER username password or AUTH username password', 'system');
    return;
  }

  appendMessage(`Unknown command: ${trimmed}. Use /help.`, 'error');
}

function sendMessage() {
  const text = inputEl.value.trim();
  if (!text || !socket || socket.readyState !== WebSocket.OPEN) {
    return;
  }

  if (text.startsWith('/')) {
    handleCommand(text);
  } else {
    if (currentMode === 'dm') {
      sendRaw(`DMMSG ${text}`);
    } else if (currentMode === 'group') {
      sendRaw(`GROUP_MESSAGE ${text}`);
    } else {
      sendRaw(text);
    }
  }

  if (!text.startsWith('/')) {
    appendMessage(`You: ${text}`, 'command');
  }

  inputEl.value = '';
}

sendBtn.addEventListener('click', sendMessage);
inputEl.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    sendMessage();
  }
});

connect();
updateStatus();
