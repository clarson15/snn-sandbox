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
            rngState = 123u,
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

        var loaded = await client.GetFromJsonAsync<SimulationSnapshotRecordDto>($"/api/simulations/snapshots/{saved.Id}");
        Assert.NotNull(loaded);
        Assert.Equal(saved.Id, loaded!.Id);
        Assert.Equal((uint)123, loaded.RngState);
    }

    [Fact]
    public async Task Delete_RemovesSnapshotAndListReflectsChange()
    {
        using var client = _factory.CreateClient();

        var payload = new
        {
            name = "Delete Fixture",
            seed = "fixture-seed-delete",
            parameters = new { worldWidth = 800, worldHeight = 480 },
            tickCount = 77,
            rngState = 9u,
            worldState = new { tick = 77, organisms = Array.Empty<object>(), food = Array.Empty<object>() }
        };

        var saveResponse = await client.PostAsJsonAsync("/api/simulations/snapshots", payload);
        Assert.Equal(HttpStatusCode.Created, saveResponse.StatusCode);

        var saved = await saveResponse.Content.ReadFromJsonAsync<SimulationSnapshotRecordDto>();
        Assert.NotNull(saved);

        var deleteResponse = await client.DeleteAsync($"/api/simulations/snapshots/{saved!.Id}");
        Assert.Equal(HttpStatusCode.NoContent, deleteResponse.StatusCode);

        var fetchDeletedResponse = await client.GetAsync($"/api/simulations/snapshots/{saved.Id}");
        Assert.Equal(HttpStatusCode.NotFound, fetchDeletedResponse.StatusCode);

        var list = await client.GetFromJsonAsync<List<SimulationSnapshotRecordDto>>("/api/simulations/snapshots");
        Assert.NotNull(list);
        Assert.DoesNotContain(list!, item => item.Id == saved.Id);
    }

    [Fact]
    public async Task Delete_ReturnsNotFoundForUnknownId()
    {
        using var client = _factory.CreateClient();

        var response = await client.DeleteAsync("/api/simulations/snapshots/sim-missing");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
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

        public uint? RngState { get; set; }

        public DateTimeOffset UpdatedAt { get; set; }
    }
}
