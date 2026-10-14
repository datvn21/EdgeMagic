using Microsoft.UI.Windowing;
using Microsoft.UI.Xaml;
using Microsoft.UI;
using Windows.Graphics;
using WinRT.Interop;

namespace EdgeMagic.App;

public sealed partial class MainWindow : Window
{
    private readonly AppWindow _appWindow;
    private readonly SystemTray _tray;
    private readonly ProductivityStore _productivity = new();
    private readonly DispatcherTimer _hideTimer;
    private DisplayArea? _selectedDisplay;
    private EdgePosition _position = EdgePosition.Right;
    private bool _collapsed;
    private bool _pinned;
    private bool _quitRequested;
    private bool _observingRoot;
    private bool _dataLoaded;
    private double _lastScale;

    public MainWindow()
    {
        InitializeComponent();
        var hwnd = WindowNative.GetWindowHandle(this);
        var windowId = Win32Interop.GetWindowIdFromWindow(hwnd);
        _appWindow = AppWindow.GetFromWindowId(windowId);

        var presenter = OverlappedPresenter.Create();
        presenter.SetBorderAndTitleBar(false, false);
        presenter.IsResizable = false;
        presenter.IsMinimizable = false;
        presenter.IsMaximizable = false;
        presenter.IsAlwaysOnTop = true;
        _appWindow.SetPresenter(presenter);
        _appWindow.Closing += OnAppWindowClosing;

        _tray = new SystemTray(hwnd, ShowShelf, Collapse, () => _pinned, () => SetPinned(!_pinned), Quit);
        HotkeyStatus.Text = _tray.HotkeyRegistered ? "Ctrl+Space opens the shelf." : "Ctrl+Space is already in use.";

        _hideTimer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(450) };
        _hideTimer.Tick += (_, _) => { _hideTimer.Stop(); if (!_pinned) Collapse(); };
        Closed += (_, _) => { _hideTimer.Stop(); _tray.Dispose(); };

        var choices = DisplayArea.FindAll().Select((display, index) => new DisplayChoice(
            display,
            $"Display {index + 1}{(display.IsPrimary ? " (primary)" : "")}")).ToArray();
        DisplayChoices.ItemsSource = choices;
        DisplayChoices.SelectedItem = choices.FirstOrDefault(choice => choice.Display.IsPrimary);
    }

    private async void OnRootLoaded(object sender, RoutedEventArgs e)
    {
        if (!_observingRoot && Root.XamlRoot is { } xamlRoot)
        {
            _lastScale = xamlRoot.RasterizationScale;
            xamlRoot.Changed += OnXamlRootChanged;
            _observingRoot = true;
        }
        ApplyLayout();
        if (!_dataLoaded) await LoadProductivityAsync();
    }

    private void OnDisplayChanged(object sender, Microsoft.UI.Xaml.Controls.SelectionChangedEventArgs e)
    {
        _selectedDisplay = (DisplayChoices.SelectedItem as DisplayChoice)?.Display;
        ApplyLayout();
    }

    private void OnXamlRootChanged(XamlRoot sender, XamlRootChangedEventArgs args)
    {
        if (_lastScale == sender.RasterizationScale) return;
        _lastScale = sender.RasterizationScale;
        ApplyLayout();
    }
    private void OnLeftEdge(object sender, RoutedEventArgs e) { _position = EdgePosition.Left; ShowShelf(); }
    private void OnRightEdge(object sender, RoutedEventArgs e) { _position = EdgePosition.Right; ShowShelf(); }
    private void OnCollapse(object sender, RoutedEventArgs e) => Collapse();
    private void OnPinClick(object sender, RoutedEventArgs e) => SetPinned(!_pinned);

    private async void OnAddNote(object sender, RoutedEventArgs e)
    {
        var content = NoteInput.Text.Trim();
        if (content.Length == 0) return;
        await RunDataActionAsync(() => _productivity.AddNoteAsync(content));
        NoteInput.Text = string.Empty;
    }

    private async void OnAddTodo(object sender, RoutedEventArgs e)
    {
        var title = TodoInput.Text.Trim();
        if (title.Length == 0) return;
        await RunDataActionAsync(() => _productivity.AddTodoAsync(title));
        TodoInput.Text = string.Empty;
    }

    private async void OnToggleTodo(object sender, RoutedEventArgs e)
    {
        if (sender is Microsoft.UI.Xaml.Controls.CheckBox { Tag: string id, IsChecked: bool completed })
            await RunDataActionAsync(() => _productivity.ToggleTodoAsync(id, completed));
    }

    private async void OnDeleteNote(object sender, RoutedEventArgs e)
    {
        if (sender is Microsoft.UI.Xaml.Controls.Button { Tag: string id })
            await RunDataActionAsync(() => _productivity.DeleteNoteAsync(id));
    }

    private async void OnDeleteTodo(object sender, RoutedEventArgs e)
    {
        if (sender is Microsoft.UI.Xaml.Controls.Button { Tag: string id })
            await RunDataActionAsync(() => _productivity.DeleteTodoAsync(id));
    }

    private async Task LoadProductivityAsync()
    {
        try
        {
            await _productivity.InitializeAsync();
            var (notes, todos) = await _productivity.LoadAsync();
            NotesList.ItemsSource = notes;
            TodosList.ItemsSource = todos;
            DataStatus.Text = $"Connected to local data · {notes.Count} notes · {todos.Count} tasks";
            _dataLoaded = true;
        }
        catch (Exception ex)
        {
            DataStatus.Text = $"Could not open local data: {ex.Message}";
        }
    }

    private async Task RunDataActionAsync(Func<Task> action)
    {
        try
        {
            await action();
            await LoadProductivityAsync();
        }
        catch (Exception ex)
        {
            DataStatus.Text = $"Could not save changes: {ex.Message}";
        }
    }
    private void OnPointerEntered(object sender, Microsoft.UI.Xaml.Input.PointerRoutedEventArgs e)
    {
        _hideTimer.Stop();
        if (_collapsed) ShowShelf();
    }
    private void OnPointerExited(object sender, Microsoft.UI.Xaml.Input.PointerRoutedEventArgs e)
    {
        if (!_collapsed && !_pinned) _hideTimer.Start();
    }

    private void ShowShelf()
    {
        _hideTimer.Stop();
        _collapsed = false;
        ApplyLayout();
        _appWindow.Show();
        Activate();
    }

    private void Collapse()
    {
        _hideTimer.Stop();
        _collapsed = true;
        ApplyLayout();
        _appWindow.Show();
    }

    private void SetPinned(bool pinned)
    {
        _pinned = pinned;
        PinButton.Content = pinned ? "Unpin" : "Pin";
        if (pinned) _hideTimer.Stop();
    }

    private void Quit()
    {
        _quitRequested = true;
        Close();
    }

    private void OnAppWindowClosing(AppWindow sender, AppWindowClosingEventArgs args)
    {
        if (_quitRequested) return;
        args.Cancel = true;
        sender.Hide();
    }

    private void ApplyLayout()
    {
        var display = _selectedDisplay ?? DisplayArea.GetFromWindowId(_appWindow.Id, DisplayAreaFallback.Primary);
        var work = display.WorkArea;
        var scale = Root.XamlRoot?.RasterizationScale ?? 1;
        static int Px(double logical, double scale) => Math.Max(1, (int)Math.Round(logical * scale));

        var width = Math.Min(Px(380, scale), work.Width);
        var margin = Math.Min(Px(12, scale), work.Height / 2);
        var surfaceHeight = Math.Max(1, Math.Min(Px(820, scale), work.Height - margin * 2));
        var surfaceTop = (work.Height - surfaceHeight) / 2;
        var x = _position == EdgePosition.Left ? work.X : work.X + work.Width - width;
        var y = work.Y + surfaceTop;
        var bounds = new RectInt32(x, y, width, surfaceHeight);

        if (_collapsed)
        {
            var thickness = Math.Min(Px(24, scale), width);
            var height = Math.Min(Px(72, scale), surfaceHeight);
            var collapsedX = _position == EdgePosition.Left ? work.X : work.X + work.Width - thickness;
            bounds = new RectInt32(collapsedX, work.Y + surfaceTop + (surfaceHeight - height) / 2, thickness, height);
        }

        _appWindow.MoveAndResize(bounds);
    }

    private sealed record DisplayChoice(DisplayArea Display, string Name);
    private enum EdgePosition { Left, Right }
}
