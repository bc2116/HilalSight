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

test("serves six-day Hijri transition context without using visibility results", async () => {
  const stableBefore = await request("/api/hijri/context?date=2026-08-11");
  assert.equal(stableBefore.status, 200);
  const stableBeforeBody = await stableBefore.json();
  const { conjunctionUtc, ...stableBeforeWithoutInstant } = stableBeforeBody.defaultProjection;
  assert.deepEqual({ ...stableBeforeBody, defaultProjection: stableBeforeWithoutInstant }, {
    referenceDate: "2026-08-11",
    mode: "stable",
    month: { year: 1448, month: 2, monthName: "Safar" },
    transition: null,
    calendar: "Islamic Civil (tabular reference)",
    note: "Hijri days begin at local sunset, and month starts may differ by location, calendar, or authority. Visibility projections do not establish an official date.",
    defaultProjection: {
      targetMonth: { year: 1448, month: 3, monthName: "Rabi al-Awwal" },
      dateLabel: "2026-08-12",
      relation: "upcoming",
    },
  });
  assert.match(conjunctionUtc, /^2026-08-12T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/);

  for (const [date, phase] of [
    ["2026-08-12", "before"],
    ["2026-08-13", "before"],
    ["2026-08-14", "before"],
    ["2026-08-15", "after"],
    ["2026-08-16", "after"],
    ["2026-08-17", "after"],
  ]) {
    const response = await request(`/api/hijri/context?date=${date}`);
    assert.equal(response.status, 200, date);
    const body = await response.json();
    assert.equal(body.mode, "transition", date);
    assert.equal(body.month, null, date);
    assert.equal(body.transition.phase, phase, date);
    assert.deepEqual(body.transition.leavingMonth, { year: 1448, month: 2, monthName: "Safar" }, date);
    assert.deepEqual(body.transition.enteringMonth, { year: 1448, month: 3, monthName: "Rabi al-Awwal" }, date);
    assert.equal(body.transition.referenceBoundaryDate, "2026-08-15", date);
    assert.equal(body.defaultProjection.dateLabel, "2026-08-12", date);
    assert.equal(body.defaultProjection.relation, date === "2026-08-12" ? "upcoming" : "recent", date);
  }

  const stableAfter = await request("/api/hijri/context?date=2026-08-18");
  assert.equal(stableAfter.status, 200);
  const stableAfterBody = await stableAfter.json();
  assert.deepEqual(stableAfterBody.month, { year: 1448, month: 3, monthName: "Rabi al-Awwal" });
  assert.equal(stableAfterBody.transition, null);
  assert.deepEqual(stableAfterBody.defaultProjection.targetMonth, { year: 1448, month: 4, monthName: "Rabi al-Thani" });
  assert.equal(stableAfterBody.defaultProjection.dateLabel, "2026-09-11");
  assert.equal(stableAfterBody.defaultProjection.relation, "upcoming");
});

test("handles Hijri context validation, supported endpoints, and year rollover", async () => {
  for (const path of [
    "/api/hijri/context",
    "/api/hijri/context?date=2026-02-30",
    "/api/hijri/context?date=1899-12-31",
    "/api/hijri/context?date=2051-01-01",
  ]) {
    const response = await request(path);
    assert.equal(response.status, 400, path);
    assert.equal(response.headers.get("cache-control"), "no-store", path);
  }

  const rollover = await request("/api/hijri/context?date=2026-06-16");
  assert.equal(rollover.status, 200);
  const rolloverBody = await rollover.json();
  assert.equal(rolloverBody.mode, "transition");
  assert.deepEqual(rolloverBody.transition.leavingMonth, { year: 1447, month: 12, monthName: "Dhu al-Hijjah" });
  assert.deepEqual(rolloverBody.transition.enteringMonth, { year: 1448, month: 1, monthName: "Muharram" });

  const day27Calendar = await request("/api/hijri/from-gregorian?date=2026-07-13");
  assert.equal((await day27Calendar.json()).hijri.day, 27);
  const day27 = await request("/api/hijri/context?date=2026-07-13");
  assert.equal(day27.status, 200);
  const day27Body = await day27.json();
  assert.equal(day27Body.mode, "stable");
  assert.deepEqual(day27Body.month, { year: 1448, month: 1, monthName: "Muharram" });

  const day28Calendar = await request("/api/hijri/from-gregorian?date=2026-07-14");
  assert.equal((await day28Calendar.json()).hijri.day, 28);
  const day28 = await request("/api/hijri/context?date=2026-07-14");
  assert.equal(day28.status, 200);
  const day28Body = await day28.json();
  assert.equal(day28Body.mode, "transition");
  assert.equal(day28Body.transition.phase, "before");
  assert.deepEqual(day28Body.transition.leavingMonth, { year: 1448, month: 1, monthName: "Muharram" });
});

test("keeps upper-bound month context when no supported map projection remains", async () => {
  const lastProjection = await request("/api/hijri/context?date=2050-12-18");
  assert.equal(lastProjection.status, 200);
  const lastProjectionBody = await lastProjection.json();
  assert.equal(lastProjectionBody.defaultProjection.dateLabel, "2050-12-14");
  assert.ok(lastProjectionBody.defaultProjection.dateLabel >= "1900-01-01");
  assert.ok(lastProjectionBody.defaultProjection.dateLabel <= "2050-12-31");

  const firstWithoutProjection = await request("/api/hijri/context?date=2050-12-19");
  assert.equal(firstWithoutProjection.status, 200);
  const firstWithoutProjectionBody = await firstWithoutProjection.json();
  assert.equal(firstWithoutProjectionBody.mode, "stable");
  assert.deepEqual(firstWithoutProjectionBody.month, { year: 1473, month: 4, monthName: "Rabi al-Thani" });
  assert.equal(firstWithoutProjectionBody.defaultProjection, null);

  const finalSupportedDate = await request("/api/hijri/context?date=2050-12-31");
  assert.equal(finalSupportedDate.status, 200);
  const finalSupportedDateBody = await finalSupportedDate.json();
  assert.deepEqual(finalSupportedDateBody.month, { year: 1473, month: 4, monthName: "Rabi al-Thani" });
  assert.equal(finalSupportedDateBody.defaultProjection, null);
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
