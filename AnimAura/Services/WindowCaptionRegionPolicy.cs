namespace AuraPlay.Services;

public readonly record struct CaptionRegion(int X, int Y, int Width, int Height)
{
	public bool Contains(int x, int y) => x >= X && x < X + Width && y >= Y && y < Y + Height;
}

public static class WindowCaptionRegionPolicy
{
	public const int LogicalLeftInteractiveWidth = 210;
	public const int LogicalRightInteractiveWidth = 220;
	public const int LogicalCaptionHeight = 56;

	public static CaptionRegion Calculate(int appWindowWidth, int appWindowHeight, double rasterizationScale)
	{
		var safeScale = double.IsFinite(rasterizationScale) && rasterizationScale > 0 ? rasterizationScale : 1d;
		var safeWidth = Math.Max(0, appWindowWidth);
		var safeHeight = Math.Max(0, appWindowHeight);
		var left = Math.Min(safeWidth, Math.Max(0, (int)Math.Round(LogicalLeftInteractiveWidth * safeScale)));
		var right = Math.Min(Math.Max(0, safeWidth - left), Math.Max(0, (int)Math.Round(LogicalRightInteractiveWidth * safeScale)));
		var height = Math.Min(safeHeight, Math.Max(0, (int)Math.Round(LogicalCaptionHeight * safeScale)));
		return new CaptionRegion(left, 0, Math.Max(0, safeWidth - left - right), height);
	}
}
