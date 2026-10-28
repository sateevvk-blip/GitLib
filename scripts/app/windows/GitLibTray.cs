// GitLib.exe для Windows: значок в трее, который запускает сервер (gitlib-server.exe) без окна консоли.
// Собирается встроенным в Windows компилятором .NET Framework (csc.exe, C# 5) — без SDK и NuGet:
//   csc /target:winexe /win32icon:gitlib.ico /out:GitLib.exe GitLibTray.cs
using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Text;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Win32;

namespace GitLib
{
    static class Program
    {
        [STAThread]
        static void Main(string[] args)
        {
            bool autostart = Array.IndexOf(args, "--autostart") >= 0;
            bool created;
            using (var mutex = new Mutex(true, "Local\\GitLib-Tray", out created))
            {
                if (!created)
                {
                    // Значок уже в трее — повторный запуск просто открывает GitLib.
                    if (!autostart) Tray.OpenBrowser(Tray.BaseUrl());
                    return;
                }
                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);
                Application.Run(new Tray(!autostart));
                GC.KeepAlive(mutex);
            }
        }
    }

    sealed class Tray : ApplicationContext
    {
        const string RunKey = @"Software\Microsoft\Windows\CurrentVersion\Run";
        const string RunValue = "GitLib";

        readonly NotifyIcon icon;
        readonly ToolStripMenuItem autostartItem;
        readonly string exeDir;
        readonly string dataDir;
        readonly string url;
        readonly SynchronizationContext ui;
        readonly object logLock = new object();
        Process server;
        StreamWriter log;
        bool stopping;

        public Tray(bool openOnReady)
        {
            exeDir = Path.GetDirectoryName(Application.ExecutablePath);
            string envData = Environment.GetEnvironmentVariable("GITLIB_DATA_DIR");
            dataDir = string.IsNullOrWhiteSpace(envData) ? Path.Combine(exeDir, "data") : Path.GetFullPath(envData);
            url = BaseUrl();

            var menu = new ContextMenuStrip();
            var open = new ToolStripMenuItem("Открыть GitLib", null, delegate { OpenBrowser(url); });
            open.Font = new Font(open.Font, FontStyle.Bold);
            menu.Items.Add(open);
            menu.Items.Add(new ToolStripMenuItem("Папка с данными", null, delegate { OpenDataDir(); }));
            menu.Items.Add(new ToolStripSeparator());
            autostartItem = new ToolStripMenuItem("Запускать вместе с Windows", null, delegate { ToggleAutostart(); });
            autostartItem.Checked = IsAutostart();
            menu.Items.Add(autostartItem);
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add(new ToolStripMenuItem("Выключить GitLib", null, delegate { Shutdown(); }));
            // Создание первого элемента управления ставит контекст WinForms — через него фоновый поток обновляет значок.
            ui = SynchronizationContext.Current ?? new WindowsFormsSynchronizationContext();

            icon = new NotifyIcon();
            icon.Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
            icon.Text = "GitLib — запускается…";
            icon.ContextMenuStrip = menu;
            icon.MouseClick += delegate (object s, MouseEventArgs e) { if (e.Button == MouseButtons.Left) OpenBrowser(url); };
            icon.Visible = true;

            var starter = new Thread(delegate () { Start(openOnReady); });
            starter.IsBackground = true;
            starter.Start();
        }

        public static string BaseUrl()
        {
            string port = Environment.GetEnvironmentVariable("GITLIB_PORT");
            return "http://localhost:" + (string.IsNullOrWhiteSpace(port) ? "4817" : port.Trim());
        }

        public static void OpenBrowser(string target)
        {
            try { Process.Start(new ProcessStartInfo(target) { UseShellExecute = true }); }
            catch (Exception) { /* браузера по умолчанию нет — адрес виден во всплывающей подсказке */ }
        }

        bool IsRunning()
        {
            try
            {
                var req = (HttpWebRequest)WebRequest.Create(url.Replace("localhost", "127.0.0.1") + "/api/health");
                req.Timeout = 1000;
                req.Proxy = null;
                using (var res = (HttpWebResponse)req.GetResponse())
                using (var reader = new StreamReader(res.GetResponseStream(), Encoding.UTF8))
                {
                    return res.StatusCode == HttpStatusCode.OK && reader.ReadToEnd().Contains("\"ok\":true");
                }
            }
            catch (Exception) { return false; }
        }

        void Start(bool openOnReady)
        {
            // Сервер мог остаться от прошлого запуска или работать в dev-режиме — тогда только подключаемся.
            if (!IsRunning())
            {
                string exe = Path.Combine(exeDir, "gitlib-server.exe");
                if (!File.Exists(exe))
                {
                    Fail("Не найден gitlib-server.exe рядом с GitLib.exe — распакуйте архив целиком.");
                    return;
                }
                Directory.CreateDirectory(dataDir);
                log = new StreamWriter(Path.Combine(dataDir, "gitlib.log"), true, new UTF8Encoding(false));
                log.AutoFlush = true;

                var psi = new ProcessStartInfo(exe);
                psi.WorkingDirectory = exeDir;
                psi.UseShellExecute = false;
                psi.CreateNoWindow = true;
                psi.RedirectStandardOutput = true;
                psi.RedirectStandardError = true;
                psi.StandardOutputEncoding = Encoding.UTF8;
                psi.StandardErrorEncoding = Encoding.UTF8;
                psi.EnvironmentVariables["GITLIB_NO_BROWSER"] = "1";
                psi.EnvironmentVariables["GITLIB_TRAY"] = "1";
                psi.EnvironmentVariables["GITLIB_DATA_DIR"] = dataDir;
                server = new Process();
                server.StartInfo = psi;
                server.EnableRaisingEvents = true;
                server.OutputDataReceived += delegate (object s, DataReceivedEventArgs e) { WriteLog(e.Data); };
                server.ErrorDataReceived += delegate (object s, DataReceivedEventArgs e) { WriteLog(e.Data); };
                server.Exited += delegate { OnServerExited(); };
                WriteLog("--- " + DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") + " запуск GitLib");
                server.Start();
                server.BeginOutputReadLine();
                server.BeginErrorReadLine();
            }

            for (int i = 0; i < 75; i++)
            {
                if (IsRunning())
                {
                    Ui(delegate { icon.Text = "GitLib — " + url; });
                    if (openOnReady) OpenBrowser(url);
                    return;
                }
                if (server != null && server.HasExited) return;
                Thread.Sleep(200);
            }
            Fail("Сервер не ответил за 15 секунд. Подробности — в gitlib.log в папке с данными.");
        }

        void WriteLog(string line)
        {
            if (line == null) return;
            lock (logLock) { if (log != null) log.WriteLine(line); }
        }

        void OnServerExited()
        {
            if (stopping) return;
            Fail("Сервер GitLib остановился. Подробности — в gitlib.log в папке с данными.");
        }

        void Fail(string message)
        {
            Ui(delegate
            {
                icon.Text = "GitLib — остановлен";
                icon.ShowBalloonTip(10000, "GitLib", message, ToolTipIcon.Error);
            });
        }

        void Ui(MethodInvoker action)
        {
            ui.Post(delegate { action(); }, null);
        }

        void OpenDataDir()
        {
            Directory.CreateDirectory(dataDir);
            Process.Start(new ProcessStartInfo(dataDir) { UseShellExecute = true });
        }

        static bool IsAutostart()
        {
            using (var key = Registry.CurrentUser.OpenSubKey(RunKey))
            {
                return key != null && key.GetValue(RunValue) != null;
            }
        }

        void ToggleAutostart()
        {
            using (var key = Registry.CurrentUser.CreateSubKey(RunKey))
            {
                if (IsAutostart()) key.DeleteValue(RunValue, false);
                else key.SetValue(RunValue, "\"" + Application.ExecutablePath + "\" --autostart");
            }
            autostartItem.Checked = IsAutostart();
        }

        void Shutdown()
        {
            stopping = true;
            icon.Text = "GitLib — выключается…";
            try
            {
                var req = (HttpWebRequest)WebRequest.Create(url.Replace("localhost", "127.0.0.1") + "/api/shutdown");
                req.Method = "POST";
                req.Timeout = 3000;
                req.Proxy = null;
                req.Headers["X-GitLib-Shutdown"] = "1";
                req.ContentLength = 0;
                using (req.GetResponse()) { }
            }
            catch (Exception) { /* сервер уже не отвечает — добьём процесс ниже */ }

            // Сервер закрывает базу и выходит сам; если не успел — завершаем принудительно.
            if (server != null && !server.WaitForExit(5000))
            {
                try { server.Kill(); } catch (Exception) { }
            }
            icon.Visible = false;
            icon.Dispose();
            lock (logLock) { if (log != null) { log.Dispose(); log = null; } }
            ExitThread();
        }
    }
}
