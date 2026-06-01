'use strict';

const fs = require('fs');
const path = require('path');
const net = require('net');
const readline = require('readline');

const exeDir = process.pkg ? path.dirname(process.execPath) : __dirname;
const CONFIG_FILE = path.join(exeDir, 'config.json');
const config = loadConfig();

const client = new net.Socket();
client.on('error', (err) => {
    console.error('Connection error:', err.message);
    console.error(`Tried to connect to ${config.clientHost}:${config.clientPort}`);
    console.error('Make sure the server is running and config.json contains the correct host and port.');
    process.exit(1);
});
client.on('close', () => {
    console.log('Disconnected from server');
});
client.connect(config.clientPort, config.clientHost, () => {
    console.log(`Connected to chat server at ${config.clientHost}:${config.clientPort}`);
});

function loadConfig() {
    const defaults = {
        serverPort: 5190,
        serverHost: '0.0.0.0',
        clientHost: 'placeholder',
        clientPort: 5190
    };

    try {
        const raw = fs.readFileSync(CONFIG_FILE, 'utf8');
        const parsed = JSON.parse(raw || '{}');
        return {
            serverPort: Number(parsed.serverPort) || defaults.serverPort,
            serverHost: parsed.serverHost || defaults.serverHost,
            clientHost: parsed.clientHost || defaults.clientHost,
            clientPort: Number(parsed.clientPort) || defaults.clientPort
        };
    } catch (err) {
        if (err.code !== 'ENOENT') {
            console.error('Failed to load config file:', err.message);
        }
        return defaults;
    }
}

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

let authenticated = false;
let chatStarted = false;
let currentUser = null;
let currentDMUser = null;

function setupReadlineListener() {
    rl.on('line', (line) => {
        const trimmed = line.trim();
        if (trimmed) {
            const command = trimmed.toLowerCase();
            if (command === '/users' || command === '/who' || command === '/online' || command === '/list') {
                client.write('GETUSERS\n');
            } else if (command === '/help') {
                console.log('Commands: /users, /who, /online, /list - view online users.');
                console.log('Commands: /friend <username>, /requests, /accept <username>, /reject <username>, /unfriend <username>, /friends - manage your friends.');
                console.log('Commands: /dm <username> - open a direct message session with a friend.');
                console.log('Commands: /group <username1> <username2> ... - start a group chat with friends.');
                console.log('Commands: /joingroup - enter the latest group chat you were invited to.');
                console.log('Commands: /sessions - view your open DM or group chat session.');
                console.log('Commands: /savesession - save the current DM/group session');
                console.log('Commands: /saved - list your saved sessions');
                console.log('Commands: /open <n> - open a saved session by number');
                console.log('Commands: /deletesaved <n> - delete a saved session by number');
                console.log('Commands: /exit or /back - close the DM/group and return to public chat.');
                console.log('Once in DM/group mode, type messages normally to send them only to those users.');
                console.log('Type any other text to send a chat message.');
            } else if (command === '/sessions') {
                client.write('SESSIONS\n');
            } else if (command === '/savesession') {
                client.write('SAVESESSION\n');
            } else if (command === '/saved') {
                client.write('LISTSAVED\n');
            } else if (command.startsWith('/open ')) {
                const num = trimmed.slice(6).trim();
                if (!num || isNaN(Number(num))) {
                    console.log('Usage: /open <saved-session-number>');
                } else {
                    client.write(`OPENSESSION ${num}\n`);
                }
            } else if (command.startsWith('/deletesaved ')) {
                const num = trimmed.slice(13).trim();
                if (!num || isNaN(Number(num))) {
                    console.log('Usage: /deletesaved <saved-session-number>');
                } else {
                    client.write(`DELETESESSION ${num}\n`);
                }
            } else if (command === '/exit' || command === '/back' || command === '/exitdm') {
                client.write('EXIT\n');
                currentDMUser = null;
            } else if (command.startsWith('/group ')) {
                const groupContent = trimmed.slice(7).trim();
                if (!groupContent) {
                    console.log('Usage: /group username1 username2 ...');
                } else {
                    const members = groupContent.split(' ').join(' ');
                    currentDMUser = `group: ${members}`;
                    client.write(`GROUP ${members}\n`);
                }
            } else if (command === '/joingroup') {
                client.write('JOINLAST\n');
            } else if (command.startsWith('/dm ')) {
                const dmContent = trimmed.slice(4).trim();
                const parts = dmContent.split(' ').filter(p => p);
                if (parts.length !== 1) {
                    console.log('Usage: /dm username');
                } else {
                    currentDMUser = parts[0];
                    client.write(`DM ${parts[0]}\n`);
                }
            } else if (command.startsWith('/friend ')) {
                const friendName = trimmed.slice(8).trim();
                if (!friendName) {
                    console.log('Usage: /friend username');
                } else {
                    client.write(`FRIEND ${friendName}\n`);
                }
            } else if (command === '/requests') {
                client.write('REQUESTS\n');
            } else if (command.startsWith('/accept ')) {
                const friendName = trimmed.slice(8).trim();
                if (!friendName) {
                    console.log('Usage: /accept username');
                } else {
                    client.write(`ACCEPT ${friendName}\n`);
                }
            } else if (command.startsWith('/reject ')) {
                const friendName = trimmed.slice(8).trim();
                if (!friendName) {
                    console.log('Usage: /reject username');
                } else {
                    client.write(`REJECT ${friendName}\n`);
                }
            } else if (command === '/friend' || command === '/friendlist' || command === '/friends') {
                client.write('FRIENDS\n');
            } else if (command.startsWith('/unfriend ')) {
                const friendName = trimmed.slice(10).trim();
                if (!friendName) {
                    console.log('Usage: /unfriend username');
                } else {
                    client.write(`UNFRIEND ${friendName}\n`);
                }
            } else if (command === '/unfriend') {
                console.log('Usage: /unfriend username');
            } else if (trimmed.startsWith('/')) {
                console.log('Unknown command. Try /users, /who, /online, /list, /friend, /unfriend, /friends, /dm, /exit, or /help.');
            } else {
                readline.clearLine(process.stdout, 0);
                readline.cursorTo(process.stdout, 0);
                if (currentDMUser) {
                    if (currentDMUser.startsWith('group:')) {
                        console.log(`GROUP You: ${trimmed}`);
                        client.write(`GROUP_MESSAGE ${trimmed}\n`);
                    } else {
                        console.log(`DM You -> ${currentDMUser}: ${trimmed}`);
                        client.write(`DMMSG ${trimmed}\n`);
                    }
                } else {
                    console.log(`You: ${trimmed}`);
                    client.write(trimmed + '\n');
                }
            }
        }
        rl.prompt();
    });
    rl.setPrompt('> ');
    rl.prompt();
}

function processMessage(message) {
    if (!message || !message.length) return;

    if (!authenticated && message.startsWith('OK Welcome')) {
        authenticated = true;
        currentUser = message.split(' ')[2].replace('!', '');
        console.log('Login successful. Start typing messages.');
        if (!chatStarted) {
            chatStarted = true;
            setupReadlineListener();
        }
        return;
    }

    if (!authenticated && message.startsWith('OK Registered')) {
        console.log('Account created. Please log in now.');
        askAuthOrRegister();
        return;
    }

    if (!authenticated && message.startsWith('ERROR')) {
        console.log('Server error:', message);
        askAuthOrRegister();
        return;
    }

    if (message.startsWith('USERS ')) {
        console.log('Online users:', message.slice(6));
        return;
    }

    if (message.startsWith('FRIENDSLIST ')) {
        console.log('Friends:', message.slice(11));
        return;
    }

    if (message.startsWith('REQUESTSLIST ')) {
        console.log('Friend requests:', message.slice(12));
        return;
    }

    if (message.startsWith('NOTIFY ')) {
        console.log('🔔', message.slice(7));
        return;
    }

    if (message.startsWith('GROUPMODE ')) {
        const groupMembers = message.slice(10);
        currentDMUser = `group: ${groupMembers}`;
        console.log(`\n👥 You are now in group chat mode with ${groupMembers}`);
        console.log(`   Type messages normally to send to the group`);
        console.log(`   Type /exit or /back to return to public chat\n`);
        return;
    }

    if (message.startsWith('GROUPEXIT ')) {
        const groupMembers = message.slice(10);
        currentDMUser = null;
        console.log(`\n✓ You have exited group chat with ${groupMembers}`);
        console.log(`   You are back in public chat\n`);
        return;
    }

    if (message.startsWith('GROUP ')) {
        console.log(message.slice(6));
        return;
    }

    if (message.startsWith('DMMODE ')) {
        const friendName = message.slice(7);
        currentDMUser = friendName;
        console.log(`\n✉️  You are now in DM mode with ${friendName}`);
        console.log(`   Type messages normally to send DMs to ${friendName}`);
        console.log(`   Type /exit or /back to return to public chat\n`);
        return;
    }

    if (message.startsWith('DMEXIT ')) {
        const friendName = message.slice(7);
        currentDMUser = null;
        console.log(`\n✓ You have exited DM mode with ${friendName}`);
        console.log(`   You are back in public chat\n`);
        return;
    }

    if (message.startsWith('INFO: ')) {
        console.log(message.slice(6));
        return;
    }

    if (message.startsWith('SESSIONLIST ')) {
        const payload = message.slice(12);
        const parts = payload.split(';');
        console.log('\n=== Open Sessions ===');
        parts.forEach(part => console.log(part));
        console.log('');
        return;
    }

    if (message.startsWith('SAVEDLIST ')) {
        const payload = message.slice(10);
        if (payload === 'None') {
            console.log('\nNo saved sessions\n');
            return;
        }
        const parts = payload.split(';');
        console.log('\n=== Saved Sessions ===');
        parts.forEach(part => console.log(part));
        console.log('');
        return;
    }

    if (message.startsWith('SAVEDOK ')) {
        console.log('\nSaved session:', message.slice(8), '\n');
        return;
    }

    if (message === 'DELETEOK') {
        console.log('\nSaved session deleted\n');
        return;
    }

    if (message.startsWith('DM ')) {
        console.log(message.slice(3));
        return;
    }

    if (message === 'COMMANDS') {
        console.log('\n=== Available Commands ===');
        return;
    }

    if (message.startsWith('User List:') || message.startsWith('Friend Management:') || message.startsWith('Direct Messages:') || message.startsWith('Help:') || message.startsWith('Sessions:') || message.startsWith('Group Chat:')) {
        console.log(message);
        return;
    }

    console.log(message);
}

client.on('data', (data) => {
    const text = data.toString();
    const lines = text.split(/\r?\n/).filter(line => line.length > 0);
    lines.forEach(line => processMessage(line));
});

function askAuthOrRegister() {
    rl.question('Do you want to [L]ogin or [R]egister? ', (answer) => {
        const choice = answer.trim().toLowerCase();
        if (choice === 'r' || choice === 'register') {
            askCredentials('REGISTER');
        } else {
            askCredentials('AUTH');
        }
    });
}

function askCredentials(command) {
    rl.question('Username: ', (username) => {
        rl.question('Password: ', (password) => {
            client.write(`${command} ${username} ${password}\n`);
        });
    });
}

askAuthOrRegister();
