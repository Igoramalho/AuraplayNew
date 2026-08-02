using Microsoft.Extensions.Logging;

using Microsoft.Extensions.DependencyInjection;
using AuraPlay.Services;

namespace AuraPlay;

public static class MauiProgram
{
	public static MauiApp CreateMauiApp()
	{
		var builder = MauiApp.CreateBuilder();
		builder
			.UseMauiApp<App>()
			.ConfigureFonts(fonts =>
			{
				fonts.AddFont("OpenSans-Regular.ttf", "OpenSansRegular");
				fonts.AddFont("OpenSans-Semibold.ttf", "OpenSansSemibold");
			});

		builder.Services.AddSingleton(new HttpClient
		{
			BaseAddress = new Uri("https://auraplay-api.vercel.app/"),
			Timeout = TimeSpan.FromSeconds(20)
		});
		builder.Services.AddSingleton<IAuraPlayApiClient, AuraPlayApiClient>();
		builder.Services.AddSingleton(serviceProvider => new FavoritesStore(
			Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "AuraPlay"),
			serviceProvider.GetRequiredService<ILogger<FavoritesStore>>()));
		builder.Services.AddSingleton<MainPage>();

#if DEBUG
		builder.Logging.AddDebug();
#endif

		return builder.Build();
	}
}
