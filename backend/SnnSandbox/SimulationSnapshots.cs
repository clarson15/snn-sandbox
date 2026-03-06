using System.Collections.Concurrent;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace SnnSandbox;

public record SaveSimulationSnapshotRequest(
    [property: JsonPropertyName("name")] string Name,
    [property: JsonPropertyName("seed")] string Seed,
    [property: JsonPropertyName("parameters")] JsonElement Parameters,
    [property: JsonPropertyName("tickCount")] long TickCount,
    [property: JsonPropertyName("worldState")] JsonElement WorldState
);

public record SimulationSnapshotRecord(
    [property: JsonPropertyName("id")] string Id,
    [property: JsonPropertyName("name")] string Name,
    [property: JsonPropertyName("seed")] string Seed,
    [property: JsonPropertyName("parameters")] JsonElement Parameters,
    [property: JsonPropertyName("tickCount")] long TickCount,
    [property: JsonPropertyName("worldState")] JsonElement WorldState,
    [property: JsonPropertyName("updatedAt")] DateTimeOffset UpdatedAt
);

public interface ISimulationSnapshotStore
{
    SimulationSnapshotRecord Save(SaveSimulationSnapshotRequest request);

    IReadOnlyList<SimulationSnapshotRecord> List();
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
}
