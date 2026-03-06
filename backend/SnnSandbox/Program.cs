using Microsoft.AspNetCore.HttpOverrides;
using SnnSandbox;

public class Program
{
    public static void Main(string[] args)
    {
        var builder = WebApplication.CreateBuilder(args);

        builder.Services.AddControllers();
        builder.Services.AddSingleton<ISimulationSnapshotStore, InMemorySimulationSnapshotStore>();

        builder.Services.Configure<ForwardedHeadersOptions>(options =>
        {
            options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;

            options.KnownNetworks.Clear();
            options.KnownProxies.Clear();
        });

        var app = builder.Build();

        var appVersion = Environment.GetEnvironmentVariable("APP_VERSION") ?? "unknown";
        app.Logger.LogInformation("Starting snn-sandbox-api with APP_VERSION={AppVersion}", appVersion);

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
            version = appVersion,
            environment = app.Environment.EnvironmentName
        });

        app.MapPost("/api/simulations/snapshots", (SaveSimulationSnapshotRequest request, ISimulationSnapshotStore store) =>
        {
            if (string.IsNullOrWhiteSpace(request.Name))
            {
                return Results.BadRequest(new { error = "Simulation name is required." });
            }

            if (string.IsNullOrWhiteSpace(request.Seed))
            {
                return Results.BadRequest(new { error = "Simulation seed is required." });
            }

            if (request.TickCount < 0)
            {
                return Results.BadRequest(new { error = "Tick count must be greater than or equal to 0." });
            }

            var saved = store.Save(request);
            return Results.Created($"/api/simulations/snapshots/{saved.Id}", saved);
        });

        app.MapGet("/api/simulations/snapshots", (ISimulationSnapshotStore store) => Results.Ok(store.List()));

        app.MapGet("/api/simulations/snapshots/{id}", (string id, ISimulationSnapshotStore store) =>
        {
            var snapshot = store.GetById(id);
            return snapshot is null ? Results.NotFound() : Results.Ok(snapshot);
        });

        app.MapDelete("/api/simulations/snapshots/{id}", (string id, ISimulationSnapshotStore store) =>
        {
            var deleted = store.DeleteById(id);
            return deleted ? Results.NoContent() : Results.NotFound();
        });

        // SPA fallback for frontend routes
        app.MapFallbackToFile("index.html");

        var port = Environment.GetEnvironmentVariable("PORT") ?? "5000";
        app.Urls.Add($"http://0.0.0.0:{port}");

        app.Run();
    }
}
