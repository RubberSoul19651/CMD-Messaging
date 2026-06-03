/*
 * CMDandWeb-Messaging legacy command-line client for Windows 95/98/ME.
 *
 * Build as a Win32 console program and link with wsock32.lib. This client uses
 * Winsock 1.1 and simple console input so it can run on Windows 9x machines
 * that cannot run modern Node.js.
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <ctype.h>
#include <conio.h>
#include <windows.h>
#include <winsock.h>

#ifdef __WATCOMC__
#define _kbhit kbhit
#define _getch getch
#endif

#define CONFIG_FILE "config.json"
#define DEFAULT_PORT 5190
#define MAX_LINE 1024
#define MAX_HOST 256
#define RECV_BUF 2048

static SOCKET g_socket = INVALID_SOCKET;
static int g_authenticated = 0;
static int g_current_mode = 0; /* 0 = public, 1 = DM, 2 = group */
static char g_current_target[MAX_LINE] = "";
static char g_input[MAX_LINE] = "";
static int g_input_len = 0;

static void prompt(void)
{
    printf("> ");
    fflush(stdout);
}

static void lowercase_copy(char *dest, const char *src, size_t dest_size)
{
    size_t i;
    if (dest_size == 0) return;
    for (i = 0; i + 1 < dest_size && src[i]; i++) {
        dest[i] = (char)tolower((unsigned char)src[i]);
    }
    dest[i] = '\0';
}

static int starts_with(const char *text, const char *prefix)
{
    return strncmp(text, prefix, strlen(prefix)) == 0;
}

static void trim_in_place(char *text)
{
    char *start = text;
    char *end;

    while (*start && isspace((unsigned char)*start)) start++;
    if (start != text) memmove(text, start, strlen(start) + 1);

    end = text + strlen(text);
    while (end > text && isspace((unsigned char)*(end - 1))) end--;
    *end = '\0';
}

static int send_line(const char *line)
{
    size_t len = strlen(line);
    int sent;
    char out[MAX_LINE + 4];

    if (len > MAX_LINE) len = MAX_LINE;
    memcpy(out, line, len);
    out[len++] = '\n';
    out[len] = '\0';

    sent = send(g_socket, out, (int)len, 0);
    return sent == (int)len;
}

static void append_text(char *dest, size_t dest_size, const char *text)
{
    size_t len;

    if (dest_size == 0) return;
    len = strlen(dest);
    if (len + 1 >= dest_size) return;
    strncat(dest, text, dest_size - len - 1);
}

static void make_prefixed_line(char *dest, size_t dest_size, const char *prefix, const char *arg)
{
    if (dest_size == 0) return;
    dest[0] = '\0';
    append_text(dest, dest_size, prefix);
    append_text(dest, dest_size, arg);
}

static void show_help(void)
{
    puts("Commands: /users, /who, /online, /list - view online users.");
    puts("Commands: /friend <username>, /requests, /accept <username>, /reject <username>, /unfriend <username>, /friends - manage your friends.");
    puts("Commands: /dm <username> - open a direct message session with a friend.");
    puts("Commands: /group <username1> <username2> ... - start a group chat with friends.");
    puts("Commands: /joingroup - enter the latest group chat you were invited to.");
    puts("Commands: /sessions - view your open DM or group chat session.");
    puts("Commands: /savesession - save the current DM/group session.");
    puts("Commands: /saved - list your saved sessions.");
    puts("Commands: /open <n> - open a saved session by number.");
    puts("Commands: /deletesaved <n> - delete a saved session by number.");
    puts("Commands: /exit or /back - close the DM/group and return to public chat.");
}

static void send_user_command(const char *line)
{
    char command[MAX_LINE];
    char out[MAX_LINE];
    const char *arg;

    lowercase_copy(command, line, sizeof(command));

    if (strcmp(command, "/users") == 0 || strcmp(command, "/who") == 0 ||
        strcmp(command, "/online") == 0 || strcmp(command, "/list") == 0) {
        send_line("GETUSERS");
    } else if (strcmp(command, "/help") == 0) {
        show_help();
    } else if (strcmp(command, "/sessions") == 0) {
        send_line("SESSIONS");
    } else if (strcmp(command, "/savesession") == 0) {
        send_line("SAVESESSION");
    } else if (strcmp(command, "/saved") == 0) {
        send_line("LISTSAVED");
    } else if (starts_with(command, "/open ")) {
        arg = line + 6;
        make_prefixed_line(out, sizeof(out), "OPENSESSION ", arg);
        send_line(out);
    } else if (starts_with(command, "/deletesaved ")) {
        arg = line + 13;
        make_prefixed_line(out, sizeof(out), "DELETESESSION ", arg);
        send_line(out);
    } else if (strcmp(command, "/exit") == 0 || strcmp(command, "/back") == 0 ||
               strcmp(command, "/exitdm") == 0) {
        g_current_mode = 0;
        g_current_target[0] = '\0';
        send_line("EXIT");
    } else if (starts_with(command, "/group ")) {
        arg = line + 7;
        make_prefixed_line(out, sizeof(out), "GROUP ", arg);
        send_line(out);
    } else if (strcmp(command, "/joingroup") == 0) {
        send_line("JOINLAST");
    } else if (starts_with(command, "/dm ")) {
        arg = line + 4;
        make_prefixed_line(out, sizeof(out), "DM ", arg);
        send_line(out);
    } else if (starts_with(command, "/friend ")) {
        arg = line + 8;
        make_prefixed_line(out, sizeof(out), "FRIEND ", arg);
        send_line(out);
    } else if (strcmp(command, "/requests") == 0) {
        send_line("REQUESTS");
    } else if (starts_with(command, "/accept ")) {
        arg = line + 8;
        make_prefixed_line(out, sizeof(out), "ACCEPT ", arg);
        send_line(out);
    } else if (starts_with(command, "/reject ")) {
        arg = line + 8;
        make_prefixed_line(out, sizeof(out), "REJECT ", arg);
        send_line(out);
    } else if (strcmp(command, "/friend") == 0 || strcmp(command, "/friendlist") == 0 ||
               strcmp(command, "/friends") == 0) {
        send_line("FRIENDS");
    } else if (starts_with(command, "/unfriend ")) {
        arg = line + 10;
        make_prefixed_line(out, sizeof(out), "UNFRIEND ", arg);
        send_line(out);
    } else if (line[0] == '/') {
        puts("Unknown command. Try /help.");
    } else if (g_current_mode == 2) {
        printf("GROUP You: %s\n", line);
        make_prefixed_line(out, sizeof(out), "GROUP_MESSAGE ", line);
        send_line(out);
    } else if (g_current_mode == 1) {
        printf("DM You -> %s: %s\n", g_current_target, line);
        make_prefixed_line(out, sizeof(out), "DMMSG ", line);
        send_line(out);
    } else {
        printf("You: %s\n", line);
        send_line(line);
    }
}

static void ask_credentials(const char *command)
{
    char username[MAX_LINE];
    char password[MAX_LINE];
    char out[MAX_LINE];

    printf("Username: ");
    fflush(stdout);
    if (!fgets(username, sizeof(username), stdin)) exit(1);
    trim_in_place(username);

    printf("Password: ");
    fflush(stdout);
    if (!fgets(password, sizeof(password), stdin)) exit(1);
    trim_in_place(password);

    out[0] = '\0';
    append_text(out, sizeof(out), command);
    append_text(out, sizeof(out), " ");
    append_text(out, sizeof(out), username);
    append_text(out, sizeof(out), " ");
    append_text(out, sizeof(out), password);
    send_line(out);
}

static void ask_auth_or_register(void)
{
    char answer[32];
    printf("Do you want to [L]ogin or [R]egister? ");
    fflush(stdout);
    if (!fgets(answer, sizeof(answer), stdin)) exit(1);
    trim_in_place(answer);

    if (tolower((unsigned char)answer[0]) == 'r') {
        ask_credentials("REGISTER");
    } else {
        ask_credentials("AUTH");
    }
}

static void print_semicolon_list(const char *title, const char *payload)
{
    char copy[RECV_BUF];
    char *part;

    puts("");
    puts(title);
    strncpy(copy, payload, sizeof(copy) - 1);
    copy[sizeof(copy) - 1] = '\0';
    part = strtok(copy, ";");
    while (part) {
        puts(part);
        part = strtok(NULL, ";");
    }
    puts("");
}

static void process_server_line(char *line)
{
    trim_in_place(line);
    if (line[0] == '\0') return;

    if (!g_authenticated && starts_with(line, "OK Welcome")) {
        g_authenticated = 1;
        puts("Login successful. Start typing messages.");
        prompt();
        return;
    }

    if (!g_authenticated && starts_with(line, "OK Registered")) {
        puts("Account created. Please log in now.");
        ask_auth_or_register();
        return;
    }

    if (!g_authenticated && starts_with(line, "ERROR")) {
        printf("Server error: %s\n", line);
        ask_auth_or_register();
        return;
    }

    if (starts_with(line, "USERS ")) {
        printf("Online users: %s\n", line + 6);
    } else if (starts_with(line, "FRIENDSLIST ")) {
        printf("Friends: %s\n", line + 11);
    } else if (starts_with(line, "REQUESTSLIST ")) {
        printf("Friend requests: %s\n", line + 12);
    } else if (starts_with(line, "NOTIFY: ")) {
        printf("Notice: %s\n", line + 8);
    } else if (starts_with(line, "NOTIFY ")) {
        printf("Notice: %s\n", line + 7);
    } else if (starts_with(line, "GROUPMODE ")) {
        g_current_mode = 2;
        strncpy(g_current_target, line + 10, sizeof(g_current_target) - 1);
        g_current_target[sizeof(g_current_target) - 1] = '\0';
        printf("\nYou are now in group chat mode with %s\n", g_current_target);
        puts("Type /exit or /back to return to public chat.\n");
    } else if (starts_with(line, "GROUPEXIT ")) {
        g_current_mode = 0;
        g_current_target[0] = '\0';
        printf("\nYou have exited group chat with %s\n\n", line + 10);
    } else if (starts_with(line, "GROUP ")) {
        puts(line + 6);
    } else if (starts_with(line, "DMMODE ")) {
        g_current_mode = 1;
        strncpy(g_current_target, line + 7, sizeof(g_current_target) - 1);
        g_current_target[sizeof(g_current_target) - 1] = '\0';
        printf("\nYou are now in DM mode with %s\n", g_current_target);
        puts("Type /exit or /back to return to public chat.\n");
    } else if (starts_with(line, "DMEXIT ")) {
        g_current_mode = 0;
        g_current_target[0] = '\0';
        printf("\nYou have exited DM mode with %s\n\n", line + 7);
    } else if (starts_with(line, "INFO: ")) {
        puts(line + 6);
    } else if (starts_with(line, "SESSIONLIST ")) {
        print_semicolon_list("=== Open Sessions ===", line + 12);
    } else if (starts_with(line, "SAVEDLIST ")) {
        if (strcmp(line + 10, "None") == 0) {
            puts("\nNo saved sessions\n");
        } else {
            print_semicolon_list("=== Saved Sessions ===", line + 10);
        }
    } else if (starts_with(line, "SAVEDOK ")) {
        printf("\nSaved session: %s\n\n", line + 8);
    } else if (strcmp(line, "DELETEOK") == 0) {
        puts("\nSaved session deleted\n");
    } else if (starts_with(line, "DM ")) {
        puts(line + 3);
    } else if (strcmp(line, "COMMANDS") == 0) {
        puts("\n=== Available Commands ===");
    } else {
        puts(line);
    }

    if (g_authenticated) prompt();
}

static void process_recv_buffer(const char *data, int len)
{
    static char pending[RECV_BUF];
    static int pending_len = 0;
    int i;

    for (i = 0; i < len; i++) {
        char ch = data[i];
        if (ch == '\n') {
            pending[pending_len] = '\0';
            process_server_line(pending);
            pending_len = 0;
        } else if (ch != '\r' && pending_len + 1 < (int)sizeof(pending)) {
            pending[pending_len++] = ch;
        }
    }
}

static void handle_keyboard(void)
{
    int ch;

    while (_kbhit()) {
        ch = _getch();
        if (ch == '\r' || ch == '\n') {
            putchar('\n');
            g_input[g_input_len] = '\0';
            trim_in_place(g_input);
            if (g_input[0]) send_user_command(g_input);
            g_input_len = 0;
            g_input[0] = '\0';
            if (g_authenticated) prompt();
        } else if (ch == 8) {
            if (g_input_len > 0) {
                g_input_len--;
                g_input[g_input_len] = '\0';
                printf("\b \b");
                fflush(stdout);
            }
        } else if (ch >= 32 && ch < 127 && g_input_len + 1 < MAX_LINE) {
            g_input[g_input_len++] = (char)ch;
            putchar(ch);
            fflush(stdout);
        }
    }
}

static void load_config(char *host, int host_size, int *port)
{
    FILE *file;
    char line[MAX_LINE];
    char *key;
    char *value;

    strncpy(host, "127.0.0.1", host_size - 1);
    host[host_size - 1] = '\0';
    *port = DEFAULT_PORT;

    file = fopen(CONFIG_FILE, "r");
    if (!file) return;

    while (fgets(line, sizeof(line), file)) {
        if (strstr(line, "\"clientHost\"")) {
            key = strchr(line, ':');
            if (key) {
                value = strchr(key, '"');
                if (value) {
                    value++;
                    key = strchr(value, '"');
                    if (key) *key = '\0';
                    if (strcmp(value, "placeholder") != 0 && value[0] != '\0') {
                        strncpy(host, value, host_size - 1);
                        host[host_size - 1] = '\0';
                    }
                }
            }
        } else if (strstr(line, "\"clientPort\"")) {
            key = strchr(line, ':');
            if (key) {
                *port = atoi(key + 1);
                if (*port <= 0) *port = DEFAULT_PORT;
            }
        }
    }

    fclose(file);
}

static int connect_to_server(const char *host, int port)
{
    struct sockaddr_in addr;
    struct hostent *he;
    unsigned long ip;
    unsigned long nonblocking = 1;

    g_socket = socket(AF_INET, SOCK_STREAM, 0);
    if (g_socket == INVALID_SOCKET) return 0;

    memset(&addr, 0, sizeof(addr));
    addr.sin_family = AF_INET;
    addr.sin_port = htons((unsigned short)port);

    ip = inet_addr(host);
    if (ip == INADDR_NONE) {
        he = gethostbyname(host);
        if (!he || !he->h_addr_list || !he->h_addr_list[0]) return 0;
        memcpy(&addr.sin_addr, he->h_addr_list[0], he->h_length);
    } else {
        addr.sin_addr.s_addr = ip;
    }

    if (connect(g_socket, (struct sockaddr *)&addr, sizeof(addr)) == SOCKET_ERROR) {
        return 0;
    }

    ioctlsocket(g_socket, FIONBIO, &nonblocking);
    return 1;
}

int main(int argc, char **argv)
{
    WSADATA wsa;
    char host[MAX_HOST];
    int port;
    char buf[RECV_BUF];
    int n;

    load_config(host, sizeof(host), &port);
    if (argc >= 2) {
        strncpy(host, argv[1], sizeof(host) - 1);
        host[sizeof(host) - 1] = '\0';
    }
    if (argc >= 3) {
        port = atoi(argv[2]);
        if (port <= 0) port = DEFAULT_PORT;
    }

    if (WSAStartup(MAKEWORD(1, 1), &wsa) != 0) {
        puts("Winsock 1.1 startup failed. Make sure TCP/IP is installed.");
        return 1;
    }

    printf("Connecting to chat server at %s:%d...\n", host, port);
    if (!connect_to_server(host, port)) {
        printf("Connection failed. Check config.json or run: legacy-client-win9x.exe host port\n");
        WSACleanup();
        return 1;
    }

    puts("Connected.");
    ask_auth_or_register();

    while (1) {
        n = recv(g_socket, buf, sizeof(buf), 0);
        if (n > 0) {
            process_recv_buffer(buf, n);
        } else if (n == 0) {
            puts("\nDisconnected from server.");
            break;
        } else {
            int err = WSAGetLastError();
            if (err != WSAEWOULDBLOCK) {
                printf("\nConnection error: %d\n", err);
                break;
            }
        }

        if (g_authenticated) handle_keyboard();
        Sleep(10);
    }

    closesocket(g_socket);
    WSACleanup();
    return 0;
}
