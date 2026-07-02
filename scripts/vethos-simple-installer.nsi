Unicode true

!ifndef SOURCE_DIR
  !error "SOURCE_DIR must point to release\\win-unpacked"
!endif

!define APP_NAME "Vethos"
!define APP_EXE "Vethos.exe"
!define UNINSTALL_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\Vethos"

!ifndef APP_VERSION
  !define APP_VERSION "0.12.2"
!endif

!ifndef APP_VERSION4
  !define APP_VERSION4 "0.12.2.0"
!endif

!ifndef OUT_FILE
  !define OUT_FILE "Vethos-Setup-${APP_VERSION}.exe"
!endif

Name "${APP_NAME}"
OutFile "${OUT_FILE}"
InstallDir "$LOCALAPPDATA\Programs\Vethos"
InstallDirRegKey HKCU "Software\Vethos" "Install_Dir"
RequestExecutionLevel user
ShowInstDetails show
ShowUninstDetails show

VIProductVersion "${APP_VERSION4}"
VIAddVersionKey "ProductName" "${APP_NAME}"
VIAddVersionKey "CompanyName" "Vethos"
VIAddVersionKey "FileDescription" "Vethos installer"
VIAddVersionKey "FileVersion" "${APP_VERSION}"
VIAddVersionKey "ProductVersion" "${APP_VERSION}"

!include "MUI2.nsh"

!define MUI_ABORTWARNING
!define MUI_ICON "..\build\icon.ico"
!define MUI_UNICON "..\build\icon.ico"
!define MUI_FINISHPAGE_RUN "$INSTDIR\${APP_EXE}"
!define MUI_FINISHPAGE_RUN_TEXT "Lancer Vethos"

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "French"

Section
  SetShellVarContext current

  DetailPrint "Installation de Vethos dans $INSTDIR"
  SetOutPath "$INSTDIR"
  File /r "${SOURCE_DIR}\*.*"

  WriteRegStr HKCU "Software\Vethos" "Install_Dir" "$INSTDIR"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayName" "${APP_NAME}"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayVersion" "${APP_VERSION}"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "Publisher" "Vethos"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayIcon" "$INSTDIR\${APP_EXE}"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "UninstallString" '"$INSTDIR\Uninstall Vethos.exe"'
  WriteRegDWORD HKCU "${UNINSTALL_KEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINSTALL_KEY}" "NoRepair" 1

  WriteUninstaller "$INSTDIR\Uninstall Vethos.exe"

  CreateDirectory "$SMPROGRAMS\Vethos"
  CreateShortCut "$SMPROGRAMS\Vethos\Vethos.lnk" "$INSTDIR\${APP_EXE}"
  CreateShortCut "$SMPROGRAMS\Vethos\Desinstaller Vethos.lnk" "$INSTDIR\Uninstall Vethos.exe"
  CreateShortCut "$DESKTOP\Vethos.lnk" "$INSTDIR\${APP_EXE}"
SectionEnd

Section "Uninstall"
  SetShellVarContext current

  Delete "$DESKTOP\Vethos.lnk"
  Delete "$SMPROGRAMS\Vethos\Vethos.lnk"
  Delete "$SMPROGRAMS\Vethos\Desinstaller Vethos.lnk"
  RMDir "$SMPROGRAMS\Vethos"

  DeleteRegKey HKCU "${UNINSTALL_KEY}"
  DeleteRegKey HKCU "Software\Vethos"

  RMDir /r "$INSTDIR"
SectionEnd
