TODO: I am currently working on building a client that will run on Windows 9x and Windows 2000 since Node.js (v4.9.1) will not work at all on 9x and only works on Windows 2000 via extended kernel.

This is a really basic messaging server and client that you can host on your own computer. The server can be connected to via the web client or the command prompt/terminal client which is prefered for use on older operating systems.
CMDandWeb-Messaging is supported on Windows XP-11 and requires Node.js v5.12.0 at minimum to run. 
You can build an EXE for the server and command prompt/terminal client using the provided build.bat on Windows 10 and 11. Users on Windows XP - Windows 8.1 will most likely need to use run-server.bat and run-client.bat to run both the server and or client since build.bat will fail to run completely on those operating systems.

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
