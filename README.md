This is a really basic messaging server and client that you can host on your own computer. The server can be connected to via the web client or the command prompt/terminal client which is prefered for use on older operating systems.
CMDandWeb-Messaging is supported on Windows 9x & 2000 - Windows 11 and requires Node.js v5.12.0 (XP and Above) at minimum to run. 
You can build an EXE for the server and command prompt/terminal client using the provided build.bat on Windows 10 and 11. Users on Windows XP - Windows 8.1 will most likely need to use run-server.bat and run-client.bat to run both the server and or client since build.bat will fail to run completely on those operating systems.

Windows 95/98/ME command-line client:
Windows 9x cannot run modern Node.js, so the normal client.js client will not work there. A separate legacy C client is included in legacy-client-win9x.c. Build it on a machine with Visual C++ 6.0, Open Watcom, or MinGW by running build-legacy-client-win9x.bat, then copy legacy-client-win9x.exe and config.json to the Windows 9x computer. The server can stay on a modern machine.

If you are compiling directly on Windows 9x and the build batch file does not run in COMMAND.COM, run one of these commands from the project folder instead:
Visual C++ 6.0: cl /O2 /W3 /DWIN32 legacy-client-win9x.c /link /subsystem:console wsock32.lib /out:legacy-client-win9x.exe
Open Watcom: wcl386 -q -bt=nt -l=nt legacy-client-win9x.c wsock32.lib -fe=legacy-client-win9x.exe
MinGW: gcc -O2 -Wall -o legacy-client-win9x.exe legacy-client-win9x.c -lwsock32

The legacy client reads clientHost and clientPort from config.json. You can also run it with a host and port directly:
legacy-client-win9x.exe 192.168.1.50 5190

Make sure TCP/IP and Winsock are installed on the Windows 9x machine, and use the server computer's LAN IP address in clientHost instead of "localhost" unless the server is running on the same Windows 9x computer.

Features (as of now):
Direct Messaging, 
Group Chats,
Public Chat with all users,
Friends,
Saving previous sessions,
Account Registration (very basic but functional),
Web Client that can be accessed on all devices

IMPORTANT:
To run the server, you must first configure the command prompt/terminal client and the server using config.json or the server will not run properly. 
After this, in the directory containing the source code open a command prompt and type npm install in order to install the dependencies required for the server to run. 
