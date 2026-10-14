using Microsoft.Windows.AppNotifications;
using Microsoft.Windows.AppNotifications.Builder;
using Windows.ApplicationModel;

namespace EdgeMagic.App;

internal sealed class ReminderNotifications
{
    private readonly AppNotificationManager _manager = AppNotificationManager.Default;

    public void Register()
    {
        if (IsPackaged())
        {
            _manager.Register();
            return;
        }

        var iconPath = Path.Combine(AppContext.BaseDirectory, "Assets", "icon.ico");
        _manager.Register("EdgeMagic", new Uri(iconPath));
    }

    public void Show(string title)
    {
        var notification = new AppNotificationBuilder()
            .AddText("EdgeMagic reminder")
            .AddText(title)
            .BuildNotification();
        _manager.Show(notification);
    }

    private static bool IsPackaged()
    {
        try { return Package.Current is not null; }
        catch (InvalidOperationException) { return false; }
    }
}
