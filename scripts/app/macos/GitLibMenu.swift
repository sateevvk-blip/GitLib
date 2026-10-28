// GitLib.app для macOS: значок в строке меню, который запускает сервер (Contents/Resources/gitlib-server) в фоне.
// Собирается на macOS: swiftc -O -target arm64-apple-macos11 GitLibMenu.swift -o GitLib
import Cocoa

final class AppDelegate: NSObject, NSApplicationDelegate {
    private let env = ProcessInfo.processInfo.environment
    private lazy var port = env["GITLIB_PORT"].flatMap { $0.isEmpty ? nil : $0 } ?? "4817"
    private lazy var url = URL(string: "http://localhost:\(port)")!
    private lazy var apiBase = "http://127.0.0.1:\(port)/api"
    private lazy var dataDir: URL = {
        if let custom = env["GITLIB_DATA_DIR"], !custom.isEmpty { return URL(fileURLWithPath: custom) }
        return FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("Library/Application Support/GitLib", isDirectory: true)
    }()
    private let agentURL = FileManager.default.homeDirectoryForCurrentUser
        .appendingPathComponent("Library/LaunchAgents/local.gitlib.app.plist")

    private var statusItem: NSStatusItem!
    private var autostartItem: NSMenuItem!
    private var server: Process?
    private var stopping = false

    func applicationDidFinishLaunching(_ notification: Notification) {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        if let button = statusItem.button {
            let image = NSImage(systemSymbolName: "books.vertical", accessibilityDescription: "GitLib")
            image?.isTemplate = true
            button.image = image
            button.toolTip = "GitLib — запускается…"
        }

        let menu = NSMenu()
        menu.addItem(item("Открыть GitLib", #selector(openGitLib)))
        menu.addItem(item("Папка с данными", #selector(openDataDir)))
        menu.addItem(.separator())
        autostartItem = item("Открывать при входе в систему", #selector(toggleAutostart))
        autostartItem.state = isAutostart() ? .on : .off
        menu.addItem(autostartItem)
        menu.addItem(.separator())
        menu.addItem(item("Выключить GitLib", #selector(shutdown), key: "q"))
        statusItem.menu = menu

        let openOnReady = !CommandLine.arguments.contains("--autostart")
        DispatchQueue.global(qos: .userInitiated).async { self.start(openOnReady: openOnReady) }
    }

    /// Повторный двойной клик по GitLib.app при работающем приложении — просто открыть GitLib.
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        openGitLib()
        return false
    }

    func applicationWillTerminate(_ notification: Notification) {
        stopServer()
    }

    private func item(_ title: String, _ action: Selector, key: String = "") -> NSMenuItem {
        let menuItem = NSMenuItem(title: title, action: action, keyEquivalent: key)
        menuItem.target = self
        return menuItem
    }

    // MARK: - Сервер

    private func request(_ path: String, method: String = "GET", timeout: TimeInterval = 1) -> (Int, String)? {
        var req = URLRequest(url: URL(string: apiBase + path)!, timeoutInterval: timeout)
        req.httpMethod = method
        if method == "POST" { req.setValue("1", forHTTPHeaderField: "X-GitLib-Shutdown") }
        let done = DispatchSemaphore(value: 0)
        var result: (Int, String)?
        URLSession.shared.dataTask(with: req) { data, response, _ in
            if let http = response as? HTTPURLResponse {
                result = (http.statusCode, data.flatMap { String(data: $0, encoding: .utf8) } ?? "")
            }
            done.signal()
        }.resume()
        _ = done.wait(timeout: .now() + timeout + 1)
        return result
    }

    private func isRunning() -> Bool {
        guard let response = request("/health") else { return false }
        return response.0 == 200 && response.1.contains("\"ok\":true")
    }

    private func start(openOnReady: Bool) {
        // Сервер мог остаться от прошлого запуска — тогда только подключаемся к нему.
        if !isRunning() {
            guard let exe = Bundle.main.url(forResource: "gitlib-server", withExtension: nil) else {
                fail("В GitLib.app нет gitlib-server — скачайте приложение заново.")
                return
            }
            // Приложение пользователь уже разрешил — снимаем карантин, чтобы macOS не спрашивала про вложенный сервер.
            let xattr = Process()
            xattr.executableURL = URL(fileURLWithPath: "/usr/bin/xattr")
            xattr.arguments = ["-dr", "com.apple.quarantine", Bundle.main.bundlePath]
            try? xattr.run()
            xattr.waitUntilExit()

            try? FileManager.default.createDirectory(at: dataDir, withIntermediateDirectories: true)
            let logURL = dataDir.appendingPathComponent("gitlib.log")
            if !FileManager.default.fileExists(atPath: logURL.path) {
                FileManager.default.createFile(atPath: logURL.path, contents: nil)
            }
            let log = try? FileHandle(forWritingTo: logURL)
            log?.seekToEndOfFile()

            let process = Process()
            process.executableURL = exe
            var environment = env
            environment["GITLIB_NO_BROWSER"] = "1"
            environment["GITLIB_TRAY"] = "1"
            environment["GITLIB_DATA_DIR"] = dataDir.path
            process.environment = environment
            process.standardOutput = log ?? FileHandle.nullDevice
            process.standardError = log ?? FileHandle.nullDevice
            process.terminationHandler = { [weak self] _ in
                guard let self = self, !self.stopping else { return }
                self.fail("Сервер GitLib остановился. Подробности — в gitlib.log в папке с данными.")
            }
            do {
                try process.run()
                server = process
            } catch {
                fail("Не удалось запустить сервер: \(error.localizedDescription)")
                return
            }
        }

        for _ in 0..<75 {
            if isRunning() {
                DispatchQueue.main.async {
                    self.statusItem.button?.toolTip = "GitLib — \(self.url.absoluteString)"
                    if openOnReady { self.openGitLib() }
                }
                return
            }
            if let server = server, !server.isRunning { return }
            Thread.sleep(forTimeInterval: 0.2)
        }
        fail("Сервер не ответил за 15 секунд. Подробности — в gitlib.log в папке с данными.")
    }

    private func fail(_ message: String) {
        DispatchQueue.main.async {
            self.statusItem.button?.toolTip = "GitLib — остановлен"
            let alert = NSAlert()
            alert.messageText = "GitLib"
            alert.informativeText = message
            alert.alertStyle = .warning
            NSApp.activate(ignoringOtherApps: true)
            alert.runModal()
        }
    }

    /// Сервер закрывает базу и выходит сам; если не успел за 5 секунд — завершаем процесс.
    private func stopServer() {
        if stopping { return }
        stopping = true
        _ = request("/shutdown", method: "POST", timeout: 3)
        guard let server = server else { return }
        let deadline = Date().addingTimeInterval(5)
        while server.isRunning && Date() < deadline { Thread.sleep(forTimeInterval: 0.1) }
        if server.isRunning { server.terminate() }
    }

    // MARK: - Меню

    @objc private func openGitLib() {
        NSWorkspace.shared.open(url)
    }

    @objc private func openDataDir() {
        try? FileManager.default.createDirectory(at: dataDir, withIntermediateDirectories: true)
        NSWorkspace.shared.open(dataDir)
    }

    private func isAutostart() -> Bool {
        FileManager.default.fileExists(atPath: agentURL.path)
    }

    /// LaunchAgent вместо SMAppService: работает и без подписи разработчика Apple.
    @objc private func toggleAutostart() {
        if isAutostart() {
            try? FileManager.default.removeItem(at: agentURL)
        } else {
            let plist: [String: Any] = [
                "Label": "local.gitlib.app",
                "ProgramArguments": ["/usr/bin/open", "-g", "-a", Bundle.main.bundlePath, "--args", "--autostart"],
                "RunAtLoad": true,
            ]
            try? FileManager.default.createDirectory(at: agentURL.deletingLastPathComponent(), withIntermediateDirectories: true)
            (plist as NSDictionary).write(to: agentURL, atomically: true)
        }
        autostartItem.state = isAutostart() ? .on : .off
    }

    @objc private func shutdown() {
        statusItem.button?.toolTip = "GitLib — выключается…"
        DispatchQueue.global(qos: .userInitiated).async {
            self.stopServer()
            DispatchQueue.main.async { NSApp.terminate(nil) }
        }
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.accessory)
app.run()
