'use strict';

const fs = require('fs');
const path = require('path');
const net = require('net');
const http = require('http');
const { WebSocketServer } = require('ws');
const { EventEmitter } = require('events');

const exeDir = process.pkg ? path.dirname(process.execPath) : __dirname;
const CONFIG_FILE = path.join(exeDir, 'config.json');
const USERS_FILE = path.join(exeDir, 'users.json');
const publicDir = path.join(exeDir, 'public');
const config = loadConfig();
const clients = [];
const users = loadUsers();
const loggedInUsers = new Map();

function loadConfig() {
    const defaults = {
        serverPort: 5190,
        serverHost: '0.0.0.0',
        clientHost: 'placeholder',
        clientPort: 5190,
        webPort: 8080,
        webHost: '0.0.0.0'
    };

    try {
        const raw = fs.readFileSync(CONFIG_FILE, 'utf8');
        const parsed = JSON.parse(raw || '{}');
        return {
            serverPort: Number(parsed.serverPort) || defaults.serverPort,
            serverHost: parsed.serverHost || defaults.serverHost,
            clientHost: parsed.clientHost || defaults.clientHost,
            clientPort: Number(parsed.clientPort) || defaults.clientPort,
            webPort: Number(parsed.webPort) || defaults.webPort,
            webHost: parsed.webHost || defaults.webHost
        };
    } catch (err) {
        if (err.code !== 'ENOENT') {
            console.error('Failed to load config file:', err.message);
        }
        return defaults;
    }
}

function loadUsers() {
    try {
        const raw = fs.readFileSync(USERS_FILE, 'utf8');
        const parsed = JSON.parse(raw || '{}');
        if (typeof parsed !== 'object' || parsed === null) {
            return {};
        }

        let changed = false;
        for (const [user, data] of Object.entries(parsed)) {
            if (typeof data === 'string') {
                parsed[user] = { password: data, friends: [] };
                changed = true;
            } else if (typeof data === 'object' && data !== null) {
                const password = String(data.password || '');
                const friends = Array.isArray(data.friends) ? data.friends : [];
                const friendRequests = Array.isArray(data.friendRequests) ? data.friendRequests : [];
                const savedSessions = Array.isArray(data.savedSessions) ? data.savedSessions : [];
                if (data.password !== password || data.friends !== friends || data.friendRequests !== friendRequests || data.savedSessions !== savedSessions) {
                    changed = true;
                }
                parsed[user] = { password, friends, friendRequests, savedSessions };
            } else {
                parsed[user] = { password: '', friends: [], friendRequests: [] };
                changed = true;
            }
        }

        if (changed) {
            saveUsers(parsed);
        }

        return parsed;
    } catch (err) {
        if (err.code === 'ENOENT') {
            return {};
        }
        console.error('Failed to load users file:', err.message);
        return {};
    }
}

function saveUsers(data = users) {
    try {
        fs.writeFileSync(USERS_FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch (err) {
        console.error('Failed to save users file:', err.message);
    }
}

const server = net.createServer(handleChatConnection);

function handleChatConnection(socket) {
    let username = null;
    let dmSession = null;
    let groupSession = null;
    socket.dmSession = null;
    socket.groupSession = null;
    socket.pendingDMs = {};
    socket.pendingGroupMsgs = new Map();
    socket.pendingGroupInvite = null;

    console.log('Client connected');
    socket.write('Welcome! Register with: REGISTER username password\n');
    socket.write('Or login with: AUTH username password\n');

    if (typeof socket.on === 'function' && typeof socket.emit === 'function') {
        // No-op, TCP sockets already support event emitters.
    }

    const onData = (data) => {
        const message = data.toString().trim();

        if (!username) {
            if (message.startsWith('REGISTER ')) {
                const parts = message.split(' ');
                if (parts.length < 3) {
                    socket.write('ERROR: Invalid REGISTER format. Use REGISTER username password\n');
                    return;
                }

                var newUser = parts[1];
                var newPassword = parts[2];
                if (!newUser || !newPassword) {
                    socket.write('ERROR: Username and password cannot be empty\n');
                    return;
                }

                if (users[newUser]) {
                    socket.write('ERROR: Username already exists\n');
                    return;
                }

                users[newUser] = { password: newPassword, friends: [], friendRequests: [] };
                saveUsers();
                socket.write('OK Registered. Now login with: AUTH username password\n');
                console.log(`Registered new user: ${newUser}`);
                return;
            }

            if (message.startsWith('AUTH ')) {
                const parts = message.split(' ');
                if (parts.length < 3) {
                    socket.write('ERROR: Invalid AUTH format. Use AUTH username password\n');
                    return;
                }

                var attemptedUser = parts[1];
                var attemptedPassword = parts[2];
                var userRecord = users[attemptedUser];
                var expectedPassword = userRecord ? userRecord.password : null;

                if (!expectedPassword || attemptedPassword !== expectedPassword) {
                    socket.write('ERROR: Invalid username or password\n');
                    return;
                }

                if (loggedInUsers.has(attemptedUser)) {
                    socket.write('ERROR: User already logged in\n');
                    return;
                }

                username = attemptedUser;
                loggedInUsers.set(username, socket);
                clients.push(socket);
                socket.write(`OK Welcome ${username}! You can now send messages.\n`);
                socket.write('COMMANDS\n');
                socket.write('User List: /users, /who, /online, /list - view online users\n');
                socket.write('Friend Management: /friend <username>, /requests, /accept <username>, /reject <username>, /unfriend <username>, /friends\n');
                socket.write('Direct Messages: /dm <username> to open a DM, /exit or /back to close it\n');
                socket.write('Group Chat: /group <username1> <username2> ... to start a group chat with friends, /exit to close it\n');
                socket.write('Sessions: /sessions - view your open DM or group chat; /savesession, /saved, /open <n>, /deletesaved <n> - manage saved sessions\n');
                socket.write('Help: /help - show all commands\n');
                console.log(`User logged in: ${username}`);
                return;
            }

            socket.write('ERROR: Send REGISTER or AUTH first\n');
            return;
        }

        console.log(`Received from ${username}:`, message);

        if (message === 'GETUSERS' || message === 'WHO' || message === 'LIST' || message === 'ONLINE') {
            const onlineUsers = Array.from(loggedInUsers.keys()).join(', ') || 'No users online';
            socket.write(`USERS ${onlineUsers}\n`);
            return;
        }

        if (message === 'FRIENDS' || message === 'FRIENDLIST') {
            const friendList = (users[username].friends || []).map(friend => {
                const status = loggedInUsers.has(friend) ? 'online' : 'offline';
                return `${friend} (${status})`;
            });
            const output = friendList.length ? friendList.join(', ') : 'No friends added';
            socket.write(`FRIENDSLIST ${output}\n`);
            return;
        }

        if (message === 'REQUESTS' || message === 'FRIENDREQUESTS') {
            const requests = users[username].friendRequests || [];
            const output = requests.length ? requests.join(', ') : 'No pending friend requests';
            socket.write(`REQUESTSLIST ${output}\n`);
            return;
        }

        if (message.startsWith('FRIEND ')) {
            const friendName = message.slice(7).trim();
            if (!friendName) {
                socket.write('ERROR: Usage FRIEND username\n');
                return;
            }
            if (!users[friendName]) {
                socket.write('ERROR: User not found\n');
                return;
            }
            if (friendName === username) {
                socket.write('ERROR: Cannot friend yourself\n');
                return;
            }
            if (users[username].friends.includes(friendName)) {
                socket.write(`ERROR: ${friendName} is already in your friends list\n`);
                return;
            }
            if ((users[friendName].friendRequests || []).includes(username)) {
                socket.write(`ERROR: Friend request already sent to ${friendName}\n`);
                return;
            }
            if ((users[username].friendRequests || []).includes(friendName)) {
                users[username].friendRequests = users[username].friendRequests.filter(req => req !== friendName);
                users[username].friends.push(friendName);
                if (!users[friendName].friends.includes(username)) {
                    users[friendName].friends.push(username);
                }
                saveUsers();
                socket.write(`OK ${friendName} added to your friends by accepting their request\n`);
                if (loggedInUsers.has(friendName)) {
                    loggedInUsers.get(friendName).write(`INFO: ${username} accepted your friend request.\n`);
                }
                return;
            }

            users[friendName].friendRequests = users[friendName].friendRequests || [];
            users[friendName].friendRequests.push(username);
            saveUsers();
            socket.write(`OK Friend request sent to ${friendName}\n`);
            if (loggedInUsers.has(friendName)) {
                loggedInUsers.get(friendName).write(`INFO: ${username} sent you a friend request. Use /requests and /accept ${username} or /reject ${username}.\n`);
            }
            return;
        }

        if (message.startsWith('ACCEPT ')) {
            const requester = message.slice(7).trim();
            if (!requester) {
                socket.write('ERROR: Usage ACCEPT username\n');
                return;
            }
            if (!users[requester]) {
                socket.write('ERROR: User not found\n');
                return;
            }
            if (!users[username].friendRequests.includes(requester)) {
                socket.write(`ERROR: No friend request from ${requester}\n`);
                return;
            }

            users[username].friendRequests = users[username].friendRequests.filter(req => req !== requester);
            if (!users[username].friends.includes(requester)) {
                users[username].friends.push(requester);
            }
            if (!users[requester].friends.includes(username)) {
                users[requester].friends.push(username);
            }
            saveUsers();
            socket.write(`OK ${requester} is now your friend\n`);
            if (loggedInUsers.has(requester)) {
                loggedInUsers.get(requester).write(`INFO: ${username} accepted your friend request.\n`);
            }
            return;
        }

        if (message.startsWith('REJECT ')) {
            const requester = message.slice(7).trim();
            if (!requester) {
                socket.write('ERROR: Usage REJECT username\n');
                return;
            }
            if (!users[requester]) {
                socket.write('ERROR: User not found\n');
                return;
            }
            if (!users[username].friendRequests.includes(requester)) {
                socket.write(`ERROR: No friend request from ${requester}\n`);
                return;
            }

            users[username].friendRequests = users[username].friendRequests.filter(req => req !== requester);
            saveUsers();
            socket.write(`OK ${requester}'s friend request rejected\n`);
            if (loggedInUsers.has(requester)) {
                loggedInUsers.get(requester).write(`INFO: ${username} rejected your friend request.\n`);
            }
            return;
        }

        if (message.startsWith('UNFRIEND ')) {
            const friendName = message.slice(9).trim();
            if (!friendName) {
                socket.write('ERROR: Usage UNFRIEND username\n');
                return;
            }
            if (!users[friendName]) {
                socket.write('ERROR: User not found\n');
                return;
            }
            if (!users[username].friends.includes(friendName)) {
                socket.write(`ERROR: ${friendName} is not in your friends list\n`);
                return;
            }

            users[username].friends = users[username].friends.filter(friend => friend !== friendName);
            if (users[friendName].friends.includes(username)) {
                users[friendName].friends = users[friendName].friends.filter(friend => friend !== username);
            }
            saveUsers();
            socket.write(`OK ${friendName} removed from your friends\n`);
            if (loggedInUsers.has(friendName)) {
                loggedInUsers.get(friendName).write(`INFO: ${username} unfriended you.\n`);
            }
            return;
        }

        if (message === 'SAVESESSION') {
            if (dmSession) {
                users[username].savedSessions = users[username].savedSessions || [];
                const sess = { type: 'dm', members: [dmSession] };
                // avoid duplicates
                const exists = users[username].savedSessions.some(s => s.type === 'dm' && Array.isArray(s.members) && s.members[0] === dmSession);
                if (!exists) {
                    users[username].savedSessions.push(sess);
                    saveUsers();
                }
                socket.write(`SAVEDOK DM ${dmSession}\n`);
            } else if (groupSession) {
                users[username].savedSessions = users[username].savedSessions || [];
                const sess = { type: 'group', members: groupSession };
                const exists = users[username].savedSessions.some(s => s.type === 'group' && JSON.stringify(s.members) === JSON.stringify(groupSession));
                if (!exists) {
                    users[username].savedSessions.push(sess);
                    saveUsers();
                }
                socket.write(`SAVEDOK GROUP ${groupSession.filter(u=>u!==username).join(', ')}\n`);
            } else {
                socket.write('ERROR: No active DM or group session to save\n');
            }
            return;
        }

        if (message === 'LISTSAVED' || message === 'SAVED') {
            const saved = users[username].savedSessions || [];
            if (!saved.length) {
                socket.write('SAVEDLIST None\n');
                return;
            }
            const entries = saved.map((s, i) => {
                if (s.type === 'dm') return `${i+1}: DM with ${s.members[0]}`;
                if (s.type === 'group') return `${i+1}: Group with ${s.members.filter(u=>u!==username).join(', ')}`;
                return `${i+1}: Unknown`;
            }).join(';');
            socket.write(`SAVEDLIST ${entries}\n`);
            return;
        }

        if (message.startsWith('OPENSESSION ')) {
            const idx = Number(message.slice(12).trim()) - 1;
            const saved = users[username].savedSessions || [];
            if (!saved[idx]) {
                socket.write('ERROR: Saved session not found\n');
                return;
            }
            const sess = saved[idx];
            if (sess.type === 'dm') {
                const member = sess.members[0];
                if (!users[member]) { socket.write('ERROR: User not found\n'); return; }
                dmSession = member;
                groupSession = null;
                socket.dmSession = member;
                socket.groupSession = null;
                
                // Build complete response with notification first, then pending messages
                let response = `DMMODE ${member}\n`;
                const pending = socket.pendingDMs[member];
                if (pending && pending.length) {
                    pending.forEach(msg => response += msg);
                    delete socket.pendingDMs[member];
                }
                socket.write(response);
                
                if (loggedInUsers.has(member)) loggedInUsers.get(member).write(`NOTIFY: ${username} opened a saved DM with you.\n`);
                return;
            }
            if (sess.type === 'group') {
                // validate members still exist and are friends
                const members = sess.members;
                for (const m of members) {
                    if (!users[m]) { socket.write(`ERROR: User ${m} not found\n`); return; }
                    if (m !== username && !users[username].friends.includes(m)) { socket.write(`ERROR: You are no longer friends with ${m}\n`); return; }
                }
                groupSession = members;
                dmSession = null;
                socket.groupSession = members;
                socket.dmSession = null;
                
                // Build complete response with notification first, then pending messages
                const key = groupKey(members);
                let response = `GROUPMODE ${members.filter(u=>u!==username).join(', ')}\n`;
                const pendingMsgs = socket.pendingGroupMsgs.get(key);
                if (pendingMsgs && pendingMsgs.length) {
                    pendingMsgs.forEach(msg => response += msg);
                    socket.pendingGroupMsgs.delete(key);
                }
                socket.write(response);
                
                members.forEach(member => {
                    if (member !== username && loggedInUsers.has(member)) {
                        const recipientSocket = loggedInUsers.get(member);
                        recipientSocket.pendingGroupInvite = members;
                        recipientSocket.write(`NOTIFY: ${username} opened a saved group chat with you. Use /joingroup to join it.\n`);
                    }
                });
                return;
            }
            return;
        }

        if (message.startsWith('DELETESESSION ')) {
            const idx = Number(message.slice(14).trim()) - 1;
            const saved = users[username].savedSessions || [];
            if (!saved[idx]) { socket.write('ERROR: Saved session not found\n'); return; }
            saved.splice(idx,1);
            users[username].savedSessions = saved;
            saveUsers();
            socket.write('DELETEOK\n');
            return;
        }

        if (message.startsWith('DM ')) {
            const parts = message.slice(3).split(' ').filter(p => p);
            if (parts.length !== 1) {
                socket.write('ERROR: Usage: /dm username\n');
                return;
            }
            const recipientName = parts[0];

            if (!users[recipientName]) {
                socket.write('ERROR: User not found\n');
                return;
            }
            if (recipientName === username) {
                socket.write('ERROR: Cannot DM yourself\n');
                return;
            }
            if (!users[username].friends.includes(recipientName)) {
                socket.write('ERROR: You must be friends to send direct messages\n');
                return;
            }

            dmSession = recipientName;
            groupSession = null;
            socket.dmSession = recipientName;
            socket.groupSession = null;
            
            // Build complete response with notification first, then pending messages
            let response = `DMMODE ${recipientName}\n`;
            const pending = socket.pendingDMs[recipientName];
            if (pending && pending.length) {
                pending.forEach(msg => response += msg);
                delete socket.pendingDMs[recipientName];
            }
            socket.write(response);
            
            if (loggedInUsers.has(recipientName)) {
                loggedInUsers.get(recipientName).write(`NOTIFY: ${username} opened a DM with you.\n`);
            }
            return;
        }

        if (message === 'EXIT' || message === 'BACK' || message === 'EXITDM') {
            if (!dmSession && !groupSession) {
                socket.write('ERROR: Not in a DM or group chat session\n');
                return;
            }
            
            if (dmSession) {
                const previousDM = dmSession;
                dmSession = null;
                socket.dmSession = null;
                socket.write(`DMEXIT ${previousDM}\n`);
                if (loggedInUsers.has(previousDM)) {
                    loggedInUsers.get(previousDM).write(`NOTIFY: ${username} closed the DM.\n`);
                }
            } else if (groupSession) {
                const groupMembers = groupSession.filter(user => user !== username);
                const groupStr = groupMembers.join(', ');
                socket.groupSession = null;
                socket.write(`GROUPEXIT ${groupStr}\n`);
                groupSession.forEach(member => {
                    if (member !== username && loggedInUsers.has(member)) {
                        loggedInUsers.get(member).write(`NOTIFY: ${username} left the group chat.\n`);
                    }
                });
                groupSession = null;
            }
            return;
        }

        if (message === 'SESSIONS') {
            const dmInfo = dmSession ? dmSession : 'None';
            const groupInfo = groupSession ? groupSession.filter(member => member !== username).join(', ') : 'None';
            socket.write(`SESSIONLIST DM:${dmInfo};GROUP:${groupInfo}\n`);
            return;
        }

        if (message === 'JOINLAST') {
            if (dmSession || groupSession) {
                socket.write('ERROR: Leave current session before joining another one\n');
                return;
            }
            const invite = socket.pendingGroupInvite;
            if (!invite || !invite.length) {
                socket.write('ERROR: No recent group invitation to join\n');
                return;
            }
            const members = invite;
            for (const member of members) {
                if (!users[member]) {
                    socket.write(`ERROR: User ${member} no longer exists\n`);
                    return;
                }
            }
            groupSession = members;
            dmSession = null;
            socket.groupSession = members;
            socket.dmSession = null;
            socket.pendingGroupInvite = null;
            
            // Build complete response with notification first, then pending messages
            const key = groupKey(members);
            let response = `GROUPMODE ${members.filter(u => u !== username).join(', ')}\n`;
            const pending = socket.pendingGroupMsgs.get(key);
            if (pending && pending.length) {
                pending.forEach(msg => response += msg);
                socket.pendingGroupMsgs.delete(key);
            }
            socket.write(response);
            return;
        }

        if (message.startsWith('GROUP ')) {
            const parts = message.slice(6).split(' ').filter(p => p);
            if (parts.length < 1) {
                socket.write('ERROR: Usage: /group <username1> <username2> ...\n');
                return;
            }

            const groupMembers = [username, ...parts];
            const uniqueMembers = [...new Set(groupMembers)];

            for (const member of uniqueMembers) {
                if (member === username) continue;
                if (!users[member]) {
                    socket.write(`ERROR: User '${member}' not found\n`);
                    return;
                }
                if (!users[username].friends.includes(member)) {
                    socket.write(`ERROR: You must be friends with ${member} to add them to group chat\n`);
                    return;
                }
            }

            groupSession = uniqueMembers;
            dmSession = null;
            socket.groupSession = uniqueMembers;
            socket.dmSession = null;
            const groupStr = parts.join(', ');
            
            // Build complete response with notification first, then pending messages
            const key = groupKey(uniqueMembers);
            let response = `GROUPMODE ${groupStr}\n`;
            const pending = socket.pendingGroupMsgs.get(key);
            if (pending && pending.length) {
                pending.forEach(msg => response += msg);
                socket.pendingGroupMsgs.delete(key);
            }
            socket.write(response);
            
            parts.forEach(member => {
                if (loggedInUsers.has(member)) {
                    const recipientSocket = loggedInUsers.get(member);
                    recipientSocket.pendingGroupInvite = uniqueMembers;
                    recipientSocket.write(`NOTIFY: ${username} started a group chat with you. Use /joingroup to join it.\n`);
                }
            });
            return;
        }

        if (message.startsWith('GROUP_MESSAGE ')) {
            if (!groupSession) {
                socket.write('ERROR: Not currently in a group chat session\n');
                return;
            }
            const groupText = message.slice(14);
            const currentGroupKey = groupKey(groupSession);
            groupSession.forEach(member => {
                if (member === username) return;
                if (!loggedInUsers.has(member)) return;
                const recipientSocket = loggedInUsers.get(member);
                const msg = `GROUP ${username}: ${groupText}\n`;
                if (recipientSocket.groupSession && groupKey(recipientSocket.groupSession) === currentGroupKey) {
                    recipientSocket.write(msg);
                } else {
                    const pending = recipientSocket.pendingGroupMsgs.get(currentGroupKey) || [];
                    pending.push(msg);
                    recipientSocket.pendingGroupMsgs.set(currentGroupKey, pending);
                }
            });
            socket.write('OK Group message sent\n');
            return;
        }

        if (message.startsWith('DMMSG ')) {
            if (!dmSession) {
                socket.write('ERROR: Not currently in a DM session\n');
                return;
            }
            const dmText = message.slice(6);
            if (!dmText) {
                socket.write('ERROR: DM message cannot be empty\n');
                return;
            }
            if (!loggedInUsers.has(dmSession)) {
                socket.write('ERROR: User is offline or not available\n');
                return;
            }
            const recipientSocket = loggedInUsers.get(dmSession);
            const msg = `DM ${username}: ${dmText}\n`;
            if (recipientSocket.dmSession === username) {
                recipientSocket.write(msg);
            } else {
                recipientSocket.pendingDMs[username] = recipientSocket.pendingDMs[username] || [];
                recipientSocket.pendingDMs[username].push(msg);
            }
            return;
        }

        clients.forEach(client => {
            if (client !== socket) {
                if (client.dmSession || client.groupSession) {
                    return;
                }
                client.write(`${username}: ${message}\n`);
            }
        });
    };

    socket.on('data', onData);

    socket.on('end', () => {
        console.log('Client disconnected');
        cleanupSocket();
    });

    socket.on('close', () => {
        cleanupSocket();
    });

    socket.on('error', (err) => {
        console.log('Socket error:', err.message);
        cleanupSocket();
    });

    function groupKey(members) {
        return Array.isArray(members) ? [...new Set(members)].sort().join(',') : '';
    }

    function flushPendingDMs(partner) {
        const pending = socket.pendingDMs[partner];
        if (!pending || !pending.length) return;
        pending.forEach(msg => socket.write(msg));
        delete socket.pendingDMs[partner];
    }

    function flushPendingGroupMessages(members) {
        const key = groupKey(members);
        const pending = socket.pendingGroupMsgs.get(key);
        if (!pending || !pending.length) return;
        pending.forEach(msg => socket.write(msg));
        socket.pendingGroupMsgs.delete(key);
    }

    function cleanupSocket() {
        const index = clients.indexOf(socket);
        if (index !== -1) {
            clients.splice(index, 1);
        }

        if (username && loggedInUsers.get(username) === socket) {
            loggedInUsers.delete(username);
            console.log(`User logged out: ${username}`);
        }
    }
}

function createWebSocketWrapper(ws) {
    const socket = new EventEmitter();
    socket.dmSession = null;
    socket.groupSession = null;
    socket.pendingDMs = {};
    socket.pendingGroupMsgs = new Map();
    socket.pendingGroupInvite = null;

    socket.write = (msg) => {
        if (ws.readyState === ws.OPEN) {
            ws.send(typeof msg === 'string' ? msg : String(msg));
        }
    };

    socket.end = () => ws.close();
    socket.destroy = () => ws.close();

    ws.on('message', (data) => {
        const payload = typeof data === 'string' ? Buffer.from(data) : Buffer.from(data);
        socket.emit('data', payload);
    });

    ws.on('close', () => socket.emit('close'));
    ws.on('error', (err) => socket.emit('error', err));

    return socket;
}

const httpServer = http.createServer((req, res) => {
    const safeUrl = decodeURIComponent(new URL(req.url, `http://${req.headers.host}`).pathname);
    const requestPath = safeUrl === '/' ? '/index.html' : safeUrl;
    const filePath = path.join(publicDir, requestPath);

    if (!filePath.startsWith(publicDir)) {
        res.statusCode = 403;
        res.end('Forbidden');
        return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
        '.html': 'text/html',
        '.js': 'application/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.svg': 'image/svg+xml',
        '.png': 'image/png'
    };

    fs.readFile(filePath, (err, data) => {
        if (err) {
            if (err.code === 'ENOENT') {
                res.statusCode = 404;
                res.end('Not found');
                return;
            }
            res.statusCode = 500;
            res.end('Server error');
            return;
        }
        res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
        res.end(data);
    });
});

httpServer.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`Port ${config.webPort} is already in use. Close the existing browser server or change webPort in config.json.`);
        process.exit(1);
    }
    console.error('HTTP server error:', err.message);
    process.exit(1);
});

const wss = new WebSocketServer({ server: httpServer });

wss.on('connection', (ws) => {
    const socket = createWebSocketWrapper(ws);
    handleChatConnection(socket);
});

httpServer.listen(config.webPort, config.webHost, () => {
    const host = config.webHost === '0.0.0.0' ? 'localhost' : config.webHost;
    console.log(`Browser client available at http://${host}:${config.webPort}`);
});

server.listen(config.serverPort, config.serverHost, () => {
    console.log(`Chat server running on ${config.serverHost}:${config.serverPort}`);
});