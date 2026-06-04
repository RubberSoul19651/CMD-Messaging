@echo off
rem Build DOSCHAT.EXE for MS-DOS 6.22 with Open Watcom and Watt-32.
rem
rem Before running this, set WATT_ROOT to your Watt-32 source/build folder.
rem Example:
rem   SET WATT_ROOT=C:\WATT32
rem
rem The packet driver and WATTCP.CFG are runtime requirements on the DOS PC.

if exist "C:\WATCOMV2\BINNT\WCL.EXE" set WATCOM=C:\WATCOMV2
if not "%WATCOM%"=="" set PATH=%WATCOM%\BINNT;%WATCOM%\BINW;%PATH%
if not "%WATCOM%"=="" set INCLUDE=%WATCOM%\H
if not "%WATCOM%"=="" set LIB=%WATCOM%\LIB286;%WATCOM%\LIB286\DOS;%WATCOM%\LIB386;%WATCOM%\LIB386\DOS
if "%WATT_ROOT%"=="" if exist "%USERPROFILE%\folderwithwatt32s\watt32s\inc\tcp.h" set WATT_ROOT=%USERPROFILE%\folderwithwatt32s\watt32s

if "%WATT_ROOT%"=="" goto no_watt
if not exist "%WATT_ROOT%\inc\tcp.h" goto bad_watt
if not exist "%WATT_ROOT%\lib\wattcpwl.lib" goto no_lib

wcl -q -bt=dos -ml -k32768 -I%WATT_ROOT%\inc dosclient.c %WATT_ROOT%\lib\wattcpwl.lib -fe=DOSCHAT.EXE
goto end

:no_watt
echo Set WATT_ROOT to your Watt-32 folder first.
echo Example: SET WATT_ROOT=C:\WATT32
goto end

:bad_watt
echo Could not find %%WATT_ROOT%%\inc\tcp.h.
echo Check that WATT_ROOT points to your Watt-32 folder.
goto end

:no_lib
echo Could not find %%WATT_ROOT%%\lib\wattcpwl.lib.
echo Build Watt-32 first:
echo   cd %%WATT_ROOT%%\src
echo   configur watcom
echo   wmake -f watcom_l.mak
:end
PAUSE