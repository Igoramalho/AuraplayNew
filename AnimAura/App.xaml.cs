using Microsoft.Extensions.DependencyInjection;

namespace AuraPlay;

public partial class App : Application
{
	private readonly MainPage _mainPage;

	public App(MainPage mainPage)
	{
		InitializeComponent();
		_mainPage = mainPage;
	}

	protected override Window CreateWindow(IActivationState? activationState)
	{
		var window = new Window(_mainPage)
		{
			Title = "AuraPlay Anime",
			Width = 1160,
			Height = 840,
			MinimumWidth = 960,
			MinimumHeight = 680
		};

#if WINDOWS
		window.Created += (_, _) => WindowChrome.Configure(window);
#endif

		return window;
	}
}
