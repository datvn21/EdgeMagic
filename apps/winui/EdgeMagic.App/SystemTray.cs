using System.ComponentModel;
using System.Runtime.InteropServices;

namespace EdgeMagic.App;

internal sealed class SystemTray : IDisposable
{
    private const uint CallbackMessage = 0x8001;
    private const uint NifMessage = 0x01;
    private const uint NifIcon = 0x02;
    private const uint NifTip = 0x04;
    private const uint NimAdd = 0;
    private const uint NimDelete = 2;
    private const uint NimSetFocus = 3;
    private const uint ImageIcon = 1;
    private const uint LoadFromFile = 0x10;
    private const uint WmLeftButtonUp = 0x0202;
    private const uint WmRightButtonUp = 0x0205;
    private const uint WmContextMenu = 0x007B;
    private const uint WmHotKey = 0x0312;
    private const uint WmClipboardUpdate = 0x031D;
    private const uint ModControl = 0x0002;
    private const uint VkSpace = 0x20;
    private const uint MfString = 0;
    private const uint MfSeparator = 0x0800;
    private const uint MfChecked = 0x08;
    private const uint TpmRightButton = 0x0002;
    private const uint TpmReturnCommand = 0x0100;
    private const nuint SubclassId = 1;
    private const nuint ShowCommand = 1;
    private const nuint CollapseCommand = 2;
    private const nuint PinCommand = 3;
    private const nuint QuitCommand = 4;
    private const int HotkeyId = 1;

    private readonly IntPtr _window;
    private readonly IntPtr _icon;
    private readonly uint _taskbarCreatedMessage;
    private readonly SubclassProcedure _procedure;
    private readonly Action _show;
    private readonly Action _collapse;
    private readonly Func<bool> _isPinned;
    private readonly Action _togglePin;
    private readonly Action _quit;
    private readonly Action _clipboardChanged;
    private NotifyIconData _data;
    private bool _disposed;
    public bool HotkeyRegistered { get; }

    public SystemTray(IntPtr window, Action show, Action collapse, Func<bool> isPinned, Action togglePin, Action quit, Action clipboardChanged)
    {
        _window = window;
        _show = show;
        _collapse = collapse;
        _isPinned = isPinned;
        _togglePin = togglePin;
        _quit = quit;
        _clipboardChanged = clipboardChanged;
        _procedure = WindowProcedure;
        _taskbarCreatedMessage = RegisterWindowMessageW("TaskbarCreated");
        _icon = LoadImageW(IntPtr.Zero, Path.Combine(AppContext.BaseDirectory, "Assets", "icon.ico"), ImageIcon, 0, 0, LoadFromFile);
        if (_icon == IntPtr.Zero) throw new Win32Exception(Marshal.GetLastWin32Error(), "Could not load the EdgeMagic tray icon.");

        _data = new NotifyIconData
        {
            Size = (uint)Marshal.SizeOf<NotifyIconData>(),
            Window = window,
            Id = 1,
            Flags = NifMessage | NifIcon | NifTip,
            CallbackMessage = CallbackMessage,
            Icon = _icon,
            Tip = "EdgeMagic",
            Info = string.Empty,
            InfoTitle = string.Empty
        };

        if (!SetWindowSubclass(window, _procedure, SubclassId, IntPtr.Zero))
        {
            DestroyIcon(_icon);
            throw new Win32Exception(Marshal.GetLastWin32Error(), "Could not install the tray message handler.");
        }
        AddClipboardFormatListener(window);
        HotkeyRegistered = RegisterHotKey(window, HotkeyId, ModControl, VkSpace);
        if (!Shell_NotifyIconW(NimAdd, ref _data))
        {
            if (HotkeyRegistered) UnregisterHotKey(window, HotkeyId);
            RemoveClipboardFormatListener(window);
            RemoveWindowSubclass(window, _procedure, SubclassId);
            DestroyIcon(_icon);
            throw new InvalidOperationException("Could not create the EdgeMagic notification area icon.");
        }
    }

    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;
        Shell_NotifyIconW(NimDelete, ref _data);
        RemoveClipboardFormatListener(_window);
        if (HotkeyRegistered) UnregisterHotKey(_window, HotkeyId);
        RemoveWindowSubclass(_window, _procedure, SubclassId);
        DestroyIcon(_icon);
    }

    private IntPtr WindowProcedure(IntPtr window, uint message, UIntPtr wParam, IntPtr lParam, UIntPtr subclassId, IntPtr referenceData)
    {
        if (message == _taskbarCreatedMessage)
        {
            Shell_NotifyIconW(NimAdd, ref _data);
            return IntPtr.Zero;
        }
        if (message == CallbackMessage)
        {
            var action = unchecked((uint)lParam.ToInt64());
            if (action == WmLeftButtonUp) _show();
            else if (action is WmRightButtonUp or WmContextMenu) ShowMenu();
            return IntPtr.Zero;
        }
        if (message == WmHotKey && wParam.ToUInt64() == HotkeyId)
        {
            _show();
            return IntPtr.Zero;
        }
        if (message == WmClipboardUpdate)
        {
            _clipboardChanged();
            return IntPtr.Zero;
        }
        return DefSubclassProc(window, message, wParam, lParam);
    }

    private void ShowMenu()
    {
        var menu = CreatePopupMenu();
        if (menu == IntPtr.Zero) return;
        try
        {
            AppendMenuW(menu, MfString, ShowCommand, "Show shelf");
            AppendMenuW(menu, MfString, CollapseCommand, "Collapse");
            AppendMenuW(menu, MfSeparator, 0, null);
            AppendMenuW(menu, MfString | (_isPinned() ? MfChecked : 0), PinCommand, _isPinned() ? "Unpin shelf" : "Pin shelf");
            AppendMenuW(menu, MfString, QuitCommand, "Quit EdgeMagic");

            GetCursorPos(out var point);
            SetForegroundWindow(_window);
            var command = TrackPopupMenu(menu, TpmRightButton | TpmReturnCommand, point.X, point.Y, 0, _window, IntPtr.Zero);
            PostMessageW(_window, 0, IntPtr.Zero, IntPtr.Zero);
            switch (command)
            {
                case ShowCommand: _show(); break;
                case CollapseCommand: _collapse(); break;
                case PinCommand: _togglePin(); break;
                case QuitCommand: _quit(); break;
            }
            Shell_NotifyIconW(NimSetFocus, ref _data);
        }
        finally
        {
            DestroyMenu(menu);
        }
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct NotifyIconData
    {
        public uint Size;
        public IntPtr Window;
        public uint Id;
        public uint Flags;
        public uint CallbackMessage;
        public IntPtr Icon;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string Tip;
        public uint State;
        public uint StateMask;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 256)] public string Info;
        public uint TimeoutOrVersion;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 64)] public string InfoTitle;
        public uint InfoFlags;
        public Guid ItemId;
        public IntPtr BalloonIcon;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct Point { public int X; public int Y; }

    private delegate IntPtr SubclassProcedure(IntPtr window, uint message, UIntPtr wParam, IntPtr lParam, UIntPtr subclassId, IntPtr referenceData);

    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)] private static extern IntPtr LoadImageW(IntPtr instance, string name, uint type, int width, int height, uint flags);
    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)] private static extern uint RegisterWindowMessageW(string name);
    [DllImport("user32.dll", SetLastError = true)] [return: MarshalAs(UnmanagedType.Bool)] private static extern bool RegisterHotKey(IntPtr window, int id, uint modifiers, uint virtualKey);
    [DllImport("user32.dll", SetLastError = true)] [return: MarshalAs(UnmanagedType.Bool)] private static extern bool UnregisterHotKey(IntPtr window, int id);
    [DllImport("user32.dll", SetLastError = true)] [return: MarshalAs(UnmanagedType.Bool)] private static extern bool AddClipboardFormatListener(IntPtr window);
    [DllImport("user32.dll", SetLastError = true)] [return: MarshalAs(UnmanagedType.Bool)] private static extern bool RemoveClipboardFormatListener(IntPtr window);
    [DllImport("user32.dll", SetLastError = true)] [return: MarshalAs(UnmanagedType.Bool)] private static extern bool DestroyIcon(IntPtr icon);
    [DllImport("comctl32.dll", SetLastError = true)] [return: MarshalAs(UnmanagedType.Bool)] private static extern bool SetWindowSubclass(IntPtr window, SubclassProcedure procedure, UIntPtr subclassId, IntPtr referenceData);
    [DllImport("comctl32.dll", SetLastError = true)] [return: MarshalAs(UnmanagedType.Bool)] private static extern bool RemoveWindowSubclass(IntPtr window, SubclassProcedure procedure, UIntPtr subclassId);
    [DllImport("comctl32.dll")] private static extern IntPtr DefSubclassProc(IntPtr window, uint message, UIntPtr wParam, IntPtr lParam);
    [DllImport("shell32.dll", CharSet = CharSet.Unicode)] [return: MarshalAs(UnmanagedType.Bool)] private static extern bool Shell_NotifyIconW(uint message, ref NotifyIconData data);
    [DllImport("user32.dll")] private static extern IntPtr CreatePopupMenu();
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] [return: MarshalAs(UnmanagedType.Bool)] private static extern bool AppendMenuW(IntPtr menu, uint flags, UIntPtr item, string? text);
    [DllImport("user32.dll")] [return: MarshalAs(UnmanagedType.Bool)] private static extern bool DestroyMenu(IntPtr menu);
    [DllImport("user32.dll")] [return: MarshalAs(UnmanagedType.Bool)] private static extern bool GetCursorPos(out Point point);
    [DllImport("user32.dll")] [return: MarshalAs(UnmanagedType.Bool)] private static extern bool SetForegroundWindow(IntPtr window);
    [DllImport("user32.dll")] private static extern UIntPtr TrackPopupMenu(IntPtr menu, uint flags, int x, int y, int reserved, IntPtr window, IntPtr rect);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] [return: MarshalAs(UnmanagedType.Bool)] private static extern bool PostMessageW(IntPtr window, uint message, IntPtr wParam, IntPtr lParam);
}
