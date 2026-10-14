using Microsoft.Windows.AppNotifications;
using Microsoft.Windows.AppNotifications.Builder;

namespace EdgeMagic.App;

internal sealed class ReminderNotifications
{
    private readonly AppNotificationManager _manager = AppNotificationManager.Default;

    public void Register()
    {
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
}
