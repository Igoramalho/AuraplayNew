using System.Text.Json;
using System.Text.Json.Serialization;

namespace AuraPlay.Models.Api;

public sealed class ApiEnvelope<T>
{
	public bool Success { get; init; }
	public T? Data { get; init; }
	public ApiError? Error { get; init; }
	public JsonElement? Meta { get; init; }
}

public sealed class ApiError
{
	public string? Code { get; init; }
	public string? Message { get; init; }
	public JsonElement? Details { get; init; }

	[JsonExtensionData]
	public Dictionary<string, JsonElement>? AdditionalData { get; init; }
}
