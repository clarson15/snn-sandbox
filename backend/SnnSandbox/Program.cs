using Microsoft.AspNetCore.HttpOverrides;

public class Program
{
    public static void Main(string[] args)
    {
        var builder = WebApplication.CreateBuilder(args);

        builder.Services.AddControllers();

        builder.Services.Configure<ForwardedHeadersOptions>(options =>
        {
            options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;

            options.KnownNetworks.Clear();
            options.KnownProxies.Clear();
        });

        var app = builder.Build();

        // Serve frontend static files when packaged in the container image
        app.UseDefaultFiles();
        app.UseStaticFiles();

        // Process X-Forwarded-* headers before components that use client IP/protocol.
        app.UseForwardedHeaders();

        // Map controllers
        app.MapControllers();

        // Health check endpoint (public - no auth required, but rate limited)
        app.MapGet("/api/health", () => new
        {
            status = "healthy",
            service = "snn-sandbox-api"
        });

        // Status endpoint (public - no auth required, but rate limited)
        app.MapGet("/api/status", () => new
        {
            version = Environment.GetEnvironmentVariable("APP_VERSION") ?? "unknown",
            environment = app.Environment.EnvironmentName
        });

        // SPA fallback for frontend routes
        app.MapFallbackToFile("index.html");

        var port = Environment.GetEnvironmentVariable("PORT") ?? "5000";
        app.Urls.Add($"http://0.0.0.0:{port}");

        app.Run();
    }
}
