using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Logging;

namespace AuraPlay.Services;

public sealed class FavoritesStore
{
	private const int MaxPayloadBytes = 1024 * 1024;
	private const string EmptyStore = "{\"version\":1,\"items\":[]}";
	private readonly SemaphoreSlim _writeGate = new(1, 1);
	private readonly ILogger<FavoritesStore> _logger;

	public FavoritesStore(string appDataDirectory, ILogger<FavoritesStore> logger)
	{
		AppDataDirectory = appDataDirectory;
		FilePath = Path.Combine(appDataDirectory, "favorites.json");
		_logger = logger;
	}

	public string AppDataDirectory { get; }
	public string FilePath { get; }

	public async Task<string> LoadAsync(CancellationToken cancellationToken = default)
	{
		try
		{
			if (!File.Exists(FilePath))
				return EmptyStore;

			var json = await File.ReadAllTextAsync(FilePath, Encoding.UTF8, cancellationToken);
			if (IsValid(json))
				return json;

			PreserveInvalidFile();
			return EmptyStore;
		}
		catch (Exception exception) when (exception is not OperationCanceledException)
		{
			_logger.LogWarning("Falha ao carregar favoritos locais: {ExceptionType}; caminho={Path}", exception.GetType().Name, FilePath);
			return EmptyStore;
		}
	}

	public async Task<bool> SaveEncodedAsync(string encodedPayload, CancellationToken cancellationToken = default)
	{
		byte[] payload;
		try
		{
			payload = Convert.FromBase64String(encodedPayload);
		}
		catch (FormatException)
		{
			return false;
		}

		if (payload.Length > MaxPayloadBytes)
			return false;

		var json = Encoding.UTF8.GetString(payload);
		if (!IsValid(json))
			return false;

		await _writeGate.WaitAsync(cancellationToken);
		try
		{
			Directory.CreateDirectory(AppDataDirectory);
			var temporaryPath = FilePath + ".tmp";
			await File.WriteAllTextAsync(temporaryPath, json, new UTF8Encoding(false), cancellationToken);
			File.Move(temporaryPath, FilePath, true);
			return true;
		}
		catch (Exception exception) when (exception is not OperationCanceledException)
		{
			_logger.LogWarning("Falha ao salvar favoritos locais: {ExceptionType}; caminho={Path}", exception.GetType().Name, FilePath);
			return false;
		}
		finally
		{
			_writeGate.Release();
		}
	}

	private static bool IsValid(string json)
	{
		try
		{
			using var document = JsonDocument.Parse(json);
			var root = document.RootElement;
			if (root.ValueKind == JsonValueKind.Array)
				return true;
			return root.ValueKind == JsonValueKind.Object &&
				(!root.TryGetProperty("items", out var items) || items.ValueKind == JsonValueKind.Array);
		}
		catch (JsonException)
		{
			return false;
		}
	}

	private void PreserveInvalidFile()
	{
		try
		{
			var backupPath = Path.Combine(AppDataDirectory, $"favorites.invalid-{DateTimeOffset.UtcNow:yyyyMMddHHmmssfff}.json");
			File.Copy(FilePath, backupPath, false);
			_logger.LogWarning("Arquivo de favoritos inválido preservado: {Path}", backupPath);
		}
		catch (Exception exception)
		{
			_logger.LogWarning("Falha ao preservar favoritos inválidos: {ExceptionType}; caminho={Path}", exception.GetType().Name, FilePath);
		}
	}
}
