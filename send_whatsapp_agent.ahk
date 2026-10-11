; send_whatsapp_agent.ahk
;
; Agente de escritorio que reemplaza a Twilio/S3 para el envio de facturas.
; Corre en segundo plano en la PC del negocio (donde esta abierto WhatsApp
; Desktop) y hace lo siguiente en bucle:
;
;   1) Revisa la carpeta whatsapp-queue dentro de los datos de la app
;      (se resuelve sola al arrancar, ver DATA_DIR). El backend deja
;      ahi un archivo "<id>.job" cada vez que alguien pide enviar una factura.
;   2) Por cada job encontrado: toma el PNG de la factura del disco, lo pega en el
;      chat de WhatsApp Desktop del telefono del cliente junto con el texto
;      de la factura (como pie de foto, un solo mensaje), y borra el job.
;   3) Escribe el resultado (OK o ERROR:motivo) en whatsapp-results\<id>.result
;      para que el backend confirme el envio.
;
; Requisitos: WhatsApp Desktop instalado y con
; sesion iniciada, y este script corriendo (dejalo en la carpeta de inicio
; de Windows para que arranque solo con la PC).
;
; PORTABLE: este archivo NO tiene ninguna ruta con un nombre de usuario de
; Windows quemada, ni el nombre exacto de la carpeta del proyecto. Al
; arrancar, detecta solo:
;   - La ruta de WhatsApp Desktop, leyendo la variable de entorno
;     LOCALAPPDATA (que Windows define para cualquier usuario, sea cual sea
;     su nombre) en vez de escribir "C:\Users\<alguien>\..." a mano.
;   - La carpeta de datos de la app, leyendo APPDATA (Windows la define
;     para cualquier usuario, sea cual sea su nombre).
; Por eso el mismo archivo sirve para instalarlo en cualquier PC sin editar
; nada a mano (ver instalar.ps1/instalar.bat, que ademas lo copia a la
; carpeta de Inicio de Windows).

#NoEnv
#SingleInstance Force
#Persistent
SendMode Input
SetWorkingDir %A_ScriptDir%
SetTitleMatchMode, 2
; El backend escribe los .job en UTF-8 sin BOM (fs.writeFile con 'utf-8').
; Sin esto, FileRead los lee con la codepage ANSI de Windows por defecto, y
; cualquier acento o "ñ" del mensaje sale corrupto al pegarlo en WhatsApp.
FileEncoding, UTF-8

; ===== CONFIGURACION =====
LOCAL_DIR         := "C:\temp\whatsapp_send"
POLL_INTERVAL_MS  := 3000   ; cada cuanto revisa la cola
; x4 (era 15000): en una PC mas lenta, el comando de PowerShell que copia la
; imagen al portapapeles puede tardar bastante mas sin que nada este fallando.
CMD_TIMEOUT_MS    := 60000  ; maximo que se espera un comando de Windows (PowerShell)
LOG_FILE          := LOCAL_DIR "\agent.log"

; La app guarda sus datos en AppData\Roaming\<nombre de la app>\datos
; (ver dataDir() en desktop/nativo.js). Ya no hay volumenes de Docker: la
; cola, las facturas y los resultados son carpetas normales de Windows.
; La carpeta de datos cambia de nombre segun como corra la app: instalada es
; "Cafe Shopping" (productName) y en desarrollo "cafe-shopping-desktop"
; (name del package.json). Por eso NO se escribe a mano: la app deja la ruta
; real en ruta-datos.txt al arrancar (ver publicarRutaParaElAgente en
; desktop/nativo.js). Si ese archivo no existe todavia -por ejemplo si el
; agente arranco antes que la app- se prueban los nombres conocidos.
EnvGet, appData, APPDATA
DATA_DIR := ""
rutaPublicada := "C:\temp\whatsapp_send\ruta-datos.txt"
if FileExist(rutaPublicada) {
    FileRead, rutaLeida, %rutaPublicada%
    rutaLeida := RegExReplace(rutaLeida, "^\s+|\s+$", "")
    if (rutaLeida != "" && FileExist(rutaLeida))
        DATA_DIR := rutaLeida
}
if (DATA_DIR = "") {
    for i, candidato in ["Cafe Shopping", "cafe-shopping-desktop"] {
        prueba := appData "\" candidato "\datos"
        if FileExist(prueba) {
            DATA_DIR := prueba
            break
        }
    }
}
if (DATA_DIR = "")
    DATA_DIR := appData "\Cafe Shopping\datos"

UPLOADS_DIR := DATA_DIR "\uploads"
QUEUE_DIR   := UPLOADS_DIR "\whatsapp-queue"
RESULTS_DIR := UPLOADS_DIR "\whatsapp-results"
INVOICES_DIR := UPLOADS_DIR "\invoices"
; ==========================

FileCreateDir, %LOCAL_DIR%

; ---- Detectar la ruta de WhatsApp Desktop (sin usuario quemado) ----
EnvGet, localAppData, LOCALAPPDATA
WHATSAPP_EXE_PATH := localAppData "\WhatsApp\WhatsApp.exe"
if !FileExist(WHATSAPP_EXE_PATH)
    LogLine("AVISO: no encontre WhatsApp Desktop en " WHATSAPP_EXE_PATH ". Instalalo (Microsoft Store o whatsapp.com/download) antes de mandar facturas.")

; ---- Preparar las carpetas de trabajo ----
FileCreateDir, %QUEUE_DIR%
FileCreateDir, %RESULTS_DIR%
if !FileExist(UPLOADS_DIR)
    LogLine("AVISO: no existe " UPLOADS_DIR ". Abre Cafe Shopping al menos una vez para que se cree.")

LogLine("=== Agente de WhatsApp iniciado. Vigilando " QUEUE_DIR " cada " POLL_INTERVAL_MS "ms ===")

; Icono de bandeja para saber que esta corriendo (click derecho > Exit para salir)
Menu, Tray, Tip, Agente WhatsApp Cafe Shopping (activo)

Loop
{
    jobs := GetPendingJobs()
    if (jobs.Length() > 0)
        LogLine("Poll: " jobs.Length() " job(s) pendiente(s).")
    for index, jobName in jobs
    {
        LogLine("Procesando " jobName " ...")
        result := ProcessJob(jobName)
        if (result.ok)
            LogLine("OK -> " jobName)
        else
            LogLine("ERROR -> " jobName ": " result.errMsg)
    }
    Sleep, %POLL_INTERVAL_MS%
}
Return

; ============================================================
; Corre un comando via cmd.exe con un limite de tiempo real.
; ============================================================
RunWithTimeout(cmdLine, timeoutMs, outFile := "") {
    fullCmd := cmdLine
    if (outFile != "")
        fullCmd := cmdLine " > """ outFile """ 2>&1"

    Run, %ComSpec% /c %fullCmd%, , Hide, pid
    if !pid
        return {timedOut: false, launchFailed: true}

    startTime := A_TickCount
    Loop
    {
        Process, Exist, %pid%
        if !ErrorLevel
            return {timedOut: false, launchFailed: false}
        if (A_TickCount - startTime > timeoutMs) {
            Process, Close, %pid%
            return {timedOut: true, launchFailed: false}
        }
        Sleep, 150
    }
}


; ============================================================
; Devuelve un array con los nombres de archivo *.job pendientes
; ============================================================
GetPendingJobs() {
    global QUEUE_DIR
    jobs := []
    ; Leer una carpeta local es instantaneo y no puede dar timeout, a
    ; diferencia del "docker run" que hacia falta antes para asomarse al
    ; volumen (y que se colgaba si Docker estaba ocupado).
    Loop, Files, %QUEUE_DIR%\*.job
        jobs.Push(A_LoopFileName)
    return jobs
}

; ============================================================
; Procesa un job: extrae PNG, envia por WhatsApp Desktop...
; ============================================================
ProcessJob(jobName) {
    global QUEUE_DIR, INVOICES_DIR, LOCAL_DIR, WHATSAPP_EXE_PATH, CMD_TIMEOUT_MS

    jobId := SubStr(jobName, 1, StrLen(jobName) - 4) ; quita ".job"

    ; --- 1) Leer el contenido del job ---
    jobPath := QUEUE_DIR "\" jobName
    LogLine("  [1/5] Leyendo pedido...")
    if !FileExist(jobPath)
        return {ok: false, errMsg: "El pedido ya no existe."}

    FileRead, jobContent, %jobPath%
    parsed := ParseJob(jobContent)
    if (parsed.phone = "" || parsed.filename = "") {
        LogLine("  Pedido invalido (falta telefono o archivo).")
        FileDelete, %jobPath%
        result := {ok: false, errMsg: "Pedido invalido."}
        PushResult(jobId, result)
        return result
    }

    ; --- 2) Sacar el pedido de la cola YA ---
    LogLine("  [2/5] Quitando pedido de la cola...")
    FileDelete, %jobPath%

    ; --- 3) La factura ya esta en disco: no hay nada que extraer ---
    ; Antes habia que copiarla desde el volumen de Docker con "docker run cp".
    ; Ahora es un archivo normal y se usa directo, sin copias intermedias.
    pngLocalPath := INVOICES_DIR "\" parsed.filename
    LogLine("  [3/5] Usando factura " parsed.filename " ...")
    if !FileExist(pngLocalPath) {
        result := {ok: false, errMsg: "No se encontro la factura " parsed.filename "."}
        PushResult(jobId, result)
        return result
    }

    ; --- 4) Cargar la imagen real al portapapeles ---
    LogLine("  [4/5] Copiando imagen al portapapeles...")
    psCmd := "powershell.exe -NoProfile -Command ""Set-Clipboard -Path '" pngLocalPath "'"""
    run := RunWithTimeout(psCmd, CMD_TIMEOUT_MS)
    if (run.timedOut) {
        result := {ok: false, errMsg: "TIMEOUT copiando imagen al portapapeles."}
        PushResult(jobId, result)
        return result
    }
    ; Intervalos x4 desde aqui hasta el final del envio (eran 400/10/10/5/
    ; 1000/1000/1000/3000/600/1200): en una PC menos potente que se traba
    ; procesando todo, ir tan rapido hacia el siguiente paso sin darle tiempo
    ; a WhatsApp de ponerse al dia terminaba colgando hasta WhatsApp mismo.
    Sleep, 1600

    ; --- 5) Asegurar que WhatsApp Desktop este activo ---
    LogLine("  [4/5] Activando WhatsApp Desktop...")
    IfWinNotExist, ahk_exe WhatsApp.Root.exe
    {
        Run, whatsapp:
        WinWait, ahk_exe WhatsApp.Root.exe, , 40
    }
    IfWinNotExist, WhatsApp
    {
        Run, %WHATSAPP_EXE_PATH%
        WinWait, WhatsApp, , 40
    }

    WinActivate, WhatsApp
    WinWaitActive, WhatsApp, , 20
    if ErrorLevel {
        result := {ok: false, errMsg: "No se pudo activar WhatsApp."}
        PushResult(jobId, result)
        return result
    }

    ; --- 6) Buscar el chat por telefono ---
    LogLine("  [5/5] Buscando chat de " parsed.phone " ...")
    searchDigits := RegExReplace(parsed.phone, "[^0-9]", "")
    Send, ^f
    Sleep, 4000
    SendRaw, %searchDigits%
    Sleep, 4000
    Send, {Enter}
    Sleep, 4000

    ; --- 7) Pegar la imagen y escribir el texto ---
    LogLine("  [5/5] Pegando imagen y enviando...")
    Send, ^v
    Sleep, 12000

    ; Los saltos de linea del mensaje (ej. la firma del negocio en su propia
    ; linea) se mandan como Shift+Enter: un Enter normal ENVIA el mensaje a
    ; medias en WhatsApp. Antes se aplanaban a espacios y el mensaje perdia
    ; el formato en varias lineas.
    lineas := StrSplit(StrReplace(parsed.message, "`r", ""), "`n")
    Loop, % lineas.Length()
    {
        SendRaw, % lineas[A_Index]
        if (A_Index < lineas.Length()) {
            Send, +{Enter}
            Sleep, 200
        }
    }
    Sleep, 2400
    Send, {Enter}
    Sleep, 4800

    result := {ok: true, errMsg: ""}
    PushResult(jobId, result)
    return result
}

; ============================================================
; Parsea el contenido de un .job
; ============================================================
ParseJob(content) {
    phone := ""
    filename := ""
    messageLines := []
    inMessage := false

    Loop, Parse, content, `n, `r
    {
        line := A_LoopField
        if (!inMessage && SubStr(line, 1, 6) = "phone=") {
            phone := SubStr(line, 7)
        } else if (!inMessage && SubStr(line, 1, 9) = "filename=") {
            filename := SubStr(line, 10)
        } else if (SubStr(line, 1, 8) = "message=") {
            inMessage := true
            messageLines.Push(SubStr(line, 9))
        } else if (inMessage) {
            messageLines.Push(line)
        }
    }

    message := ""
    for i, l in messageLines
        message .= (i = 1 ? "" : "`n") . l

    return {phone: Trim(phone), filename: Trim(filename), message: message}
}

; ============================================================
; Escribe el resultado localmente y lo copia de vuelta
; ============================================================
PushResult(jobId, result) {
    global RESULTS_DIR

    resultPath := RESULTS_DIR "\" jobId ".result"
    FileDelete, %resultPath%
    text := result.ok ? "OK" : "ERROR:" result.errMsg
    FileAppend, %text%, %resultPath%
}

; ============================================================
; Log simple a archivo
; ============================================================
LogLine(msg) {
    global LOG_FILE
    FormatTime, ts,, yyyy-MM-dd HH:mm:ss
    FileAppend, [%ts%] %msg%`n, %LOG_FILE%
}