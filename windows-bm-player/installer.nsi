Unicode true
!include "MUI2.nsh"
Name "BM Player"
OutFile "${OUTPUT}"
InstallDir "$LOCALAPPDATA\Programs\BM Player"
RequestExecutionLevel user
SetCompressor /SOLID lzma
!define MUI_ABORTWARNING
!define MUI_ICON "build.ico"
!define MUI_UNICON "build.ico"
!define MUI_FINISHPAGE_RUN "$INSTDIR\BM Player.exe"
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"
Section "BM Player"
  ; A running BM Player (or a leftover background process) locks its DLLs,
  ; which makes every file fail with "Error opening file for writing".
  DetailPrint "Closing BM Player if it is running..."
  StrCpy $1 0
  close_loop:
    ; Full path: a 32-bit installer cannot always find taskkill on PATH.
    nsExec::Exec '"$SYSDIR\taskkill.exe" /F /T /IM "BM Player.exe"'
    Pop $0
    nsExec::Exec 'powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "Get-Process | Where-Object { $$_.Path -like \"$INSTDIR\*\" } | Stop-Process -Force"'
    Pop $0
    Sleep 1500
    IfFileExists "$INSTDIR\libEGL.dll" 0 files_free
    ClearErrors
    FileOpen $2 "$INSTDIR\libEGL.dll" a
    IfErrors still_locked
    FileClose $2
    Goto files_free
  still_locked:
    IntOp $1 $1 + 1
    IntCmp $1 5 ask_user close_loop ask_user
  ask_user:
    MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "BM Player is still open.$\r$\n$\r$\nClose BM Player (or restart the computer), then click Retry." IDRETRY close_retry
    Abort
  close_retry:
    StrCpy $1 0
    Goto close_loop
  files_free:
  SetOutPath "$INSTDIR"
  File /r "${APPDIR}\*.*"
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  CreateDirectory "$SMPROGRAMS\BM Player"
  CreateShortcut "$SMPROGRAMS\BM Player\BM Player.lnk" "$INSTDIR\BM Player.exe" "" "$INSTDIR\resources\app\build.ico"
  CreateShortcut "$SMPROGRAMS\BM Player\Uninstall.lnk" "$INSTDIR\Uninstall.exe"
  CreateShortcut "$DESKTOP\BM Player.lnk" "$INSTDIR\BM Player.exe" "" "$INSTDIR\resources\app\build.ico"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\BMPlayer" "DisplayName" "BM Player"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\BMPlayer" "DisplayVersion" "0.4.78"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\BMPlayer" "Publisher" "BM Support"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\BMPlayer" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\BMPlayer" "DisplayIcon" "$INSTDIR\resources\app\build.ico"
SectionEnd
Section "Uninstall"
  Delete "$DESKTOP\BM Player.lnk"
  RMDir /r "$SMPROGRAMS\BM Player"
  RMDir /r "$INSTDIR"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\BMPlayer"
SectionEnd