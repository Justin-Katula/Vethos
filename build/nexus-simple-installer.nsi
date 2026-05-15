Unicode true

!ifndef SOURCE_DIR
  !error "SOURCE_DIR must point to release\\win-unpacked"
!endif

!define APP_NAME "Nexus"
!define APP_EXE "Nexus.exe"
!define UNINSTALL_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\Nexus"

!ifndef APP_VERSION
  !define APP_VERSION "0.6.0"
!endif

!ifndef APP_VERSION4
  !define APP_VERSION4 "0.6.0.0"
!endif

!ifndef OUT_FILE
  !define OUT_FILE "Nexus-Setup-${APP_VERSION}.exe"
!endif

Name "${APP_NAME}"
OutFile "${OUT_FILE}"
InstallDir "$LOCALAPPDATA\Programs\Nexus"
InstallDirRegKey HKCU "Software\Nexus" "Install_Dir"
RequestExecutionLevel user
ShowInstDetails show
ShowUninstDetails show

VIProductVersion "${APP_VERSION4}"
VIAddVersionKey "ProductName" "${APP_NAME}"
VIAddVersionKey "CompanyName" "Nexus"
VIAddVersionKey "FileDescription" "Nexus installer"
VIAddVersionKey "FileVersion" "${APP_VERSION}"
VIAddVersionKey "ProductVersion" "${APP_VERSION}"

!include "MUI2.nsh"

!define MUI_ABORTWARNING
!define MUI_FINISHPAGE_RUN "$INSTDIR\${APP_EXE}"
!define MUI_FINISHPAGE_RUN_TEXT "Lancer Nexus"

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "French"

Section
  SetShellVarContext current

  DetailPrint "Installation de Nexus dans $INSTDIR"
  SetOutPath "$INSTDIR"
  File /r "${SOURCE_DIR}\*.*"

  WriteRegStr HKCU "Software\Nexus" "Install_Dir" "$INSTDIR"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayName" "${APP_NAME}"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayVersion" "${APP_VERSION}"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "Publisher" "Nexus"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayIcon" "$INSTDIR\${APP_EXE}"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "UninstallString" '"$INSTDIR\Uninstall Nexus.exe"'
  WriteRegDWORD HKCU "${UNINSTALL_KEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINSTALL_KEY}" "NoRepair" 1

  WriteUninstaller "$INSTDIR\Uninstall Nexus.exe"

  CreateDirectory "$SMPROGRAMS\Nexus"
  CreateShortCut "$SMPROGRAMS\Nexus\Nexus.lnk" "$INSTDIR\${APP_EXE}"
  CreateShortCut "$SMPROGRAMS\Nexus\Desinstaller Nexus.lnk" "$INSTDIR\Uninstall Nexus.exe"
  CreateShortCut "$DESKTOP\Nexus.lnk" "$INSTDIR\${APP_EXE}"
SectionEnd

Section "Uninstall"
  SetShellVarContext current

  Delete "$DESKTOP\Nexus.lnk"
  Delete "$SMPROGRAMS\Nexus\Nexus.lnk"
  Delete "$SMPROGRAMS\Nexus\Desinstaller Nexus.lnk"
  RMDir "$SMPROGRAMS\Nexus"

  DeleteRegKey HKCU "${UNINSTALL_KEY}"
  DeleteRegKey HKCU "Software\Nexus"

  RMDir /r "$INSTDIR"
SectionEnd
