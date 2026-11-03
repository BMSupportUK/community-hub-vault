Unicode true
!include "MUI2.nsh"
Name "BM Player"
OutFile "${OUTPUT}"
InstallDir "$LOCALAPPDATA\Programs\BM Player"
RequestExecutionLevel user
SetCompressor /SOLID lzma
!define MUI_ABORTWARNING
!define MUI_ICON "../windows-tv-enabler/build.ico"
!define MUI_UNICON "../windows-tv-enabler/build.ico"
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
  nsExec::Exec 'taskkill /F /T /IM "BM Player.exe"'
  Pop $0
  Sleep 1500
  SetOutPath "$INSTDIR"
  File /r "${APPDIR}\*.*"
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  CreateDirectory "$SMPROGRAMS\BM Player"
  CreateShortcut "$SMPROGRAMS\BM Player\BM Player.lnk" "$INSTDIR\BM Player.exe"
  CreateShortcut "$SMPROGRAMS\BM Player\Uninstall.lnk" "$INSTDIR\Uninstall.exe"
  CreateShortcut "$DESKTOP\BM Player.lnk" "$INSTDIR\BM Player.exe"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\BMPlayer" "DisplayName" "BM Player"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\BMPlayer" "DisplayVersion" "0.2.8"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\BMPlayer" "Publisher" "BM Support"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\BMPlayer" "UninstallString" '"$INSTDIR\Uninstall.exe"'
SectionEnd
Section "Uninstall"
  Delete "$DESKTOP\BM Player.lnk"
  RMDir /r "$SMPROGRAMS\BM Player"
  RMDir /r "$INSTDIR"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\BMPlayer"
SectionEnd