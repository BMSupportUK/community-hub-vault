Unicode true
!include "MUI2.nsh"
Name "BM TV Enabler"
OutFile "${OUTPUT}"
InstallDir "$LOCALAPPDATA\Programs\BM TV Enabler"
RequestExecutionLevel user
SetCompressor /SOLID lzma
!define MUI_ABORTWARNING
!define MUI_ICON "build.ico"
!define MUI_UNICON "build.ico"
!define MUI_FINISHPAGE_RUN "$INSTDIR\BM TV Enabler.exe"
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"
Section "BM TV Enabler"
  SetOutPath "$INSTDIR"
  File /r "${APPDIR}\*.*"
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  CreateDirectory "$SMPROGRAMS\BM TV Enabler"
  CreateShortcut "$SMPROGRAMS\BM TV Enabler\BM TV Enabler.lnk" "$INSTDIR\BM TV Enabler.exe"
  CreateShortcut "$SMPROGRAMS\BM TV Enabler\Uninstall.lnk" "$INSTDIR\Uninstall.exe"
  CreateShortcut "$DESKTOP\BM TV Enabler.lnk" "$INSTDIR\BM TV Enabler.exe"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\BMTVEnabler" "DisplayName" "BM TV Enabler"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\BMTVEnabler" "DisplayVersion" "1.60.0"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\BMTVEnabler" "Publisher" "BM Support"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\BMTVEnabler" "UninstallString" '"$INSTDIR\Uninstall.exe"'
SectionEnd
Section "Uninstall"
  Delete "$DESKTOP\BM TV Enabler.lnk"
  RMDir /r "$SMPROGRAMS\BM TV Enabler"
  RMDir /r "$INSTDIR"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\BMTVEnabler"
SectionEnd