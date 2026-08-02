using System.Net;

namespace AuraPlay.Services;

public sealed class AuraPlayApiException : Exception
{
	public AuraPlayApiException(string message, HttpStatusCode? statusCode = null, string? code = null, Exception? innerException = null)
		: base(message, innerException)
	{
		StatusCode = statusCode;
		Code = code;
	}

	public HttpStatusCode? StatusCode { get; }
	public string? Code { get; }
}
