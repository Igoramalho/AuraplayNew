using System.Runtime.InteropServices;
using System.Diagnostics;
using AuraPlay.Services;
using Microsoft.UI.Input;
using Microsoft.UI.Windowing;
using Windows.Graphics;

namespace AuraPlay;

internal static class WindowChrome
{
	private const int DwmWindowAttributeBorderColor = 34;
	private const int DwmWindowAttributeImmersiveDarkMode = 20;
	private const int DwmWindowAttributeNonClientRenderingPolicy = 2;
	private const int DwmWindowAttributeWindowCornerPreference = 33;
	private const uint DwmNonClientRenderingDisabled = 1;
	private const uint DwmNonClientRenderingEnabled = 2;
	private const uint DwmWindowCornerDefault = 0;
	private const uint DwmWindowCornerDoNotRound = 1;
	private const uint AuraPlayBorderColor = 0xFFFFFFFE;
	private const int WindowStyleIndex = -16;
	private const long WindowStyleCaption = 0x00C00000L;
	private const long WindowStyleThickFrame = 0x00040000L;
	private const uint SetWindowPositionNoSize = 0x0001;
	private const uint SetWindowPositionNoMove = 0x0002;
	private const uint SetWindowPositionNoZOrder = 0x0004;
	private const uint SetWindowPositionFrameChanged = 0x0020;
	private static bool _wasMaximizedBeforeFullscreen;
	private static bool _isPictureInPicture;
	private static bool _wasMaximizedBeforePictureInPicture;
	private static PointInt32 _positionBeforePictureInPicture;
	private static SizeInt32 _sizeBeforePictureInPicture;
	private static double _mauiWidthBeforePictureInPicture;
	private static double _mauiHeightBeforePictureInPicture;
	private static double _mauiMinimumWidthBeforePictureInPicture;
	private static double _mauiMinimumHeightBeforePictureInPicture;
	private static readonly object ConfigurationGate = new();
	private static readonly HashSet<Microsoft.UI.Xaml.Window> ConfiguredWindows = [];
	private static Action<string>? _diagnosticSink;
	private static long _diagnosticSequence;

	public static void ConfigureDiagnostics(Action<string> diagnosticSink) => _diagnosticSink = diagnosticSink;

	public static void Configure(Microsoft.Maui.Controls.Window mauiWindow)
	{
		if (!TryGetNativeWindow(mauiWindow, out var nativeWindow, out var appWindow))
			return;
		lock (ConfigurationGate)
		{
			if (!ConfiguredWindows.Add(nativeWindow))
			{
				Log("chrome-update-skipped", "reason=handler-already-registered repeatedCount=1");
				return;
			}
		}

		nativeWindow.ExtendsContentIntoTitleBar = true;
		var chromeColor = Windows.UI.Color.FromArgb(255, 6, 9, 14);
		appWindow.TitleBar.ExtendsContentIntoTitleBar = true;
		appWindow.TitleBar.PreferredHeightOption = TitleBarHeightOption.Collapsed;
		appWindow.TitleBar.BackgroundColor = chromeColor;
		appWindow.TitleBar.InactiveBackgroundColor = chromeColor;
		appWindow.TitleBar.ButtonBackgroundColor = chromeColor;
		appWindow.TitleBar.ButtonInactiveBackgroundColor = chromeColor;
		ConfigureOverlappedPresenter(appWindow);
		RemoveSystemBorder(nativeWindow);

		var nonClientSource = InputNonClientPointerSource.GetForWindowId(appWindow.Id);
		var dispatcher = nativeWindow.DispatcherQueue;
		var resizeTimer = dispatcher.CreateTimer();
		resizeTimer.Interval = TimeSpan.FromMilliseconds(75);
		resizeTimer.IsRepeating = false;
		var updateInProgress = false;
		var chromeMutationInProgress = false;
		var updatePending = false;
		var lastWidth = -1;
		var lastHeight = -1;
		var lastScale = -1d;
		var lastPresenterKind = appWindow.Presenter.Kind;
		var lastPresenterState = GetPresenterState(appWindow);
		var repeatedChangedCount = 0;
		var resizeScheduled = false;
		var lastChangedLogTimestamp = 0L;

		void UpdateCaptionRegion(string reason)
		{
			if (updateInProgress)
			{
				updatePending = true;
				Log("chrome-update-reentrant-blocked", $"reason={reason} updateInProgress=true repeatedCount={Math.Max(1, repeatedChangedCount)}");
				return;
			}
			updateInProgress = true;
			var stopwatch = Stopwatch.StartNew();
			Log("chrome-update-start", $"reason={reason} updateInProgress=true");
			try
			{
			if (appWindow.Presenter.Kind == AppWindowPresenterKind.FullScreen)
			{
				nonClientSource.ClearRegionRects(NonClientRegionKind.Caption);
				lastWidth = appWindow.Size.Width;
				lastHeight = appWindow.Size.Height;
				Log("caption-region-updated", $"captionX=0 captionY=0 captionWidth=0 captionHeight=0 rasterizationScale=1 appWindowWidth={lastWidth} appWindowHeight={lastHeight}");
				return;
			}

			var scale = nativeWindow.Content?.XamlRoot?.RasterizationScale ?? 1d;
			var region = WindowCaptionRegionPolicy.Calculate(appWindow.Size.Width, appWindow.Size.Height, scale);
			if (lastWidth == appWindow.Size.Width && lastHeight == appWindow.Size.Height && Math.Abs(lastScale - scale) < 0.001)
			{
				Log("chrome-update-skipped", $"reason=unchanged-size repeatedCount={Math.Max(1, repeatedChangedCount)}");
				return;
			}

			nonClientSource.SetRegionRects(
				NonClientRegionKind.Caption,
				[new RectInt32(region.X, region.Y, region.Width, region.Height)]);
			lastWidth = appWindow.Size.Width;
			lastHeight = appWindow.Size.Height;
			lastScale = scale;
			repeatedChangedCount = 0;
			Log("caption-region-updated", $"captionX={region.X} captionY={region.Y} captionWidth={region.Width} captionHeight={region.Height} rasterizationScale={scale:F2} appWindowWidth={lastWidth} appWindowHeight={lastHeight}");
			}
			catch (Exception exception)
			{
				Log("window-change-exception", $"error={exception.GetType().Name}");
			}
			finally
			{
				stopwatch.Stop();
				updateInProgress = false;
				Log("chrome-update-complete", $"durationMs={stopwatch.ElapsedMilliseconds} updateInProgress=false");
				if (updatePending)
				{
					updatePending = false;
					resizeTimer.Stop();
					resizeTimer.Start();
				}
			}
		}

		resizeTimer.Tick += (_, _) =>
		{
			resizeScheduled = false;
			UpdateCaptionRegion("debounced-size");
		};
		nativeWindow.Closed += (_, _) =>
		{
			resizeTimer.Stop();
			lock (ConfigurationGate) ConfiguredWindows.Remove(nativeWindow);
			Log("chrome-update-complete", "reason=window-closed durationMs=0 updateInProgress=false");
		};
		UpdateCaptionRegion("initial");
		appWindow.Changed += (_, args) =>
		{
			repeatedChangedCount++;
			var presenterKind = appWindow.Presenter.Kind;
			var presenterState = GetPresenterState(appWindow);
			var changedTimestamp = Stopwatch.GetTimestamp();
			if (lastChangedLogTimestamp == 0 || Stopwatch.GetElapsedTime(lastChangedLogTimestamp, changedTimestamp) >= TimeSpan.FromMilliseconds(100))
			{
				lastChangedLogTimestamp = changedTimestamp;
				Log("appwindow-changed", $"DidSizeChange={args.DidSizeChange} DidPresenterChange={args.DidPresenterChange} DidPositionChange={args.DidPositionChange} PresenterKind={presenterKind} OverlappedPresenterState={presenterState} width={appWindow.Size.Width} height={appWindow.Size.Height} updateInProgress={updateInProgress} repeatedCount={repeatedChangedCount}");
			}
			if (chromeMutationInProgress)
			{
				Log("chrome-update-reentrant-blocked", $"reason=native-chrome-mutation updateInProgress=true repeatedCount={repeatedChangedCount}");
				return;
			}
			if (args.DidPresenterChange && (presenterKind != lastPresenterKind || presenterState != lastPresenterState))
			{
				Log("window-presenter-change", $"PresenterKind={presenterKind} OverlappedPresenterState={presenterState}");
				lastPresenterKind = presenterKind;
				lastPresenterState = presenterState;
				chromeMutationInProgress = true;
				try { RemoveSystemBorder(nativeWindow); }
				finally { chromeMutationInProgress = false; }
				Log(presenterState switch { "Maximized" => "window-state-maximized", "Minimized" => "window-state-minimized", _ => "window-state-restored" }, $"PresenterKind={presenterKind} OverlappedPresenterState={presenterState}");
				UpdateCaptionRegion("presenter-change");
			}
			else if (args.DidSizeChange)
			{
				if (!resizeScheduled)
				{
					resizeScheduled = true;
					var watchdog = Stopwatch.StartNew();
					Log("window-size-change", $"width={appWindow.Size.Width} height={appWindow.Size.Height} repeatedCount={repeatedChangedCount}");
					Log("window-ui-responsive-check", "callback=scheduled responsive=unknown");
					dispatcher.TryEnqueue(() =>
					{
						watchdog.Stop();
						Log("window-ui-responsive-check", $"callback=executed delayMs={watchdog.ElapsedMilliseconds} responsive={watchdog.ElapsedMilliseconds < 1000}");
					});
					Log("chrome-update-scheduled", "reason=size-change delayMs=75");
				}
				resizeTimer.Stop();
				resizeTimer.Start();
			}
		};
	}

	private static string GetPresenterState(AppWindow appWindow) =>
		appWindow.Presenter is OverlappedPresenter presenter ? presenter.State.ToString() : "None";

	private static void Log(string eventName, string fields)
	{
		var sequence = Interlocked.Increment(ref _diagnosticSequence);
		_diagnosticSink?.Invoke($"[{DateTimeOffset.Now:O}] event={eventName} sequence={sequence} threadId={Environment.CurrentManagedThreadId} {fields}{Environment.NewLine}");
	}

	public static void HandleAction(Microsoft.Maui.Controls.Window mauiWindow, string action)
	{
		if (!TryGetNativeWindow(mauiWindow, out var nativeWindow, out var appWindow))
			return;

		var presenter = appWindow.Presenter as OverlappedPresenter;

		switch (action.ToLowerInvariant())
		{
			case "minimize":
				presenter?.Minimize();
				break;
			case "maximize":
				if (presenter?.State == OverlappedPresenterState.Maximized)
					presenter.Restore();
				else
					presenter?.Maximize();
				break;
			case "fullscreen-enter":
				_wasMaximizedBeforeFullscreen = presenter?.State == OverlappedPresenterState.Maximized;
				appWindow.SetPresenter(AppWindowPresenterKind.FullScreen);
				break;
			case "fullscreen-exit":
				appWindow.SetPresenter(AppWindowPresenterKind.Overlapped);
				ConfigureOverlappedPresenter(appWindow);
				RemoveSystemBorder(nativeWindow);
				if (_wasMaximizedBeforeFullscreen &&
					appWindow.Presenter is OverlappedPresenter restoredPresenter)
				{
					restoredPresenter.Maximize();
				}
				_wasMaximizedBeforeFullscreen = false;
				break;
			case "pip-enter":
				EnterPictureInPicture(mauiWindow, nativeWindow, appWindow);
				break;
			case "pip-exit":
			case "pip-restore":
			case "window-restore":
				ExitPictureInPicture(mauiWindow, nativeWindow, appWindow);
				break;
			case "close":
				nativeWindow.Close();
				break;
		}
	}

	private static void EnterPictureInPicture(Microsoft.Maui.Controls.Window mauiWindow, Microsoft.UI.Xaml.Window nativeWindow, AppWindow appWindow)
	{
		if (_isPictureInPicture)
			return;

		if (appWindow.Presenter.Kind == AppWindowPresenterKind.FullScreen)
		{
			appWindow.SetPresenter(AppWindowPresenterKind.Overlapped);
			ConfigureOverlappedPresenter(appWindow);
		}

		if (appWindow.Presenter is not OverlappedPresenter presenter)
			return;

		_positionBeforePictureInPicture = appWindow.Position;
		_sizeBeforePictureInPicture = appWindow.Size;
		_mauiWidthBeforePictureInPicture = mauiWindow.Width;
		_mauiHeightBeforePictureInPicture = mauiWindow.Height;
		_mauiMinimumWidthBeforePictureInPicture = mauiWindow.MinimumWidth;
		_mauiMinimumHeightBeforePictureInPicture = mauiWindow.MinimumHeight;
		_wasMaximizedBeforePictureInPicture = presenter.State == OverlappedPresenterState.Maximized;
		if (_wasMaximizedBeforePictureInPicture)
			presenter.Restore();

		presenter.IsAlwaysOnTop = true;
		presenter.IsMaximizable = false;
		presenter.IsMinimizable = true;
		presenter.IsResizable = false;

		var compactSize = new SizeInt32(560, 340);
		mauiWindow.MinimumWidth = 420;
		mauiWindow.MinimumHeight = 260;
		mauiWindow.Width = 560;
		mauiWindow.Height = 340;
		var displayArea = DisplayArea.GetFromWindowId(appWindow.Id, DisplayAreaFallback.Primary);
		var workArea = displayArea.WorkArea;
		var compactPosition = new PointInt32(
			Math.Max(workArea.X, workArea.X + workArea.Width - compactSize.Width - 24),
			Math.Max(workArea.Y, workArea.Y + workArea.Height - compactSize.Height - 24));

		appWindow.Resize(compactSize);
		appWindow.Move(compactPosition);
		RemoveSystemBorder(nativeWindow);
		_isPictureInPicture = true;
	}

	private static void ExitPictureInPicture(Microsoft.Maui.Controls.Window mauiWindow, Microsoft.UI.Xaml.Window nativeWindow, AppWindow appWindow)
	{
		if (!_isPictureInPicture)
			return;

		if (appWindow.Presenter is OverlappedPresenter presenter)
		{
			presenter.IsAlwaysOnTop = false;
			presenter.IsMaximizable = true;
			presenter.IsResizable = true;
			appWindow.Resize(_sizeBeforePictureInPicture);
			appWindow.Move(_positionBeforePictureInPicture);
			mauiWindow.MinimumWidth = _mauiMinimumWidthBeforePictureInPicture;
			mauiWindow.MinimumHeight = _mauiMinimumHeightBeforePictureInPicture;
			mauiWindow.Width = _mauiWidthBeforePictureInPicture;
			mauiWindow.Height = _mauiHeightBeforePictureInPicture;
			if (_wasMaximizedBeforePictureInPicture)
				presenter.Maximize();
		}

		RemoveSystemBorder(nativeWindow);
		_isPictureInPicture = false;
		_wasMaximizedBeforePictureInPicture = false;
	}

	private static void ConfigureOverlappedPresenter(AppWindow appWindow)
	{
		if (appWindow.Presenter is OverlappedPresenter presenter)
		{
			presenter.SetBorderAndTitleBar(hasBorder: false, hasTitleBar: false);
			presenter.IsResizable = true;
			presenter.IsMinimizable = true;
			presenter.IsMaximizable = true;
		}
	}

	private static bool TryGetNativeWindow(
		Microsoft.Maui.Controls.Window mauiWindow,
		out Microsoft.UI.Xaml.Window nativeWindow,
		out AppWindow appWindow)
	{
		if (mauiWindow.Handler?.PlatformView is not Microsoft.UI.Xaml.Window platformWindow)
		{
			nativeWindow = null!;
			appWindow = null!;
			return false;
		}

		nativeWindow = platformWindow;
		var windowHandle = WinRT.Interop.WindowNative.GetWindowHandle(nativeWindow);
		var windowId = Microsoft.UI.Win32Interop.GetWindowIdFromWindow(windowHandle);
		appWindow = AppWindow.GetFromWindowId(windowId);
		return true;
	}

	private static void RemoveSystemBorder(Microsoft.UI.Xaml.Window nativeWindow)
	{
		var windowHandle = WinRT.Interop.WindowNative.GetWindowHandle(nativeWindow);
		var darkModeEnabled = 1u;
		_ = DwmSetWindowAttribute(
			windowHandle,
			DwmWindowAttributeImmersiveDarkMode,
			ref darkModeEnabled,
			Marshal.SizeOf<uint>());

		var borderColor = AuraPlayBorderColor;
		_ = DwmSetWindowAttribute(
			windowHandle,
			DwmWindowAttributeBorderColor,
			ref borderColor,
			Marshal.SizeOf<uint>());

		var style = GetWindowLongPtr(windowHandle, WindowStyleIndex).ToInt64();
		style &= ~(WindowStyleCaption | WindowStyleThickFrame);
		_ = SetWindowLongPtr(windowHandle, WindowStyleIndex, new IntPtr(style));
		_ = SetWindowPos(
			windowHandle,
			IntPtr.Zero,
			0,
			0,
			0,
			0,
			SetWindowPositionNoMove |
			SetWindowPositionNoSize |
			SetWindowPositionNoZOrder |
			SetWindowPositionFrameChanged);
	}

	private static void SetPictureInPictureFrame(Microsoft.UI.Xaml.Window nativeWindow, bool enabled)
	{
		var windowHandle = WinRT.Interop.WindowNative.GetWindowHandle(nativeWindow);
		var nonClientPolicy = enabled ? DwmNonClientRenderingDisabled : DwmNonClientRenderingEnabled;
		_ = DwmSetWindowAttribute(windowHandle, DwmWindowAttributeNonClientRenderingPolicy, ref nonClientPolicy, Marshal.SizeOf<uint>());
		var cornerPreference = enabled ? DwmWindowCornerDoNotRound : DwmWindowCornerDefault;
		_ = DwmSetWindowAttribute(windowHandle, DwmWindowAttributeWindowCornerPreference, ref cornerPreference, Marshal.SizeOf<uint>());
		_ = SetWindowPos(windowHandle, IntPtr.Zero, 0, 0, 0, 0,
			SetWindowPositionNoMove | SetWindowPositionNoSize | SetWindowPositionNoZOrder | SetWindowPositionFrameChanged);
	}

	[DllImport("dwmapi.dll")]
	private static extern int DwmSetWindowAttribute(
		IntPtr windowHandle,
		int attribute,
		ref uint attributeValue,
		int attributeSize);

	[DllImport("user32.dll", EntryPoint = "GetWindowLongPtrW")]
	private static extern IntPtr GetWindowLongPtr(IntPtr windowHandle, int index);

	[DllImport("user32.dll", EntryPoint = "SetWindowLongPtrW")]
	private static extern IntPtr SetWindowLongPtr(IntPtr windowHandle, int index, IntPtr newValue);

	[DllImport("user32.dll")]
	private static extern bool SetWindowPos(
		IntPtr windowHandle,
		IntPtr insertAfter,
		int x,
		int y,
		int width,
		int height,
		uint flags);
}
