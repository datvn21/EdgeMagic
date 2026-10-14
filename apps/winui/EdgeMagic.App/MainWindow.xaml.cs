using Microsoft.UI.Windowing;
using Microsoft.UI.Xaml;
using Microsoft.UI;
using Windows.Graphics;
using Windows.ApplicationModel.DataTransfer;
using Windows.Storage;
using Microsoft.Windows.Storage.Pickers;
using WinRT.Interop;
using System.Diagnostics;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace EdgeMagic.App;

public sealed partial class MainWindow : Window
{
    private readonly AppWindow _appWindow;
    private readonly SystemTray _tray;
    private readonly ProductivityStore _productivity = new();
    private readonly BackupService _backup;
    private readonly DispatcherTimer _hideTimer;
    private DisplayArea? _selectedDisplay;
    private EdgePosition _position = EdgePosition.Right;
    private bool _collapsed;
    private bool _pinned;
    private bool _quitRequested;
    private bool _observingRoot;
    private bool _dataLoaded;
    private bool _clipboardCaptureEnabled = true;
    private string? _lastClipboardText;
    private DateTimeOffset _lastClipboardCapture;
    private List<NoteItem> _notes = [];
    private List<BrowserBookmark> _bookmarks = [];
    private string? _editingNoteId;
    private double _lastScale;

    public MainWindow()
    {
        InitializeComponent();
        _backup = _productivity.CreateBackupService();
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

        _tray = new SystemTray(hwnd, ShowShelf, Collapse, () => _pinned, () => SetPinned(!_pinned), Quit, OnClipboardChanged);
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

    private void OnSectionChanged(object sender, Microsoft.UI.Xaml.Controls.SelectionChangedEventArgs e)
    {
        if (InboxPanel is null) return;
        var panels = new[] { InboxPanel, NotesPanel, TodosPanel, RemindersPanel, SavedPanel, BookmarksPanel, SettingsPanel };
        var selected = Math.Clamp(SectionChoices.SelectedIndex, 0, panels.Length - 1);
        for (var index = 0; index < panels.Length; index++) panels[index].Visibility = index == selected ? Visibility.Visible : Visibility.Collapsed;
    }

    private void OnXamlRootChanged(XamlRoot sender, XamlRootChangedEventArgs args)
    {
        if (_lastScale == sender.RasterizationScale) return;
        _lastScale = sender.RasterizationScale;
        ApplyLayout();
    }
    private async void OnLeftEdge(object sender, RoutedEventArgs e) { _position = EdgePosition.Left; ShowShelf(); await SavePositionAsync(); }
    private async void OnRightEdge(object sender, RoutedEventArgs e) { _position = EdgePosition.Right; ShowShelf(); await SavePositionAsync(); }
    private void OnCollapse(object sender, RoutedEventArgs e) => Collapse();
    private void OnPinClick(object sender, RoutedEventArgs e) => SetPinned(!_pinned);

    private async void OnAddCapture(object sender, RoutedEventArgs e)
    {
        var text = CaptureInput.Text.Trim();
        if (text.Length == 0) return;
        await RunDataActionAsync(() => _productivity.AddCaptureAsync(text));
        CaptureInput.Text = string.Empty;
    }

    private async void OnPasteCapture(object sender, RoutedEventArgs e)
    {
        try
        {
            var content = Clipboard.GetContent();
            if (!content.Contains(StandardDataFormats.Text))
            {
                DataStatus.Text = "The clipboard does not contain text.";
                return;
            }
            var text = (await content.GetTextAsync()).Trim();
            if (text.Length == 0) return;
            await RunDataActionAsync(() => _productivity.AddCaptureAsync(text));
        }
        catch (Exception ex) { DataStatus.Text = $"Could not read the clipboard: {ex.Message}"; }
    }

    private void OnInboxDragOver(object sender, Microsoft.UI.Xaml.DragEventArgs e)
    {
        e.AcceptedOperation = e.DataView.Contains(StandardDataFormats.StorageItems) ? DataPackageOperation.Copy : DataPackageOperation.None;
    }

    private async void OnInboxDrop(object sender, Microsoft.UI.Xaml.DragEventArgs e)
    {
        if (!e.DataView.Contains(StandardDataFormats.StorageItems)) return;
        try
        {
            foreach (var item in await e.DataView.GetStorageItemsAsync())
            {
                if (item is not StorageFile file) continue;
                var properties = await file.GetBasicPropertiesAsync();
                await _productivity.AddFileCaptureAsync(file.Path, file.Name, (long)properties.Size, file.ContentType);
            }
            await LoadProductivityAsync();
        }
        catch (Exception ex) { DataStatus.Text = $"Could not capture dropped files: {ex.Message}"; }
    }

    private async void OnClipboardCaptureToggle(object sender, RoutedEventArgs e)
    {
        if (!_dataLoaded || ClipboardCaptureToggle.IsChecked is not bool enabled) return;
        try
        {
            await _productivity.SetClipboardCaptureEnabledAsync(enabled);
            _clipboardCaptureEnabled = enabled;
        }
        catch (Exception ex) { DataStatus.Text = $"Could not save clipboard setting: {ex.Message}"; }
    }

    private async Task SavePositionAsync()
    {
        if (!_dataLoaded) return;
        try { await _productivity.SetEdgePositionAsync(_position == EdgePosition.Left ? "left" : "right"); }
        catch (Exception ex) { DataStatus.Text = $"Could not save shelf position: {ex.Message}"; }
    }

    private async void OnClipboardChanged()
    {
        if (!_dataLoaded || !_clipboardCaptureEnabled) return;
        try
        {
            var content = Clipboard.GetContent();
            if (!content.Contains(StandardDataFormats.Text)) return;
            var text = (await content.GetTextAsync()).Trim();
            if (text.Length == 0 || (text == _lastClipboardText && DateTimeOffset.UtcNow - _lastClipboardCapture < TimeSpan.FromSeconds(2))) return;
            _lastClipboardText = text;
            _lastClipboardCapture = DateTimeOffset.UtcNow;
            await RunDataActionAsync(() => _productivity.AddCaptureAsync(text, "clipboard"));
        }
        catch (Exception ex) { DataStatus.Text = $"Could not capture clipboard text: {ex.Message}"; }
    }

    private async void OnAddNote(object sender, RoutedEventArgs e)
    {
        var content = NoteInput.Text.Trim();
        if (content.Length == 0) return;
        var editingId = _editingNoteId;
        await RunDataActionAsync(() => editingId is null ? _productivity.AddNoteAsync(content) : _productivity.UpdateNoteAsync(editingId, content));
        NoteInput.Text = string.Empty;
        SetNoteEditMode(null);
    }

    private void OnEditNote(object sender, RoutedEventArgs e)
    {
        if (sender is not Microsoft.UI.Xaml.Controls.Button { Tag: string id }) return;
        var note = _notes.FirstOrDefault(item => item.Id == id);
        if (note is null) return;
        NoteInput.Text = note.Content;
        SetNoteEditMode(id);
        NoteInput.Focus(Microsoft.UI.Xaml.FocusState.Programmatic);
    }

    private void OnCancelNoteEdit(object sender, RoutedEventArgs e)
    {
        NoteInput.Text = string.Empty;
        SetNoteEditMode(null);
    }

    private void SetNoteEditMode(string? id)
    {
        _editingNoteId = id;
        NoteSaveButton.Content = id is null ? "Add note" : "Save note";
        NoteCancelButton.Visibility = id is null ? Visibility.Collapsed : Visibility.Visible;
    }

    private async void OnAddTodo(object sender, RoutedEventArgs e)
    {
        var title = TodoInput.Text.Trim();
        if (title.Length == 0) return;
        await RunDataActionAsync(() => _productivity.AddTodoAsync(title));
        TodoInput.Text = string.Empty;
    }

    private async void OnAddReminder(object sender, RoutedEventArgs e)
    {
        var title = ReminderInput.Text.Trim();
        if (title.Length == 0 || !double.IsFinite(ReminderMinutes.Value)) return;
        var minutes = Math.Clamp(ReminderMinutes.Value, 1, 525600);
        await RunDataActionAsync(() => _productivity.AddReminderAsync(title, DateTimeOffset.Now.AddMinutes(minutes)));
        ReminderInput.Text = string.Empty;
    }

    private async void OnAddSaved(object sender, RoutedEventArgs e)
    {
        var title = SavedTitleInput.Text.Trim();
        var text = SavedUrlInput.Text.Trim();
        if (text.Length == 0) return;
        if (!Uri.TryCreate(text, UriKind.Absolute, out var url) || url.Scheme is not ("http" or "https"))
        {
            DataStatus.Text = "Enter a valid http or https link.";
            return;
        }
        await RunDataActionAsync(() => _productivity.AddSavedAsync(title.Length > 0 ? title : url.Host, url.ToString(), null));
        SavedTitleInput.Text = string.Empty;
        SavedUrlInput.Text = string.Empty;
    }

    private async void OnExportBackup(object sender, RoutedEventArgs e)
    {
        try
        {
            var picker = new FileSavePicker(_appWindow.Id)
            {
                SuggestedFileName = $"edgemagic-backup-{DateTime.UtcNow:yyyyMMdd-HHmmss}",
                DefaultFileExtension = ".json"
            };
            picker.FileTypeChoices.Add("EdgeMagic backup", [".json"]);
            var result = await picker.PickSaveFileAsync();
            if (result is null) return;
            await File.WriteAllTextAsync(result.Path, await _backup.ExportAsync());
            DataStatus.Text = $"Backup saved to {result.Path}. It is not encrypted; linked attachment files were not copied.";
        }
        catch (Exception ex) { DataStatus.Text = $"Could not export backup: {ex.Message}"; }
    }

    private async void OnImportBackup(object sender, RoutedEventArgs e)
    {
        try
        {
            var picker = new FileOpenPicker(_appWindow.Id) { SuggestedStartLocation = PickerLocationId.Downloads };
            picker.FileTypeFilter.Add(".json");
            var result = await picker.PickSingleFileAsync();
            if (result is null) return;
            var summary = await _backup.ImportAsync(await File.ReadAllTextAsync(result.Path));
            await LoadProductivityAsync();
            DataStatus.Text = $"Imported {summary.Items} captures, {summary.Attachments} attachment records, and {summary.ModuleRecords} local records. Existing records with different IDs were kept.";
        }
        catch (Exception ex) { DataStatus.Text = $"Could not import backup: {ex.Message}"; }
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

    private async void OnDeleteReminder(object sender, RoutedEventArgs e)
    {
        if (sender is Microsoft.UI.Xaml.Controls.Button { Tag: string id })
            await RunDataActionAsync(() => _productivity.DeleteReminderAsync(id));
    }

    private async void OnDeleteSaved(object sender, RoutedEventArgs e)
    {
        if (sender is Microsoft.UI.Xaml.Controls.Button { Tag: string id })
            await RunDataActionAsync(() => _productivity.DeleteSavedAsync(id));
    }

    private async void OnDeleteCapture(object sender, RoutedEventArgs e)
    {
        if (sender is Microsoft.UI.Xaml.Controls.Button { Tag: string id })
            await RunDataActionAsync(() => _productivity.DeleteCaptureAsync(id));
    }

    private async void OnImportBookmarks(object sender, RoutedEventArgs e)
    {
        try
        {
            var root = JsonNode.Parse(BookmarksInput.Text) as JsonObject
                ?? throw new InvalidDataException("The bookmark file must contain a JSON object.");
            if (root["roots"] is not JsonObject roots)
                throw new InvalidDataException("This does not look like a Chrome or Edge Bookmarks file (missing roots).");
            var imported = new List<BrowserBookmark>();
            foreach (var (rootName, node) in roots)
                if (node is JsonObject folder) FlattenBookmarks(folder, "edge", [rootName], imported);

            var byUrl = _bookmarks.ToDictionary(bookmark => bookmark.Url.Trim().ToLowerInvariant(), StringComparer.Ordinal);
            foreach (var bookmark in imported) byUrl[bookmark.Url.Trim().ToLowerInvariant()] = bookmark;
            _bookmarks = byUrl.Values.OrderByDescending(bookmark => bookmark.UpdatedAt).ToList();
            await _productivity.SaveBookmarksAsync(_bookmarks);
            BookmarksInput.Text = string.Empty;
            BookmarksList.ItemsSource = _bookmarks;
            BookmarksStatus.Text = $"Imported {imported.Count} bookmarks · {_bookmarks.Count} total.";
        }
        catch (Exception ex) { BookmarksStatus.Text = $"Could not import bookmarks: {ex.Message}"; }
    }

    private async void OnClearBookmarks(object sender, RoutedEventArgs e)
    {
        _bookmarks.Clear();
        await _productivity.SaveBookmarksAsync(_bookmarks);
        BookmarksList.ItemsSource = null;
        BookmarksStatus.Text = "Imported browser bookmarks cleared.";
    }

    private void OnOpenBookmark(object sender, RoutedEventArgs e)
    {
        if (sender is not Microsoft.UI.Xaml.Controls.Button { Tag: string raw } ||
            !Uri.TryCreate(raw, UriKind.Absolute, out var uri) || uri.Scheme is not ("http" or "https")) return;
        Process.Start(new ProcessStartInfo(uri.AbsoluteUri) { UseShellExecute = true });
    }

    private static void FlattenBookmarks(JsonObject node, string browser, string[] folderPath, List<BrowserBookmark> result)
    {
        if (node["type"]?.GetValue<string>() == "url" && node["url"]?.GetValue<string>() is { } url && Uri.TryCreate(url, UriKind.Absolute, out var uri) && uri.Scheme is "http" or "https")
        {
            var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            var added = long.TryParse(node["date_added"]?.GetValue<string>(), out var micros)
                ? Math.Max(0, micros / 1000 - 11644473600000L) : now;
            var key = $"{browser}:{url}";
            uint hash = 0;
            foreach (var character in key) hash = unchecked(hash * 31 + character);
            result.Add(new($"bookmark-{browser}-{hash:x}", node["name"]?.GetValue<string>()?.Trim() is { Length: > 0 } title ? title : url,
                url, browser, folderPath, added, added));
            return;
        }

        if (node["children"] is not JsonArray children) return;
        var name = node["name"]?.GetValue<string>();
        var childPath = string.IsNullOrWhiteSpace(name) ? folderPath : [.. folderPath, name];
        foreach (var child in children.OfType<JsonObject>()) FlattenBookmarks(child, browser, childPath, result);
    }

    private async Task LoadProductivityAsync()
    {
        try
        {
            await _productivity.InitializeAsync();
            _position = await _productivity.GetEdgePositionAsync() == "left" ? EdgePosition.Left : EdgePosition.Right;
            _hideTimer.Interval = TimeSpan.FromMilliseconds(await _productivity.GetAutoHideDelayAsync());
            _clipboardCaptureEnabled = await _productivity.GetClipboardCaptureEnabledAsync();
            ClipboardCaptureToggle.IsChecked = _clipboardCaptureEnabled;
            ApplyLayout();
            var (notes, todos, reminders, saved, captures) = await _productivity.LoadAsync();
            _bookmarks = await _productivity.GetBookmarksAsync();
            var pendingSync = await _productivity.GetPendingSyncCountAsync();
            _notes = notes;
            NotesList.ItemsSource = notes;
            TodosList.ItemsSource = todos;
            RemindersList.ItemsSource = reminders.Select(item => new ReminderRow(item.Id, item.Title, DateTimeOffset.FromUnixTimeMilliseconds(item.RemindAt).ToLocalTime().ToString("g"))).ToList();
            SavedList.ItemsSource = saved;
            BookmarksList.ItemsSource = _bookmarks;
            BookmarksStatus.Text = $"{_bookmarks.Count} imported bookmarks.";
            SyncQueueStatus.Text = $"{pendingSync} local changes queued. Sync providers are not enabled in this WinUI build.";
            CapturesList.ItemsSource = captures.Select(item => new CaptureRow(item.Id, item.Title ?? item.Url ?? item.Path ?? "Capture", item.Content ?? item.Url ?? item.Path ?? item.Type, item.Source)).ToList();
            DataStatus.Text = $"Local data · {captures.Count} captures · {notes.Count} notes · {todos.Count} tasks · {reminders.Count} reminders · {saved.Count} saved";
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
        catch (Exception ex) { DataStatus.Text = $"Could not save changes: {ex.Message}"; }
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
    private sealed record ReminderRow(string Id, string Title, string When);
    private sealed record CaptureRow(string Id, string Title, string Preview, string Source);
    private enum EdgePosition { Left, Right }
}
