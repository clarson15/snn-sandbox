using System.Collections.Concurrent;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace SnnSandbox;

public record SaveSimulationSnapshotRequest(
    [property: JsonPropertyName("name")] string Name,
    [property: JsonPropertyName("seed")] string Seed,
    [property: JsonPropertyName("parameters")] JsonElement Parameters,
    [property: JsonPropertyName("tickCount")] long TickCount,
    [property: JsonPropertyName("worldState")] JsonElement WorldState,
    [property: JsonPropertyName("rngState")] uint? RngState,
    [property: JsonPropertyName("schemaVersion")] int SchemaVersion = 1,
    [property: JsonPropertyName("overwriteExisting")] bool OverwriteExisting = false,
    [property: JsonPropertyName("overwriteSnapshotId")] string? OverwriteSnapshotId = null
);

public record SimulationSnapshotRecord(
    [property: JsonPropertyName("id")] string Id,
    [property: JsonPropertyName("name")] string Name,
    [property: JsonPropertyName("seed")] string Seed,
    [property: JsonPropertyName("parameters")] JsonElement Parameters,
    [property: JsonPropertyName("tickCount")] long TickCount,
    [property: JsonPropertyName("worldState")] JsonElement WorldState,
    [property: JsonPropertyName("rngState")] uint? RngState,
    [property: JsonPropertyName("schemaVersion")] int SchemaVersion,
    [property: JsonPropertyName("updatedAt")] DateTimeOffset UpdatedAt
);

public record SaveSimulationSnapshotResult(
    SimulationSnapshotRecord Record,
    bool WasOverwrite,
    string? ErrorCode = null,
    string? ErrorMessage = null,
    SimulationSnapshotRecord? ConflictSnapshot = null
)
{
    public bool Succeeded => string.IsNullOrWhiteSpace(ErrorCode);
}

public interface ISimulationSnapshotStore
{
    SaveSimulationSnapshotResult Save(SaveSimulationSnapshotRequest request);

    IReadOnlyList<SimulationSnapshotRecord> List();

    SimulationSnapshotRecord? GetById(string id);

    bool DeleteById(string id);
}

public sealed class InMemorySimulationSnapshotStore : ISimulationSnapshotStore
{
    private readonly ConcurrentDictionary<string, SimulationSnapshotRecord> _snapshots = new();

    public SaveSimulationSnapshotResult Save(SaveSimulationSnapshotRequest request)
    {
        var now = DateTimeOffset.UtcNow;
        var conflict = FindByName(request.Name);

        if (!request.OverwriteExisting && conflict is not null)
        {
            return new SaveSimulationSnapshotResult(
                Record: conflict,
                WasOverwrite: false,
                ErrorCode: "SNAPSHOT_NAME_CONFLICT",
                ErrorMessage: $"A saved simulation named \"{request.Name}\" already exists.",
                ConflictSnapshot: conflict
            );
        }

        if (request.OverwriteExisting)
        {
            var target = ResolveOverwriteTarget(request, conflict);
            if (target is null)
            {
                return new SaveSimulationSnapshotResult(
                    Record: conflict ?? CreateRecord(request, now),
                    WasOverwrite: false,
                    ErrorCode: "SNAPSHOT_OVERWRITE_TARGET_MISSING",
                    ErrorMessage: "Unable to overwrite because the target snapshot was not found. Refresh and retry.",
                    ConflictSnapshot: conflict
                );
            }

            var replaced = CreateRecord(request, now, target.Id);
            _snapshots[target.Id] = replaced;
            return new SaveSimulationSnapshotResult(replaced, WasOverwrite: true);
        }

        var created = CreateRecord(request, now);
        _snapshots[created.Id] = created;
        return new SaveSimulationSnapshotResult(created, WasOverwrite: false);
    }

    public IReadOnlyList<SimulationSnapshotRecord> List()
    {
        return _snapshots
            .Values
            .OrderByDescending(snapshot => snapshot.UpdatedAt)
            .ThenBy(snapshot => snapshot.Id, StringComparer.Ordinal)
            .ToList();
    }

    public SimulationSnapshotRecord? GetById(string id)
    {
        return _snapshots.TryGetValue(id, out var record) ? record : null;
    }

    public bool DeleteById(string id)
    {
        return _snapshots.TryRemove(id, out _);
    }

    private SimulationSnapshotRecord CreateRecord(SaveSimulationSnapshotRequest request, DateTimeOffset now, string? id = null)
    {
        return new SimulationSnapshotRecord(
            Id: id ?? $"sim-{Guid.NewGuid():N}",
            Name: request.Name,
            Seed: request.Seed,
            Parameters: request.Parameters,
            TickCount: request.TickCount,
            WorldState: request.WorldState,
            RngState: request.RngState,
            SchemaVersion: request.SchemaVersion,
            UpdatedAt: now
        );
    }

    private SimulationSnapshotRecord? FindByName(string name)
    {
        return _snapshots.Values
            .Where(snapshot => string.Equals(snapshot.Name, name, StringComparison.OrdinalIgnoreCase))
            .OrderByDescending(snapshot => snapshot.UpdatedAt)
            .FirstOrDefault();
    }

    private SimulationSnapshotRecord? ResolveOverwriteTarget(SaveSimulationSnapshotRequest request, SimulationSnapshotRecord? conflict)
    {
        if (!string.IsNullOrWhiteSpace(request.OverwriteSnapshotId) &&
            _snapshots.TryGetValue(request.OverwriteSnapshotId, out var explicitTarget))
        {
            return explicitTarget;
        }

        return conflict;
    }
}
