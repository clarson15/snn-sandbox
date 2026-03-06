using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;

namespace SnnSandbox.Tests;

public class UnitTest1 : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly WebApplicationFactory<Program> _factory;

    public UnitTest1(WebApplicationFactory<Program> factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task SaveThenList_PreservesSeedAndTickCountExactly()
    {
        using var client = _factory.CreateClient();

        var payload = new
        {
            name = "Deterministic Fixture",
            seed = "fixture-seed-0001",
            parameters = new
            {
                worldWidth = 800,
                worldHeight = 480,
                maxFood = 120
            },
            tickCount = 12345,
            worldState = new
            {
                tick = 12345,
                organisms = new[] { new { id = "org-1", x = 1.25, y = 9.5, energy = 10.0 } },
                food = new[] { new { id = "food-1", x = 3.0, y = 4.0, energyValue = 5 } }
            }
        };

        var saveResponse = await client.PostAsJsonAsync("/api/simulations/snapshots", payload);
        Assert.Equal(HttpStatusCode.Created, saveResponse.StatusCode);

        var list = await client.GetFromJsonAsync<List<SimulationSnapshotRecordDto>>("/api/simulations/snapshots");
        Assert.NotNull(list);
        Assert.NotEmpty(list);

        var saved = list![0];
        Assert.Equal("fixture-seed-0001", saved.Seed);
        Assert.Equal(12345, saved.TickCount);
    }

    [Fact]
    public async Task Save_RejectsMissingName()
    {
        using var client = _factory.CreateClient();

        var payload = new
        {
            name = "",
            seed = "fixture-seed-0001",
            parameters = new { },
            tickCount = 0,
            worldState = new { tick = 0, organisms = Array.Empty<object>(), food = Array.Empty<object>() }
        };

        var saveResponse = await client.PostAsJsonAsync("/api/simulations/snapshots", payload);

        Assert.Equal(HttpStatusCode.BadRequest, saveResponse.StatusCode);
    }

    private sealed class SimulationSnapshotRecordDto
    {
        public string Id { get; set; } = string.Empty;

        public string Name { get; set; } = string.Empty;

        public string Seed { get; set; } = string.Empty;

        public long TickCount { get; set; }

        public DateTimeOffset UpdatedAt { get; set; }
    }
}
