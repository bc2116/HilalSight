import assert from "node:assert/strict";
import test from "node:test";

const workerUrl = new URL("../dist/server/index.js", import.meta.url);
workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
const { default: worker } = await import(workerUrl.href);

function request(path, accept = "application/json") {
  return worker.fetch(
    new Request(`http://localhost${path}`, { headers: { accept } }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the HilalSight application", async () => {
  const response = await request("/", "text/html");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  assert.match(response.headers.get("content-security-policy") ?? "", /frame-ancestors 'none'/);
  assert.equal(response.headers.get("permissions-policy"), "geolocation=(self)");
  assert.equal(response.headers.get("referrer-policy"), "strict-origin-when-cross-origin");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("x-frame-options"), "DENY");

  const html = await response.text();
  assert.match(html, /<title>HilalSight — Crescent Moon Visibility<\/title>/i);
  assert.match(html, /HilalSight/);
  assert.match(html, /Global Visibility Map/);
  assert.match(html, /Hosted place-name search is disabled/);
  assert.doesNotMatch(html, /Typed place names are sent to Nominatim/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton|Starter Project/i);
});

test("serves the calendar and new-moon API contract", async () => {
  const status = await request("/api/status");
  assert.equal(status.status, 200);
  const statusBody = await status.json();
  assert.equal(statusBody.ok, true);
  assert.equal(statusBody.service, "HilalSight Sites");
  assert.equal(statusBody.ephemeris.path, undefined);

  const hijri = await request("/api/hijri/to-gregorian?year=1448&month=2&day=1");
  assert.equal(hijri.status, 200);
  assert.equal((await hijri.json()).gregorianDate, "2026-07-17");
  assert.equal((await request("/api/hijri/to-gregorian?year=1448&month=2&day=30")).status, 400);
  assert.equal((await request("/api/hijri/to-gregorian?year=1448&month=1&day=30")).status, 200);

  const moon = await request("/api/newmoon/next?from=2026-07-14");
  assert.equal(moon.status, 200);
  const moonBody = await moon.json();
  assert.equal(moonBody.newMoonDateUtc, "2026-07-14");
});

test("matches the reference point and returns a complete map grid", async () => {
  const point = await request("/api/visibility/point?lat=21.4225&lon=39.8262&date=2026-07-14&dayOffset=0");
  assert.equal(point.status, 200);
  assert.equal(point.headers.get("cache-control"), "no-store");
  const pointBody = await point.json();
  assert.equal(pointBody.result.category, "F");
  assert.ok(Math.abs(pointBody.result.q - -0.7738231503448899) < 0.001);
  assert.ok(Math.abs(pointBody.result.lagMinutes - 17.992) < 0.1);

  const map = await request("/api/visibility/map?date=2026-07-14&dayOffset=0&resolution=5");
  assert.equal(map.status, 200);
  assert.equal(map.headers.get("cache-control"), "public, max-age=86400");
  const mapBody = await map.json();
  assert.equal(mapBody.nLat, 36);
  assert.equal(mapBody.nLon, 72);
  assert.equal(mapBody.categories.length, 2592);
  assert.equal(mapBody.qValues.length, 2592);
  assert.ok(mapBody.markers.firstNakedEye);
  assert.ok(mapBody.markers.firstOpticalAid);
});

test("rejects malformed or unsupported public API inputs", async () => {
  const requests = [
    "/api/visibility/point?date=2026-07-14",
    "/api/visibility/point?lat=0&lon=0&date=2026-07-14&dayOffset=nope",
    "/api/visibility/map?date=2051-01-01&dayOffset=0&resolution=5",
    "/api/hijri/to-gregorian?year=1448&month=2&day=nope",
  ];
  for (const path of requests) {
    const response = await request(path);
    assert.equal(response.status, 400, path);
    assert.equal(response.headers.get("cache-control"), "no-store", path);
  }
});

test("disables hosted place-name geocoding", async () => {
  const response = await request("/api/geocode/search?q=Makkah");
  assert.equal(response.status, 501);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.match((await response.json()).detail, /disabled/i);
});

test("uses the requested polar civil day and returns offset-aware local timestamps", async () => {
  const polar = await request("/api/visibility/point?lat=69.6492&lon=18.9553&date=2026-07-20&dayOffset=0");
  assert.equal(polar.status, 200);
  assert.equal((await polar.json()).result.category, "NO_SUNSET");

  const makkah = await request("/api/visibility/point?lat=21.4225&lon=39.8262&date=2026-07-14&dayOffset=0");
  const result = (await makkah.json()).result;
  assert.match(result.tsLocal, /(Z|[+-]\d{2}:\d{2})$/);
  assert.match(result.tmLocal, /(Z|[+-]\d{2}:\d{2})$/);
  assert.match(result.tbLocal, /(Z|[+-]\d{2}:\d{2})$/);
});
