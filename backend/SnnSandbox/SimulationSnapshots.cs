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
    [property: JsonPropertyName("rngState")] uint? RngState
);

public record SimulationSnapshotRecord(
    [property: JsonPropertyName("id")] string Id,
    [property: JsonPropertyName("name")] string Name,
    [property: JsonPropertyName("seed")] string Seed,
    [property: JsonPropertyName("parameters")] JsonElement Parameters,
    [property: JsonPropertyName("tickCount")] long TickCount,
    [property: JsonPropertyName("worldState")] JsonElement WorldState,
    [property: JsonPropertyName("rngState")] uint? RngState,
    [property: JsonPropertyName("updatedAt")] DateTimeOffset UpdatedAt
);

public interface ISimulationSnapshotStore
{
    SimulationSnapshotRecord Save(SaveSimulationSnapshotRequest request);

    IReadOnlyList<SimulationSnapshotRecord> List();

    SimulationSnapshotRecord? GetById(string id);

    bool DeleteById(string id);
}

public sealed class InMemorySimulationSnapshotStore : ISimulationSnapshotStore
{
    private readonly ConcurrentDictionary<string, SimulationSnapshotRecord> _snapshots = new();

    public SimulationSnapshotRecord Save(SaveSimulationSnapshotRequest request)
    {
        var now = DateTimeOffset.UtcNow;
        var record = new SimulationSnapshotRecord(
            Id: $"sim-{Guid.NewGuid():N}",
            Name: request.Name,
            Seed: request.Seed,
            Parameters: request.Parameters,
            TickCount: request.TickCount,
            WorldState: request.WorldState,
            RngState: request.RngState,
            UpdatedAt: now
        );

        _snapshots[record.Id] = record;
        return record;
    }

    public IReadOnlyList<SimulationSnapshotRecord> List()
    {
        return _snapshots
            .Values
            .OrderByDescending(snapshot => snapshot.UpdatedAt)
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
}
