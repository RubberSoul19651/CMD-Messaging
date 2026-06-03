@echo off
cd /d "%~dp0"

echo Building Windows 9x legacy command-line client...
echo.

if not exist legacy-client-win9x.c goto missing_source

cl.exe /nologo /O2 /W3 /DWIN32 legacy-client-win9x.c /link /subsystem:console wsock32.lib /out:legacy-client-win9x.exe
if not errorlevel 1 goto done

wcl386.exe -q -bt=nt -l=nt legacy-client-win9x.c wsock32.lib -fe=legacy-client-win9x.exe
if not errorlevel 1 goto done

gcc.exe -O2 -Wall -o legacy-client-win9x.exe legacy-client-win9x.c -lwsock32
if not errorlevel 1 goto done

echo No supported C compiler was found.
echo Install Visual C++ 6.0, Open Watcom, or MinGW, then run this file again.
goto failed

:missing_source
echo Could not find legacy-client-win9x.c.
echo Make sure this batch file is in the same folder as the source file.
goto failed

:done
if errorlevel 1 (
    echo.
    echo Build failed.
    goto failed
)
echo.
echo Built legacy-client-win9x.exe
echo.
pause
goto end

:failed
echo.
echo Build failed or no compiler was available.
echo.
pause

:end
